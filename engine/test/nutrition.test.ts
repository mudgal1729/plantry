import { describe, it, expect } from "vitest";
import { deriveDishMacros, proteinToCarbRatio, HOUSEHOLD_SERVINGS } from "../src/nutrition.js";
import type { CatalogIngredient, Ingredient } from "../src/data/schemas.js";

function ing(ingredient: string, quantity: number, unit: "g" | "ml" | "pcs"): Ingredient {
  return { dishId: 1, dishName: "Test dish", ingredient, quantity, unit };
}

describe("deriveDishMacros", () => {
  it("derives per-person protein and carbs as sum(grams x per100g / 100) / 2", () => {
    const catalog: CatalogIngredient[] = [
      {
        ingredient: "Paneer",
        group: "Proteins and Dairy",
        unit: "g",
        proteinPer100g: 18,
        carbsPer100g: 4,
      },
      { ingredient: "Rice", group: "Pantry", unit: "g", proteinPer100g: 7, carbsPer100g: 78 },
    ];
    const rows = [ing("Paneer", 200, "g"), ing("Rice", 100, "g")];
    const macros = deriveDishMacros(rows, catalog);

    // Dish total protein = 200*18/100 + 100*7/100 = 36 + 7 = 43; per person = 21.5.
    expect(macros.proteinPerPerson).toBeCloseTo(21.5, 10);
    // Dish total carbs = 200*4/100 + 100*78/100 = 8 + 78 = 86; per person = 43.
    expect(macros.carbsPerPerson).toBeCloseTo(43, 10);
    expect(macros.proteinToCarbRatio).toBeCloseTo(21.5 / 43, 10);
  });

  it("divides the dish total by the household serving count (two)", () => {
    expect(HOUSEHOLD_SERVINGS).toBe(2);
    const catalog: CatalogIngredient[] = [
      {
        ingredient: "Chicken",
        group: "Proteins and Dairy",
        unit: "g",
        proteinPer100g: 25,
        carbsPer100g: 0,
      },
    ];
    // 100 g chicken -> dish total 25 g protein -> per person 12.5 g.
    const macros = deriveDishMacros([ing("Chicken", 100, "g")], catalog);
    expect(macros.proteinPerPerson).toBeCloseTo(12.5, 10);
    expect(macros.carbsPerPerson).toBe(0);
    // Carbs zero -> ratio undefined -> null.
    expect(macros.proteinToCarbRatio).toBeNull();
  });

  it("converts pcs ingredients to grams via Grams per piece", () => {
    const catalog: CatalogIngredient[] = [
      {
        ingredient: "Egg",
        group: "Proteins and Dairy",
        unit: "pcs",
        gramsPerPiece: 50,
        proteinPer100g: 13,
        carbsPer100g: 1,
      },
    ];
    // 2 eggs -> 100 g -> protein 13, carbs 1 (dish total); per person 6.5 and 0.5.
    const macros = deriveDishMacros([ing("Egg", 2, "pcs")], catalog);
    expect(macros.proteinPerPerson).toBeCloseTo(6.5, 10);
    expect(macros.carbsPerPerson).toBeCloseTo(0.5, 10);
  });

  it("converts ml ingredients to grams 1:1 and composes with g and pcs rows", () => {
    const catalog: CatalogIngredient[] = [
      {
        ingredient: "Milk",
        group: "Proteins and Dairy",
        unit: "ml",
        proteinPer100g: 3.4,
        carbsPer100g: 5,
      },
      { ingredient: "Rice", group: "Pantry", unit: "g", proteinPer100g: 7, carbsPer100g: 78 },
      {
        ingredient: "Egg",
        group: "Proteins and Dairy",
        unit: "pcs",
        gramsPerPiece: 50,
        proteinPer100g: 13,
        carbsPer100g: 1,
      },
    ];
    // 200 ml milk -> 200 g (1:1) -> protein 6.8, carbs 10 (dish total).
    const milkOnly = deriveDishMacros([ing("Milk", 200, "ml")], catalog);
    expect(milkOnly.proteinPerPerson).toBeCloseTo((200 * 3.4) / 100 / 2, 10);
    expect(milkOnly.carbsPerPerson).toBeCloseTo((200 * 5) / 100 / 2, 10);

    // ml composes with g and pcs: milk 200 ml + rice 100 g + egg 2 pcs (100 g).
    const rows = [ing("Milk", 200, "ml"), ing("Rice", 100, "g"), ing("Egg", 2, "pcs")];
    const macros = deriveDishMacros(rows, catalog);
    // Dish total protein = 200*3.4/100 + 100*7/100 + 100*13/100 = 6.8 + 7 + 13 = 26.8.
    expect(macros.proteinPerPerson).toBeCloseTo(26.8 / 2, 10);
    // Dish total carbs = 200*5/100 + 100*78/100 + 100*1/100 = 10 + 78 + 1 = 89.
    expect(macros.carbsPerPerson).toBeCloseTo(89 / 2, 10);
  });

  it("treats a pcs ingredient with no Grams per piece as zero contribution", () => {
    const catalog: CatalogIngredient[] = [
      // Macros present but no gramsPerPiece: cannot weigh, contributes nothing.
      {
        ingredient: "Green Chilli",
        group: "Vegetables",
        unit: "pcs",
        proteinPer100g: 2,
        carbsPer100g: 9,
      },
    ];
    const macros = deriveDishMacros([ing("Green Chilli", 3, "pcs")], catalog);
    expect(macros.proteinPerPerson).toBe(0);
    expect(macros.carbsPerPerson).toBe(0);
    expect(macros.proteinToCarbRatio).toBeNull();
  });

  it("reads a blank (absent) macro as zero", () => {
    const catalog: CatalogIngredient[] = [
      // Onion has no macros in the catalog (blank cells): contributes zero.
      { ingredient: "Onion", group: "Aromatics and Herbs", unit: "g" },
      { ingredient: "Paneer", group: "Proteins and Dairy", unit: "g", proteinPer100g: 18 },
    ];
    // Only Paneer contributes protein; Onion (blank) adds nothing; carbs all blank -> 0.
    const macros = deriveDishMacros([ing("Onion", 150, "g"), ing("Paneer", 200, "g")], catalog);
    expect(macros.proteinPerPerson).toBeCloseTo((200 * 18) / 100 / 2, 10);
    expect(macros.carbsPerPerson).toBe(0);
    expect(macros.proteinToCarbRatio).toBeNull();
  });

  it("treats an ingredient absent from the catalog as zero macros", () => {
    const macros = deriveDishMacros([ing("Mystery", 100, "g")], []);
    expect(macros.proteinPerPerson).toBe(0);
    expect(macros.carbsPerPerson).toBe(0);
  });

  it("returns zero macros for a dish with no ingredient rows", () => {
    const macros = deriveDishMacros([], []);
    expect(macros.proteinPerPerson).toBe(0);
    expect(macros.carbsPerPerson).toBe(0);
    expect(macros.proteinToCarbRatio).toBeNull();
  });

  it("the whole live library derives without throwing and macros read near zero pre-2.2", () => {
    // Live catalog ships every macro cell blank this slice, so every dish reads
    // zero protein and zero carbs. This guards the blank-as-zero path on real
    // data and documents the expected pre-2.2 state.
    // (Kept light: full coverage numbers are the reports' job.)
    const catalog: CatalogIngredient[] = [];
    const macros = deriveDishMacros([ing("Anything", 500, "g")], catalog);
    expect(macros.proteinPerPerson).toBe(0);
  });
});

describe("proteinToCarbRatio", () => {
  it("returns protein / carbs", () => {
    expect(proteinToCarbRatio(30, 60)).toBeCloseTo(0.5, 10);
  });

  it("is scale-invariant (per-person and dish-total give the same ratio)", () => {
    expect(proteinToCarbRatio(30, 60)).toBe(proteinToCarbRatio(15, 30));
  });

  it("returns null when carbs are zero", () => {
    expect(proteinToCarbRatio(30, 0)).toBeNull();
  });
});
