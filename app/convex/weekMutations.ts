import { mutation } from "./_generated/server.js";
import { v, ConvexError } from "convex/values";
import { dishes } from "@plantry/engine/library";
import { assertAuthor } from "./lib/author.js";

type ShortDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
type LowerMeal = "breakfast" | "lunch";
type LongDay = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
type CapMeal = "Breakfast" | "Lunch";

type SlotAuthor = "rajat" | "tuhina" | "system";
type DishPickShape = {
  dishId: number | null;
  customLabel: string | null;
  source: "generated" | "swapped" | "custom";
  author: SlotAuthor;
  updatedAt: number;
  includeRecipe?: boolean;
};
type SlotShape = {
  day: ShortDay;
  meal: LowerMeal;
  dishes: DishPickShape[];
};
type SkippedDayShape = {
  day: ShortDay;
  reason: string;
  author: "rajat" | "tuhina";
  skippedAt: number;
};

const LONG_DAY: Record<ShortDay, LongDay> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};
const CAP_MEAL: Record<LowerMeal, CapMeal> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
};

/**
 * Replaces one position within one (day, meal) slot of `currentWeek` with a
 * custom one-off label (a free-text dish that is not in the library).
 *
 * Signature (per `docs/engineering.md` §3, §7, `features/multi-dish-slots.md`,
 * `features/manual-changes.md`):
 *   addCustomOneOff({
 *     author: "rajat" | "tuhina",
 *     weekStart: string,                     // ISO date of the Monday
 *     day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat",
 *     meal: "breakfast" | "lunch",
 *     position: number,                      // 0-based within slot.dishes
 *     customLabel: string,
 *     version: number,                       // optimistic concurrency from caller
 *     reason: string,                        // required, trimmed
 *   }) => { ok: true; version: number }
 *      | { ok: false; reason: "version-mismatch" | "no-current-week"
 *                           | "no-such-slot" | "no-such-position" }
 *
 * Behavior:
 *   - Validates `author` via `assertAuthor`; rejects with a `ConvexError` otherwise.
 *   - Trims `customLabel`; rejects with a `ConvexError` if empty.
 *   - Trims `reason`; empty -> ConvexError("reason must not be empty after trimming").
 *   - Looks up the `currentWeek` row by `weekStart` via the `by_weekStart` index.
 *     Missing row -> { ok: false, reason: "no-current-week" }.
 *   - If `row.version !== args.version` -> { ok: false, reason: "version-mismatch" }.
 *     Caller is expected to reload and retry.
 *   - Locates the slot by `(day, meal)`. Missing slot ->
 *     { ok: false, reason: "no-such-slot" }.
 *     Locates the position within `slot.dishes`. Out of range ->
 *     { ok: false, reason: "no-such-position" }.
 *   - Patches `slot.dishes[position]` to `{ dishId: null, customLabel,
 *     source: "custom", author, updatedAt: Date.now() }` and increments
 *     `version` by 1. The rest of the slot's dishes are untouched.
 *   - On success ALSO inserts a `manualChanges` row in the same Convex
 *     transaction recording the pre-change pick state, the new custom label,
 *     and the trimmed `reason`. See `features/manual-changes.md`.
 *   - Returns `{ ok: true, version: newVersion }`.
 */
export const addCustomOneOff = mutation({
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
    position: v.number(),
    customLabel: v.string(),
    version: v.number(),
    reason: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; version: number }
    | {
        ok: false;
        reason: "version-mismatch" | "no-current-week" | "no-such-slot" | "no-such-position";
      }
  > => {
    assertAuthor(args.author);
    const trimmedLabel = args.customLabel.trim();
    if (trimmedLabel.length === 0) {
      throw new ConvexError("customLabel must not be empty after trimming");
    }
    const trimmedReason = args.reason.trim();
    if (trimmedReason.length === 0) {
      throw new ConvexError("reason must not be empty after trimming");
    }

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

    const slots = week.slots as SlotShape[];
    const slotIndex = slots.findIndex((s) => s.day === args.day && s.meal === args.meal);
    if (slotIndex === -1) {
      return { ok: false, reason: "no-such-slot" };
    }
    const slot = slots[slotIndex];
    if (args.position < 0 || args.position >= slot.dishes.length) {
      return { ok: false, reason: "no-such-position" };
    }

    const existingPick = slot.dishes[args.position];
    const now = Date.now();
    const newPick: DishPickShape = {
      ...existingPick,
      dishId: null,
      customLabel: trimmedLabel,
      source: "custom",
      author: args.author,
      updatedAt: now,
    };
    const newDishes = [...slot.dishes];
    newDishes[args.position] = newPick;
    const newSlot: SlotShape = { ...slot, dishes: newDishes };
    const newSlots = [...slots];
    newSlots[slotIndex] = newSlot;
    const newVersion = week.version + 1;

    await ctx.db.patch(week._id, {
      slots: newSlots,
      version: newVersion,
    });

    // Append-only manual-changes log. Same Convex transaction as the patch
    // above, so both land or neither does. See `features/manual-changes.md`.
    await ctx.db.insert("manualChanges", {
      createdAt: now,
      author: args.author,
      weekStart: args.weekStart,
      day: args.day,
      meal: args.meal,
      position: args.position,
      changeKind: "custom",
      before: {
        dishId: existingPick.dishId,
        customLabel: existingPick.customLabel,
      },
      after: {
        dishId: null,
        customLabel: trimmedLabel,
      },
      reason: trimmedReason,
      status: "queued",
      resolvedAt: null,
      resolvedPr: null,
    });

    return { ok: true, version: newVersion };
  },
});

