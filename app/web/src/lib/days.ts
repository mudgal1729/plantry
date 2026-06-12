import type { ShortDay, Meal } from "./types.js";

// The Convex schema stores currentWeek.slots[].day in short form ("Mon"..."Sat")
// because that's the live-plan format; weekArchive uses the full-word form to
// match menu_history.md. The view renders full words, so we translate here.
const DAY_LABELS: Record<ShortDay, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

const DAY_ORDER: ShortDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayLabel(day: ShortDay): string {
  return DAY_LABELS[day];
}

export function dayOrderIndex(day: ShortDay): number {
  return DAY_ORDER.indexOf(day);
}

export function mealLabel(meal: Meal): string {
  return meal === "breakfast" ? "Breakfast" : "Lunch";
}

export function mealOrderIndex(meal: Meal): number {
  return meal === "breakfast" ? 0 : 1;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// weekStart is an ISO date string for the Monday of the week (e.g. "2026-06-15").
// We parse it as a local calendar date (split, not Date(string), to avoid the
// UTC-midnight shift that can land the badge on the wrong day in IST).
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => Number.parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export interface DayDate {
  /** Day-of-month number, e.g. 15. */
  num: number;
  /** Three-letter month, e.g. "Jun". */
  month: string;
}

/** The calendar date for a short day within the week starting at weekStart. */
export function dayDate(weekStart: string, day: ShortDay): DayDate {
  const monday = parseISODate(weekStart);
  const offset = dayOrderIndex(day);
  const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
  return { num: date.getDate(), month: SHORT_MONTHS[date.getMonth()] };
}

/** Human range for the week header, e.g. "Jun 15 to 20" or "Jun 30 to Jul 4". */
export function weekRangeLabel(weekStart: string): string {
  const monday = parseISODate(weekStart);
  const saturday = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + dayOrderIndex("Sat"),
  );
  const startMonth = SHORT_MONTHS[monday.getMonth()];
  const endMonth = SHORT_MONTHS[saturday.getMonth()];
  if (startMonth === endMonth) {
    return `${startMonth} ${monday.getDate()} to ${saturday.getDate()}`;
  }
  return `${startMonth} ${monday.getDate()} to ${endMonth} ${saturday.getDate()}`;
}
