import { describe, it, expect } from "vitest";
import {
  coverageReport,
  poolCoverageReport,
  hpProteinConsistencyReport,
  HP_PROTEIN_THRESHOLD_PER_PERSON,
} from "../../src/data/validators.js";
import { loadLiveData } from "../loadLive.js";
import type { CatalogIngredient, Dish, Ingredient } from "../../src/data/schemas.js";

const baseDish = {
  category: "Gravy dish" as const,
  time: "Lunch" as const,
  tags: [] as string[],
  primaryIngredient: "Chicken",
  preferred: "Yes" as const,
  active: "Yes" as const,
  satiety: "High" as const,
  prepMinutes: 30,
  seasons: "All" as const,
};

function dish(overrides: Partial<Dish> & { id: number; name: string }): Dish {
  return { ...baseDish, ...overrides };
}

describe("coverageReport", () => {
  it("counts enrichment fields over active dishes only", () => {
    const dishes: Dish[] = [
      dish({ id: 1, name: "A", description: "tasty", complexity: "Easy", recipe: ["step"] }),
      dish({ id: 2, name: "B", photo: "b.jpg" }),
      // Inactive dish: fully enriched but must not count.
      dish({ id: 3, name: "C", active: "No", description: "x", complexity: "Hard" }),
    ];
    const catalog: CatalogIngredient[] = [];
    const cov = coverageReport(dishes, catalog);
    expect(cov.activeDishCount).toBe(2);
    expect(cov.withDescription).toBe(1);
    expect(cov.withRecipe).toBe(1);
    expect(cov.withComplexity).toBe(1);
    expect(cov.withPhoto).toBe(1);
  });

  it("counts macro coverage only over macro-relevant catalog rows", () => {
    const catalog: CatalogIngredient[] = [
      // Macro-relevant (food groups):
      { ingredient: "Paneer", group: "Proteins and Dairy", unit: "g", proteinPer100g: 18 },
      { ingredient: "Rice", group: "Pantry", unit: "g" }, // relevant, no macros
      { ingredient: "Carrot", group: "Vegetables", unit: "g" }, // relevant, no macros
      // Not macro-relevant (aromatics / other), excluded from the denominator:
      { ingredient: "Onion", group: "Aromatics and Herbs", unit: "g" },
      { ingredient: "Fruit", group: "Other", unit: "g" },
    ];
    const cov = coverageReport([], catalog);
    expect(cov.macroRelevantCount).toBe(3);
    expect(cov.macroRelevantWithMacros).toBe(1);
  });

  it("reads near-zero macro coverage on live data (expected pre-2.2)", () => {
    const { library, catalog } = loadLiveData();
    const cov = coverageReport(library, catalog);
    expect(cov.macroRelevantWithMacros).toBe(0);
    expect(cov.macroRelevantCount).toBeGreaterThan(0);
    // Enrichment fields are all unpopulated this slice too.
    expect(cov.withDescription).toBe(0);
    expect(cov.withRecipe).toBe(0);
  });
});

describe("poolCoverageReport", () => {
  it("emits one row per slot per season and never throws on live data", () => {
    const { library } = loadLiveData();
    const pools = poolCoverageReport(library);
    const seasons = new Set(pools.map((p) => p.season));
    expect(seasons).toEqual(new Set(["Summer", "Monsoon", "Winter"]));
    // 20 slot rows per season (see the report's slot table).
    expect(pools.filter((p) => p.season === "Summer").length).toBe(20);
    // Counts are non-negative integers.
    for (const p of pools) expect(p.count).toBeGreaterThanOrEqual(0);
  });

  it("surfaces the known thin Fruit pool (1 candidate)", () => {
    const { library } = loadLiveData();
    const pools = poolCoverageReport(library);
    const fruit = pools.find((p) => p.season === "Summer" && p.slot.includes("fruit"));
    expect(fruit).toBeDefined();
    expect(fruit!.count).toBe(1);
  });
});

describe("hpProteinConsistencyReport", () => {
  const catalogWithMacros: CatalogIngredient[] = [
    { ingredient: "Chicken", group: "Proteins and Dairy", unit: "g", proteinPer100g: 25 },
    { ingredient: "Potato", group: "Vegetables", unit: "g", proteinPer100g: 2, carbsPer100g: 17 },
  ];

  function row(dishId: number, ingredient: string, quantity: number): Ingredient {
    return { dishId, dishName: "x", ingredient, quantity, unit: "g" };
  }

  it("is empty when no macros are populated (the pre-2.2 state)", () => {
    const { library, ingredients, catalog } = loadLiveData();
    // Live catalog already ships every macro cell blank this slice, so this
    // exercises the real pre-2.2 state directly.
    const drift = hpProteinConsistencyReport(library, ingredients, catalog);
    expect(drift).toEqual([]);
  });

  it("flags an HP-tagged dish whose derived protein is below the threshold", () => {
    // 100 g potato -> dish protein 2 g -> per person 1 g, far below threshold.
    const dishes: Dish[] = [dish({ id: 1, name: "Low protein", tags: ["HP"] })];
    const ingredients = [row(1, "Potato", 100)];
    const drift = hpProteinConsistencyReport(dishes, ingredients, catalogWithMacros);
    expect(drift).toHaveLength(1);
    expect(drift[0].hasHpTag).toBe(true);
    expect(drift[0].proteinPerPerson).toBeLessThan(HP_PROTEIN_THRESHOLD_PER_PERSON);
  });

  it("flags a high-protein dish that lacks the HP tag", () => {
    // 400 g chicken -> dish protein 100 g -> per person 50 g, well above threshold.
    const dishes: Dish[] = [dish({ id: 2, name: "High protein no tag", tags: [] })];
    const ingredients = [row(2, "Chicken", 400)];
    const drift = hpProteinConsistencyReport(dishes, ingredients, catalogWithMacros);
    expect(drift).toHaveLength(1);
    expect(drift[0].hasHpTag).toBe(false);
    expect(drift[0].proteinPerPerson).toBeGreaterThanOrEqual(HP_PROTEIN_THRESHOLD_PER_PERSON);
  });

  it("does not flag a consistent HP dish", () => {
    const dishes: Dish[] = [dish({ id: 3, name: "Consistent HP", tags: ["HP"] })];
    const ingredients = [row(3, "Chicken", 400)];
    const drift = hpProteinConsistencyReport(dishes, ingredients, catalogWithMacros);
    expect(drift).toEqual([]);
  });
});
