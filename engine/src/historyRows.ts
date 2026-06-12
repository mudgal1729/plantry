import type { MenuHistoryRow } from "./data/schemas.js";
import type { Day, Meal } from "./eligibility.js";
import type { GeneratedWeek } from "./generateWeek.js";

/**
 * History-row derivation (docs/engine.md §6 Skipped days, design-revamp §1.4
 * item 3). On finalize, a week's picked dishes append to the historical record
 * (docs/product.md §3 item 4); that record drives the §4 recency rule on later
 * weeks. This pure function derives those `MenuHistoryRow` rows from a generated
 * week.
 *
 * Skipped days are skip-aware: a skipped day keeps its dishes in the data (so a
 * restore is lossless) but contributes NO history rows, because the dishes were
 * not cooked, so recency must not see them. Pass the skipped days via the
 * optional `skippedDays`; the default (none skipped) leaves every caller's
 * behaviour unchanged (pure, additive).
 *
 * Custom one-offs (dishes with no library id) are not part of the generated
 * `GeneratedWeek` shape, which only carries library `Dish` objects; the
 * Convex-side finalize is responsible for excluding custom picks from the
 * archive. This engine function operates on the generated week only.
 */

const LONG_DAY: Record<Day, MenuHistoryRow["day"]> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

const CAP_MEAL: Record<Meal, MenuHistoryRow["meal"]> = {
  Breakfast: "Breakfast",
  Lunch: "Lunch",
};

export interface DeriveHistoryRowsArgs {
  week: GeneratedWeek;
  /**
   * Days excluded from the history append (a fast-loop skip). Defaults to none,
   * so existing callers are unchanged. Dishes on a skipped day stay in `week`
   * but produce zero history rows here.
   */
  skippedDays?: ReadonlyArray<Day>;
}

/**
 * Derive the finalize history rows for a generated week, one row per picked
 * dish in (day, meal, pick) order. Skipped days contribute zero rows.
 */
export function deriveHistoryRows(args: DeriveHistoryRowsArgs): MenuHistoryRow[] {
  const { week, skippedDays } = args;
  const skipped = new Set<Day>(skippedDays ?? []);

  const rows: MenuHistoryRow[] = [];
  for (const day of week.days) {
    if (skipped.has(day.day)) continue;
    for (const slot of day.slots) {
      for (const dish of slot.dishes) {
        rows.push({
          weekStart: week.weekStart,
          day: LONG_DAY[day.day],
          meal: CAP_MEAL[slot.meal],
          dishName: dish.name,
          dishId: dish.id,
        });
      }
    }
  }
  return rows;
}
