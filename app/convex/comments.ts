import { internalMutation } from "./_generated/server.js";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";

/** Marks each comment in commentIds as applied with resolvedAt = now and resolvedPr = arg. */
export const markCommentsApplied = internalMutation({
  args: {
    commentIds: v.array(v.id("comments")),
    resolvedPr: v.string(),
  },
  handler: async (
    ctx,
    args: { commentIds: Id<"comments">[]; resolvedPr: string },
  ): Promise<{ updated: number; skipped: number }> => {
    const now = Date.now();
    let updated = 0;
    let skipped = 0;
    for (const id of args.commentIds) {
      const row = await ctx.db.get(id);
      if (!row) {
        skipped += 1;
        await ctx.db.insert("incidents", {
          createdAt: now,
          source: "backend",
          severity: "warn",
          context: {
            mutation: "markCommentsApplied",
            commentId: id,
            resolvedPr: args.resolvedPr,
          },
          message: `markCommentsApplied: comment ${id} not found; skipped.`,
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
            mutation: "markCommentsApplied",
            commentId: id,
            currentStatus: row.status,
            resolvedPr: args.resolvedPr,
          },
          message: `markCommentsApplied: comment ${id} already resolved (status ${row.status}); skipped.`,
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

/** Marks each comment in commentIds as reviewed_no_change with resolvedAt = now and resolvedPr = arg. */
export const markCommentsReviewedNoChange = internalMutation({
  args: {
    commentIds: v.array(v.id("comments")),
    resolvedPr: v.string(),
  },
  handler: async (
    ctx,
    args: { commentIds: Id<"comments">[]; resolvedPr: string },
  ): Promise<{ updated: number; skipped: number }> => {
    const now = Date.now();
    let updated = 0;
    let skipped = 0;
    for (const id of args.commentIds) {
      const row = await ctx.db.get(id);
      if (!row) {
        skipped += 1;
        await ctx.db.insert("incidents", {
          createdAt: now,
          source: "backend",
          severity: "warn",
          context: {
            mutation: "markCommentsReviewedNoChange",
            commentId: id,
            resolvedPr: args.resolvedPr,
          },
          message: `markCommentsReviewedNoChange: comment ${id} not found; skipped.`,
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
            mutation: "markCommentsReviewedNoChange",
            commentId: id,
            currentStatus: row.status,
            resolvedPr: args.resolvedPr,
          },
          message: `markCommentsReviewedNoChange: comment ${id} already resolved (status ${row.status}); skipped.`,
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

/** Marks each incident in incidentIds resolved by setting resolvedAt = now. */
export const markIncidentsResolved = internalMutation({
  args: {
    incidentIds: v.array(v.id("incidents")),
    resolvedPr: v.string(),
  },
  handler: async (
    ctx,
    args: { incidentIds: Id<"incidents">[]; resolvedPr: string },
  ): Promise<{ updated: number; skipped: number }> => {
    const now = Date.now();
    let updated = 0;
    let skipped = 0;
    for (const id of args.incidentIds) {
      const row = await ctx.db.get(id);
      if (!row) {
        skipped += 1;
        await ctx.db.insert("incidents", {
          createdAt: now,
          source: "backend",
          severity: "warn",
          context: {
            mutation: "markIncidentsResolved",
            incidentId: id,
            resolvedPr: args.resolvedPr,
          },
          message: `markIncidentsResolved: incident ${id} not found; skipped.`,
          resolvedAt: null,
        });
        continue;
      }
      if (row.resolvedAt !== null) {
        skipped += 1;
        await ctx.db.insert("incidents", {
          createdAt: now,
          source: "backend",
          severity: "warn",
          context: {
            mutation: "markIncidentsResolved",
            incidentId: id,
            previousResolvedAt: row.resolvedAt,
            resolvedPr: args.resolvedPr,
          },
          message: `markIncidentsResolved: incident ${id} already resolved; skipped.`,
          resolvedAt: null,
        });
        continue;
      }
      await ctx.db.patch(id, { resolvedAt: now });
      updated += 1;
    }
    return { updated, skipped };
  },
});
