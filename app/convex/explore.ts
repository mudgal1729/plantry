import { query } from "./_generated/server.js";
import { v } from "convex/values";
import { dishes, ingredients, catalog } from "@plantry/engine/library";
import { history } from "@plantry/engine/history";
import {
  rankExplore,
  type ExploreAffinityKey,
  type MenuHistoryRow,
  type Season,
} from "@plantry/engine";

/**
 * Explore feed for the Explore tab (`features/design-revamp.md` §1.4 item 4,
 * §1.5, §6.12). Returns the eligible (active, in-season), NEVER-COOKED library
 * dishes ranked "familiar but new" by the engine `rankExplore`, each carrying
 * its `dominantAffinity` key. The UI phrases the "why it fits" line from the
 * key; no UI prose leaks out of the engine (Principle 7).
 *
 * Last-cooked join. "Never cooked" is the union of two cooking records: the
 * baked `menu_history` (the seed and periodic snapshot, bundled into the engine)
 * and the live Convex `weekArchive` (weeks finalized since the last bake). A
 * dish cooked in either is excluded from Explore. We feed the engine the baked
 * history plus a synthetic history row per `weekArchive` row, so a dish a recent
 * finalize already recorded does not resurface as "new on the plate". The
 * archive rows already mirror the `MenuHistoryRow` shape (day long-form, meal
 * capitalised), so the merge is a direct map.
 *
 * The ranking is the engine's; this query only supplies inputs (library,
 * merged history, season, ingredient rows + catalog for protein derivation) and
 * projects the result to the wire shape the Explore tab consumes. With an empty
 * `weekArchive` (production today) the merged history equals the baked history,
 * so the feed is exactly what the engine produces from the seed.
 */

/**
 * Bangalore seasons per `docs/product.md` §1. Inlined from generateWeek.ts /
 * swap.ts / dayMutations.ts (a fourth similar caller; the inline copy stays per
 * `docs/product.md` §4 Principle 8 rather than extracting a shared helper for a
 * one-line month read). Reads the month from the ISO date string ("YYYY-MM-DD").
 */
function seasonOf(isoDate: string): Season {
  const month = Number.parseInt(isoDate.slice(5, 7), 10);
  if (month >= 3 && month <= 5) return "Summer";
  if (month >= 6 && month <= 9) return "Monsoon";
  return "Winter";
}

export interface ExploreFeedDish {
  dishId: number;
  name: string;
  /** Structured affinity key; the UI phrases the "why it fits" line from it. */
  dominantAffinity: ExploreAffinityKey;
}

/**
 * Browser-callable query. The PWA subscribes via
 * `useQuery(anyApi.explore.getExploreFeed, { weekStart })`. `weekStart` only
 * fixes the season; the ranking spans both meal-times (Explore is not slot
 * scoped). Returns the full ranked list (the UI decides how many to show).
 */
export const getExploreFeed = query({
  args: { weekStart: v.string() },
  handler: async (ctx, args): Promise<ExploreFeedDish[]> => {
    const archives = await ctx.db.query("weekArchive").collect();
    const archiveHistory: MenuHistoryRow[] = [];
    for (const archive of archives) {
      for (const row of archive.rows) {
        archiveHistory.push({
          weekStart: archive.weekStart,
          day: row.day,
          meal: row.meal,
          dishName: row.dishName,
          dishId: row.dishId,
        });
      }
    }

    const mergedHistory: MenuHistoryRow[] = [...history, ...archiveHistory];

    const ranked = rankExplore({
      library: dishes,
      history: mergedHistory,
      season: seasonOf(args.weekStart),
      ingredients,
      catalog,
    });

    // Decision 9: hide dishes already placed in the current week or queued for
    // next, so the tab keeps its "new on the plate" promise. Placed = any dish
    // id appearing in a current-week slot for `weekStart`; queued = any dish id
    // on a `queued` nextWeekQueue row (the queue is week-agnostic until a
    // generation run consumes it, so all queued rows are excluded). Both reads
    // are server-side so the wire payload is already trimmed.
    const week = await ctx.db
      .query("currentWeek")
      .withIndex("by_weekStart", (q) => q.eq("weekStart", args.weekStart))
      .unique();
    const scheduled = new Set<number>();
    if (week) {
      for (const slot of week.slots) {
        for (const pick of slot.dishes) {
          if (pick.dishId !== null) scheduled.add(pick.dishId);
        }
      }
    }
    const queued = await ctx.db
      .query("nextWeekQueue")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    for (const row of queued) scheduled.add(row.dishId);

    return ranked
      .filter((entry) => !scheduled.has(entry.dish.id))
      .map((entry) => ({
        dishId: entry.dish.id,
        name: entry.dish.name,
        dominantAffinity: entry.dominantAffinity,
      }));
  },
});
