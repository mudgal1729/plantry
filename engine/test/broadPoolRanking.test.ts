import { describe, it, expect } from "vitest";
import { rankCandidates } from "../src/priority.js";
import { emptyLedger } from "../src/consolidation.js";
import type { Dish, MenuHistoryRow, PackSizeHeader } from "../src/data/schemas.js";

/**
 * Stream H: the non-restrictive swap picker (in `app/convex/swap.ts`) collects
 * every Active + in-season + meal-time-matching dish and hands it to
 * `rankCandidates`. These tests verify that `rankCandidates` correctly ranks
 * such a broad pool by §4 priority (longest-unused first, with the ingredient-
 * ledger and Preferred=Yes tilts), so the convex-side picker's contract
 * (described in `features/multi-dish-slots.md`) holds at the engine layer.
 */

let nextId = 1;
function makeDish(overrides: Partial<Dish> = {}): Dish {
  const id = nextId++;
  return {
    id,
    name: `Dish ${id}`,
    category: "Gravy dish",
    time: "Lunch",
    tags: [],
    primaryIngredient: "Paneer",
    preferred: "No",
    active: "Yes",
    satiety: "Medium",
    prepMinutes: 30,
    seasons: "All",
    ...overrides,
  };
}

function historyRow(dishId: number, dishName: string, weekStart: string): MenuHistoryRow {
  return {
    weekStart,
    day: "Monday",
    meal: "Lunch",
    dishName,
    dishId,
  };
}

describe("Stream H broad-pool ranking", () => {
  it("longest-unused dish surfaces first across categories", () => {
    nextId = 1;
    // Broad lunch pool mixing categories that would be split across multiple
    // composition pools (HP, non-HP gravy, accompaniment, lunch carb): the
    // non-restrictive picker mashes them all together.
    const hp = makeDish({ name: "Rajma", category: "Gravy dish", tags: ["HP"] });
    const nonHpGravy = makeDish({ name: "Aloo Gobi", category: "Gravy dish" });
    const accompaniment = makeDish({ name: "Salad", category: "Accompaniment" });
    const lunchCarb = makeDish({ name: "Chapati", category: "Chapati" });
    const pool = [hp, nonHpGravy, accompaniment, lunchCarb];

    // Rajma was cooked very recently; Aloo Gobi was cooked last quarter;
    // Salad never cooked. Lunch carbs are recency-exempt so their position is
    // preserved.
    const history: MenuHistoryRow[] = [
      historyRow(hp.id, hp.name, "2026-06-01"),
      historyRow(nonHpGravy.id, nonHpGravy.name, "2026-03-15"),
    ];

    const ranked = rankCandidates({ pool, history });
    // Never-cooked Salad outranks both cooked dishes; Aloo Gobi outranks
    // Rajma; lunch carb keeps its input slot (it is exempt).
    const ids = ranked.map((d) => d.id);
    expect(ids.indexOf(accompaniment.id)).toBeLessThan(ids.indexOf(nonHpGravy.id));
    expect(ids.indexOf(nonHpGravy.id)).toBeLessThan(ids.indexOf(hp.id));
    expect(ids).toContain(lunchCarb.id);
  });

  it("Preferred=Yes wins step-4 ties within the broad pool", () => {
    nextId = 1;
    const preferred = makeDish({ name: "Preferred", preferred: "Yes" });
    const notPreferred = makeDish({ name: "Not Preferred", preferred: "No" });
    const ranked = rankCandidates({ pool: [notPreferred, preferred], history: [] });
    expect(ranked[0].id).toBe(preferred.id);
  });

  it("accepts an ingredient-consolidation context without crashing on a broad pool", () => {
    nextId = 1;
    const a = makeDish({ name: "Paneer Bhurji", primaryIngredient: "Paneer" });
    const b = makeDish({ name: "Chicken Curry", primaryIngredient: "Chicken" });
    const pool = [a, b];

    // The non-restrictive picker always passes a ledger built from the
    // current week's other picks; here we verify rankCandidates returns the
    // full pool when given an empty ledger (the broad pool is preserved, no
    // dish is dropped by the §6 tilt).
    const packSizes: PackSizeHeader[] = [{ ingredient: "Paneer", packSize: "200g pack" }];
    const ledger = emptyLedger(packSizes);

    const ranked = rankCandidates({
      pool,
      history: [],
      consolidationContext: {
        ledger,
        ingredients: [
          {
            dishId: a.id,
            dishName: a.name,
            ingredient: "Paneer",
            quantity: 80,
            unit: "g",
          },
          {
            dishId: b.id,
            dishName: b.name,
            ingredient: "Chicken",
            quantity: 200,
            unit: "g",
          },
        ],
      },
    });
    expect(ranked).toHaveLength(2);
    expect(new Set(ranked.map((d) => d.id))).toEqual(new Set([a.id, b.id]));
  });
});
