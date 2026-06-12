import { describe, it, expect } from "vitest";
import { deriveHistoryRows } from "../src/historyRows.js";
import type { GeneratedWeek } from "../src/generateWeek.js";
import type { Dish } from "../src/data/schemas.js";

/**
 * docs/engine.md §6 Skipped days, finalize half. `deriveHistoryRows` derives the
 * menu-history append from a generated week and is skip-aware: a skipped day
 * keeps its dishes in the week but contributes zero history rows.
 */

let nextId = 1;
function makeDish(name: string): Dish {
  return {
    id: nextId++,
    name,
    category: "Gravy dish",
    time: "Lunch",
    tags: [],
    primaryIngredient: "Paneer",
    preferred: "No",
    active: "Yes",
    satiety: "Medium",
    prepMinutes: 30,
    seasons: "All",
  };
}

function makeWeek(): GeneratedWeek {
  nextId = 1;
  const monB = makeDish("Poha");
  const monL = makeDish("Dal");
  const friL = makeDish("Rajma");
  return {
    weekStart: "2026-06-15",
    days: [
      {
        day: "Mon",
        slots: [
          { day: "Mon", meal: "Breakfast", dishes: [monB] },
          { day: "Mon", meal: "Lunch", dishes: [monL] },
        ],
      },
      {
        day: "Fri",
        slots: [{ day: "Fri", meal: "Lunch", dishes: [friL] }],
      },
    ],
    droppedDishIds: [],
    incidents: [],
  };
}

describe("§6 deriveHistoryRows", () => {
  it("derives one row per picked dish, with long day names and capitalized meals", () => {
    const rows = deriveHistoryRows({ week: makeWeek() });
    expect(rows).toEqual([
      { weekStart: "2026-06-15", day: "Monday", meal: "Breakfast", dishName: "Poha", dishId: 1 },
      { weekStart: "2026-06-15", day: "Monday", meal: "Lunch", dishName: "Dal", dishId: 2 },
      { weekStart: "2026-06-15", day: "Friday", meal: "Lunch", dishName: "Rajma", dishId: 3 },
    ]);
  });

  it("defaults to no days skipped (existing callers unchanged)", () => {
    const withDefault = deriveHistoryRows({ week: makeWeek() });
    const withEmpty = deriveHistoryRows({ week: makeWeek(), skippedDays: [] });
    expect(withDefault).toEqual(withEmpty);
  });

  it("excludes a skipped day's rows; the dishes stay in the week", () => {
    const week = makeWeek();
    const rows = deriveHistoryRows({ week, skippedDays: ["Fri"] });
    // Fri (Rajma) is gone from history; Mon's two rows remain.
    expect(rows.map((r) => r.dishName)).toEqual(["Poha", "Dal"]);
    // The week itself is untouched (restore is lossless): Fri still present.
    expect(week.days.some((d) => d.day === "Fri")).toBe(true);
  });

  it("a fully skipped week derives zero rows", () => {
    const rows = deriveHistoryRows({ week: makeWeek(), skippedDays: ["Mon", "Fri"] });
    expect(rows).toEqual([]);
  });
});
