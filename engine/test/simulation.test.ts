import { describe, it, expect } from "vitest";
import { generateWeek } from "../src/generateWeek.js";
import { deriveHistoryRows } from "../src/historyRows.js";
import { aggregateGroceryList, type GroceryDayPicks } from "../src/groceryList.js";
import { loadLiveData } from "./loadLive.js";
import type { Day } from "../src/eligibility.js";
import type { MenuHistoryRow, Season } from "../src/data/schemas.js";

/**
 * Forward simulation harness (docs/engine.md §9 spec-code parity: "the
 * simulation harness exercises all sections end-to-end against
 * data/menu_history.md plus four to six weeks of forward simulation"). Each
 * week: generate, finalize (append derived history rows), feed history forward,
 * build the grocery list. One week is a skipped-day week, exercising §6: a
 * skipped day keeps its dishes in the generated week but contributes nothing to
 * the grocery list and nothing to the history append.
 *
 * Determinism: a fixed RNG drives the Saturday alternation, so the run is
 * reproducible. The skipped-day week's property assertions are the §6 contract:
 * skipped days contribute zero grocery rows and zero history rows.
 */

const WEEKDAY_ORDER: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Deterministic 0..1 RNG (a simple LCG), so the simulation is reproducible. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function seasonOf(weekStart: string): Season {
  const month = Number.parseInt(weekStart.slice(5, 7), 10);
  if (month >= 3 && month <= 5) return "Summer";
  if (month >= 6 && month <= 9) return "Monsoon";
  return "Winter";
}

/** Flatten a generated week's days into day-tagged picks for the grocery list. */
function weekDayPicks(week: ReturnType<typeof generateWeek>): GroceryDayPicks[] {
  return week.days.map((d) => ({
    day: d.day,
    dishes: d.slots.flatMap((s) => s.dishes),
  }));
}

