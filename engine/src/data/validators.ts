import type {
  CatalogIngredient,
  Dish,
  DishFile,
  GroceryGroup,
  Ingredient,
  MenuHistoryRow,
  PackSizeHeader,
  Season,
} from "./schemas.js";
import { CatalogIngredientSchema, DishSchema } from "./schemas.js";
import { baseSlug, slugForDishes } from "./slug.js";
import { serializeDishFile } from "./serialize.js";
import { deriveDishMacros } from "../nutrition.js";
import { eligibleDishes } from "../eligibility.js";
import {
  breakfastWeekdayPair,
  breakfastSinglePick,
  menu1,
  menu2,
  menu3,
  menu4,
} from "../composition.js";

export function validateMenuHistoryAgainstLibrary(history: MenuHistoryRow[], dishes: Dish[]): void {
  const dishIds = new Set(dishes.map((d) => d.id));
  const missing = new Map<number, MenuHistoryRow[]>();
  for (const row of history) {
    if (!dishIds.has(row.dishId)) {
      const list = missing.get(row.dishId) ?? [];
      list.push(row);
      missing.set(row.dishId, list);
    }
  }
  if (missing.size === 0) return;
  const sortedIds = Array.from(missing.keys()).sort((a, b) => a - b);
  const parts = sortedIds.map((id) => {
    const rows = missing.get(id)!;
    const refs = rows
      .map((r) => `week=${r.weekStart} day=${r.day} meal=${r.meal} name="${r.dishName}"`)
      .join("; ");
    return `dish id ${id} (referenced by: ${refs})`;
  });
  throw new Error(
    `validateMenuHistoryAgainstLibrary: ${missing.size} dish id(s) in history not present in dish library: ${parts.join(" | ")}`,
  );
}

export function validatePackSizesUsed(
  packSizes: PackSizeHeader[],
  ingredients: Ingredient[],
): void {
  const usedNames = new Set(ingredients.map((i) => i.ingredient));
  const unused: string[] = [];
  for (const p of packSizes) {
    if (!usedNames.has(p.ingredient)) {
      unused.push(p.ingredient);
    }
  }
  if (unused.length === 0) return;
  throw new Error(
    `validatePackSizesUsed: ${unused.length} tracked ingredient(s) in pack-size header not referenced by any ingredient row: ${unused.map((n) => `"${n}"`).join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// Per-dish file + ingredient catalog validators (feature plan §1.3 / §5).
// These are the blocking gates that protect the new data layout: structural
// integrity of the dish files, and the name-resolution gate that protects
// future ordering automation (plan §7 item 1).
// ---------------------------------------------------------------------------

/**
 * Structural gates over the parsed dish files:
 * (a) frontmatter validates against the dish schema (re-asserted here so the
 *     gate holds even if a caller built DishFiles without the parser);
 * (b) dish ids are unique;
 * (c) slugs are unique;
 * (d) each file's slug matches the slug derived from its name (using the
 *     library-wide collision resolution), so the filename is canonical and
 *     stable.
 */
export function validateDishFiles(files: DishFile[]): void {
  const problems: string[] = [];

  // (a) schema re-validation.
  for (const f of files) {
    const r = DishSchema.safeParse(f.dish);
    if (!r.success) {
      problems.push(
        `dish "${f.slug}": frontmatter invalid: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
    }
  }

  // (b) id uniqueness.
  const idToSlugs = new Map<number, string[]>();
  for (const f of files) {
    const list = idToSlugs.get(f.dish.id) ?? [];
    list.push(f.slug);
    idToSlugs.set(f.dish.id, list);
  }
  for (const [id, slugs] of idToSlugs) {
    if (slugs.length > 1) {
      problems.push(`dish id ${id} used by ${slugs.length} files: ${slugs.join(", ")}`);
    }
  }

  // (c) slug uniqueness.
  const slugCounts = new Map<string, number>();
  for (const f of files) {
    slugCounts.set(f.slug, (slugCounts.get(f.slug) ?? 0) + 1);
  }
  for (const [slug, count] of slugCounts) {
    if (count > 1) problems.push(`slug "${slug}" used by ${count} files`);
  }

  // (d) slug matches the canonical derivation (filename canonicality).
  const expected = slugForDishes(files.map((f) => ({ id: f.dish.id, name: f.dish.name })));
  for (const f of files) {
    const want = expected.get(f.dish.id);
    if (want !== undefined && want !== f.slug) {
      problems.push(
        `dish id ${f.dish.id} ("${f.dish.name}") has slug "${f.slug}" but canonical slug is "${want}" (base "${baseSlug(f.dish.name)}")`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`validateDishFiles: ${problems.join(" | ")}`);
  }
}

