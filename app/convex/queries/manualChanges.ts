import { query } from "../_generated/server.js";
import type { Doc } from "../_generated/dataModel.js";

/**
 * Returns all `manualChanges` rows whose status is `"queued"`, sorted by
 * `createdAt` ascending. Mirrors `listQueuedComments`. Consumed by the slow
 * loop as fuel for rule redesign alongside queued comments and open incidents
 * (see `features/manual-changes.md` and `.claude/commands/slow-loop.md`).
 */
export const listQueuedManualChanges = query({
  args: {},
  handler: async (ctx): Promise<Doc<"manualChanges">[]> => {
    const queued = await ctx.db
      .query("manualChanges")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    queued.sort((a, b) => a.createdAt - b.createdAt);
    return queued;
  },
});
