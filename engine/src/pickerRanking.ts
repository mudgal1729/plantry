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
 * already has). Within the head, dishes are ordered by a deterministic
 * LEXICOGRAPHIC comparison on the tuple
 *
 *   (recencyTier, proteinBandDistanceForSwaps, id)   — lower wins
 *
 *   - recencyTier: a COARSE recency bucket, NOT a unique total order. All
 *     NEVER-COOKED dishes share the single best (first) tier. Cooked dishes are
 *     tiered by their last-cooked weekStart, oldest weekStart = better tier, so
 *     dishes last cooked the same week share a tier. Genuine ties therefore
 *     exist (all never-cooked dishes tie; same-week dishes tie). This is the
 *     DOMINANT term: a longer-unused dish in a better tier always outranks a
 *     closer-protein-band dish in a worse tier. The §4 fruit/lunch-carb recency
 *     exemption does NOT apply here; the picker ranks every dish by recency
 *     uniformly, because a swap is a deliberate user choice, not an automated
 *     pick.
 *
 *   - proteinBandDistanceForSwaps: for SWAPS ONLY (an `outgoingDish` is
 *     supplied), the absolute distance in protein band between the candidate and
 *     the outgoing dish. Because it sits SECOND in the tuple, it only ever
 *     orders dishes that already share a recencyTier; it can never move a dish
 *     across tiers. A candidate in the same protein band as the dish being
 *     replaced sorts ahead of one a band away. Protein bands are derived from
 *     `nutrition.ts` per-person protein (§11), bucketed by
 *     `PROTEIN_BAND_WIDTH_GRAMS`. For ADDS (no `outgoingDish`) this term is a
 *     constant 0, so the head is pure recency tier then id.
 *
 *   - id: dish id ascending, the final total tie-break.
 *
 * TAIL: every other meal-time-matching dish in the pool (i.e. dishes already on
 * the day, which the head excluded). The tail keeps the broad pool complete
 * (Principle 4: the picker is non-restrictive; nothing is dropped) while
 * pushing same-day repeats below fresh options. The tail is ordered by the same
 * tuple comparison so it is internally deterministic too.
 *
 * DETERMINISM: no RNG anywhere. Every tie resolves through the fixed tuple
 * chain:
 *   1. recencyTier (coarse longest-unused bucket; never-cooked = best tier)
 *   2. proteinBandDistanceForSwaps (swap only; same-band first)
 *   3. dish id ascending (the final, total tie-break)
 *
 * This module ranks; it does NOT filter the pool. The broad-pool eligibility
 * filter (Active + season + meal-time) stays in the caller (`app/convex/swap.ts`
 * `getSlotAlternatives`), non-restrictive per Principle 4.
 */

/** Number of grams-per-person that separates one protein band from the next. */
export const PROTEIN_BAND_WIDTH_GRAMS = 5;

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
 * Coarse recency tier for one dish (lower = longer unused = ranks first). This
 * is deliberately NOT a unique index: dishes that are equally fresh share a
 * tier, so the protein-band term below can order WITHIN the tier.
 *
 *   - Never-cooked dishes share tier 0, the single best tier.
 *   - Cooked dishes are tiered by their last-cooked weekStart, oldest first.
 *     Every distinct weekStart maps to a distinct tier (1, 2, 3, ...), and all
 *     dishes sharing a weekStart share a tier.
 *
 * `tierByWeek` is the precomputed weekStart -> tier index map for the group;
 * see `recencyTierMap`.
 */
function recencyTier(
  dish: Dish,
  lastCooked: Map<number, string>,
  tierByWeek: Map<string, number>,
): number {
  const week = lastCooked.get(dish.id);
  if (week === undefined) return 0;
  // Cooked tiers start at 1 so every cooked dish ranks below every never-cooked
  // one (tier 0). The non-null assertion is safe: tierByWeek holds every
  // weekStart seen across the group.
  return tierByWeek.get(week)!;
}

/**
 * Build the weekStart -> tier map for a group of dishes: sort the distinct
 * last-cooked weekStarts ascending (oldest = best) and number them from 1, so
 * tier 0 stays reserved for never-cooked dishes.
 */
function recencyTierMap(dishes: Dish[], lastCooked: Map<number, string>): Map<string, number> {
  const weeks = new Set<string>();
  for (const dish of dishes) {
    const week = lastCooked.get(dish.id);
    if (week !== undefined) weeks.add(week);
  }
  const tierByWeek = new Map<string, number>();
  [...weeks]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .forEach((week, index) => tierByWeek.set(week, index + 1));
  return tierByWeek;
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

  // recencyTier: a coarse longest-unused bucket (never-cooked = tier 0), built
  // over head and tail independently so each group is internally tiered. Equally
  // fresh dishes share a tier so the protein-band term can order within it.
  const headTierByWeek = recencyTierMap(head, lastCooked);
  const tailTierByWeek = recencyTierMap(tail, lastCooked);

  // Protein-band distance: swaps only, and only when macros are available.
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

  /**
   * Protein-band distance to the outgoing dish (swaps only). Sits SECOND in the
   * sort tuple, so it only ever orders dishes that already share a recencyTier;
   * it can never move a dish across tiers. Constant 0 for adds (no outgoing
   * dish) and when macros are unavailable, making it a no-op there.
   */
  function proteinBandDistance(dish: Dish): number {
    if (outgoingBand === undefined) return 0;
    const band = proteinBand(dishProtein(dish, ingredientsByDishId, catalogRows));
    return Math.abs(band - outgoingBand);
  }

  function sortGroup(group: Dish[], tierByWeek: Map<string, number>): Dish[] {
    return [...group].sort((a, b) => {
      // Lexicographic on (recencyTier, proteinBandDistance, id). Recency is the
      // dominant term; protein band only tie-breaks within a shared tier; id is
      // the final total tie-break.
      const tierDiff =
        recencyTier(a, lastCooked, tierByWeek) - recencyTier(b, lastCooked, tierByWeek);
      if (tierDiff !== 0) return tierDiff;
      const bandDiff = proteinBandDistance(a) - proteinBandDistance(b);
      if (bandDiff !== 0) return bandDiff;
      return a.id - b.id;
    });
  }

  return [...sortGroup(head, headTierByWeek), ...sortGroup(tail, tailTierByWeek)];
}
