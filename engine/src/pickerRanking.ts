import type { Dish, MenuHistoryRow } from "./data/schemas.js";
import type { Meal } from "./eligibility.js";
import { deriveDishMacros } from "./nutrition.js";
import type { CatalogIngredient, Ingredient } from "./data/schemas.js";

/**
 * Picker ranking (docs/engine.md §5 Picker ranking, design-revamp §1.4 item 1).
 *
 * The swap and add pickers rank the broad meal-time pool with their own
 * deterministic rule, distinct from §4 selection priority (which ranks
 * generation candidate sets). The picker answers a different question: given
 * the broad, non-restrictive pool (Active + in-season + meal-time, per
 * Principle 4), which alternatives should surface first when a user opens the
 * "Replace with..." or "Add a dish" sheet?
 *
 * The ranking is a HEAD followed by a TAIL.
 *
 * HEAD ("fits this day"): dishes whose meal-time matches the slot and that are
 * NOT already placed on that day (so the picker never offers a dish the day
 * already has). Within the head, dishes are ordered by a deterministic score
 * (lower score ranks first):
 *
 *   headScore(d) = recencyRank(d) + proteinPenalty(d)
 *
 *   - recencyRank: the dish's 0-based index in the longest-unused ordering of
 *     the head (never-cooked first, then oldest last-cooked first). This is the
 *     dominant term: a never-cooked dish gets rank 0, the next-oldest rank 1,
 *     and so on. Recency-exempt dishes (the §4 fruit/lunch-carb exemption does
 *     NOT apply here; the picker ranks every dish by recency uniformly, because
 *     a swap is a deliberate user choice, not an automated pick).
 *
 *   - proteinPenalty: for SWAPS ONLY (an `outgoingDish` is supplied), the
 *     absolute difference in protein band between the candidate and the
 *     outgoing dish, scaled so it tie-breaks WITHIN a recency rank but never
 *     overrides it. A candidate in the same protein band as the dish being
 *     replaced sorts ahead of one a band away. Protein bands are derived from
 *     `nutrition.ts` per-person protein (§7). For ADDS (no `outgoingDish`) the
 *     penalty is zero and the head is pure recency.
 *
 * The protein penalty is bounded to [0, 1) so it can only reorder candidates
 * that share a recencyRank — it can never leapfrog a more-recently-cooked dish
 * over a longer-unused one. This keeps recency dominant and the protein signal
 * a pure tie-break, exactly the "recency plus protein-band similarity" the
 * handoff describes.
 *
 * TAIL: every other meal-time-matching dish in the pool (i.e. dishes already on
 * the day, which the head excluded). The tail keeps the broad pool complete
 * (Principle 4: the picker is non-restrictive; nothing is dropped) while
 * pushing same-day repeats below fresh options. The tail is ordered by the same
 * recency-then-protein score so it is internally deterministic too.
 *
 * DETERMINISM: no RNG anywhere. Every tie resolves through a fixed chain:
 *   1. recencyRank (longest-unused; never-cooked first)
 *   2. proteinPenalty (swap only; same-band first)
 *   3. dish id ascending (the final, total tie-break)
 *
 * This module ranks; it does NOT filter the pool. The broad-pool eligibility
 * filter (Active + season + meal-time) stays in the caller (`app/convex/swap.ts`
 * `getSlotAlternatives`), non-restrictive per Principle 4.
 */

/** Number of grams-per-person that separates one protein band from the next. */
export const PROTEIN_BAND_WIDTH_GRAMS = 5;

/**
 * Upper bound (exclusive) on the protein tie-break penalty. Keeping it below 1
 * guarantees the penalty only reorders candidates that share a recencyRank: it
 * can never push a candidate past one with a smaller (better) recencyRank.
 */
const MAX_PROTEIN_PENALTY = 0.999;

export interface PickerRankingArgs {
  /**
   * The broad, non-restrictive pool already filtered by the caller (Active +
   * in-season + meal-time). This module ranks but never filters it.
   */
  pool: Dish[];
  /** The slot's meal-time; defines the head's "fits this day" meal match. */
  meal: Meal;
  /**
   * Dishes already placed on the same day as the slot. Used to split the head
   * (fresh, not-on-day options) from the tail (same-day repeats). Pass the
   * empty array when nothing is on the day yet (a fresh add).
   */
  dishesOnDay: Dish[];
  /** Cooking history (live + within-week synthetic), for the recency ordering. */
  history: MenuHistoryRow[];
  /**
   * The dish being replaced. Present for SWAPS (enables protein-band
   * similarity); absent for ADDS (head is pure recency).
   */
  outgoingDish?: Dish;
  /**
   * Per-dish ingredient rows for the whole library, used to derive protein for
   * the protein-band tie-break. Only consulted when `outgoingDish` is set.
   * Absent (or empty) leaves every protein band at 0, so the penalty is a no-op
   * and ranking falls back to pure recency + id.
   */
  ingredients?: Ingredient[];
  /** Ingredient catalog, the per-100g macro source for protein derivation. */
  catalog?: CatalogIngredient[];
}

