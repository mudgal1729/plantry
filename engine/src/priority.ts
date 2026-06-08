import type { Dish, MenuHistoryRow } from "./data/schemas.js";

/**
 * Placeholder context shape for §6 ingredient consolidation. Step 3 of §4
 * delegates to §6, which has not landed yet (B slice 5). When §6 ships, this
 * type will carry the leftover ledger needed to score candidates by which
 * ingredients they reuse from earlier picks in the week.
 */
export type ConsolidationContext = Record<string, never>;

export interface RankCandidatesArgs {
  pool: Dish[];
  history: MenuHistoryRow[];
  /**
   * The Primary Ingredient of breakfast on the same day as the slot being
   * ranked. Used by step 2 to deprioritise lunch candidates that repeat the
   * morning's headline ingredient. Undefined for slots without a same-day
   * breakfast (Saturday lunch) or when the breakfast slot has not been
   * decided yet.
   */
  sameDayBreakfastPrimaryIngredient?: string;
  /** Placeholder for §6 ingredient consolidation. Unused until B slice 5. */
  consolidationContext?: ConsolidationContext;
}

const LUNCH_CARB_CATEGORIES = new Set(["Chapati", "Rice"]);

/**
 * §4 recency exemption: dishes with the `fruit` tag and lunch carbs (Category
 * in {Chapati, Rice}) are exempt from step 1 (longest unused). They pass
 * through with a neutral rank so step 1 cannot reorder them relative to each
 * other or to non-exempt dishes.
 */
function isRecencyExempt(dish: Dish): boolean {
  if (dish.tags.includes("fruit")) return true;
  if (LUNCH_CARB_CATEGORIES.has(dish.category)) return true;
  return false;
}

/** Last-cooked date per dish id, taken from the most recent matching history row. */
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
 * §4 step 1: sort the pool oldest last-cooked date first. A dish that has
 * never been cooked counts as the longest unused. Recency-exempt dishes
 * (fruit-tagged, lunch carbs) keep their input position; the sort treats any
 * comparison touching an exempt dish as a tie so stable order is preserved.
 */
export function byLongestUnused(pool: Dish[], history: MenuHistoryRow[]): Dish[] {
  const lastCooked = lastCookedMap(history);
  // Decorate with original index so we can do a stable sort by hand; Array.sort
  // is not guaranteed stable across engines older than ES2019, and being
  // explicit here also documents the tie semantics.
  const decorated = pool.map((dish, index) => ({ dish, index }));
  decorated.sort((a, b) => {
    const aExempt = isRecencyExempt(a.dish);
    const bExempt = isRecencyExempt(b.dish);
    // Either side exempt → neutral; preserve input order via index tiebreak.
    if (aExempt || bExempt) {
      return a.index - b.index;
    }
    const aDate = lastCooked.get(a.dish.id);
    const bDate = lastCooked.get(b.dish.id);
    // Never-cooked counts as longest unused → comes first.
    if (aDate === undefined && bDate === undefined) return a.index - b.index;
    if (aDate === undefined) return -1;
    if (bDate === undefined) return 1;
    if (aDate < bDate) return -1;
    if (aDate > bDate) return 1;
    return a.index - b.index;
  });
  return decorated.map((d) => d.dish);
}

/**
 * §4 step 2: if a candidate's Primary Ingredient matches the same day's
 * breakfast Primary Ingredient, push it to the bottom of the pool while
 * preserving the prior-step order among the kept-above and pushed-below
 * groups. If no `sameDayBreakfastPrimaryIngredient` is supplied (Saturday
 * lunch, or the breakfast slot has not been resolved yet), the step is a
 * no-op. If every candidate matches, pushing them all to the bottom is the
 * same as pushing none; the pool is returned unchanged so §4's "if no viable
 * alternative remains, allow the repeat" fallback holds without special
 * casing further down.
 */
export function byNoSameDayPrimaryIngredient(
  pool: Dish[],
  sameDayBreakfastPrimaryIngredient: string | undefined,
): Dish[] {
  if (sameDayBreakfastPrimaryIngredient === undefined) return pool;
  const target = sameDayBreakfastPrimaryIngredient;
  const kept: Dish[] = [];
  const pushedDown: Dish[] = [];
  for (const dish of pool) {
    if (dish.primaryIngredient === target) {
      pushedDown.push(dish);
    } else {
      kept.push(dish);
    }
  }
  // Fallback: every candidate would be deprioritised → §4 allows the repeat.
  if (kept.length === 0) return pool;
  return [...kept, ...pushedDown];
}

/**
 * §4 step 3 is implemented in B slice 5 (§6 ingredient consolidation). This is
 * a no-op placeholder until §6 lands.
 */
export function byConsolidationStub(
  pool: Dish[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: ConsolidationContext | undefined,
): Dish[] {
  return pool;
}

/**
 * §4 step 4: Preferred=Yes ranks above Preferred=No. Stable: within each group
 * the order from the previous step is preserved.
 */
export function byPreferredYes(pool: Dish[]): Dish[] {
  const yes: Dish[] = [];
  const no: Dish[] = [];
  for (const dish of pool) {
    if (dish.preferred === "Yes") {
      yes.push(dish);
    } else {
      no.push(dish);
    }
  }
  return [...yes, ...no];
}

/**
 * §4 selection priority. Composes the four steps in order; each step takes the
 * output of the previous as its input, so ties from step N are broken by step
 * N+1. Returns a stable permutation of the input pool.
 */
export function rankCandidates(args: RankCandidatesArgs): Dish[] {
  const step1 = byLongestUnused(args.pool, args.history);
  const step2 = byNoSameDayPrimaryIngredient(step1, args.sameDayBreakfastPrimaryIngredient);
  const step3 = byConsolidationStub(step2, args.consolidationContext);
  const step4 = byPreferredYes(step3);
  return step4;
}
