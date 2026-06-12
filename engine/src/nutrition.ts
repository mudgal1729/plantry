import type { CatalogIngredient, Ingredient } from "./data/schemas.js";

/**
 * Nutrition derivation (docs/engine.md Nutrition section, design-revamp §1.2).
 *
 * Per-dish macros are DERIVED, never hand-stored. There is no per-dish protein
 * or carb field and deliberately no override (Principle 8): the single source of
 * truth is each ingredient row's quantity times the catalog's per-100g macros.
 * Correcting one ingredient's macros corrects every dish that uses it.
 *
 * The household basis is two people: every dish serves two, and macros display
 * per person, so the dish total is divided by two.
 *
 * Blank catalog macros read as zero (a catalog cell ships blank until slice 2.2;
 * spices and aromatics may stay blank forever). A `pcs`-unit ingredient converts
 * to grams via the catalog's `Grams per piece` before the math; a `pcs`
 * ingredient with no grams-per-piece contributes zero (it cannot be weighed, so
 * it cannot contribute macro mass).
 */

/** Per-person derived macros for one dish. */
export interface DishMacros {
  /** Grams of protein per person (dish total over two). */
  proteinPerPerson: number;
  /** Grams of carbohydrate per person (dish total over two). */
  carbsPerPerson: number;
  /**
   * Protein-to-carb ratio (protein / carbs). `null` when carbs are zero (the
   * ratio is undefined); callers decide how to present "no carbs".
   */
  proteinToCarbRatio: number | null;
}

/** The two people the household cooks for; macros display per person. */
export const HOUSEHOLD_SERVINGS = 2;

/**
 * Convert one ingredient row's quantity to grams. `g` is already grams; `pcs`
 * multiplies by the catalog's grams-per-piece (zero when absent); `ml` converts
 * to grams 1:1, assuming a culinary liquid density of about 1.0 (milk ~1.03,
 * coconut milk ~0.97, both within noise for a display macro). No per-ingredient
 * density column exists (Principle 8): no column until a dish needs one.
 */
function rowGrams(row: Ingredient, catalogEntry: CatalogIngredient | undefined): number {
  if (row.unit === "g") return row.quantity;
  if (row.unit === "pcs") {
    const gramsPerPiece = catalogEntry?.gramsPerPiece ?? 0;
    return row.quantity * gramsPerPiece;
  }
  return row.quantity;
}

/**
 * Derive per-person protein and carbs for a single dish from its ingredient rows
 * and the catalog. `ingredientRows` are the rows for ONE dish (the caller filters
 * by dish id); `catalog` is the full ingredient catalog (looked up by name).
 */
export function deriveDishMacros(
  ingredientRows: Ingredient[],
  catalog: CatalogIngredient[],
): DishMacros {
  const byName = new Map<string, CatalogIngredient>();
  for (const entry of catalog) byName.set(entry.ingredient, entry);

  let proteinTotal = 0;
  let carbsTotal = 0;
  for (const row of ingredientRows) {
    const entry = byName.get(row.ingredient);
    const grams = rowGrams(row, entry);
    if (grams === 0) continue;
    const protein100 = entry?.proteinPer100g ?? 0;
    const carbs100 = entry?.carbsPer100g ?? 0;
    proteinTotal += (grams * protein100) / 100;
    carbsTotal += (grams * carbs100) / 100;
  }

  const proteinPerPerson = proteinTotal / HOUSEHOLD_SERVINGS;
  const carbsPerPerson = carbsTotal / HOUSEHOLD_SERVINGS;

  return {
    proteinPerPerson,
    carbsPerPerson,
    proteinToCarbRatio: proteinToCarbRatio(proteinPerPerson, carbsPerPerson),
  };
}

/**
 * Protein-to-carb ratio. Scale-invariant (per-person and dish-total give the
 * same ratio), so the per-person figures are passed straight through. `null`
 * when carbs are zero.
 */
export function proteinToCarbRatio(protein: number, carbs: number): number | null {
  if (carbs === 0) return null;
  return protein / carbs;
}
