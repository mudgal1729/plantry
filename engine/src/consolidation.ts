import type { Dish, Ingredient, PackSizeHeader } from "./data/schemas.js";

/**
 * Per-ingredient state: how much of this ingredient is on the buy list and
 * how much remains unused after the dish picks so far this week. Implements
 * docs/engine.md §6 step 1 ("leftover after each dish picked").
 */
export interface IngredientLedgerEntry {
  ingredient: string;
  packSizeGrams: number;
  packsOnBuyList: number;
  usedGrams: number;
  leftoverGrams: number;
}

export type IngredientLedger = Map<string, IngredientLedgerEntry>;

/** Default leftover threshold from docs/engine.md §6 ("Leftover threshold: 50 g"). */
export const DEFAULT_LEFTOVER_THRESHOLD_GRAMS = 50;

/**
 * Fresh produce items named in docs/engine.md §6 soft-consolidation paragraph.
 * Source: "capsicum, tomato, cucumber, onion, mint, coriander". Canonical
 * ingredient names in the ingredient catalog (data/ingredients.md) spell mint
 * as "Mint Leaf" and coriander as "Coriander Leaf", so both forms map to the
 * same fresh-item concept and we list every form a Dish.primaryIngredient or
 * Ingredient row might use.
 */
export const FRESH_PRODUCE_ITEMS: ReadonlySet<string> = new Set([
  "Capsicum",
  "Tomato",
  "Cucumber",
  "Onion",
  "Mint Leaf",
  "Coriander Leaf",
]);

/**
 * Parse a pack-size string ("200 g", "500 g", ...) into grams. Pack sizes in
 * the live data are all grams (verified against data/ingredients.md). Any
 * non-gram pack size is treated as 0 (unconsolidatable), with the caller
 * deciding whether to keep the entry. Today every tracked Pack Size in the
 * ingredient catalog is grams so this branch is defensive.
 */
function parsePackSizeGrams(packSize: string): number {
  const match = packSize.trim().match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (!match) return 0;
  return Number(match[1]);
}

/**
 * docs/engine.md §6 ("Tracked: ingredients listed in the pack-size header").
 * Builds an empty ledger keyed by canonical ingredient name. Untracked
 * ingredients (anything not in `packSizes`) are NEVER added; downstream
 * applyPick / scoreCandidates ignore them.
 */
export function emptyLedger(packSizes: PackSizeHeader[]): IngredientLedger {
  const ledger: IngredientLedger = new Map();
  for (const header of packSizes) {
    const packSizeGrams = parsePackSizeGrams(header.packSize);
    ledger.set(header.ingredient, {
      ingredient: header.ingredient,
      packSizeGrams,
      packsOnBuyList: 0,
      usedGrams: 0,
      leftoverGrams: 0,
    });
  }
  return ledger;
}

/**
 * docs/engine.md §6 step 1 ("After each dish is picked, compute leftover for
 * its tracked ingredients: pack size minus dish usage, rounded up to the next
 * pack multiple if a single pack falls short"). Pure: returns a new ledger.
 *
 * Unit handling: only ingredient rows with unit="g" are consolidated against
 * grams-denominated pack sizes. Rows with unit="ml" or unit="pcs" (e.g.
 * Coconut Milk in ml; Egg in pcs) are not in the tracked header anyway today,
 * but the guard is in place so a future tracked ml/pcs ingredient does not
 * silently corrupt the gram ledger; instead it falls back to no
 * consolidation (a follow-up slice can add unit-aware ledgers if needed).
 */
export function applyPick(
  ledger: IngredientLedger,
  dish: Dish,
  ingredients: Ingredient[],
): IngredientLedger {
  const next: IngredientLedger = new Map();
  for (const [key, entry] of ledger) {
    next.set(key, { ...entry });
  }

  const rows = ingredients.filter((row) => row.dishId === dish.id);
  for (const row of rows) {
    const entry = next.get(row.ingredient);
    if (!entry) continue;
    if (row.unit !== "g") continue;
    if (entry.packSizeGrams <= 0) continue;

    entry.usedGrams += row.quantity;
    if (entry.usedGrams > entry.packsOnBuyList * entry.packSizeGrams) {
      const needed = Math.ceil(entry.usedGrams / entry.packSizeGrams);
      entry.packsOnBuyList = needed;
    }
    entry.leftoverGrams = entry.packsOnBuyList * entry.packSizeGrams - entry.usedGrams;
  }
  return next;
}

/**
 * Returns the set of tracked ingredient names a dish would consume above
 * threshold from existing leftovers. Used by both scoreCandidates and the
 * priority.ts step-3 composition.
 */
