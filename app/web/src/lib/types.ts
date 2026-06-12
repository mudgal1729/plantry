// Frontend-local type aliases for slice 1. These mirror the Convex schema
// for currentWeek but are duplicated here so app/web does not need a TS
// project reference to app/convex (the generated client uses anyApi at
// runtime; types come from convex/_generated/dataModel only when wired).

export type Identity = "rajat" | "tuhina";

export type ShortDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
export type Meal = "breakfast" | "lunch";
export type SlotSource = "generated" | "swapped" | "custom";
export type SlotAuthor = "rajat" | "tuhina" | "system";

/**
 * One picked dish at one position within a (day, meal) slot. Per-position
 * source/author/updatedAt let the slow loop attribute who changed which dish
 * within a multi-dish meal.
 */
export interface DishPick {
  dishId: number | null;
  customLabel: string | null;
  source: SlotSource;
  author: SlotAuthor;
  updatedAt: number;
}

/**
 * One (day, meal) slot. `dishes` is the position-ordered list of picks:
 * lead first (e.g. HP for Menu 1, complete_meal for Menu 3), then partners
 * and the lunch carb where applicable. Mon/Wed/Fri lunch holds 3 picks, Tue/
 * Thu lunch 4 picks, Sat lunch 3, Mon/Wed/Fri breakfast 2, Tue/Thu breakfast 1.
 */
export interface WeekSlot {
  day: ShortDay;
  meal: Meal;
  dishes: DishPick[];
}

/**
 * A day the household marked skipped (eating out or away). The day's dishes stay
 * in `slots` so restore is lossless; the Menu screen renders the reason in place
 * of meals, and the skip-aware grocery query drops the day's ingredients.
 */
export interface SkippedDay {
  day: ShortDay;
  reason: string;
  author: Identity;
  skippedAt: number;
}

export interface CurrentWeek {
  weekStart: string;
  status: "draft" | "final";
  slots: WeekSlot[];
  skippedDays?: SkippedDay[];
  version: number;
}

export interface CachedWeek {
  cachedAt: number;
  week: CurrentWeek;
}
