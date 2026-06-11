import { ZodError } from "zod";
import { parse as parseYaml } from "yaml";
import {
  CatalogIngredientSchema,
  DishSchema,
  IngredientSchema,
  MenuHistoryRowSchema,
  type CatalogIngredient,
  type Dish,
  type DishFile,
  type DishIngredientRow,
  type Ingredient,
  type MenuHistoryRow,
  type PackSizeHeader,
} from "./schemas.js";

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

function splitRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    throw new Error(`Not a pipe-table row: ${line}`);
  }
  const inner = trimmed.slice(1, -1);
  return inner.split("|").map((cell) => cell.trim());
}

function isDividerRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
  const inner = trimmed.slice(1, -1);
  return inner.split("|").every((cell) => /^\s*-+\s*$/.test(cell));
}

function findTables(markdown: string): ParsedTable[] {
  const lines = markdown.split("\n");
  const tables: ParsedTable[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line && line.trim().startsWith("|") && next !== undefined && isDividerRow(next)) {
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && !isDividerRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      tables.push({ headers, rows });
    } else {
      i += 1;
    }
  }
  return tables;
}

function parseIntStrict(raw: string, label: string, rowKey: string): number {
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`${rowKey}: ${label} must be an integer, got "${raw}"`);
  }
  return parseInt(raw, 10);
}

function parseNumberStrict(raw: string, label: string, rowKey: string): number {
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`${rowKey}: ${label} must be a number, got "${raw}"`);
  }
  return parseFloat(raw);
}

const MENU_HISTORY_HEADERS = ["Week Start", "Day", "Meal", "Dish Name", "Dish ID"];

interface WeekSection {
  weekStart: string;
  table: ParsedTable;
}