function consumedAboveThreshold(
  dish: Dish,
  ledger: IngredientLedger,
  ingredients: Ingredient[],
  thresholdGrams: number,
): number {
  let score = 0;
  const rows = ingredients.filter((row) => row.dishId === dish.id);
  for (const row of rows) {
    const entry = ledger.get(row.ingredient);
    if (!entry) continue;
    if (row.unit !== "g") continue;
    if (entry.leftoverGrams >= thresholdGrams) {
      score += 1;
    }
  }
  return score;
}

/**
 * docs/engine.md §6 step 2 ("If leftover is at least 50 g, the next slot
 * needing that ingredient prefers a dish that consumes the leftover").
 * Higher score (more tracked ingredients with above-threshold leftover that
 * this dish would consume) ranks first. Stable: ties preserve input order.
 */
export function scoreCandidates(
  pool: Dish[],
  ledger: IngredientLedger,
  ingredients: Ingredient[],
  thresholdGrams: number = DEFAULT_LEFTOVER_THRESHOLD_GRAMS,
): Dish[] {
  const decorated = pool.map((dish, index) => ({
    dish,
    index,
    score: consumedAboveThreshold(dish, ledger, ingredients, thresholdGrams),
  }));
  decorated.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.index - b.index;
  });
  return decorated.map((d) => d.dish);
}

/**
 * docs/engine.md §6 soft-consolidation paragraph ("prefer dishes that share
 * fresh produce already on the buy list: capsicum, tomato, cucumber, onion,
 * mint, coriander"). Returns the count of named fresh items the dish would
 * share with `lastFreshItemsUsed` (one purchase covering multiple dishes
 * beats two small ones). Pool sorted highest score first; stable on ties.
 *
 * The fresh items are matched against both Ingredient rows (dish-level
 * recipe) and Dish.primaryIngredient (the headline ingredient), so a dish
 * whose Primary Ingredient is one of the fresh items still counts even if
 * the ingredient row table only lists it once.
 */
export function scoreSoftConsolidation(
  pool: Dish[],
  lastFreshItemsUsed: ReadonlySet<string>,
  ingredients: Ingredient[],
): Dish[] {
  const decorated = pool.map((dish, index) => ({
    dish,
    index,
    score: countSharedFreshItems(dish, lastFreshItemsUsed, ingredients),
  }));
  decorated.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.index - b.index;
  });
  return decorated.map((d) => d.dish);
}

/**
 * Internal helper: the set of fresh-produce items a dish touches, intersected
 * with `lastFreshItemsUsed`. A dish whose Primary Ingredient is a fresh item
 * counts even when not enumerated in its ingredient rows.
 */
function countSharedFreshItems(
  dish: Dish,
  lastFreshItemsUsed: ReadonlySet<string>,
  ingredients: Ingredient[],
): number {
  const touched = new Set<string>();
  if (FRESH_PRODUCE_ITEMS.has(dish.primaryIngredient)) {
    touched.add(dish.primaryIngredient);
  }
  for (const row of ingredients) {
    if (row.dishId !== dish.id) continue;
    if (FRESH_PRODUCE_ITEMS.has(row.ingredient)) {
      touched.add(row.ingredient);
    }
  }
  let count = 0;
  for (const name of touched) {
    if (lastFreshItemsUsed.has(name)) count += 1;
  }
  return count;
}

/**
 * Composes hard (§6 step 2) and soft (§6 last paragraph) consolidation:
 * hard score is primary, soft score is secondary tiebreak, input order is
 * the final tiebreak. This is what priority.ts step 3 calls when a ledger
 * is present; when no soft signal is available (`lastFreshItemsUsed`
 * undefined) the behaviour is identical to scoreCandidates.
 */
export function rankByConsolidation(
  pool: Dish[],
  ledger: IngredientLedger,
  ingredients: Ingredient[],
  options: {
    thresholdGrams?: number;
    lastFreshItemsUsed?: ReadonlySet<string>;
  } = {},
): Dish[] {
  const threshold = options.thresholdGrams ?? DEFAULT_LEFTOVER_THRESHOLD_GRAMS;
  const soft = options.lastFreshItemsUsed;
  const decorated = pool.map((dish, index) => ({
    dish,
    index,
    hard: consumedAboveThreshold(dish, ledger, ingredients, threshold),
    soft: soft ? countSharedFreshItems(dish, soft, ingredients) : 0,
  }));
  decorated.sort((a, b) => {
    if (a.hard !== b.hard) return b.hard - a.hard;
    if (a.soft !== b.soft) return b.soft - a.soft;
    return a.index - b.index;
  });
  return decorated.map((d) => d.dish);
}
