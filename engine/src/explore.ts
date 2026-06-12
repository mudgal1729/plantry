import type {
  CatalogIngredient,
  Dish,
  Ingredient,
  MenuHistoryRow,
  Season,
} from "./data/schemas.js";
import { eligibleDishes } from "./eligibility.js";
import { deriveDishMacros } from "./nutrition.js";

/**
 * Explore ranking (docs/engine.md §7 Explore ranking, design-revamp §1.4 item 4).
 *
 * Ranks the ELIGIBLE (active, in-season), NEVER-COOKED dishes "familiar but new":
 * dishes the household has not had yet but that resemble what it actually cooks,
 * so the Explore tab surfaces novelty that still fits the household's habits
 * rather than random unseen dishes.
 *
 * Three affinity signals, each normalised to [0, 1] (1 = strongest affinity):
 *
 *   1. shared-primary-ingredient frequency. How dominant this dish's
 *      `primaryIngredient` is in cooking history: the share of cooked dishes
 *      whose primary ingredient matches, divided by the most-cooked primary
 *      ingredient's share, so the single most-cooked ingredient scores 1.0. A
 *      paneer dish scores high in a paneer-heavy history.
 *
 *   2. protein-band proximity. Closeness of this dish's per-person protein
 *      (§9 nutrition) to the household's COOKED-MEDIAN protein, measured in
 *      fixed `PROTEIN_BAND_WIDTH_GRAMS` bands: `1 / (1 + bandDistance)`, so a
 *      dish in the median band scores 1.0 and the score decays with distance. A
 *      dish in the household's usual protein range scores high.
 *
 *   3. category familiarity. How common this dish's `category` is in history,
 *      normalised the same way as signal 1 (most-cooked category = 1.0).
 *
 * COMBINED SCORE = the equal-weight sum of the three signals (no RNG). Dishes
 * rank by combined score descending, ties broken by dish id ascending, so the
 * ranking is fully deterministic and input-order-independent.
 *
 * DOMINANT-AFFINITY KEY. Each ranked dish also carries the single signal that
 * contributed most to its score, as a STRUCTURED KEY (`shared-ingredient` /
 * `protein-match` / `familiar-category`), NOT UI prose (Principle 7: display
 * decoupled from structure). The UI phrases the "why it fits" line from the key;
 * no sentence text leaks out of the engine. Ties between equal signal values
 * resolve by a fixed priority order (shared-ingredient, then protein-match, then
 * familiar-category), so the key is deterministic too.
 *
 * Pure function: same inputs always produce the same ranking. This module ships
 * DORMANT; slice 7.1 wires it into the Explore tab.
 */

/** Number of grams-per-person that separates one protein band from the next. */
export const PROTEIN_BAND_WIDTH_GRAMS = 5;

/** The structured "why it fits" key. The UI phrases it; the engine never does. */
export type ExploreAffinityKey = "shared-ingredient" | "protein-match" | "familiar-category";

/** Fixed dominant-affinity tie-break order (Principle 7: deterministic key). */
const AFFINITY_PRIORITY: ExploreAffinityKey[] = [
  "shared-ingredient",
  "protein-match",
  "familiar-category",
];

export interface ExploreRankedDish {
  dish: Dish;
  /** Equal-weight sum of the three normalised affinity signals. */
  score: number;
  /** The three normalised signals (each in [0, 1]), for transparency/testing. */
  signals: {
    sharedIngredient: number;
    proteinMatch: number;
    familiarCategory: number;
  };
  /** The single signal that contributed most; the UI phrases the line from it. */
  dominantAffinity: ExploreAffinityKey;
}

export interface RankExploreArgs {
  library: Dish[];
  history: MenuHistoryRow[];
  season: Season;
  /** Per-dish ingredient rows for the whole library, for protein derivation. */
  ingredients: Ingredient[];
  /** Ingredient catalog, the per-100g macro source for protein derivation. */
  catalog: CatalogIngredient[];
}

/** Set of dish ids that appear anywhere in cooking history (= "cooked"). */
function cookedDishIds(history: MenuHistoryRow[]): Set<number> {
  const ids = new Set<number>();
  for (const row of history) ids.add(row.dishId);
  return ids;
}

