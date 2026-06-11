// Shared test helper: load the live library + history via the per-dish-files +
// ingredient-catalog layout (the slice-1.2 data layout). Mirrors what the bake
// does, so tests exercise the same load path production uses.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  catalogToPackSizes,
  dishFilesToLibrary,
  parseIngredientCatalog,
  parseMenuHistory,
} from "../src/data/parse.js";
import { loadDishFiles } from "../scripts/bake.js";
import type {
  CatalogIngredient,
  Dish,
  DishFile,
  Ingredient,
  MenuHistoryRow,
  PackSizeHeader,
} from "../src/data/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const dataDir = resolve(repoRoot, "data");

export interface LiveData {
  dishFiles: DishFile[];
  library: Dish[];
  ingredients: Ingredient[];
  catalog: CatalogIngredient[];
  packSizes: PackSizeHeader[];
  history: MenuHistoryRow[];
}

export function loadLiveData(): LiveData {
  const dishFiles = loadDishFiles(resolve(dataDir, "dishes"));
  const { dishes, ingredients } = dishFilesToLibrary(dishFiles);
  const catalog = parseIngredientCatalog(readFileSync(resolve(dataDir, "ingredients.md"), "utf8"));
  const packSizes = catalogToPackSizes(catalog);
  const history = parseMenuHistory(readFileSync(resolve(dataDir, "menu_history.md"), "utf8"));
  return { dishFiles, library: dishes, ingredients, catalog, packSizes, history };
}

export { dataDir as liveDataDir };
