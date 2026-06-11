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

  const tables = findTables(markdown.slice(fmMatch[0].length));
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

  return { slug, dish, ingredients };
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

const CATALOG_HEADERS = ["Ingredient", "Group", "Unit", "Pack Size"];

/**
 * Parse the ingredient catalog (data/ingredients.md). One row per canonical
 * ingredient; a blank Pack Size cell marks an untracked ingredient.
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
    try {
      out.push(
        CatalogIngredientSchema.parse({
          ingredient: cells[0],
          group: cells[1],
          unit: cells[2],
          ...(packSize !== undefined ? { packSize } : {}),
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