/** Integer protein band: protein-per-person bucketed into PROTEIN_BAND_WIDTH_GRAMS. */
function proteinBand(proteinPerPerson: number): number {
  return Math.floor(proteinPerPerson / PROTEIN_BAND_WIDTH_GRAMS);
}

/** Per-person derived protein for one dish, or 0 when macros are unavailable. */
function dishProtein(
  dish: Dish,
  ingredientsByDishId: Map<number, Ingredient[]>,
  catalog: CatalogIngredient[],
): number {
  const rows = ingredientsByDishId.get(dish.id) ?? [];
  if (rows.length === 0) return 0;
  return deriveDishMacros(rows, catalog).proteinPerPerson;
}

/** Median of a numeric list (lower-middle for even counts); 0 for an empty list. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  return sorted[mid];
}

/**
 * Count each value's frequency in a list and return a name -> [0,1] map
 * normalised so the most frequent value scores 1.0. An empty list yields an
 * empty map (every lookup then reads as 0).
 */
function normalisedFrequency(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;
  const out = new Map<string, number>();
  if (max === 0) return out;
  for (const [name, count] of counts) out.set(name, count / max);
  return out;
}

/**
 * Rank the eligible, never-cooked dishes familiar-but-new. Returns the full
 * ranked list (the caller decides how many to show). Deterministic: score
 * descending, then id ascending. Pure: inputs are never mutated.
 */
export function rankExplore(args: RankExploreArgs): ExploreRankedDish[] {
  const { library, history, season, ingredients, catalog } = args;

  const ingredientsByDishId = new Map<number, Ingredient[]>();
  for (const row of ingredients) {
    const list = ingredientsByDishId.get(row.dishId);
    if (list) list.push(row);
    else ingredientsByDishId.set(row.dishId, [row]);
  }

  // Cooking-history profile: which primary ingredients, categories, and protein
  // bands the household actually cooks. Built from the library rows the history
  // references (history rows carry only id + name, so we join back to the dish).
  const dishById = new Map<number, Dish>();
  for (const dish of library) dishById.set(dish.id, dish);
  const cooked = cookedDishIds(history);

  const cookedPrimaries: string[] = [];
  const cookedCategories: string[] = [];
  const cookedProteins: number[] = [];
  for (const id of cooked) {
    const dish = dishById.get(id);
    if (!dish) continue;
    cookedPrimaries.push(dish.primaryIngredient);
    cookedCategories.push(dish.category);
    cookedProteins.push(dishProtein(dish, ingredientsByDishId, catalog));
  }

  const primaryFreq = normalisedFrequency(cookedPrimaries);
  const categoryFreq = normalisedFrequency(cookedCategories);
  const medianBand = proteinBand(median(cookedProteins));

  // Eligible (active, in-season) AND never-cooked. The slot argument only feeds
  // the active+season filter; meal-time is not narrowed here (Explore spans both).
  const eligible = eligibleDishes({
    library,
    history,
    season,
    slot: { day: "Mon", meal: "Lunch" },
  });
  const candidates = eligible.filter((d) => !cooked.has(d.id));

  const ranked: ExploreRankedDish[] = candidates.map((dish) => {
    const sharedIngredient = primaryFreq.get(dish.primaryIngredient) ?? 0;
    const familiarCategory = categoryFreq.get(dish.category) ?? 0;
    const band = proteinBand(dishProtein(dish, ingredientsByDishId, catalog));
    const proteinMatch = 1 / (1 + Math.abs(band - medianBand));

    const signals = { sharedIngredient, proteinMatch, familiarCategory };
    const byKey: Record<ExploreAffinityKey, number> = {
      "shared-ingredient": sharedIngredient,
      "protein-match": proteinMatch,
      "familiar-category": familiarCategory,
    };
    let dominantAffinity: ExploreAffinityKey = AFFINITY_PRIORITY[0];
    for (const key of AFFINITY_PRIORITY) {
      if (byKey[key] > byKey[dominantAffinity]) dominantAffinity = key;
    }

    return {
      dish,
      score: sharedIngredient + proteinMatch + familiarCategory,
      signals,
      dominantAffinity,
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.dish.id - b.dish.id;
  });
  return ranked;
}
