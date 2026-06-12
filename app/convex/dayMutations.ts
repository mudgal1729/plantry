import { mutation } from "./_generated/server.js";
import { v, ConvexError } from "convex/values";
import { dishes } from "@plantry/engine/library";
import type { Season } from "@plantry/engine";
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

const DAY_VALIDATOR = v.union(
  v.literal("Mon"),
  v.literal("Tue"),
  v.literal("Wed"),
  v.literal("Thu"),
  v.literal("Fri"),
  v.literal("Sat"),
);
const MEAL_VALIDATOR = v.union(v.literal("breakfast"), v.literal("lunch"));

/**
 * Bangalore seasons per `docs/product.md` §1. Duplicated inline from
 * `generateWeek.ts`/`swap.ts` (three similar callers, per `docs/product.md` §4
 * Principle 8 "three similar rows beat a premature abstraction"). Reads the
 * month directly from the ISO date string ("YYYY-MM-DD"); no Date object.
 */
function seasonOf(isoDate: string): Season {
  const month = Number.parseInt(isoDate.slice(5, 7), 10);
  if (month >= 3 && month <= 5) return "Summer";
  if (month >= 6 && month <= 9) return "Monsoon";
  return "Winter";
}

/**
 * Removes one position from one (day, meal) slot of `currentWeek` (before = the
 * dish removed, after = null). The fast loop is permissive: delete may leave the
 * day below its composition shape (Decision #11); the share image simply shows
 * fewer items. Reason required (Decision #8). Writes a `manualChanges` row with
 * `changeKind: "delete"` in the same transaction (the `swapDish` pattern).
 *
 *   deleteDish({ author, weekStart, day, meal, position, version, reason })
 *     => { ok: true; version: number }
 *      | { ok: false; reason: "version-mismatch" | "no-current-week"
 *                           | "no-such-slot" | "no-such-position" }
 */
