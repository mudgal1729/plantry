import { mutation } from "./_generated/server.js";
import { v, ConvexError } from "convex/values";
import { assertAuthor } from "./lib/author.js";

type ShortDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
type LowerMeal = "breakfast" | "lunch";

type SlotAuthor = "rajat" | "tuhina" | "system";
type DishPickShape = {
  dishId: number | null;
  customLabel: string | null;
  source: "generated" | "swapped" | "custom";
  author: SlotAuthor;
  updatedAt: number;
};
type SlotShape = {
  day: ShortDay;
  meal: LowerMeal;
  dishes: DishPickShape[];
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