/** Consecutive Mondays from a start ISO date. */
function mondays(start: string, count: number): string[] {
  const out: string[] = [];
  const base = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

describe("forward simulation harness", () => {
  const { library, ingredients, packSizes, catalog, history: seedHistory } = loadLiveData();

  // Five forward weeks starting from a fixed Monday. Week index 2 (the third
  // week) is the skipped-day week, skipping Friday.
  const WEEKS = 5;
  const SKIPPED_WEEK_INDEX = 2;
  const SKIPPED_DAY: Day = "Fri";
  const weekStarts = mondays("2026-06-15", WEEKS);

  it("runs five forward weeks, each a full valid menu, history accumulating", () => {
    const rng = makeRng(42);
    let history: MenuHistoryRow[] = [...seedHistory];
    let lastSaturdayMenu: 3 | 4 | null = null;

    for (let i = 0; i < WEEKS; i += 1) {
      const weekStart = weekStarts[i];
      const season = seasonOf(weekStart);
      const week = generateWeek({
        weekStart,
        library,
        history,
        season,
        ingredients,
        packSizes,
        rng,
        lastSaturdayMenu,
      });

      // Every scheduled day produces at least one dish.
      for (const day of week.days) {
        const total = day.slots.reduce((sum, s) => sum + s.dishes.length, 0);
        expect(total).toBeGreaterThan(0);
      }

      // Finalize: append derived history rows. The skipped week skips Friday.
      const skippedDays = i === SKIPPED_WEEK_INDEX ? [SKIPPED_DAY] : [];
      const rows = deriveHistoryRows({ week, skippedDays });
      history = [...history, ...rows];

      // Track Saturday menu form for next week's alternation.
      const satLunch = week.days
        .find((d) => d.day === "Sat")
        ?.slots.find((s) => s.meal === "Lunch");
      if (satLunch && satLunch.dishes.length > 0) {
        // Menu 3 leads with complete_meal+HP, Menu 4 with complete_meal (non-HP).
        const lead = satLunch.dishes[0];
        lastSaturdayMenu = lead.tags.includes("HP") ? 3 : 4;
      }
    }

    // History grew by roughly five weeks of rows (minus the skipped Friday).
    expect(history.length).toBeGreaterThan(seedHistory.length);
  });

  it("property: a skipped day contributes zero grocery rows and zero history rows", () => {
    const rng = makeRng(7);
    const weekStart = weekStarts[SKIPPED_WEEK_INDEX];
    const season = seasonOf(weekStart);
    const week = generateWeek({
      weekStart,
      library,
      history: seedHistory,
      season,
      ingredients,
      packSizes,
      rng,
    });

    // The skipped day really has generated dishes (so the property is non-trivial).
    const skippedDay = week.days.find((d) => d.day === SKIPPED_DAY);
    expect(skippedDay).toBeDefined();
    const skippedDishIds = (skippedDay?.slots ?? []).flatMap((s) => s.dishes.map((d) => d.id));
    expect(skippedDishIds.length).toBeGreaterThan(0);

    // History rows: none reference the skipped day.
    const skippedRows = deriveHistoryRows({ week, skippedDays: [SKIPPED_DAY] });
    expect(skippedRows.some((r) => r.day === "Friday")).toBe(false);

    // The dropped rows are exactly the skipped day's rows.
    const fullRows = deriveHistoryRows({ week });
    expect(fullRows.length - skippedRows.length).toBe(
      (skippedDay?.slots ?? []).reduce((sum, s) => sum + s.dishes.length, 0),
    );

    // Grocery list: ingredients unique to the skipped day disappear.
    const days = weekDayPicks(week);
    const withSkip = aggregateGroceryList({
      days,
      skippedDays: [SKIPPED_DAY],
      ingredients,
      packSizes,
      catalog,
    });
    const withoutSkip = aggregateGroceryList({ days, ingredients, packSizes, catalog });

    // Build the set of ingredient names that ONLY the skipped day's dishes use.
    const ingByDish = new Map<number, Set<string>>();
    for (const r of ingredients) {
      const set = ingByDish.get(r.dishId) ?? new Set<string>();
      set.add(r.ingredient);
      ingByDish.set(r.dishId, set);
    }
    const skippedIngredients = new Set<string>();
    for (const id of skippedDishIds) {
      for (const name of ingByDish.get(id) ?? []) skippedIngredients.add(name);
    }
    const otherDishIds = week.days
      .filter((d) => d.day !== SKIPPED_DAY)
      .flatMap((d) => d.slots.flatMap((s) => s.dishes.map((dish) => dish.id)));
    const keptIngredients = new Set<string>();
    for (const id of otherDishIds) {
      for (const name of ingByDish.get(id) ?? []) keptIngredients.add(name);
    }
    const onlySkippedIngredients = [...skippedIngredients].filter(
      (name) => !keptIngredients.has(name),
    );

    const namesIn = (list: typeof withSkip) =>
      new Set(list.groups.flatMap((g) => g.items.map((i) => i.ingredient)));
    const withSkipNames = namesIn(withSkip);
    const withoutSkipNames = namesIn(withoutSkip);

    // Every ingredient unique to the skipped day is present without the skip and
    // absent with it.
    for (const name of onlySkippedIngredients) {
      expect(withoutSkipNames.has(name)).toBe(true);
      expect(withSkipNames.has(name)).toBe(false);
    }
  });

  it("is deterministic: same seed reproduces the same five-week run", () => {
    function run(seed: number): number[] {
      const rng = makeRng(seed);
      let history: MenuHistoryRow[] = [...seedHistory];
      const ids: number[] = [];
      for (let i = 0; i < WEEKS; i += 1) {
        const weekStart = weekStarts[i];
        const week = generateWeek({
          weekStart,
          library,
          history,
          season: seasonOf(weekStart),
          ingredients,
          packSizes,
          rng,
        });
        for (const day of week.days) {
          for (const slot of day.slots) {
            for (const dish of slot.dishes) ids.push(dish.id);
          }
        }
        history = [...history, ...deriveHistoryRows({ week })];
      }
      return ids;
    }
    expect(run(99)).toEqual(run(99));
  });

  it("emits days in canonical Mon..Sat order each week", () => {
    const rng = makeRng(3);
    const week = generateWeek({
      weekStart: weekStarts[0],
      library,
      history: seedHistory,
      season: seasonOf(weekStarts[0]),
      ingredients,
      packSizes,
      rng,
    });
    const order = week.days.map((d) => d.day);
    const expected = WEEKDAY_ORDER.filter((d) => order.includes(d));
    expect(order).toEqual(expected);
  });
});