/**
 * Finalizes the current week: appends a `weekArchive` row mirroring the
 * `menu_history.md` format and flips `currentWeek.status` to `"final"`. On
 * finalize the week's dishes enter the historical record that drives the §4
 * recency rule on later weeks (`docs/product.md` §3 item 4, `docs/engine.md` §6).
 *
 * Skip-exclusion (`features/design-revamp.md` §1.4 item 3, §1.5): a day in
 * `currentWeek.skippedDays` was not cooked, so its dishes contribute NO archive
 * rows and recency must not see them. The day's `slots` stay intact (restore is
 * lossless); finalize simply omits them from the appended rows. With no skipped
 * days (the common case) every day's dishes archive, exactly as before this
 * behavior existed.
 *
 * Custom one-offs (`dishId === null`) are also omitted: the archive mirrors
 * `MenuHistoryRow`, which keys on a library dish id and name, and a free-text
 * one-off has neither. This matches the grocery list, which likewise skips
 * one-offs (they are not library dishes).
 *
 * The engine's skip-aware `deriveHistoryRows({ skippedDays })` operates on a
 * `GeneratedWeek` of library `Dish` objects; the live `currentWeek` carries
 * swapped and custom picks instead, so finalize derives the rows directly from
 * the live slots here (applying the same skip + one-off exclusions) rather than
 * re-running the engine against a week the user has since edited.
 *
 *   finalizeWeek({ author, weekStart, version })
 *     => { ok: true; version: number }
 *      | { ok: false; reason: "version-mismatch" | "no-current-week"
 *                           | "already-final" }
 */
export const finalizeWeek = mutation({
  args: {
    author: v.string(),
    weekStart: v.string(),
    version: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; version: number }
    | { ok: false; reason: "version-mismatch" | "no-current-week" | "already-final" }
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
    if (week.status === "final") {
      return { ok: false, reason: "already-final" };
    }

    const skipped = new Set<ShortDay>(
      ((week.skippedDays ?? []) as SkippedDayShape[]).map((s) => s.day),
    );

    // Build archive rows from the live slots, skipping skipped days and custom
    // one-offs. Order follows the slot/position order so the archive reads the
    // way the week was cooked. Dish names come from the baked library (the live
    // pick stores only the id for a library dish); a pick whose id is not in the
    // library is skipped defensively (the swap/add mutations only write library
    // ids, so this is unreachable for real data).
    const nameById = new Map<number, string>(dishes.map((d) => [d.id, d.name]));
    const rows: {
      day: LongDay;
      meal: CapMeal;
      dishName: string;
      dishId: number;
    }[] = [];
    for (const slot of week.slots as SlotShape[]) {
      if (skipped.has(slot.day)) continue;
      for (const pick of slot.dishes) {
        if (pick.dishId === null) continue;
        const dishName = nameById.get(pick.dishId);
        if (dishName === undefined) continue;
        rows.push({
          day: LONG_DAY[slot.day],
          meal: CAP_MEAL[slot.meal],
          dishName,
          dishId: pick.dishId,
        });
      }
    }

    const now = Date.now();
    await ctx.db.insert("weekArchive", {
      weekStart: args.weekStart,
      finalizedAt: now,
      rows,
    });

    const newVersion = week.version + 1;
    await ctx.db.patch(week._id, {
      status: "final",
      version: newVersion,
    });

    return { ok: true, version: newVersion };
  },
});
