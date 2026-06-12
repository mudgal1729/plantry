import { describe, it, expect } from "vitest";
import {
  coverageReport,
  poolCoverageReport,
  hpProteinConsistencyReport,
  specialSourcingReport,
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
      { ingredient: "Paneer", group: "Proteins and Dairy", unit: "g", proteinPer100g: 18, special: false },
      { ingredient: "Rice", group: "Pantry", unit: "g", special: false }, // relevant, no macros
      { ingredient: "Carrot", group: "Vegetables", unit: "g", special: false }, // relevant, no macros
      // Not macro-relevant (aromatics / other), excluded from the denominator:
      { ingredient: "Onion", group: "Aromatics and Herbs", unit: "g", special: false },
      { ingredient: "Fruit", group: "Other", unit: "g", special: false },
    ];
    const cov = coverageReport([], catalog);
    expect(cov.macroRelevantCount).toBe(3);
    expect(cov.macroRelevantWithMacros).toBe(1);
  });

  it("reads full macro and enrichment coverage on live data (enrichment complete)", () => {
    const { library, catalog } = loadLiveData();
    const cov = coverageReport(library, catalog);
    // Every macro-relevant catalog row carries macros (slice 2.2 onward).
    expect(cov.macroRelevantCount).toBeGreaterThan(0);
    expect(cov.macroRelevantWithMacros).toBe(cov.macroRelevantCount);
    // The B1 enrichment track is complete: every active dish carries a
    // description, recipe, and complexity. This now guards that the library
    // STAYS fully enriched — a new dish shipped without these (expansion dishes
    // are meant to ship complete) would drop a count below activeDishCount and
    // fail here.
    expect(cov.withDescription).toBe(cov.activeDishCount);
    expect(cov.withRecipe).toBe(cov.activeDishCount);
    expect(cov.withComplexity).toBe(cov.activeDishCount);
    // Photos remain a separate (B2) track; no images committed yet, so coverage
    // is zero. The first photo batch updates this expectation.
    expect(cov.withPhoto).toBe(0);
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

  it("surfaces the Fruit pool from live data", () => {
    // The expansion-0 batch deepened this slot from 1 to 3 candidates
    // (Seasonal fruit, Banana bowl, Papaya bowl). The report tracks live data;
    // the assertion is the post-expansion floor, not the old thin baseline.
    const { library } = loadLiveData();
    const pools = poolCoverageReport(library);
    const fruit = pools.find((p) => p.season === "Summer" && p.slot.includes("fruit"));
    expect(fruit).toBeDefined();
    expect(fruit!.count).toBe(3);
  });
});

describe("hpProteinConsistencyReport", () => {
  const catalogWithMacros: CatalogIngredient[] = [
    { ingredient: "Chicken", group: "Proteins and Dairy", unit: "g", proteinPer100g: 25, special: false },
    {
      ingredient: "Potato",
      group: "Vegetables",
      unit: "g",
      proteinPer100g: 2,
      carbsPer100g: 17,
      special: false,
    },
  ];

  function row(dishId: number, ingredient: string, quantity: number): Ingredient {
    return { dishId, dishName: "x", ingredient, quantity, unit: "g" };
  }

  it("surfaces drift on live data now that macros are populated (post-2.2)", () => {
    const { library, ingredients, catalog } = loadLiveData();
    // Slice 2.2 populated the catalog macros, so the report now speaks: it lists
    // dishes whose derived per-person protein disagrees with their HP tag. This is
    // information for the slow loop, not a blocking failure; the HP tag stays the
    // rule input. Every flagged dish carries a real (non-negative) derived protein.
    const drift = hpProteinConsistencyReport(library, ingredients, catalog);
    expect(drift.length).toBeGreaterThan(0);
    for (const d of drift) {
      expect(d.threshold).toBe(HP_PROTEIN_THRESHOLD_PER_PERSON);
      expect(d.proteinPerPerson).toBeGreaterThanOrEqual(0);
      // A flagged dish disagrees with its tag: HP-tagged below threshold, or
      // above threshold without the tag.
      expect(d.hasHpTag).toBe(d.proteinPerPerson < HP_PROTEIN_THRESHOLD_PER_PERSON);
    }
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

describe("specialSourcingReport", () => {
  const catalog: CatalogIngredient[] = [
    { ingredient: "Tahini", group: "Pantry", unit: "g", special: true },
    { ingredient: "Olive Oil", group: "Pantry", unit: "ml", special: true },
    { ingredient: "Chickpea", group: "Pantry", unit: "g", special: false },
    { ingredient: "Onion", group: "Aromatics and Herbs", unit: "g", special: false },
  ];

  function row(dishId: number, ingredient: string, quantity: number): Ingredient {
    return { dishId, dishName: "x", ingredient, quantity, unit: "g" };
  }

  it("lists, per active dish, the special-sourcing ingredients it uses (sorted)", () => {
    const dishes: Dish[] = [
      dish({ id: 1, name: "Hummus" }),
      dish({ id: 2, name: "Plain dal" }),
    ];
    const ingredients = [
      row(1, "Chickpea", 200),
      row(1, "Tahini", 30),
      row(1, "Olive Oil", 15),
      row(2, "Onion", 80),
    ];
    const report = specialSourcingReport(dishes, ingredients, catalog);
    // Only dish 1 uses special ingredients; dish 2 (all regular) is omitted.
    expect(report).toEqual([
      { dishId: 1, dishName: "Hummus", ingredients: ["Olive Oil", "Tahini"] },
    ]);
  });

  it("omits inactive dishes even when they use a special ingredient", () => {
    const dishes: Dish[] = [dish({ id: 1, name: "Inactive", active: "No" })];
    const ingredients = [row(1, "Tahini", 30)];
    expect(specialSourcingReport(dishes, ingredients, catalog)).toEqual([]);
  });

  it("deduplicates a special ingredient repeated across rows", () => {
    const dishes: Dish[] = [dish({ id: 1, name: "Double tahini" })];
    const ingredients = [row(1, "Tahini", 30), row(1, "Tahini", 10)];
    const report = specialSourcingReport(dishes, ingredients, catalog);
    expect(report).toEqual([{ dishId: 1, dishName: "Double tahini", ingredients: ["Tahini"] }]);
  });

  it("flags tabbouleh's Parsley and the other special ingredients on live data", () => {
    const { library, ingredients, catalog: liveCatalog } = loadLiveData();
    const report = specialSourcingReport(library, ingredients, liveCatalog);
    // At least one active dish needs a special trip, and every flagged dish names
    // a non-empty special-ingredient set that all resolve to special catalog rows.
    expect(report.length).toBeGreaterThan(0);
    const specialNames = new Set(liveCatalog.filter((c) => c.special).map((c) => c.ingredient));
    for (const d of report) {
      expect(d.ingredients.length).toBeGreaterThan(0);
      for (const name of d.ingredients) expect(specialNames.has(name)).toBe(true);
    }
    // Tabbouleh now uses Parsley (a special ingredient), so it must appear with
    // Parsley among its flagged special ingredients.
    const tabbouleh = report.find((d) => d.dishName === "Tabbouleh");
    expect(tabbouleh).toBeDefined();
    expect(tabbouleh!.ingredients).toContain("Parsley");
  });
});
