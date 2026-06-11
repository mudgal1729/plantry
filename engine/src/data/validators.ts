import type {
  CatalogIngredient,
  Dish,
  DishFile,
  Ingredient,
  MenuHistoryRow,
  PackSizeHeader,
} from "./schemas.js";
import { CatalogIngredientSchema, DishSchema } from "./schemas.js";
import { baseSlug, slugForDishes } from "./slug.js";
import { serializeDishFile } from "./serialize.js";

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
