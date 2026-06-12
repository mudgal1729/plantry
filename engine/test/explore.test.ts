import { describe, it, expect } from "vitest";
import { rankExplore } from "../src/explore.js";
import type { CatalogIngredient, Dish, Ingredient, MenuHistoryRow } from "../src/data/schemas.js";

/**
 * docs/engine.md §7 Explore ranking. Ranks the eligible (active, in-season),
 * never-cooked dishes "familiar but new" by three normalised affinity signals:
 * shared-primary-ingredient frequency, protein-band proximity to the cooked
 * median, and category familiarity. Combined score = equal-weight sum; ties by
 * id. Each ranked dish carries its dominant-affinity STRUCTURED key (no UI prose).
 * Deterministic, no RNG.
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

function historyRow(dish: Dish, weekStart: string): MenuHistoryRow {
  return { weekStart, day: "Monday", meal: "Lunch", dishName: dish.name, dishId: dish.id };
}

function rowsFor(dish: Dish, ingredient: string, quantity: number): Ingredient {
  return { dishId: dish.id, dishName: dish.name, ingredient, quantity, unit: "g" };
}

// Catalog with a high-protein and a near-zero-protein ingredient, so dishes land
// in distinct protein bands purely from their ingredient rows.
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

describe("§7 explore ranking", () => {
  describe("filtering", () => {
    it("includes only eligible (active, in-season), never-cooked dishes", () => {
      nextId = 1;
      const cooked = makeDish({ name: "Cooked" });
      const inactive = makeDish({ name: "Inactive", active: "No" });
      const outOfSeason = makeDish({ name: "Winter only", seasons: ["Winter"] });
      const fresh = makeDish({ name: "Fresh" });
      const library = [cooked, inactive, outOfSeason, fresh];
      const ranked = rankExplore({
        library,
        history: [historyRow(cooked, "2026-01-01")],
        season: "Summer",
        ingredients: [],
        catalog,
      });
      const names = ranked.map((r) => r.dish.name);
      expect(names).toEqual(["Fresh"]);
    });
  });

  describe("shared-primary-ingredient signal", () => {
    it("ranks a dish sharing the most-cooked primary ingredient highest", () => {
      nextId = 1;
      // History: two paneer dishes, one tofu dish. Paneer is the dominant primary.
      const cookedPaneer1 = makeDish({ primaryIngredient: "Paneer" });
      const cookedPaneer2 = makeDish({ primaryIngredient: "Paneer" });
      const cookedTofu = makeDish({ primaryIngredient: "Tofu" });
      // Candidates (never cooked): one paneer, one tofu, one unseen ingredient.
      const freshPaneer = makeDish({ name: "Fresh Paneer", primaryIngredient: "Paneer" });
      const freshTofu = makeDish({ name: "Fresh Tofu", primaryIngredient: "Tofu" });
      const freshOkra = makeDish({ name: "Fresh Okra", primaryIngredient: "Okra" });
      const library = [cookedPaneer1, cookedPaneer2, cookedTofu, freshPaneer, freshTofu, freshOkra];
      const history = [
        historyRow(cookedPaneer1, "2026-01-01"),
        historyRow(cookedPaneer2, "2026-02-01"),
        historyRow(cookedTofu, "2026-03-01"),
      ];
      const ranked = rankExplore({ library, history, season: "Summer", ingredients: [], catalog });
      const byName = new Map(ranked.map((r) => [r.dish.name, r]));
      // Paneer (freq 1.0) > Tofu (freq 0.5) > Okra (freq 0) on the shared signal.
      expect(byName.get("Fresh Paneer")!.signals.sharedIngredient).toBe(1);
      expect(byName.get("Fresh Tofu")!.signals.sharedIngredient).toBe(0.5);
      expect(byName.get("Fresh Okra")!.signals.sharedIngredient).toBe(0);
    });
  });

  describe("protein-band proximity signal", () => {
    it("scores a dish in the cooked-median protein band highest", () => {
      nextId = 1;
      // One cooked dish at ~50g/person (Chicken 400g => band 10). Median band 10.
      const cooked = makeDish({ primaryIngredient: "Chicken" });
      const nearBand = makeDish({ name: "Near", primaryIngredient: "Okra" }); // band 10
      const farBand = makeDish({ name: "Far", primaryIngredient: "Okra" }); // band 0
      const library = [cooked, nearBand, farBand];
      const ingredients: Ingredient[] = [
        rowsFor(cooked, "Chicken", 400), // 50 g/person => band 10
        rowsFor(nearBand, "Chicken", 400), // band 10 => distance 0 => 1.0
        rowsFor(farBand, "Rice", 400), // ~4 g/person => band 0 => distance 10
      ];
      const history = [historyRow(cooked, "2026-01-01")];
      const ranked = rankExplore({ library, history, season: "Summer", ingredients, catalog });
      const byName = new Map(ranked.map((r) => [r.dish.name, r]));
      expect(byName.get("Near")!.signals.proteinMatch).toBe(1);
      expect(byName.get("Far")!.signals.proteinMatch).toBeLessThan(
        byName.get("Near")!.signals.proteinMatch,
      );
    });
  });

  describe("category-familiarity signal", () => {
    it("ranks a dish in the most-cooked category highest on that signal", () => {
      nextId = 1;
      const cookedGravy1 = makeDish({ category: "Gravy dish", primaryIngredient: "A" });
      const cookedGravy2 = makeDish({ category: "Gravy dish", primaryIngredient: "B" });
      const cookedDry = makeDish({ category: "Dry dish", primaryIngredient: "C" });
      const freshGravy = makeDish({
        name: "Fresh Gravy",
        category: "Gravy dish",
        primaryIngredient: "X",
      });
      const freshDry = makeDish({
        name: "Fresh Dry",
        category: "Dry dish",
        primaryIngredient: "Y",
      });
      const library = [cookedGravy1, cookedGravy2, cookedDry, freshGravy, freshDry];
      const history = [
        historyRow(cookedGravy1, "2026-01-01"),
        historyRow(cookedGravy2, "2026-02-01"),
        historyRow(cookedDry, "2026-03-01"),
      ];
      const ranked = rankExplore({ library, history, season: "Summer", ingredients: [], catalog });
      const byName = new Map(ranked.map((r) => [r.dish.name, r]));
      expect(byName.get("Fresh Gravy")!.signals.familiarCategory).toBe(1);
      expect(byName.get("Fresh Dry")!.signals.familiarCategory).toBe(0.5);
    });
  });

  describe("dominant-affinity key", () => {
    it("reports the single strongest signal as a structured key", () => {
      nextId = 1;
      // History dominated by paneer + Gravy dish. A fresh paneer Gravy dish in a
      // far protein band has shared-ingredient 1.0 and category 1.0 but low
      // protein-match; shared-ingredient wins the fixed priority tie.
      const cooked1 = makeDish({ category: "Gravy dish", primaryIngredient: "Paneer" });
      const cooked2 = makeDish({ category: "Gravy dish", primaryIngredient: "Paneer" });
      const fresh = makeDish({
        name: "Fresh",
        category: "Gravy dish",
        primaryIngredient: "Paneer",
      });
      const library = [cooked1, cooked2, fresh];
      const ingredients: Ingredient[] = [
        rowsFor(cooked1, "Chicken", 400), // band 10
        rowsFor(cooked2, "Chicken", 400), // band 10
        rowsFor(fresh, "Rice", 400), // band 0 => far from median band 10
      ];
      const history = [historyRow(cooked1, "2026-01-01"), historyRow(cooked2, "2026-02-01")];
      const ranked = rankExplore({ library, history, season: "Summer", ingredients, catalog });
      const entry = ranked.find((r) => r.dish.name === "Fresh")!;
      expect(entry.dominantAffinity).toBe("shared-ingredient");
    });

    it("picks protein-match when it is the strongest signal", () => {
      nextId = 1;
      // Cooked history: a Keto dish with a primary the fresh dish does not share,
      // at a protein band the fresh dish matches. The fresh dish shares neither
      // primary ingredient nor category, so protein-match dominates.
      const cooked = makeDish({ category: "Keto", primaryIngredient: "Egg" });
      const fresh = makeDish({ name: "Fresh", category: "Gravy dish", primaryIngredient: "Okra" });
      const library = [cooked, fresh];
      const ingredients: Ingredient[] = [
        rowsFor(cooked, "Chicken", 400), // band 10
        rowsFor(fresh, "Chicken", 400), // band 10 => protein-match 1.0
      ];
      const history = [historyRow(cooked, "2026-01-01")];
      const ranked = rankExplore({ library, history, season: "Summer", ingredients, catalog });
      const entry = ranked.find((r) => r.dish.name === "Fresh")!;
      expect(entry.dominantAffinity).toBe("protein-match");
    });
  });

  describe("ordering and determinism", () => {
    it("orders by combined score descending, then id ascending", () => {
      nextId = 1;
      const cooked = makeDish({ category: "Gravy dish", primaryIngredient: "Paneer" });
      // strong shares both primary + category; weak shares neither.
      const strong = makeDish({
        name: "Strong",
        category: "Gravy dish",
        primaryIngredient: "Paneer",
      });
      const weak = makeDish({ name: "Weak", category: "Dry dish", primaryIngredient: "Okra" });
      const library = [cooked, strong, weak];
      const history = [historyRow(cooked, "2026-01-01")];
      const ranked = rankExplore({ library, history, season: "Summer", ingredients: [], catalog });
      expect(ranked.map((r) => r.dish.name)).toEqual(["Strong", "Weak"]);
    });

    it("breaks an exact score tie by ascending dish id", () => {
      nextId = 1;
      // No history => every signal is uniform across candidates (shared 0,
      // category 0, protein-match equal), so the score ties and id decides.
      const d3 = makeDish();
      const d1 = makeDish();
      const d2 = makeDish();
      const library = [d3, d1, d2];
      const ranked = rankExplore({
        library,
        history: [],
        season: "Summer",
        ingredients: [],
        catalog,
      });
      const ids = ranked.map((r) => r.dish.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it("is a pure function: same inputs, same output; input order independent", () => {
      nextId = 1;
      const cooked = makeDish({ primaryIngredient: "Paneer" });
      const a = makeDish({ name: "A", primaryIngredient: "Paneer" });
      const b = makeDish({ name: "B", primaryIngredient: "Tofu" });
      const c = makeDish({ name: "C", primaryIngredient: "Okra" });
      const history = [historyRow(cooked, "2026-01-01")];
      const forward = rankExplore({
        library: [cooked, a, b, c],
        history,
        season: "Summer",
        ingredients: [],
        catalog,
      }).map((r) => r.dish.name);
      const reversed = rankExplore({
        library: [c, b, a, cooked],
        history,
        season: "Summer",
        ingredients: [],
        catalog,
      }).map((r) => r.dish.name);
      expect(forward).toEqual(reversed);
    });
  });
});