/** Last-cooked date per dish id, most recent matching history row. */
function lastCookedMap(history: MenuHistoryRow[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of history) {
    const existing = map.get(row.dishId);
    if (existing === undefined || row.weekStart > existing) {
      map.set(row.dishId, row.weekStart);
    }
  }
  return map;
}

/**
 * Order a set of dishes longest-unused first (never-cooked ahead of cooked,
 * then oldest last-cooked first), id ascending as the final tie-break. Returns
 * the ids in that order so callers can read off a 0-based recency rank.
 */
function longestUnusedOrder(dishes: Dish[], lastCooked: Map<number, string>): number[] {
  return [...dishes]
    .sort((a, b) => {
      const aDate = lastCooked.get(a.id);
      const bDate = lastCooked.get(b.id);
      if (aDate === undefined && bDate === undefined) return a.id - b.id;
      if (aDate === undefined) return -1;
      if (bDate === undefined) return 1;
      if (aDate < bDate) return -1;
      if (aDate > bDate) return 1;
      return a.id - b.id;
    })
    .map((d) => d.id);
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

/** Integer protein band: protein-per-person bucketed into PROTEIN_BAND_WIDTH_GRAMS. */
function proteinBand(proteinPerPerson: number): number {
  return Math.floor(proteinPerPerson / PROTEIN_BAND_WIDTH_GRAMS);
}

/**
 * Rank a broad swap/add pool deterministically. Returns a stable permutation of
 * the input pool: head (fresh, not-on-day, recency + protein-band) then tail
 * (same-day repeats, same ordering). No dish is dropped; no RNG is used.
 */
export function rankPickerAlternatives(args: PickerRankingArgs): Dish[] {
  const { pool, dishesOnDay, history, outgoingDish, ingredients, catalog } = args;

  const lastCooked = lastCookedMap(history);
  const onDayIds = new Set(dishesOnDay.map((d) => d.id));

  // Split head (not already on the day) from tail (same-day repeats). The pool
  // is assumed already meal-time-filtered by the caller; we do not re-filter.
  const head: Dish[] = [];
  const tail: Dish[] = [];
  for (const dish of pool) {
    if (onDayIds.has(dish.id)) tail.push(dish);
    else head.push(dish);
  }

  // recencyRank: 0-based index in the longest-unused ordering, computed over
  // head and tail independently so each group is internally recency-ordered.
  const headRank = new Map<number, number>();
  longestUnusedOrder(head, lastCooked).forEach((id, index) => headRank.set(id, index));
  const tailRank = new Map<number, number>();
  longestUnusedOrder(tail, lastCooked).forEach((id, index) => tailRank.set(id, index));

  // Protein-band penalty: swaps only, and only when macros are available.
  const ingredientsByDishId = new Map<number, Ingredient[]>();
  if (ingredients) {
    for (const row of ingredients) {
      const list = ingredientsByDishId.get(row.dishId);
      if (list) list.push(row);
      else ingredientsByDishId.set(row.dishId, [row]);
    }
  }
  const catalogRows = catalog ?? [];
  const outgoingBand =
    outgoingDish !== undefined
      ? proteinBand(dishProtein(outgoingDish, ingredientsByDishId, catalogRows))
      : undefined;

  function proteinPenalty(dish: Dish): number {
    if (outgoingBand === undefined) return 0;
    const band = proteinBand(dishProtein(dish, ingredientsByDishId, catalogRows));
    const bandDistance = Math.abs(band - outgoingBand);
    // Squash unbounded band distance into [0, MAX_PROTEIN_PENALTY) so it can
    // only ever tie-break within a recencyRank, never override it. A distance
    // of 0 (same band) yields 0; larger distances asymptote toward, but never
    // reach, MAX_PROTEIN_PENALTY.
    return MAX_PROTEIN_PENALTY * (1 - 1 / (1 + bandDistance));
  }

  function sortGroup(group: Dish[], rankOf: Map<number, number>): Dish[] {
    return [...group].sort((a, b) => {
      const aScore = (rankOf.get(a.id) ?? 0) + proteinPenalty(a);
      const bScore = (rankOf.get(b.id) ?? 0) + proteinPenalty(b);
      if (aScore !== bScore) return aScore - bScore;
      return a.id - b.id;
    });
  }

  return [...sortGroup(head, headRank), ...sortGroup(tail, tailRank)];
}
