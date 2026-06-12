import { internalMutation } from "./_generated/server.js";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";
import { dishes, packSizes, ingredients } from "@plantry/engine/library";
import { history } from "@plantry/engine/history";
import { generateWeek, type GeneratedWeek, type Season } from "@plantry/engine";

type ShortDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
type LowerMeal = "breakfast" | "lunch";

/**
 * Bangalore seasons per `docs/product.md` §1:
 *   - Summer: March-May
 *   - Monsoon: June-September
 *   - Winter: October-February
 *
 * Reads the month directly from the ISO date string ("YYYY-MM-DD"); no Date
 * object is needed and no timezone math is involved.
 */
export function seasonOf(isoDate: string): Season {
  const month = Number.parseInt(isoDate.slice(5, 7), 10);
  if (month >= 3 && month <= 5) return "Summer";
  if (month >= 6 && month <= 9) return "Monsoon";
  return "Winter";
}

/**
 * `internalMutation` that calls the engine for a given Monday and persists the
 * resulting week into Convex. Not browser-callable: the EM (or a future Stream
 * F scheduled action) triggers it via `npx convex run`. The PWA renders
 * whatever `getCurrentWeek` returns.
 *
 * Replacement semantics: if a `currentWeek` row already exists for the same
 * `weekStart` (looked up via the `by_weekStart` index), it is deleted before
 * the new row is inserted. The new row starts at `version: 1`, `status:
 * "draft"`. A future auto-recovery slice may add validation that diffs the new
 * row against the old before committing the replacement.
 *
 * Shape conversion (engine -> Convex):
 *   - day: identity (the engine's `Day` is already short-form: "Mon".."Sat").
 *   - meal: lowercased ("Breakfast" -> "breakfast", "Lunch" -> "lunch").
 *   - dishes: every pick from `slot.dishes`, in pick order (lead first), each
 *     mapped to `{ dishId, customLabel: null, source: "generated",
 *     author: "system", updatedAt: now }`. A slot with no picks (cap drop
 *     wiped it) is skipped.
 *
 * Next-week queue (`features/design-revamp.md` §1.5, §3.2): before generating,
 * the run reads every `queued` `nextWeekQueue` row and passes its `dishId` as a
 * `requests` input to the engine. The engine places each requested dish into a
 * slot whose §3 composition accepts it (overriding §4 recency) or, if no slot
 * accepts it, emits an incident and does not place it. After generation, each
 * queue row whose dish actually landed in the week is marked `placed` with
 * `consumedWeekStart = weekStart`; rows whose dish could not be placed stay
 * `queued` (the engine's incident is persisted, and the slow loop re-reads them
 * next run). An empty queue (production today) yields no requests and leaves
 * generation byte-identical to before.
 *
 * Incidents: any human-readable warnings the engine reports (`GeneratedWeek
 * .incidents`, e.g. "Friday over cap (5), dropped: Rajma", or an unplaceable
 * requested dish) are persisted as one `incidents` row each with
 * `source: "engine"`, `severity: "warn"`, and `context: { weekStart, weekId }`.
 * The count is returned so the caller can see at a glance whether the generation
 * produced warnings worth inspecting.
 */
export const generateCurrentWeek = internalMutation({
  args: {
    weekStart: v.string(),
    rng: v.optional(v.number()),
    userRequestedDishId: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    weekId: Id<"currentWeek">;
    version: number;
    incidentCount: number;
    placedQueueDishIds: number[];
  }> => {
    const season = seasonOf(args.weekStart);

    // §1.5 next-week queue: queued saves become engine `requests`, in
    // insertion order (createdAt ascending) so an earlier save outranks a
    // later one when two compete for one accepting slot.
    const queued = await ctx.db
      .query("nextWeekQueue")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    queued.sort((a, b) => a.createdAt - b.createdAt);
    const requests = queued.map((row) => row.dishId);

    // The engine composes §1 schedule -> §2 alternation -> §3 composition
    // -> §3.2 substitution -> §4 priority -> §5 cap -> §6 consolidation, then
    // places §6 requested dishes ahead of recency where composition accepts them.
    const generated: GeneratedWeek = generateWeek({
      weekStart: args.weekStart,
      library: dishes,
      history,
      season,
      ingredients,
      packSizes,
      rng: args.rng !== undefined ? () => args.rng as number : undefined,
      userRequestedDishId: args.userRequestedDishId,
      requests,
    });

    // A requested dish "landed" iff it appears anywhere in the generated week
    // (the engine drops it from `days` when no slot's composition accepts it or
    // the §5 cap removes it). Compute the placed set from the result so the
    // queue rows reflect what actually shipped, not just what was requested.
    const placedDishIds = new Set<number>();
    for (const day of generated.days) {
      for (const slot of day.slots) {
        for (const dish of slot.dishes) placedDishIds.add(dish.id);
      }
    }

    const now = Date.now();
    const slots = generated.days.flatMap((d) =>
      d.slots
        .filter((slot) => slot.dishes.length > 0)
        .map((slot) => ({
          day: slot.day as ShortDay,
          meal: slot.meal.toLowerCase() as LowerMeal,
          dishes: slot.dishes.map((dish) => ({
            dishId: dish.id as number | null,
            customLabel: null as string | null,
            source: "generated" as const,
            author: "system" as const,
            updatedAt: now,
          })),
        })),
    );

    // Replace any existing row for this weekStart. Documented as intentional;
    // future auto-recovery middleware may insert a validation diff here.
    const existing = await ctx.db
      .query("currentWeek")
      .withIndex("by_weekStart", (q) => q.eq("weekStart", args.weekStart))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    const weekId = await ctx.db.insert("currentWeek", {
      weekStart: args.weekStart,
      status: "draft",
      slots,
      version: 1,
    });

    for (const message of generated.incidents) {
      await ctx.db.insert("incidents", {
        createdAt: now,
        source: "engine",
        severity: "warn",
        context: { weekStart: args.weekStart, weekId },
        message,
        resolvedAt: null,
      });
    }

    // Mark each consumed queue row: rows whose dish landed become `placed` with
    // the consuming week; rows whose dish could not be placed stay `queued` (the
    // engine already logged the incident above) so next week's run retries them.
    const placedQueueDishIds: number[] = [];
    for (const row of queued) {
      if (!placedDishIds.has(row.dishId)) continue;
      await ctx.db.patch(row._id, {
        status: "placed",
        consumedWeekStart: args.weekStart,
      });
      placedQueueDishIds.push(row.dishId);
    }

    return {
      weekId,
      version: 1,
      incidentCount: generated.incidents.length,
      placedQueueDishIds,
    };
  },
});
