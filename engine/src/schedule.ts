import type { Day, Meal } from "./eligibility.js";

export type LunchMenu = 1 | 2 | 3 | 4;

export interface SlotPlan {
  day: Day;
  meal: Meal;
  itemCount: number;
  lunchMenu?: LunchMenu;
}

export interface WeekScheduleArgs {
  weekStart: string;
  lastSaturdayMenu?: 3 | 4 | null;
  rng?: () => number;
}

const WEEKDAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const ISO_MONDAY = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoMonday(weekStart: string): void {
  if (!ISO_MONDAY.test(weekStart)) {
    throw new Error(
      `weekStart must be an ISO date (YYYY-MM-DD); got ${weekStart}`,
    );
  }
  const [y, m, d] = weekStart.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (
    utc.getUTCFullYear() !== y ||
    utc.getUTCMonth() !== m - 1 ||
    utc.getUTCDate() !== d
  ) {
    throw new Error(`weekStart is not a valid calendar date: ${weekStart}`);
  }
  if (utc.getUTCDay() !== 1) {
    throw new Error(`weekStart must be a Monday; got ${weekStart}`);
  }
}

function weekdayLunchMenu(day: Day): LunchMenu {
  return day === "Mon" || day === "Wed" || day === "Fri" ? 1 : 2;
}

function weekdayBreakfastItemCount(day: Day): number {
  return day === "Mon" || day === "Wed" || day === "Fri" ? 2 : 1;
}

function weekdayLunchItemCount(day: Day): number {
  return day === "Mon" || day === "Wed" || day === "Fri" ? 3 : 4;
}

function pickSaturdayMenu(
  lastSaturdayMenu: 3 | 4 | null | undefined,
  rng: () => number,
): 3 | 4 {
  if (lastSaturdayMenu === 3) return 4;
  if (lastSaturdayMenu === 4) return 3;
  return rng() < 0.5 ? 3 : 4;
}

export function weekSchedule(args: WeekScheduleArgs): SlotPlan[] {
  assertIsoMonday(args.weekStart);
  const rng = args.rng ?? Math.random;

  const slots: SlotPlan[] = [];
  for (const day of WEEKDAYS) {
    slots.push({
      day,
      meal: "Breakfast",
      itemCount: weekdayBreakfastItemCount(day),
    });
    slots.push({
      day,
      meal: "Lunch",
      itemCount: weekdayLunchItemCount(day),
      lunchMenu: weekdayLunchMenu(day),
    });
  }

  const saturdayMenu = pickSaturdayMenu(args.lastSaturdayMenu, rng);
  slots.push({
    day: "Sat",
    meal: "Lunch",
    itemCount: 3,
    lunchMenu: saturdayMenu,
  });

  return slots;
}
