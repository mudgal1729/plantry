import type { Dish, MenuHistoryRow, Season } from "./data/schemas.js";
import type { Day, Meal } from "./eligibility.js";
import { composeSlot, candidateSetPools } from "./composition.js";
import type { SlotPlan } from "./schedule.js";

/**
 * Requested dishes (docs/engine.md §6 Requested dishes, design-revamp §1.4 item 2).
 *
 * `generateWeek` accepts an optional `requests` input: a list of dish ids the
 * next generation must place (later fed by the next-week queue). This generalises
 * the existing §3.2 trigger (a) into one mechanism:
 *
 *   - A requested dish is placed into a slot WHOSE COMPOSITION ACCEPTS IT,
 *     overriding recency. "Composition accepts it" means the dish appears in at
 *     least one position pool of that slot's §3 candidate set (it is an Active,
 *     in-season, meal-time-matching dish the slot could legitimately hold).
 *   - A request that CANNOT be placed (no slot's composition ever accepts it, or
 *     it is out of season, inactive, or not in the library) produces an INCIDENT
 *     and is NOT placed. The dish stays queued; the caller re-queues it next week.
 *     Generation never crashes and never forces a dish into an incompatible slot.
 *
 * The mechanism is deliberately MINIMAL: a list of dish ids, not a generic
 * directive language. No calendar awareness (a request cannot pin a specific day);
 * that can earn its way in later (Principle 1, Principle 8). The planner picks the
 * first schedule slot (in schedule order) whose composition accepts the dish and
 * that is not already taken by an earlier request, so two requests never collide
 * on one slot.
 *
 * This module is a PURE PLANNER: it reads the schedule, library, season, and
 * history and returns, per requested id, either a pinned (day, meal) slot or an
 * incident. `generateWeek` then pins each placement exactly the way it already
 * pins a §3.2 substitution lead (overriding §4 recency for that one position).
 * The default empty `requests` list yields no pins and no incidents, so behaviour
 * is identical to today and every existing caller stays green.
 */

/** A single request resolved to the slot it will be pinned into. */
export interface RequestPlacement {
  dishId: number;
  day: Day;
  meal: Meal;
}

export interface PlanRequestsArgs {
  /** Dish ids the next generation must place, in priority order. */
  requests: number[];
  /** The (already substitution-rewritten) week schedule generateWeek will run. */
  schedule: SlotPlan[];
  library: Dish[];
  history: MenuHistoryRow[];
  season: Season;
  /**
   * Slots already pinned by a §3.2 substitution lead. A request never overrides
   * an existing substitution pin; it takes the next accepting slot instead.
   */
  reservedSlots?: ReadonlySet<string>;
}

export interface PlanRequestsResult {
  /** One placement per request that found an accepting, free slot. */
  placements: RequestPlacement[];
  /**
   * Human-readable incidents, one per request that could not be placed (out of
   * season, inactive, unknown id, or no composition slot accepts it).
   */
  incidents: string[];
  /** Ids of the requests that could not be placed (mirror of `incidents`). */
  unplaceableDishIds: number[];
}

/** Stable key for a (day, meal) slot, so pins and reservations dedupe cleanly. */
export function slotKey(day: Day, meal: Meal): string {
  return `${day}/${meal}`;
}

/**
 * Does this slot's §3 composition accept the dish? True when the dish id appears
 * in any position pool of the slot's candidate set. Out-of-season, inactive, and
 * wrong-meal-time dishes never appear in a pool, so they are rejected here.
 */
function slotAcceptsDish(args: {
  slot: SlotPlan;
  dishId: number;
  library: Dish[];
  history: MenuHistoryRow[];
  season: Season;
  /** Lunch carbs already pinned earlier in the plan, for the §3.1 Rice cap. */
  weekLunchCarbs: Dish[];
}): boolean {
  const candidateSet = composeSlot({
    slot: args.slot,
    library: args.library,
    history: args.history,
    season: args.season,
    weekLunchCarbs: args.weekLunchCarbs,
  });
  for (const pool of candidateSetPools(candidateSet)) {
    if (pool.some((d) => d.id === args.dishId)) return true;
  }
  return false;
}

/**
 * Plan requested-dish placements against the schedule. Pure: no RNG, no
 * mutation of inputs. Each request is resolved in order to the first schedule
 * slot (schedule order) whose composition accepts it and that is not already
 * reserved (by a §3.2 substitution) or taken by an earlier request. A request
 * that finds no accepting free slot becomes an incident and is not placed.
 */
export function planRequests(args: PlanRequestsArgs): PlanRequestsResult {
  const { requests, schedule, library, history, season } = args;
  const reserved = new Set(args.reservedSlots ?? []);
  const placements: RequestPlacement[] = [];
  const incidents: string[] = [];
  const unplaceableDishIds: number[] = [];

  // Slots already claimed by an earlier request in this same plan, so two
  // requests never land on one slot.
  const takenSlots = new Set<string>();
  // Lunch carbs pinned by earlier requests, so a later Rice request sees the
  // §3.1 "Rice at most once" cap the same way generation will.
  const pinnedLunchCarbs: Dish[] = [];

  for (const dishId of requests) {
    const dish = library.find((d) => d.id === dishId);
    let placedSlot: SlotPlan | undefined;
    if (dish) {
      placedSlot = schedule.find((slot) => {
        const key = slotKey(slot.day, slot.meal);
        if (reserved.has(key) || takenSlots.has(key)) return false;
        return slotAcceptsDish({
          slot,
          dishId,
          library,
          history,
          season,
          weekLunchCarbs: pinnedLunchCarbs,
        });
      });
    }

    if (!placedSlot || !dish) {
      const name = dish ? dish.name : `dish ${dishId}`;
      incidents.push(`Requested ${name} could not be placed (no composition slot accepts it)`);
      unplaceableDishIds.push(dishId);
      continue;
    }

    const key = slotKey(placedSlot.day, placedSlot.meal);
    takenSlots.add(key);
    if (dish.category === "Chapati" || dish.category === "Rice") {
      pinnedLunchCarbs.push(dish);
    }
    placements.push({ dishId, day: placedSlot.day, meal: placedSlot.meal });
  }

  return { placements, incidents, unplaceableDishIds };
}