export const deleteDish = mutation({
  args: {
    author: v.string(),
    weekStart: v.string(),
    day: DAY_VALIDATOR,
    meal: MEAL_VALIDATOR,
    position: v.number(),
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

    const removedPick = slot.dishes[args.position];
    const now = Date.now();
    const newDishes = slot.dishes.filter((_, i) => i !== args.position);
    const newSlot: SlotShape = { ...slot, dishes: newDishes };
    const newSlots = [...slots];
    newSlots[slotIndex] = newSlot;
    const newVersion = week.version + 1;

    await ctx.db.patch(week._id, {
      slots: newSlots,
      version: newVersion,
    });

    await ctx.db.insert("manualChanges", {
      createdAt: now,
      author: args.author,
      weekStart: args.weekStart,
      day: args.day,
      meal: args.meal,
      position: args.position,
      changeKind: "delete",
      before: {
        dishId: removedPick.dishId,
        customLabel: removedPick.customLabel,
      },
      after: {
        dishId: null,
        customLabel: null,
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
 * Appends a library dish as a new position in one (day, meal) slot of
 * `currentWeek` (before = null, after = the dish). Like `swapDish` this is the
 * non-restrictive picker: meal-time and Active+season are hard filters; §3
 * composition eligibility is NOT enforced (signal for the slow loop, per
 * `docs/product.md` §4 Principle 4). Reason required (Decision #8). Writes a
 * `manualChanges` row with `changeKind: "add"` in the same transaction.
 *
 *   addDish({ author, weekStart, day, meal, newDishId, version, reason })
 *     => { ok: true; version: number; position: number }
 *      | { ok: false; reason: "version-mismatch" | "no-current-week"
 *                           | "no-such-slot" | "dish-not-in-library"
 *                           | "dish-not-meal-time"
 *                           | "dish-not-active-or-in-season" }
 */
export const addDish = mutation({
  args: {
    author: v.string(),
    weekStart: v.string(),
    day: DAY_VALIDATOR,
    meal: MEAL_VALIDATOR,
    newDishId: v.number(),
    version: v.number(),
    reason: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; version: number; position: number }
    | {
        ok: false;
        reason:
          | "version-mismatch"
          | "no-current-week"
          | "no-such-slot"
          | "dish-not-in-library"
          | "dish-not-meal-time"
          | "dish-not-active-or-in-season";
      }
  > => {
    assertAuthor(args.author);
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

    const newDish = dishes.find((d) => d.id === args.newDishId);
    if (!newDish) {
      return { ok: false, reason: "dish-not-in-library" };
    }
    const engineMeal = args.meal === "breakfast" ? "Breakfast" : "Lunch";
    if (newDish.time !== engineMeal) {
      return { ok: false, reason: "dish-not-meal-time" };
    }
    if (newDish.active !== "Yes") {
      return { ok: false, reason: "dish-not-active-or-in-season" };
    }
    const season = seasonOf(args.weekStart);
    if (newDish.seasons !== "All" && !newDish.seasons.includes(season)) {
      return { ok: false, reason: "dish-not-active-or-in-season" };
    }

    const slot = slots[slotIndex];
    const now = Date.now();
    const newPick: DishPickShape = {
      dishId: args.newDishId,
      customLabel: null,
      source: "swapped",
      author: args.author,
      updatedAt: now,
    };
    const newDishes = [...slot.dishes, newPick];
    const position = newDishes.length - 1;
    const newSlot: SlotShape = { ...slot, dishes: newDishes };
    const newSlots = [...slots];
    newSlots[slotIndex] = newSlot;
    const newVersion = week.version + 1;

    await ctx.db.patch(week._id, {
      slots: newSlots,
      version: newVersion,
    });

    await ctx.db.insert("manualChanges", {
      createdAt: now,
      author: args.author,
      weekStart: args.weekStart,
      day: args.day,
      meal: args.meal,
      position,
      changeKind: "add",
      before: {
        dishId: null,
        customLabel: null,
      },
      after: {
        dishId: args.newDishId,
        customLabel: null,
      },
      reason: trimmedReason,
      status: "queued",
      resolvedAt: null,
      resolvedPr: null,
    });

    return { ok: true, version: newVersion, position };
  },
});

/**
 * Marks a day skipped for the current week by appending to
 * `currentWeek.skippedDays`. The day's dishes are never removed, so restore is
 * lossless (`restoreDay`). Reason required (Decision #8). Writes a
 * `manualChanges` row with `changeKind: "skip_day"` (day-level: no meal/position,
 * null before/after) in the same transaction.
 *
 *   skipDay({ author, weekStart, day, version, reason })
 *     => { ok: true; version: number }
 *      | { ok: false; reason: "version-mismatch" | "no-current-week"
 *                           | "already-skipped" }
 */
export const skipDay = mutation({
  args: {
    author: v.string(),
    weekStart: v.string(),
    day: DAY_VALIDATOR,
    version: v.number(),
    reason: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; version: number }
    | { ok: false; reason: "version-mismatch" | "no-current-week" | "already-skipped" }
  > => {
    assertAuthor(args.author);
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

    const skippedDays = (week.skippedDays ?? []) as SkippedDayShape[];
    if (skippedDays.some((s) => s.day === args.day)) {
      return { ok: false, reason: "already-skipped" };
    }

    const now = Date.now();
    const newSkippedDays: SkippedDayShape[] = [
      ...skippedDays,
      { day: args.day, reason: trimmedReason, author: args.author, skippedAt: now },
    ];
    const newVersion = week.version + 1;

    await ctx.db.patch(week._id, {
      skippedDays: newSkippedDays,
      version: newVersion,
    });

    await ctx.db.insert("manualChanges", {
      createdAt: now,
      author: args.author,
      weekStart: args.weekStart,
      day: args.day,
      changeKind: "skip_day",
      before: { dishId: null, customLabel: null },
      after: { dishId: null, customLabel: null },
      reason: trimmedReason,
      status: "queued",
      resolvedAt: null,
      resolvedPr: null,
    });

    return { ok: true, version: newVersion };
  },
});

/**
 * Restores a previously skipped day by removing it from
 * `currentWeek.skippedDays`. Lossless: the day's dishes were never removed.
 * Reason required (Decision #8). Writes a `manualChanges` row with
 * `changeKind: "restore_day"` (day-level: no meal/position, null before/after)
 * in the same transaction.
 *
 *   restoreDay({ author, weekStart, day, version, reason })
 *     => { ok: true; version: number }
 *      | { ok: false; reason: "version-mismatch" | "no-current-week"
 *                           | "not-skipped" }
 */
export const restoreDay = mutation({
  args: {
    author: v.string(),
    weekStart: v.string(),
    day: DAY_VALIDATOR,
    version: v.number(),
    reason: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; version: number }
    | { ok: false; reason: "version-mismatch" | "no-current-week" | "not-skipped" }
  > => {
    assertAuthor(args.author);
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

    const skippedDays = (week.skippedDays ?? []) as SkippedDayShape[];
    if (!skippedDays.some((s) => s.day === args.day)) {
      return { ok: false, reason: "not-skipped" };
    }

    const now = Date.now();
    const newSkippedDays = skippedDays.filter((s) => s.day !== args.day);
    const newVersion = week.version + 1;

    await ctx.db.patch(week._id, {
      skippedDays: newSkippedDays,
      version: newVersion,
    });

    await ctx.db.insert("manualChanges", {
      createdAt: now,
      author: args.author,
      weekStart: args.weekStart,
      day: args.day,
      changeKind: "restore_day",
      before: { dishId: null, customLabel: null },
      after: { dishId: null, customLabel: null },
      reason: trimmedReason,
      status: "queued",
      resolvedAt: null,
      resolvedPr: null,
    });

    return { ok: true, version: newVersion };
  },
});

/**
 * Saves a library dish for next week by inserting a `queued` row into
 * `nextWeekQueue`. The next generation run reads queued rows as engine
 * `requests` (4.2). Reason required (Decision #8). Writes a `manualChanges` row
 * with `changeKind: "save_next_week"` (day-level: no meal/position; after carries
 * the saved dish id for the activity feed) in the same transaction.
 *
 *   saveForNextWeek({ author, weekStart, dishId, reason })
 *     => { ok: true; queueId: string }
 *      | { ok: false; reason: "dish-not-in-library" | "already-queued" }
 *
 * `weekStart` is recorded on the `manualChanges` row so the save appears in the
 * current week's activity feed; the queue row itself is week-agnostic until a
 * generation run consumes it (`consumedWeekStart`).
 */
export const saveForNextWeek = mutation({
  args: {
    author: v.string(),
    weekStart: v.string(),
    dishId: v.number(),
    reason: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; queueId: string } | { ok: false; reason: "dish-not-in-library" | "already-queued" }
  > => {
    assertAuthor(args.author);
    const trimmedReason = args.reason.trim();
    if (trimmedReason.length === 0) {
      throw new ConvexError("reason must not be empty after trimming");
    }

    const dish = dishes.find((d) => d.id === args.dishId);
    if (!dish) {
      return { ok: false, reason: "dish-not-in-library" };
    }

    // Decision #9 hides already-queued dishes in Explore, but guard the mutation
    // too so a stale client cannot double-queue the same dish.
    const queued = await ctx.db
      .query("nextWeekQueue")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    if (queued.some((row) => row.dishId === args.dishId)) {
      return { ok: false, reason: "already-queued" };
    }

    const now = Date.now();
    const queueId = await ctx.db.insert("nextWeekQueue", {
      createdAt: now,
      author: args.author,
      dishId: args.dishId,
      reason: trimmedReason,
      status: "queued",
      consumedWeekStart: null,
    });

    await ctx.db.insert("manualChanges", {
      createdAt: now,
      author: args.author,
      weekStart: args.weekStart,
      // A save targets next week, not a day of this week, so there is no natural
      // `day`. The brief makes only `meal`/`position` optional (not `day`), so the
      // field stays required; "Mon" is a non-semantic placeholder. The dish saved
      // is the load-bearing value and lives in `after.dishId`. The activity feed
      // (4.2) keys this kind off `after`, not `day`. EM: flag if you would rather
      // `day` also become optional for this kind (same safe required->optional
      // loosening) — kept in-scope per the brief's explicit list.
      day: "Mon",
      changeKind: "save_next_week",
      before: { dishId: null, customLabel: null },
      after: { dishId: args.dishId, customLabel: null },
      reason: trimmedReason,
      status: "queued",
      resolvedAt: null,
      resolvedPr: null,
    });

    return { ok: true, queueId };
  },
});

/**
 * Sets the `includeRecipe` share preference on one dish entry in one (day, meal)
 * slot of `currentWeek`. A share preference, NOT a menu change, so it does NOT
 * write a `manualChanges` row. It still bumps `version` for optimistic
 * concurrency. Resets weekly by living on the week document (Decision #10).
 *
 *   setIncludeRecipe({ author, weekStart, day, meal, position, include, version })
 *     => { ok: true; version: number }
 *      | { ok: false; reason: "version-mismatch" | "no-current-week"
 *                           | "no-such-slot" | "no-such-position" }
 */
export const setIncludeRecipe = mutation({
  args: {
    author: v.string(),
    weekStart: v.string(),
    day: DAY_VALIDATOR,
    meal: MEAL_VALIDATOR,
    position: v.number(),
    include: v.boolean(),
    version: v.number(),
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
    const newPick: DishPickShape = { ...existingPick, includeRecipe: args.include };
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

    return { ok: true, version: newVersion };
  },
});
