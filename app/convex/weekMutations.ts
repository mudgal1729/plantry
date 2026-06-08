import { mutation } from "./_generated/server.js";
import { v, ConvexError } from "convex/values";
import { assertAuthor } from "./lib/author.js";

/**
 * Replaces the dish in one (day, meal) slot of `currentWeek` with a custom
 * one-off label (a free-text dish that is not in the library).
 *
 * Signature (per `docs/engineering.md` §3, §7):
 *   addCustomOneOff({
 *     author: "rajat" | "tuhina",
 *     weekStart: string,                     // ISO date of the Monday
 *     day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat",
 *     meal: "breakfast" | "lunch",
 *     customLabel: string,
 *     version: number,                       // optimistic concurrency from caller
 *   }) => { ok: true; version: number }
 *      | { ok: false; reason: "version-mismatch" | "no-current-week" | "no-such-slot" }
 *
 * Behavior:
 *   - Validates `author` via `assertAuthor`; rejects with a `ConvexError` otherwise.
 *   - Trims `customLabel`; rejects with a `ConvexError` if empty.
 *   - Looks up the `currentWeek` row by `weekStart` via the `by_weekStart` index.
 *     Missing row -> { ok: false, reason: "no-current-week" }.
 *   - If `row.version !== args.version` -> { ok: false, reason: "version-mismatch" }.
 *     Caller is expected to reload and retry.
 *   - Locates the slot by `(day, meal)`. Missing slot ->
 *     { ok: false, reason: "no-such-slot" }.
 *   - Patches that slot to `{ ...existing, dishId: null, customLabel,
 *     source: "custom", author, updatedAt: Date.now() }` and increments
 *     `version` by 1.
 *   - Returns `{ ok: true, version: newVersion }`.
 *
 * Why the result is a tagged union, not a thrown error: version-mismatch and
 * no-current-week are expected control flow that the UI handles (reload and
 * retry). Throwing would force the client to parse error strings, which is
 * fragile. Throws are reserved for programmer errors (bad author, empty label).
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
    customLabel: v.string(),
    version: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; version: number }
    | {
        ok: false;
        reason: "version-mismatch" | "no-current-week" | "no-such-slot";
      }
  > => {
    assertAuthor(args.author);
    const trimmedLabel = args.customLabel.trim();
    if (trimmedLabel.length === 0) {
      throw new ConvexError("customLabel must not be empty after trimming");
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

    const slotIndex = week.slots.findIndex((s) => s.day === args.day && s.meal === args.meal);
    if (slotIndex === -1) {
      return { ok: false, reason: "no-such-slot" };
    }

    const existing = week.slots[slotIndex];
    const now = Date.now();
    const newSlot = {
      ...existing,
      dishId: null,
      customLabel: trimmedLabel,
      source: "custom" as const,
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
