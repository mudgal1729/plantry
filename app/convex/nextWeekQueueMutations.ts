import { internalMutation } from "./_generated/server.js";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";

/**
 * Marks each `nextWeekQueue` row in `queueIds` as `dropped`. Invoked by the
 * slow-loop mark-applied action when a slow-loop PR's diagnosis decides a
 * saved-for-next-week dish is stale or no longer worth carrying forward
 * (`features/design-revamp.md` §1.8). `dropped` is the queue's terminal
 * "consumed by the slow loop without placing" state, parallel to
 * `reviewed_no_change` on comments and manual changes.
 *
 * Mirrors `markCommentsApplied` in shape and never-throw discipline: a missing
 * id, or a row past the `queued` lifecycle (already `placed` by a generation
 * run, or already `dropped`), logs a `warn` incident and is skipped. The
 * never-throw guarantee lets a stale or fabricated id in a merged PR body fail
 * softly without blocking the consume cycle for sibling clusters. The
 * generation run owns the `queued -> placed` transition; the slow loop owns the
 * `queued -> dropped` transition. This mutation only acts on `queued` rows.
 */
export const markQueueDropped = internalMutation({
  args: {
    queueIds: v.array(v.id("nextWeekQueue")),
    resolvedPr: v.string(),
  },
  handler: async (
    ctx,
    args: { queueIds: Id<"nextWeekQueue">[]; resolvedPr: string },
  ): Promise<{ updated: number; skipped: number }> => {
    const now = Date.now();
    let updated = 0;
    let skipped = 0;
    for (const id of args.queueIds) {
      const row = await ctx.db.get(id);
      if (!row) {
        skipped += 1;
        await ctx.db.insert("incidents", {
          createdAt: now,
          source: "backend",
          severity: "warn",
          context: {
            mutation: "markQueueDropped",
            queueId: id,
            resolvedPr: args.resolvedPr,
          },
          message: `markQueueDropped: nextWeekQueue ${id} not found; skipped.`,
          resolvedAt: null,
        });
        continue;
      }
      if (row.status !== "queued") {
        skipped += 1;
        await ctx.db.insert("incidents", {
          createdAt: now,
          source: "backend",
          severity: "warn",
          context: {
            mutation: "markQueueDropped",
            queueId: id,
            currentStatus: row.status,
            resolvedPr: args.resolvedPr,
          },
          message: `markQueueDropped: nextWeekQueue ${id} not in queued state (status ${row.status}); skipped.`,
          resolvedAt: null,
        });
        continue;
      }
      await ctx.db.patch(id, { status: "dropped" });
      updated += 1;
    }
    return { updated, skipped };
  },
});
