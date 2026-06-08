import { mutation } from "./_generated/server.js";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.js";
import { assertAuthor } from "./lib/author.js";

/**
 * Inserts a queued comment attached to a dish or a day in a specific week.
 *
 * Signature (per `docs/engineering.md` §3):
 *   addComment({
 *     author: "rajat" | "tuhina",
 *     attachedTo: {
 *       kind: "dish" | "day",
 *       weekStart: string,      // ISO date of the Monday
 *       day: string | null,     // short-form "Mon".."Sat" matching currentWeek
 *       dishId: number | null,
 *     },
 *     text: string,
 *   }) => Id<"comments">
 *
 * Behavior:
 *   - Validates `author` via `assertAuthor`; rejects with a `ConvexError` otherwise.
 *   - Trims `text`; rejects with a `ConvexError` if the trimmed string is empty.
 *   - Inserts a row with `createdAt: Date.now()`, `status: "queued"`,
 *     `resolvedAt: null`, `resolvedPr: null`.
 *   - Returns the new row's `Id<"comments">`. The slow loop consumes queued
 *     comments later (see `docs/engineering.md` §5 "Write (comment)").
 */
export const addComment = mutation({
  args: {
    author: v.string(),
    attachedTo: v.object({
      kind: v.union(v.literal("dish"), v.literal("day")),
      weekStart: v.string(),
      day: v.union(v.string(), v.null()),
      dishId: v.union(v.number(), v.null()),
    }),
    text: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"comments">> => {
    assertAuthor(args.author);
    const trimmed = args.text.trim();
    if (trimmed.length === 0) {
      throw new ConvexError("comment text must not be empty after trimming");
    }
    return await ctx.db.insert("comments", {
      createdAt: Date.now(),
      author: args.author,
      attachedTo: args.attachedTo,
      text: trimmed,
      status: "queued",
      resolvedAt: null,
      resolvedPr: null,
    });
  },
});
