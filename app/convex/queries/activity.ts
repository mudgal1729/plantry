import { query } from "../_generated/server.js";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel.js";

/**
 * Activity feed for the Changes tab (`features/design-revamp.md` §1.5, §6.11).
 *
 * Returns every `manualChanges` row for one `weekStart`, newest first, so the
 * Changes tab can render the week's edits (swap, custom, delete, add, skip_day,
 * restore_day, save_next_week) with author, time, and reason. The client merges
 * in the queued `comments` for the same week separately (the comments query
 * already exists); this query deliberately does NOT join comments server-side,
 * keeping each signal channel its own query and its own subscription.
 *
 * Display order is `createdAt` descending (newest first): the Changes tab shows
 * the most recent edit at the top. All statuses are returned, not just
 * `queued`, because the tab is a history of what happened, not a slow-loop work
 * queue (that is `listQueuedManualChanges`, used by the slow loop).
 */
export const listManualChangesForWeek = query({
  args: { weekStart: v.string() },
  handler: async (ctx, args): Promise<Doc<"manualChanges">[]> => {
    const rows = await ctx.db
      .query("manualChanges")
      .withIndex("by_weekStart", (q) => q.eq("weekStart", args.weekStart))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  },
});
