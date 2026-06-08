import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseDishes, parseIngredients, parseMenuHistory } from "../../src/data/parse.js";
import {
  validateMenuHistoryAgainstLibrary,
  validatePackSizesUsed,
} from "../../src/data/validators.js";
import type {
  Dish,
  Ingredient,
  MenuHistoryRow,
  PackSizeHeader,
} from "../../src/data/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../../../data");

function loadLive() {
  const dishes = parseDishes(readFileSync(resolve(dataDir, "dishes.md"), "utf8"));
  const ingredients = parseIngredients(
    readFileSync(resolve(dataDir, "ingredients.md"), "utf8"),
  );
  const history = parseMenuHistory(
    readFileSync(resolve(dataDir, "menu_history.md"), "utf8"),
  );
  return { dishes, ingredients, history };
}

describe("validateMenuHistoryAgainstLibrary", () => {
  // Live data has one known drift (dish id 7, "Rajma", referenced by the
  // 2026-05-04 week but absent from data/dishes.md). Flagged in the PR body
  // under "EM check needed" for slow-loop reconciliation. The positive test
  // below filters that single row out so the rest of the live data continues
  // to gate against future drift.
  const KNOWN_MISSING_DISH_IDS = new Set<number>([7]);

  it("passes on live data once the known missing dish ids are excluded", () => {
    const { dishes, history } = loadLive();
    const filtered = history.filter((r) => !KNOWN_MISSING_DISH_IDS.has(r.dishId));
    expect(() => validateMenuHistoryAgainstLibrary(filtered, dishes)).not.toThrow();
  });

  it("flags the current known-missing dish id on live data", () => {
    const { dishes, history } = loadLive();
    expect(() => validateMenuHistoryAgainstLibrary(history, dishes)).toThrow(
      /dish id 7/,
    );
  });

  it("throws and names every missing dish id with referencing rows", () => {
    const dishes: Dish[] = [
      {
        id: 1,
        name: "Chicken masala gravy",
        category: "Gravy dish",
        time: "Lunch",
        tags: ["HP"],
        primaryIngredient: "Chicken",
        preferred: "Yes",
        active: "Yes",
        satiety: "High",
        prepMinutes: 30,
        seasons: "All",
      },
    ];
    const history: MenuHistoryRow[] = [
      {
        weekStart: "2026-06-08",
        day: "Monday",
        meal: "Lunch",
        dishName: "Chicken masala gravy",
        dishId: 1,
      },
      {
        weekStart: "2026-06-08",
        day: "Monday",
        meal: "Lunch",
        dishName: "Ghost dish",
        dishId: 999,
      },
      {
        weekStart: "2026-06-08",
        day: "Tuesday",
        meal: "Breakfast",
        dishName: "Other ghost",
        dishId: 777,
      },
    ];
    expect(() => validateMenuHistoryAgainstLibrary(history, dishes)).toThrow(
      /dish id 777.*dish id 999|dish id 999.*dish id 777/s,
    );
  });
});

describe("validatePackSizesUsed", () => {
  it("passes on live data/ingredients.md", () => {
    const { ingredients } = loadLive();
    expect(() =>
      validatePackSizesUsed(ingredients.packSizes, ingredients.rows),
    ).not.toThrow();
  });

  it("throws and names every unused tracked ingredient", () => {
    const packSizes: PackSizeHeader[] = [
      { ingredient: "Paneer", packSize: "200 g" },
      { ingredient: "Unicorn meat", packSize: "500 g" },
      { ingredient: "Phantom spice", packSize: "50 g" },
    ];
    const ingredients: Ingredient[] = [
      {
        dishId: 1,
        dishName: "Palak paneer",
        ingredient: "Paneer",
        quantity: 200,
        unit: "g",
      },
    ];
    expect(() => validatePackSizesUsed(packSizes, ingredients)).toThrow(
      /"Unicorn meat".*"Phantom spice"|"Phantom spice".*"Unicorn meat"/s,
    );
  });
});
