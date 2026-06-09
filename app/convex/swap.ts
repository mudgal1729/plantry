import { query, mutation } from "./_generated/server.js";
import { v, ConvexError } from "convex/values";
import { dishes, packSizes, ingredients } from "@plantry/engine/library";
import { history } from "@plantry/engine/history";
import { rankCandidatesForSlot } from "@plantry/engine";
import type { Dish, Season } from "@plantry/engine";
import { assertAuthor } from "./lib/author.js";

type ShortDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
type LowerMeal = "breakfast" | "lunch";

/**
 * Bangalore seasons per `docs/product.md` §1. Duplicated inline from
 * `generateWeek.ts` (two callers, per `docs/product.md` §4 Principle 8
 * "three similar rows beat a premature abstraction"). Reads the month directly
 * from the ISO date string ("YYYY-MM-DD"); no Date object or timezone math.
 */
function seasonOf(isoDate: string): Season {
  const month = Number.parseInt(isoDate.slice(5, 7), 10);
  if (month >= 3 && month <= 5) return "Summer";
  if (month >= 6 && month <= 9) return "Monsoon";
  return "Winter";
}

/**
 * Builds the `currentWeekPicks: Dish[]` context that `rankCandidatesForSlot`
 * needs to honour §3.1 (rice-at-most-once) and §6 (consolidation). We look up
 * each slot's `dishId` in the baked library; slots with `dishId === null` are
 * custom one-offs and skipped (they contribute no ingredient ledger entries).
 *
 * Optionally excludes one (day, meal) slot so the caller can omit the slot
 * being ranked itself; this matches the engine's expectation that the caller
 * does not double-count the slot's current pick (see `RankCandidatesForSlotArgs`
 * JSDoc).
 */
function buildCurrentWeekPicks(
  slots: ReadonlyArray<{
    day: ShortDay;
    meal: LowerMeal;
    dishId: number | null;
  }>,
  exclude: { day: ShortDay; meal: LowerMeal } | null,
): Dish[] {
  const picks: Dish[] = [];
  const libraryById = new Map<number, Dish>(dishes.map((d) => [d.id, d]));
  for (const slot of slots) {
    if (exclude && slot.day === exclude.day && slot.meal === exclude.meal) {
      continue;
    }
    if (slot.dishId === null) continue;
    const dish = libraryById.get(slot.dishId);
    if (dish) picks.push(dish);
  }
  return picks;
}

/**
 * Returns the engine-ranked list of alternative dishes for a single
 * (day, meal) slot of the current week. Drives the swap UI's "Replace with..."
 * picker (Stream D slice 3 consumes this via `anyApi.swap.getSlotAlternatives`).
 *
 * Signature (per `features/phase2.md` §3 Stream C slice 4):
 *   getSlotAlternatives({
 *     weekStart: string,                                       // ISO Monday
 *     day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat",
 *     meal: "breakfast" | "lunch",
 *     limit?: number,                                          // default 10
 *   }) => Dish[]
 *
 * Behavior:
 *   - Looks up the `currentWeek` row by `weekStart` via `by_weekStart`. If the
 *     row is missing, throws a `ConvexError` (the UI should not have asked).
 *   - Builds `currentWeekPicks` from the live week's slots, excluding the slot
 *     being ranked so the engine does not see the current pick in its own
 *     ranking context.
 *   - Calls `rankCandidatesForSlot` with the engine's capitalised meal
 *     ("Breakfast" / "Lunch") and the season derived from `weekStart`.
 *   - Filters out the currently-picked `dishId` from the result so the user is
 *     not offered a swap to the same dish.
 *   - Returns at most `limit` (default 10) full Zod-validated `Dish` objects,
 *     top of the ranking first. The frontend reads `.id`, `.name`, `.tags`,
 *     etc.
 */
