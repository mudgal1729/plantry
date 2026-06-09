import type { Dish, Satiety } from "./data/schemas.js";
import type { Day } from "./eligibility.js";

/**
 * The shape of a single picked item in the week-in-progress. §5 cares only
 * about a dish's Satiety and Prep Min; downstream consumers (generateWeek)
 * may need additional per-slot metadata. We expose the seam as a type alias
 * so a future grouping change does not ripple through this module. For
 * slice 6 a SlotPick is just a Dish.
 */
export type SlotPick = Dish;

/** docs/engine.md §5 ("5 items per weekday"). */
export const WEEKDAY_CAP = 5;
/** docs/engine.md §5 ("3 on Saturday"). */
export const SATURDAY_CAP = 3;

const WEEKDAYS: ReadonlySet<Day> = new Set<Day>([
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
]);

const SATIETY_RANK: Record<Satiety, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

export interface ApplyCapArgs {
  slotsByDay: Map<Day, SlotPick[]>;
}

export interface ApplyCapResult {
  slotsByDay: Map<Day, SlotPick[]>;
  droppedDishIds: number[];
}

/**
 * Per-day item cap from docs/engine.md §5. When a day exceeds its cap, drop
 * dishes one at a time:
 *   1. From the dishes with the lowest Satiety value present in the menu.
 *   2. Among those, drop the one with the longest Prep Min.
 * Tie-break beyond §5: when two dishes share both Satiety and Prep Min, the
 * one later in the day's array is dropped (earlier slots' picks win). This is
 * stable: a day at or below its cap is returned unchanged. Sunday, if present,
 * is passed through; §2 schedule emits no Sunday slots so this is defensive.
 */
export function applyCap(args: ApplyCapArgs): ApplyCapResult {
  const out = new Map<Day, SlotPick[]>();
  const droppedDishIds: number[] = [];

  for (const [day, picks] of args.slotsByDay) {
    const cap = capForDay(day);
    if (cap === null || picks.length <= cap) {
      out.set(day, [...picks]);
      continue;
    }
    const { kept, dropped } = trimToCap(picks, cap);
    out.set(day, kept);
    for (const dish of dropped) {
      droppedDishIds.push(dish.id);
    }
  }

  return { slotsByDay: out, droppedDishIds };
}

/** Returns the per-day cap, or null for days without an enforced cap (Sun). */
function capForDay(day: Day | string): number | null {
  if (WEEKDAYS.has(day as Day)) return WEEKDAY_CAP;
  if (day === "Sat") return SATURDAY_CAP;
  return null;
}

/**
 * Repeatedly drop the worst dish until length is at the cap. "Worst" per §5:
 * lowest Satiety; among those the longest Prep Min; final tie-break is the
 * latest position in the current array (stable for earlier picks).
 */
function trimToCap(
  picks: readonly SlotPick[],
  cap: number,
): { kept: SlotPick[]; dropped: SlotPick[] } {
  const working: SlotPick[] = [...picks];
  const dropped: SlotPick[] = [];
  while (working.length > cap) {
    const dropIndex = pickDropIndex(working);
    dropped.push(working[dropIndex]);
    working.splice(dropIndex, 1);
  }
  return { kept: working, dropped };
}

/**
 * Index of the dish to drop next per §5. Scans once, keeping the worst-so-far.
 * Worse = lower satiety, or equal satiety with longer prepMinutes, or both
 * equal with a later array position (the original §5 ordering is silent on
 * the final tie so we lock it here and document it inline).
 */
function pickDropIndex(picks: readonly SlotPick[]): number {
  let worstIndex = 0;
  for (let i = 1; i < picks.length; i += 1) {
    if (isWorse(picks[i], picks[worstIndex])) {
      worstIndex = i;
    }
  }
  return worstIndex;
}

function isWorse(a: SlotPick, b: SlotPick): boolean {
  const sa = SATIETY_RANK[a.satiety];
  const sb = SATIETY_RANK[b.satiety];
  if (sa !== sb) return sa < sb;
  if (a.prepMinutes !== b.prepMinutes) return a.prepMinutes > b.prepMinutes;
  // Equal on both §5 criteria: prefer to drop the later one (keep earlier slots).
  // Returning true here means "a is worse than b" so the scan replaces b with a
  // whenever we see an equal candidate later in the array.
  return true;
}
