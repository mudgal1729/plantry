import { ZodError } from "zod";
import {
  DishSchema,
  IngredientSchema,
  PackSizeHeaderSchema,
  SeasonSchema,
  type Dish,
  type Ingredient,
  type PackSizeHeader,
  type SeasonsField,
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
    if (
      line &&
      line.trim().startsWith("|") &&
      next !== undefined &&
      isDividerRow(next)
    ) {
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith("|") &&
        !isDividerRow(lines[i])
      ) {
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

function parseSeasons(raw: string, dishId: number): SeasonsField {
  if (raw === "All") return "All";
  const tokens = raw.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  const parsed = tokens.map((t) => {
    const r = SeasonSchema.safeParse(t);
    if (!r.success) {
      throw new Error(
        `dish id ${dishId}: invalid Season token "${t}" in "${raw}"`,
      );
    }
    return r.data;
  });
  if (parsed.length === 0) {
    throw new Error(`dish id ${dishId}: Seasons cell is empty`);
  }
  return parsed;
}

function parseTags(raw: string): string[] {
  if (raw.length === 0) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
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

const DISH_HEADERS = [
  "ID",
  "Name",
  "Category",
  "Time",
  "Tags",
  "Primary Ingredient",
  "Preferred",
  "Active",
  "Satiety",
  "Prep Min",
  "Seasons",
];

export function parseDishes(markdown: string): Dish[] {
  const tables = findTables(markdown);
  if (tables.length === 0) {
    throw new Error("parseDishes: no pipe table found in input");
  }
  const table = tables[0];
  if (
    table.headers.length !== DISH_HEADERS.length ||
    !DISH_HEADERS.every((h, i) => h === table.headers[i])
  ) {
    throw new Error(
      `parseDishes: unexpected headers ${JSON.stringify(table.headers)}`,
    );
  }
  const dishes: Dish[] = [];
  for (const cells of table.rows) {
    if (cells.length !== DISH_HEADERS.length) {
      throw new Error(
        `parseDishes: row has ${cells.length} cells, expected ${DISH_HEADERS.length}: ${JSON.stringify(cells)}`,
      );
    }
    const idStr = cells[0];
    const rowKey = `dish row id=${idStr || "?"} name="${cells[1] || ""}"`;
    const id = parseIntStrict(idStr, "ID", rowKey);
    const dish = {
      id,
      name: cells[1],
      category: cells[2],
      time: cells[3],
      tags: parseTags(cells[4]),
      primaryIngredient: cells[5],
      preferred: cells[6],
      active: cells[7],
      satiety: cells[8],
      prepMinutes: parseIntStrict(cells[9], "Prep Min", rowKey),
      seasons: parseSeasons(cells[10], id),
    };
    try {
      dishes.push(DishSchema.parse(dish));
    } catch (err) {
      if (err instanceof ZodError) {
        throw new Error(`${rowKey}: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      }
      throw err;
    }
  }
  return dishes;
}

const PACK_HEADERS = ["Ingredient", "Pack Size"];
const INGREDIENT_HEADERS = ["Dish ID", "Dish Name", "Ingredient", "Quantity", "Unit"];

export function parseIngredients(markdown: string): {
  packSizes: PackSizeHeader[];
  rows: Ingredient[];
} {
  const tables = findTables(markdown);
  if (tables.length < 2) {
    throw new Error(
      `parseIngredients: expected two tables, found ${tables.length}`,
    );
  }
  const packTable = tables[0];
  const ingTable = tables[1];

  if (
    packTable.headers.length !== PACK_HEADERS.length ||
    !PACK_HEADERS.every((h, i) => h === packTable.headers[i])
  ) {
    throw new Error(
      `parseIngredients: unexpected pack-size headers ${JSON.stringify(packTable.headers)}`,
    );
  }
  const packSizes: PackSizeHeader[] = [];
  for (const cells of packTable.rows) {
    if (cells.length !== PACK_HEADERS.length) {
      throw new Error(
        `parseIngredients: pack-size row has ${cells.length} cells, expected ${PACK_HEADERS.length}: ${JSON.stringify(cells)}`,
      );
    }
    const rowKey = `pack-size row ingredient="${cells[0]}"`;
    try {
      packSizes.push(
        PackSizeHeaderSchema.parse({ ingredient: cells[0], packSize: cells[1] }),
      );
    } catch (err) {
      if (err instanceof ZodError) {
        throw new Error(`${rowKey}: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      }
      throw err;
    }
  }

  if (
    ingTable.headers.length !== INGREDIENT_HEADERS.length ||
    !INGREDIENT_HEADERS.every((h, i) => h === ingTable.headers[i])
  ) {
    throw new Error(
      `parseIngredients: unexpected ingredient headers ${JSON.stringify(ingTable.headers)}`,
    );
  }
  const rows: Ingredient[] = [];
  for (const cells of ingTable.rows) {
    if (cells.length !== INGREDIENT_HEADERS.length) {
      throw new Error(
        `parseIngredients: ingredient row has ${cells.length} cells, expected ${INGREDIENT_HEADERS.length}: ${JSON.stringify(cells)}`,
      );
    }
    const rowKey = `ingredient row dish_id=${cells[0]} ingredient="${cells[2]}"`;
    const dishId = parseIntStrict(cells[0], "Dish ID", rowKey);
    const quantity = parseNumberStrict(cells[3], "Quantity", rowKey);
    try {
      rows.push(
        IngredientSchema.parse({
          dishId,
          dishName: cells[1],
          ingredient: cells[2],
          quantity,
          unit: cells[4],
        }),
      );
    } catch (err) {
      if (err instanceof ZodError) {
        throw new Error(`${rowKey}: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      }
      throw err;
    }
  }
  return { packSizes, rows };
}