/**
 * Every catalog row has a valid Group (and unit), and ingredient names are
 * unique across the catalog. The Group enum is already enforced by the schema
 * on parse; this re-asserts it and adds the uniqueness gate so a duplicated or
 * group-less row fails the build.
 */
export function validateCatalogGroups(catalog: CatalogIngredient[]): void {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const row of catalog) {
    const r = CatalogIngredientSchema.safeParse(row);
    if (!r.success) {
      problems.push(
        `catalog row "${row.ingredient}": ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
    }
    seen.set(row.ingredient, (seen.get(row.ingredient) ?? 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) problems.push(`catalog ingredient "${name}" appears ${count} times`);
  }
  if (problems.length > 0) {
    throw new Error(`validateCatalogGroups: ${problems.join(" | ")}`);
  }
}

/**
 * The referential-integrity gate that is the whole point of this slice: every
 * ingredient row inside every dish file must resolve to a catalog row by exact
 * name match. This is what protects future ordering automation (plan §7 item
 * 1): a row that names an ingredient absent from the catalog would have no
 * group, no pack size, and no machine-readable identity. (Note: the dish
 * frontmatter `primaryIngredient` is a free categorization label, NOT an
 * ingredient row, and intentionally is NOT required to resolve here. See the PR
 * diagnosis card.)
 */
export function validateIngredientNamesResolve(
  files: DishFile[],
  catalog: CatalogIngredient[],
): void {
  const catalogNames = new Set(catalog.map((c) => c.ingredient));
  const unresolved = new Map<string, string[]>();
  for (const f of files) {
    for (const row of f.ingredients) {
      if (!catalogNames.has(row.ingredient)) {
        const list = unresolved.get(row.ingredient) ?? [];
        list.push(f.slug);
        unresolved.set(row.ingredient, list);
      }
    }
  }
  if (unresolved.size === 0) return;
  const parts = Array.from(unresolved.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, slugs]) => `"${name}" (in ${slugs.join(", ")})`);
  throw new Error(
    `validateIngredientNamesResolve: ${unresolved.size} ingredient name(s) in dish files do not resolve to a catalog row: ${parts.join("; ")}`,
  );
}

/**
 * Per-file round-trip gate: re-serializing a parsed dish file reproduces the
 * on-disk bytes exactly. Run by the round-trip test against every file on disk.
 */
export function validateDishFileRoundTrip(file: DishFile, original: string): void {
  const out = serializeDishFile(file);
  if (out !== original) {
    throw new Error(
      `validateDishFileRoundTrip: dish "${file.slug}" does not round-trip byte-identical`,
    );
  }
}

// ===========================================================================
// Reporting layer (design-revamp §1.3, slice 2.1).
//
// These are REPORTING severity, NOT blocking. They never throw on a coverage
// gap or a thin pool; they return structured data that engine/scripts/reports.ts
// prints in CI output and the slow loop later consumes. The blocking validators
// above keep facts TRUE; these reports keep the library GOOD, which is judgment
// CI cannot make. Blank macros (every cell this slice, until 2.2) are EXPECTED:
// the coverage report reading near-zero on macros is correct, not a failure.
// ===========================================================================

const ALL_SEASONS: readonly Season[] = ["Summer", "Monsoon", "Winter"];

/**
 * Catalog rows that SHOULD carry macros, so the coverage denominator is not
 * diluted by spices and aromatics that legitimately stay blank forever
 * (design-revamp §1.1: "spices and aromatics can stay blank forever, protein
 * sources and staples cannot"). Heuristic, reporting-only: rows in the food
 * groups (Proteins and Dairy, Pantry, Vegetables) are macro-relevant; Aromatics
 * and Herbs and Other are not. Tuning this set never blocks a build.
 */
const MACRO_RELEVANT_GROUPS: ReadonlySet<GroceryGroup> = new Set<GroceryGroup>([
  "Proteins and Dairy",
  "Pantry",
  "Vegetables",
]);

function isMacroRelevant(row: CatalogIngredient): boolean {
  return MACRO_RELEVANT_GROUPS.has(row.group);
}

function hasMacros(row: CatalogIngredient): boolean {
  return row.proteinPer100g !== undefined || row.carbsPer100g !== undefined;
}

export interface CoverageReport {
  activeDishCount: number;
  /** Count of active dishes carrying each enrichment field. */
  withDescription: number;
  withRecipe: number;
  withComplexity: number;
  withPhoto: number;
  /** Macro-relevant catalog rows, and how many carry any macro value. */
  macroRelevantCount: number;
  macroRelevantWithMacros: number;
}

/**
 * Enrichment + macro coverage over the active library and the catalog. The
 * ratchet slice 2.2+ burns down. Active dishes only (inactive dishes are not
 * shown in the UI, so their enrichment does not matter yet).
 */
export function coverageReport(dishes: Dish[], catalog: CatalogIngredient[]): CoverageReport {
  const active = dishes.filter((d) => d.active === "Yes");
  const macroRelevant = catalog.filter(isMacroRelevant);
  return {
    activeDishCount: active.length,
    withDescription: active.filter((d) => d.description !== undefined).length,
    withRecipe: active.filter((d) => d.recipe !== undefined).length,
    withComplexity: active.filter((d) => d.complexity !== undefined).length,
    withPhoto: active.filter((d) => d.photo !== undefined).length,
    macroRelevantCount: macroRelevant.length,
    macroRelevantWithMacros: macroRelevant.filter(hasMacros).length,
  };
}

/** One composition slot's candidate count, for one season. */
export interface PoolCount {
  season: Season;
  /** Composition slot label, mirroring docs/engine.md §3. */
  slot: string;
  count: number;
}

/**
 * For each composition slot in docs/engine.md §3, per season, the count of
 * eligible candidates. Surfaces thin pools (the source of repetition) and flags
 * when a season change strands a slot. The slot pools come from the live
 * composition functions, so the report cannot drift from the engine.
 *
 * Lunch carbs are reported as the §3.1 default pool (no Rice-already-used
 * constraint applied: this is a static pool snapshot, not a within-week pick).
 */
export function poolCoverageReport(library: Dish[]): PoolCount[] {
  const out: PoolCount[] = [];
  for (const season of ALL_SEASONS) {
    // §3 composition reads from the eligible (active, in-season) set for the
    // meal; breakfast and lunch share the same eligible set here since
    // eligibility is season + active only (docs/engine.md §1).
    const eligible = eligibleDishes({
      library,
      history: [],
      season,
      slot: { day: "Mon", meal: "Lunch" },
    });

    const pair = breakfastWeekdayPair(eligible);
    const single = breakfastSinglePick(eligible);
    const m1 = menu1(eligible, []);
    const m2 = menu2(eligible, []);
    const m3 = menu3(eligible);
    const m4 = menu4(eligible);

    const rows: Array<[string, number]> = [
      ["Breakfast Option A: complete_meal", pair.optionA.completeMeal.length],
      ["Breakfast Option A: fruit", pair.optionA.fruit.length],
      ["Breakfast Option B: complete_carb", pair.optionB.completeCarb.length],
      ["Breakfast Option B: accompaniment", pair.optionB.accompaniment.length],
      ["Breakfast Option C: dry main", pair.optionC.dryMain.length],
      ["Breakfast Option C: plain carb", pair.optionC.plainCarb.length],
      ["Breakfast single (Tue/Thu)", single.pool.length],
      ["Menu 1: HP", m1.hp.length],
      ["Menu 1: partner when HP is Dry", m1.partnerWhenHpIsDry.length],
      ["Menu 1: partner when HP is Gravy", m1.partnerWhenHpIsGravy.length],
      ["Menu 2: Keto", m2.keto.length],
      ["Menu 2: non-HP Gravy", m2.nonHpGravy.length],
      ["Menu 2: non-HP Dry", m2.nonHpDry.length],
      ["Menu 3: complete_meal + HP", m3.completeMealHp.length],
      ["Menu 3: Accompaniment", m3.accompaniment.length],
      ["Menu 3: Dessert", m3.dessert.length],
      ["Menu 4: complete_meal non-HP", m4.completeMealNonHp.length],
      ["Menu 4: Keto", m4.keto.length],
      ["Menu 4: Accompaniment", m4.accompaniment.length],
      ["Lunch carb (§3.1)", m1.lunchCarb.length],
    ];
    for (const [slot, count] of rows) {
      out.push({ season, slot, count });
    }
  }
  return out;
}

/** One dish whose computed protein disagrees with its HP tag. */
export interface HpProteinDrift {
  dishId: number;
  dishName: string;
  hasHpTag: boolean;
  proteinPerPerson: number;
  /** The high-protein threshold (g per person) the report compared against. */
  threshold: number;
}

/**
 * The HP threshold (grams of protein per person) the consistency report uses to
 * call a dish "high-protein". Reporting-only: the HP TAG stays the rule input
 * (docs/engine.md §3), this number only surfaces drift between the tag and the
 * derived macro. Whether HP ever becomes derived from a threshold is a future
 * slow-loop question (design-revamp §1.2), not this slice.
 */
export const HP_PROTEIN_THRESHOLD_PER_PERSON = 20;

/**
 * Warn when a dish's COMPUTED protein and its HP tag disagree: HP-tagged but
 * below the threshold, or above the threshold without the tag. Dishes whose
 * macros are not yet populated (derived protein zero because every ingredient's
 * catalog macros are blank) are SKIPPED, so the report stays silent this slice
 * (every macro cell is blank until 2.2) and only speaks once real macros exist.
 */
export function hpProteinConsistencyReport(
  dishes: Dish[],
  ingredients: Ingredient[],
  catalog: CatalogIngredient[],
): HpProteinDrift[] {
  const rowsByDishId = new Map<number, Ingredient[]>();
  for (const row of ingredients) {
    const list = rowsByDishId.get(row.dishId);
    if (list) list.push(row);
    else rowsByDishId.set(row.dishId, [row]);
  }

  const drift: HpProteinDrift[] = [];
  for (const dish of dishes) {
    if (dish.active !== "Yes") continue;
    const rows = rowsByDishId.get(dish.id) ?? [];
    const { proteinPerPerson } = deriveDishMacros(rows, catalog);
    // No macro data yet -> nothing to compare. This keeps the report empty
    // until macros are populated (2.2), which is the intended pre-2.2 state.
    if (proteinPerPerson === 0) continue;
    const hasHpTag = dish.tags.includes("HP");
    const isHighProtein = proteinPerPerson >= HP_PROTEIN_THRESHOLD_PER_PERSON;
    if (hasHpTag !== isHighProtein) {
      drift.push({
        dishId: dish.id,
        dishName: dish.name,
        hasHpTag,
        proteinPerPerson,
        threshold: HP_PROTEIN_THRESHOLD_PER_PERSON,
      });
    }
  }
  return drift;
}