export const getSlotAlternatives = query({
  args: {
    weekStart: v.string(),
    day: v.union(
      v.literal("Mon"),
      v.literal("Tue"),
      v.literal("Wed"),
      v.literal("Thu"),
      v.literal("Fri"),
      v.literal("Sat"),
    ),
    meal: v.union(v.literal("breakfast"), v.literal("lunch")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Dish[]> => {
    const week = await ctx.db
      .query("currentWeek")
      .withIndex("by_weekStart", (q) => q.eq("weekStart", args.weekStart))
      .unique();
    if (!week) {
      throw new ConvexError("no current week for this weekStart");
    }

    const limit = args.limit ?? 10;
    const season = seasonOf(args.weekStart);
    const engineMeal = args.meal === "breakfast" ? "Breakfast" : "Lunch";

    const currentSlot = week.slots.find(
      (s) => s.day === args.day && s.meal === args.meal,
    );
    const currentDishId = currentSlot?.dishId ?? null;

    const currentWeekPicks = buildCurrentWeekPicks(week.slots, {
      day: args.day,
      meal: args.meal,
    });

    const ranked = rankCandidatesForSlot({
      weekStart: args.weekStart,
      day: args.day,
      meal: engineMeal,
      library: dishes,
      history,
      season,
      ingredients,
      packSizes,
      currentWeekPicks,
    });

    const filtered =
      currentDishId === null
        ? ranked
        : ranked.filter((d) => d.id !== currentDishId);
    return filtered.slice(0, limit);
  },
});

/**
 * Replaces the dish in one (day, meal) slot of `currentWeek` with a different
 * dish that the engine considers eligible for that slot. Drives the swap UI's
 * confirmation step (Stream D slice 3 consumes this via
 * `anyApi.swap.swapDish`).
 *
 * Signature (per `features/phase2.md` §3 Stream C slice 4 and
 * `docs/engineering.md` §5 "Write (swap a dish)"):
 *   swapDish({
 *     author: "rajat" | "tuhina",
 *     weekStart: string,                                       // ISO Monday
 *     day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat",
 *     meal: "breakfast" | "lunch",
 *     newDishId: number,
 *     version: number,                                         // OCC
 *   }) => { ok: true; version: number }
 *      | { ok: false; reason: "version-mismatch" | "no-current-week"
 *                           | "no-such-slot" | "dish-not-eligible"
 *                           | "dish-not-in-library" }
 *
 * Behavior:
 *   - Validates `author` via `assertAuthor`; throws a `ConvexError` otherwise.
 *   - Looks up `currentWeek` by `weekStart`. Missing -> `no-current-week`.
 *   - Optimistic concurrency: `row.version !== args.version` ->
 *     `version-mismatch`. The UI is expected to reload and retry.
 *   - Locates the slot by `(day, meal)`. Missing -> `no-such-slot`.
 *   - Validates `newDishId` against the baked library. Missing ->
 *     `dish-not-in-library`.
 *   - Re-runs `rankCandidatesForSlot` with the same context
 *     `getSlotAlternatives` would have built and confirms `newDishId` is in
 *     the result. Missing -> `dish-not-eligible`. This catches a stale tap
 *     (the dish was eligible when the user opened the picker but isn't now
 *     because something else on the plate shifted the ledger).
 *   - Patches the slot to `{ ...existing, dishId: newDishId, customLabel: null,
 *     source: "swapped", author, updatedAt: Date.now() }` and increments
 *     `version` by 1.
 *   - Returns `{ ok: true, version: newVersion }`.
 *
 * Why the result is a tagged union, not a thrown error: every non-throw branch
 * is expected control flow that the UI handles (reload + retry, or show a
 * targeted message). Throws are reserved for programmer errors (bad author).
 * This matches the shape of `addCustomOneOff` (the contract every future
 * `currentWeek` mutation honours).
 */
export const swapDish = mutation({
  args: {
    author: v.string(),
    weekStart: v.string(),
    day: v.union(
      v.literal("Mon"),
      v.literal("Tue"),
      v.literal("Wed"),
      v.literal("Thu"),
      v.literal("Fri"),
      v.literal("Sat"),
    ),
    meal: v.union(v.literal("breakfast"), v.literal("lunch")),
    newDishId: v.number(),
    version: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; version: number }
    | {
        ok: false;
        reason:
          | "version-mismatch"
          | "no-current-week"
          | "no-such-slot"
          | "dish-not-eligible"
          | "dish-not-in-library";
      }
  > => {
    assertAuthor(args.author);

    const week = await ctx.db
      .query("currentWeek")
      .withIndex("by_weekStart", (q) => q.eq("weekStart", args.weekStart))
      .unique();
    if (!week) {
      return { ok: false, reason: "no-current-week" };
    }
    if (week.version !== args.version) {
      return { ok: false, reason: "version-mismatch" };
    }

    const slotIndex = week.slots.findIndex(
      (s) => s.day === args.day && s.meal === args.meal,
    );
    if (slotIndex === -1) {
      return { ok: false, reason: "no-such-slot" };
    }

    const newDish = dishes.find((d) => d.id === args.newDishId);
    if (!newDish) {
      return { ok: false, reason: "dish-not-in-library" };
    }

    const season = seasonOf(args.weekStart);
    const engineMeal = args.meal === "breakfast" ? "Breakfast" : "Lunch";
    const currentWeekPicks = buildCurrentWeekPicks(week.slots, {
      day: args.day,
      meal: args.meal,
    });
    const ranked = rankCandidatesForSlot({
      weekStart: args.weekStart,
      day: args.day,
      meal: engineMeal,
      library: dishes,
      history,
      season,
      ingredients,
      packSizes,
      currentWeekPicks,
    });
    if (!ranked.some((d) => d.id === args.newDishId)) {
      return { ok: false, reason: "dish-not-eligible" };
    }

    const existing = week.slots[slotIndex];
    const now = Date.now();
    const newSlot = {
      ...existing,
      dishId: args.newDishId,
      customLabel: null,
      source: "swapped" as const,
      author: args.author,
      updatedAt: now,
    };
    const newSlots = [...week.slots];
    newSlots[slotIndex] = newSlot;
    const newVersion = week.version + 1;

    await ctx.db.patch(week._id, {
      slots: newSlots,
      version: newVersion,
    });

    return { ok: true, version: newVersion };
  },
});
