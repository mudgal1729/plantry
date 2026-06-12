import { describe, it, expect } from "vitest";
import { rankPickerAlternatives, PROTEIN_BAND_WIDTH_GRAMS } from "../src/pickerRanking.js";
import type { CatalogIngredient, Dish, Ingredient, MenuHistoryRow } from "../src/data/schemas.js";

/**
 * docs/engine.md §5 Picker ranking. The swap/add picker ranks the broad
 * meal-time pool deterministically: a HEAD ("fits this day", not already on the
 * day) ordered by recency plus protein-band similarity to the outgoing dish,
 * then a TAIL of same-day repeats. No RNG; every tie resolves through recency,
 * then protein band (swaps), then dish id.
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

function historyRow(dishId: number, weekStart: string): MenuHistoryRow {
  return { weekStart, day: "Monday", meal: "Lunch", dishName: `Dish ${dishId}`, dishId };
}

describe("§5 picker ranking", () => {
  describe("head / tail split", () => {
    it("ranks not-on-day dishes (head) above same-day repeats (tail)", () => {
      nextId = 1;
      const onDay = makeDish();
      const fresh1 = makeDish();
      const fresh2 = makeDish();
      // Pool contains a dish already on the day; the head should hold the two
      // fresh dishes, the tail the on-day repeat, even though the repeat is a
      // lower id (it would win every tie in the head).
      const ranked = rankPickerAlternatives({
        pool: [onDay, fresh1, fresh2],
        meal: "Lunch",
        dishesOnDay: [onDay],
        history: [],
      });
      expect(ranked.map((d) => d.id)).toEqual([fresh1.id, fresh2.id, onDay.id]);
    });

    it("keeps every pool dish (non-restrictive: nothing dropped)", () => {
      nextId = 1;
      const pool = [makeDish(), makeDish(), makeDish()];
      const ranked = rankPickerAlternatives({
        pool,
        meal: "Lunch",
        dishesOnDay: [pool[0]],
        history: [],
      });
      expect(new Set(ranked.map((d) => d.id))).toEqual(new Set(pool.map((d) => d.id)));
      expect(ranked).toHaveLength(pool.length);
    });
  });

  describe("recency ordering", () => {
    it("orders the head longest-unused first; never-cooked outranks cooked", () => {
      nextId = 1;
      const neverCooked = makeDish();
      const cookedOld = makeDish();
      const cookedRecent = makeDish();
      const history: MenuHistoryRow[] = [
        historyRow(cookedOld.id, "2026-01-01"),
        historyRow(cookedRecent.id, "2026-06-01"),
      ];
      const ranked = rankPickerAlternatives({
        pool: [cookedRecent, cookedOld, neverCooked],
        meal: "Lunch",
        dishesOnDay: [],
        history,
      });
      expect(ranked.map((d) => d.id)).toEqual([neverCooked.id, cookedOld.id, cookedRecent.id]);
    });

    it("uses the most recent matching history row for a dish", () => {
      nextId = 1;
      const a = makeDish();
      const b = makeDish();
      // a was cooked long ago AND recently; the recent date should govern, so a
      // (recent) ranks below b (cooked once, mid).
      const history: MenuHistoryRow[] = [
        historyRow(a.id, "2026-01-01"),
        historyRow(a.id, "2026-06-08"),
        historyRow(b.id, "2026-03-01"),
      ];
      const ranked = rankPickerAlternatives({
        pool: [a, b],
        meal: "Lunch",
        dishesOnDay: [],
        history,
      });
      expect(ranked.map((d) => d.id)).toEqual([b.id, a.id]);
    });
  });

  describe("protein-band similarity (swaps)", () => {
    // Two ingredients: a high-protein one and a near-zero one, so dishes land in
    // distinct protein bands purely from their ingredient rows.
    const catalog: CatalogIngredient[] = [
      {
        ingredient: "Chicken",
        group: "Proteins and Dairy",
        unit: "g",
        proteinPer100g: 25,
        carbsPer100g: 0,
        special: false,
      },
      {
        ingredient: "Rice",
        group: "Pantry",
        unit: "g",
        proteinPer100g: 2,
        carbsPer100g: 80,
        special: false,
      },
    ];

    function rowsFor(dishId: number, ingredient: string, quantity: number): Ingredient[] {
      return [{ dishId, dishName: `Dish ${dishId}`, ingredient, quantity, unit: "g" }];
    }

    it("breaks a recency tie toward the dish in the outgoing dish's protein band", () => {
      nextId = 1;
      // Outgoing dish is high-protein (Chicken 400g => 50g/person, band 10).
      const outgoing = makeDish();
      // Two candidates, both never cooked, so they share the single never-cooked
      // recency tier (a genuine tie). farBand has the LOWER id and sameBand the
      // HIGHER id, so the id tie-break alone would order farBand first. The only
      // thing that can flip them is the protein-band term: sameBand shares the
      // outgoing dish's band and must therefore rank first DESPITE its higher id.
      const farBand = makeDish(); // lower id, far protein band
      const sameBand = makeDish(); // higher id, same protein band as outgoing
      expect(sameBand.id).toBeGreaterThan(farBand.id);
      const ingredients: Ingredient[] = [
        ...rowsFor(outgoing.id, "Chicken", 400),
        ...rowsFor(sameBand.id, "Chicken", 400),
        ...rowsFor(farBand.id, "Rice", 400),
      ];
      const ranked = rankPickerAlternatives({
        pool: [farBand, sameBand],
        meal: "Lunch",
        dishesOnDay: [],
        history: [],
        outgoingDish: outgoing,
        ingredients,
        catalog,
      });
      // sameBand (higher id) first proves the protein term is load-bearing: with
      // the term removed, the id tie-break would put farBand (lower id) first.
      expect(ranked.map((d) => d.id)).toEqual([sameBand.id, farBand.id]);
    });

    it("orders a shared never-cooked tier by protein-band distance, then id", () => {
      nextId = 1;
      // Outgoing dish is high-protein (Chicken 400g => 50g/person, band 10).
      const outgoing = makeDish();
      // Three never-cooked candidates (one shared recency tier) in DISTINCT
      // protein bands at increasing distance from the outgoing dish. Their ids
      // are assigned in the OPPOSITE order to the desired output (far has the
      // smallest id, near the largest), so a pure-id sort would give far, mid,
      // near. The expected order (near, mid, far) can ONLY come from the
      // protein-band term: if it were removed, the id tie-break would reverse it.
      const far = makeDish(); // smallest id, farthest band
      const mid = makeDish(); // middle id, one band away
      const near = makeDish(); // largest id, closest band (same band: distance 0)
      expect(far.id).toBeLessThan(mid.id);
      expect(mid.id).toBeLessThan(near.id);
      const ingredients: Ingredient[] = [
        ...rowsFor(outgoing.id, "Chicken", 400), // 50 g/person => band 10
        ...rowsFor(near.id, "Chicken", 400), // 50 g/person => band 10, distance 0
        // Chicken 50g => 6.25 g/person => band 1; outgoing band 10 => distance 9.
        ...rowsFor(mid.id, "Chicken", 50),
        ...rowsFor(far.id, "Rice", 400), // 4 g/person => band 0, distance 10
      ];
      const ranked = rankPickerAlternatives({
        pool: [far, near, mid],
        meal: "Lunch",
        dishesOnDay: [],
        history: [],
        outgoingDish: outgoing,
        ingredients,
        catalog,
      });
      // Full ordering by band distance (0, 9, 10), independent of input order.
      expect(ranked.map((d) => d.id)).toEqual([near.id, mid.id, far.id]);
    });

    it("breaks a band-distance tie by ascending id within a tier", () => {
      nextId = 1;
      // Outgoing dish band 10. Two never-cooked candidates the SAME band-distance
      // away (one band below, one band above), so the protein term ties and the
      // id tie-break decides. This proves id is the final, total tie-break even
      // when the protein term is active.
      const outgoing = makeDish();
      const below = makeDish(); // band 9 (one below) => distance 1
      const above = makeDish(); // band 11 (one above) => distance 1, higher id
      const ingredients: Ingredient[] = [
        ...rowsFor(outgoing.id, "Chicken", 400), // band 10
        ...rowsFor(below.id, "Chicken", 360), // 45 g/person => band 9, distance 1
        ...rowsFor(above.id, "Chicken", 440), // 55 g/person => band 11, distance 1
      ];
      const ranked = rankPickerAlternatives({
        pool: [above, below],
        meal: "Lunch",
        dishesOnDay: [],
        history: [],
        outgoingDish: outgoing,
        ingredients,
        catalog,
      });
      expect(ranked.map((d) => d.id)).toEqual([below.id, above.id]);
    });

    it("protein band never overrides recency (recency stays dominant)", () => {
      nextId = 1;
      const outgoing = makeDish();
      // longUnused is a FAR protein band but never cooked; recent is the SAME
      // band but cooked recently. Recency dominates: longUnused ranks first.
      const longUnused = makeDish();
      const recent = makeDish();
      const ingredients: Ingredient[] = [
        ...rowsFor(outgoing.id, "Chicken", 400),
        ...rowsFor(longUnused.id, "Rice", 400),
        ...rowsFor(recent.id, "Chicken", 400),
      ];
      const history: MenuHistoryRow[] = [historyRow(recent.id, "2026-06-01")];
      const ranked = rankPickerAlternatives({
        pool: [recent, longUnused],
        meal: "Lunch",
        dishesOnDay: [],
        history,
        outgoingDish: outgoing,
        ingredients,
        catalog,
      });
      expect(ranked.map((d) => d.id)).toEqual([longUnused.id, recent.id]);
    });

    it("ignores protein band for adds (no outgoing dish): pure recency", () => {
      nextId = 1;
      const a = makeDish();
      const b = makeDish();
      const ingredients: Ingredient[] = [
        ...rowsFor(a.id, "Rice", 400),
        ...rowsFor(b.id, "Chicken", 400),
      ];
      // No outgoingDish => no protein term; both never cooked => id tie-break.
      const ranked = rankPickerAlternatives({
        pool: [b, a],
        meal: "Lunch",
        dishesOnDay: [],
        history: [],
        ingredients,
        catalog,
      });
      expect(ranked.map((d) => d.id)).toEqual([a.id, b.id]);
    });
  });

  describe("determinism and tie-breaks", () => {
    it("is a pure function of its inputs: same inputs, same output", () => {
      nextId = 1;
      const pool = [makeDish(), makeDish(), makeDish(), makeDish()];
      const history: MenuHistoryRow[] = [historyRow(pool[1].id, "2026-02-01")];
      const args = {
        pool,
        meal: "Lunch" as const,
        dishesOnDay: [pool[3]],
        history,
      };
      const a = rankPickerAlternatives(args).map((d) => d.id);
      const b = rankPickerAlternatives(args).map((d) => d.id);
      expect(a).toEqual(b);
    });

    it("breaks full recency ties by ascending dish id", () => {
      nextId = 1;
      // All never cooked, no outgoing dish => recencyRank ties broken by id.
      const d3 = makeDish();
      const d1 = makeDish();
      const d2 = makeDish();
      const ranked = rankPickerAlternatives({
        pool: [d3, d1, d2],
        meal: "Lunch",
        dishesOnDay: [],
        history: [],
      });
      expect(ranked.map((d) => d.id)).toEqual([d3, d1, d2].map((d) => d.id).sort((x, y) => x - y));
    });

    it("input order does not affect output (order-independence)", () => {
      nextId = 1;
      const pool = [makeDish(), makeDish(), makeDish()];
      const history: MenuHistoryRow[] = [historyRow(pool[0].id, "2026-05-01")];
      const forward = rankPickerAlternatives({
        pool,
        meal: "Lunch",
        dishesOnDay: [],
        history,
      }).map((d) => d.id);
      const reversed = rankPickerAlternatives({
        pool: [...pool].reverse(),
        meal: "Lunch",
        dishesOnDay: [],
        history,
      }).map((d) => d.id);
      expect(forward).toEqual(reversed);
    });
  });

  it("exposes the protein band width as a named constant", () => {
    expect(PROTEIN_BAND_WIDTH_GRAMS).toBe(5);
  });
});
