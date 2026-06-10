import { internalMutation } from "./_generated/server.js";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";

/**
 * Marks each `manualChanges` row in `manualChangeIds` as `applied` with
 * `resolvedAt = now` and `resolvedPr = arg`. Mirrors `markCommentsApplied` in
 * shape and never-throw discipline: a missing id, or a row already past the
 * `queued` / `in_review` lifecycle, logs an incident and is skipped. The
 * slow-loop GitHub action depends on never-throwing so a stale or fabricated
 * id in a merged PR body cannot block the consume cycle for sibling clusters.
 */
export const markManualChangesApplied = internalMutation({
  args: {
    manualChangeIds: v.array(v.id("manualChanges")),
    resolvedPr: v.string(),
  },
  handler: async (
    ctx,
    args: { manualChangeIds: Id<"manualChanges">[]; resolvedPr: string },
  ): Promise<{ updated: number; skipped: number }> => {
    const now = Date.now();
    let updated = 0;
    let skipped = 0;
    for (const id of args.manualChangeIds) {
      const row = await ctx.db.get(id);
      if (!row) {
        skipped += 1;
        await ctx.db.insert("incidents", {
          createdAt: now,
          source: "backend",
          severity: "warn",
          context: {
            mutation: "markManualChangesApplied",
            manualChangeId: id,
            resolvedPr: args.resolvedPr,
          },
          message: `markManualChangesApplied: manualChange ${id} not found; skipped.`,
          resolvedAt: null,
        });
        continue;
      }
      if (row.status !== "queued" && row.status !== "in_review") {
        skipped += 1;
        await ctx.db.insert("incidents", {
          createdAt: now,
          source: "backend",
          severity: "warn",
          context: {
            mutation: "markManualChangesApplied",
            manualChangeId: id,
            currentStatus: row.status,
            resolvedPr: args.resolvedPr,
          },
          message: `markManualChangesApplied: manualChange ${id} already resolved (status ${row.status}); skipped.`,
          resolvedAt: null,
        });
        continue;
      }
      await ctx.db.patch(id, {
        status: "applied",
        resolvedAt: now,
        resolvedPr: args.resolvedPr,
      });
      updated += 1;
    }
    return { updated, skipped };
  },
});

/**
 * Marks each `manualChanges` row in `manualChangeIds` as `reviewed_no_change`
 * with `resolvedAt = now` and `resolvedPr = arg`. Mirrors
 * `markCommentsReviewedNoChange`. Same never-throw discipline as
 * `markManualChangesApplied`.
 */
export const markManualChangesReviewedNoChange = internalMutation({
  args: {
    manualChangeIds: v.array(v.id("manualChanges")),
    resolvedPr: v.string(),
  },
  handler: async (
    ctx,
    args: { manualChangeIds: Id<"manualChanges">[]; resolvedPr: string },
  ): Promise<{ updated: number; skipped: number }> => {
    const now = Date.now();
    let updated = 0;
    let skipped = 0;
    for (const id of args.manualChangeIds) {
      const row = await ctx.db.get(id);
      if (!row) {
        skipped += 1;
        await ctx.db.insert("incidents", {
          createdAt: now,
          source: "backend",
          severity: "warn",
          context: {
            mutation: "markManualChangesReviewedNoChange",
            manualChangeId: id,
            resolvedPr: args.resolvedPr,
          },
          message: `markManualChangesReviewedNoChange: manualChange ${id} not found; skipped.`,
          resolvedAt: null,
        });
        continue;
      }
      if (row.status !== "queued" && row.status !== "in_review") {
        skipped += 1;
        await ctx.db.insert("incidents", {
          createdAt: now,
          source: "backend",
          severity: "warn",
          context: {
            mutation: "markManualChangesReviewedNoChange",
            manualChangeId: id,
            currentStatus: row.status,
            resolvedPr: args.resolvedPr,
          },
          message: `markManualChangesReviewedNoChange: manualChange ${id} already resolved (status ${row.status}); skipped.`,
          resolvedAt: null,
        });
        continue;
      }
      await ctx.db.patch(id, {
        status: "reviewed_no_change",
        resolvedAt: now,
        resolvedPr: args.resolvedPr,
      });
      updated += 1;
    }
    return { updated, skipped };
  },
});