function findWeekSections(markdown: string): WeekSection[] {
  const lines = markdown.split("\n");
  const sections: WeekSection[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const headerMatch = line.match(/^## Week of (\d{4}-\d{2}-\d{2})\s*$/);
    if (!headerMatch) {
      i += 1;
      continue;
    }
    const weekStart = headerMatch[1];
    // Find the next pipe-table block after this heading.
    let j = i + 1;
    while (j < lines.length && !lines[j].trim().startsWith("|")) {
      j += 1;
    }
    if (j + 1 >= lines.length || !isDividerRow(lines[j + 1])) {
      throw new Error(
        `parseMenuHistory: week "${weekStart}" has no pipe table beneath the heading`,
      );
    }
    const headers = splitRow(lines[j]);
    let k = j + 2;
    const rows: string[][] = [];
    while (k < lines.length && lines[k].trim().startsWith("|") && !isDividerRow(lines[k])) {
      rows.push(splitRow(lines[k]));
      k += 1;
    }
    sections.push({ weekStart, table: { headers, rows } });
    i = k;
  }
  return sections;
}

export function parseMenuHistory(markdown: string): MenuHistoryRow[] {
  const sections = findWeekSections(markdown);
  if (sections.length === 0) {
    throw new Error("parseMenuHistory: no '## Week of YYYY-MM-DD' sections found");
  }
  const out: MenuHistoryRow[] = [];
  for (const section of sections) {
    const { weekStart, table } = section;
    if (
      table.headers.length !== MENU_HISTORY_HEADERS.length ||
      !MENU_HISTORY_HEADERS.every((h, i) => h === table.headers[i])
    ) {
      throw new Error(
        `parseMenuHistory: week "${weekStart}" has unexpected headers ${JSON.stringify(table.headers)}`,
      );
    }
    for (const cells of table.rows) {
      if (cells.length !== MENU_HISTORY_HEADERS.length) {
        throw new Error(
          `parseMenuHistory: week "${weekStart}" row has ${cells.length} cells, expected ${MENU_HISTORY_HEADERS.length}: ${JSON.stringify(cells)}`,
        );
      }
      const rowKey = `menu_history row week=${weekStart} day=${cells[1]} meal=${cells[2]} dish_id=${cells[4]}`;
      if (cells[0] !== weekStart) {
        throw new Error(
          `${rowKey}: Week Start cell "${cells[0]}" does not match section heading "${weekStart}"`,
        );
      }
      const dishId = parseIntStrict(cells[4], "Dish ID", rowKey);
      try {
        out.push(
          MenuHistoryRowSchema.parse({
            weekStart: cells[0],
            day: cells[1],
            meal: cells[2],
            dishName: cells[3],
            dishId,
          }),
        );
      } catch (err) {
        if (err instanceof ZodError) {
          throw new Error(
            `${rowKey}: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
          );
        }
        throw err;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-dish file + ingredient catalog parsing (the slice-1.2 data layout).
// ---------------------------------------------------------------------------

const DISH_INGREDIENT_HEADERS = ["Ingredient", "Quantity", "Unit"];

/**
 * Parse one per-dish file (data/dishes/<slug>.md). The `slug` is the filename
 * stem; the parser checks it matches the frontmatter via the validators, not
 * here. Frontmatter is read with the `yaml` library; the ingredient rows come
 * from the single `## Ingredients` pipe table (which may have zero body rows).
 */
export function parseDishFile(slug: string, markdown: string): DishFile {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) {
    throw new Error(`parseDishFile(${slug}): missing YAML frontmatter fenced by '---'`);
  }
  let raw: unknown;
  try {
    raw = parseYaml(fmMatch[1]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`parseDishFile(${slug}): frontmatter YAML error: ${message}`);
  }

  let dish: Dish;
  try {
    dish = DishSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new Error(
        `parseDishFile(${slug}): ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
    }
    throw err;
  }

  const body = markdown.slice(fmMatch[0].length);

  // Body-prose conventions (design-revamp §1.1, slice 2.1):
  //  - the first body paragraph, the prose before `## Ingredients`, is the
  //    one-line `description`;
  //  - a `## Recipe` section after `## Ingredients` holds numbered steps, one
  //    per `recipe` entry.
  // Both optional: a dish file with neither (every current file) yields neither
  // and parses exactly as before. We attach them to the dish object below.
  const description = parseDescription(body);
  const recipe = parseRecipe(body);

  const tables = findTables(body);
  if (tables.length === 0) {
    throw new Error(`parseDishFile(${slug}): no '## Ingredients' pipe table found`);
  }
  const table = tables[0];
  if (
    table.headers.length !== DISH_INGREDIENT_HEADERS.length ||
    !DISH_INGREDIENT_HEADERS.every((h, i) => h === table.headers[i])
  ) {
    throw new Error(
      `parseDishFile(${slug}): unexpected ingredient headers ${JSON.stringify(table.headers)}`,
    );
  }
  const ingredients: DishIngredientRow[] = [];
  for (const cells of table.rows) {
    if (cells.length !== DISH_INGREDIENT_HEADERS.length) {
      throw new Error(
        `parseDishFile(${slug}): ingredient row has ${cells.length} cells, expected ${DISH_INGREDIENT_HEADERS.length}: ${JSON.stringify(cells)}`,
      );
    }
    const rowKey = `dish ${slug} ingredient="${cells[0]}"`;
    const quantity = parseNumberStrict(cells[1], "Quantity", rowKey);
    try {
      ingredients.push(
        IngredientSchema.pick({
          ingredient: true,
          quantity: true,
          unit: true,
        }).parse({ ingredient: cells[0], quantity, unit: cells[2] }),
      );
    } catch (err) {
      if (err instanceof ZodError) {
        throw new Error(
          `${rowKey}: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }
      throw err;
    }
  }

  const enrichedDish: Dish = {
    ...dish,
    ...(description !== undefined ? { description } : {}),
    ...(recipe !== undefined ? { recipe } : {}),
  };

  return { slug, dish: enrichedDish, ingredients };
}

/**
 * The one-line description: the first non-empty body paragraph that appears
 * before the first `## ` section heading. A paragraph is the run of contiguous
 * non-empty lines, joined with a single space (descriptions are one line today,
 * but a wrapped paragraph collapses cleanly). Returns undefined when the body
 * opens directly on a heading (every current dish file).
 */
function parseDescription(body: string): string | undefined {
  const lines = body.split("\n");
  const para: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) break;
    if (trimmed.length === 0) {
      if (para.length > 0) break;
      continue;
    }
    para.push(trimmed);
  }
  if (para.length === 0) return undefined;
  return para.join(" ");
}

/**
 * Numbered recipe steps from a `## Recipe` section. Each step is a line of the
 * form `N. step text`; the leading `N. ` marker is stripped. A wrapped step
 * (continuation lines without a new marker) joins onto the current step with a
 * single space. Returns undefined when no `## Recipe` section is present.
 */
function parseRecipe(body: string): string[] | undefined {
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() !== "## Recipe") i += 1;
  if (i >= lines.length) return undefined;
  i += 1;
  const steps: string[] = [];
  for (; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("## ")) break;
    if (trimmed.length === 0) continue;
    const marker = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (marker) {
      steps.push(marker[2].trim());
    } else if (steps.length > 0) {
      steps[steps.length - 1] = `${steps[steps.length - 1]} ${trimmed}`;
    }
  }
  return steps.length > 0 ? steps : undefined;
}

/**
 * Flatten a set of parsed dish files into the engine's consumed shapes: the
 * `Dish[]` library and the flat `Ingredient[]` rows (each carrying its dish's
 * id + name). Files are taken in the order given; the bake sorts by id so the
 * baked output is deterministic regardless of directory read order.
 */
export function dishFilesToLibrary(files: DishFile[]): {
  dishes: Dish[];
  ingredients: Ingredient[];
} {
  const dishes: Dish[] = [];
  const ingredients: Ingredient[] = [];
  for (const file of files) {
    dishes.push(file.dish);
    for (const row of file.ingredients) {
      ingredients.push({
        dishId: file.dish.id,
        dishName: file.dish.name,
        ingredient: row.ingredient,
        quantity: row.quantity,
        unit: row.unit,
      });
    }
  }
  return { dishes, ingredients };
}

const CATALOG_HEADERS = [
  "Ingredient",
  "Group",
  "Unit",
  "Pack Size",
  "Grams per piece",
  "Protein /100g",
  "Carbs /100g",
];

/**
 * Parse the ingredient catalog (data/ingredients.md). One row per canonical
 * ingredient; a blank Pack Size cell marks an untracked ingredient. The three
 * macro columns (Grams per piece, Protein /100g, Carbs /100g, design-revamp
 * §1.1) are schema-present from slice 2.1; every cell ships blank this slice and
 * a blank cell reads as absent (undefined), which nutrition derivation treats as
 * zero.
 */
export function parseIngredientCatalog(markdown: string): CatalogIngredient[] {
  const tables = findTables(markdown);
  if (tables.length === 0) {
    throw new Error("parseIngredientCatalog: no pipe table found in input");
  }
  const table = tables[0];
  if (
    table.headers.length !== CATALOG_HEADERS.length ||
    !CATALOG_HEADERS.every((h, i) => h === table.headers[i])
  ) {
    throw new Error(`parseIngredientCatalog: unexpected headers ${JSON.stringify(table.headers)}`);
  }
  const out: CatalogIngredient[] = [];
  for (const cells of table.rows) {
    if (cells.length !== CATALOG_HEADERS.length) {
      throw new Error(
        `parseIngredientCatalog: row has ${cells.length} cells, expected ${CATALOG_HEADERS.length}: ${JSON.stringify(cells)}`,
      );
    }
    const rowKey = `catalog row ingredient="${cells[0]}"`;
    const packSize = cells[3].length > 0 ? cells[3] : undefined;
    const gramsPerPiece =
      cells[4].length > 0 ? parseNumberStrict(cells[4], "Grams per piece", rowKey) : undefined;
    const proteinPer100g =
      cells[5].length > 0 ? parseNumberStrict(cells[5], "Protein /100g", rowKey) : undefined;
    const carbsPer100g =
      cells[6].length > 0 ? parseNumberStrict(cells[6], "Carbs /100g", rowKey) : undefined;
    try {
      out.push(
        CatalogIngredientSchema.parse({
          ingredient: cells[0],
          group: cells[1],
          unit: cells[2],
          ...(packSize !== undefined ? { packSize } : {}),
          ...(gramsPerPiece !== undefined ? { gramsPerPiece } : {}),
          ...(proteinPer100g !== undefined ? { proteinPer100g } : {}),
          ...(carbsPer100g !== undefined ? { carbsPer100g } : {}),
        }),
      );
    } catch (err) {
      if (err instanceof ZodError) {
        throw new Error(
          `${rowKey}: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }
      throw err;
    }
  }
  return out;
}

/**
 * Derive the engine's pack-size header shape (PackSizeHeader[]) from the
 * catalog. Only tracked ingredients (those with a Pack Size) are included, in
 * catalog order, matching the legacy header table the §6 consolidation ledger
 * consumes.
 */
export function catalogToPackSizes(catalog: CatalogIngredient[]): PackSizeHeader[] {
  const out: PackSizeHeader[] = [];
  for (const row of catalog) {
    if (row.packSize !== undefined) {
      out.push({ ingredient: row.ingredient, packSize: row.packSize });
    }
  }
  return out;
}
