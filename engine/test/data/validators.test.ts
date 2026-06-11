import { describe, it, expect } from "vitest";
import {
  validateCatalogGroups,
  validateDishFiles,
  validateIngredientNamesResolve,
  validateMenuHistoryAgainstLibrary,
  validatePackSizesUsed,
} from "../../src/data/validators.js";
import { loadLiveData } from "../loadLive.js";
import type {
  CatalogIngredient,
  Dish,
  DishFile,
  Ingredient,
  MenuHistoryRow,
  PackSizeHeader,
} from "../../src/data/schemas.js";

describe("validateMenuHistoryAgainstLibrary", () => {
  it("passes on live data with no drift between menu_history and dishes", () => {
    const { library, history } = loadLiveData();
    expect(() => validateMenuHistoryAgainstLibrary(history, library)).not.toThrow();
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
  it("passes on live catalog-derived pack sizes", () => {
    const { packSizes, ingredients } = loadLiveData();
    expect(() => validatePackSizesUsed(packSizes, ingredients)).not.toThrow();
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

describe("validateDishFiles", () => {
  it("passes on the live per-dish files", () => {
    const { dishFiles } = loadLiveData();
    expect(() => validateDishFiles(dishFiles)).not.toThrow();
  });

  it("the two Paneer bhurji dishes get distinct, canonical slugs", () => {
    const { dishFiles } = loadLiveData();
    const byId = new Map(dishFiles.map((f) => [f.dish.id, f.slug]));
    expect(byId.get(13)).toBe("paneer-bhurji");
    expect(byId.get(106)).toBe("paneer-bhurji-106");
  });

  it("throws when a slug does not match its name", () => {
    const file: DishFile = {
      slug: "wrong-slug",
      dish: {
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
      ingredients: [],
    };
    expect(() => validateDishFiles([file])).toThrow(/canonical slug is "chicken-masala-gravy"/);
  });

  it("throws on a duplicate dish id", () => {
    const base = {
      category: "Gravy dish" as const,
      time: "Lunch" as const,
      tags: [],
      primaryIngredient: "Chicken",
      preferred: "Yes" as const,
      active: "Yes" as const,
      satiety: "High" as const,
      prepMinutes: 30,
      seasons: "All" as const,
    };
    const files: DishFile[] = [
      { slug: "a", dish: { id: 5, name: "A", ...base }, ingredients: [] },
      { slug: "b", dish: { id: 5, name: "B", ...base }, ingredients: [] },
    ];
    expect(() => validateDishFiles(files)).toThrow(/dish id 5 used by 2 files/);
  });
});

describe("validateCatalogGroups", () => {
  it("passes on the live catalog (every row has a valid group)", () => {
    const { catalog } = loadLiveData();
    expect(() => validateCatalogGroups(catalog)).not.toThrow();
  });

  it("throws on a duplicated catalog ingredient", () => {
    const catalog: CatalogIngredient[] = [
      { ingredient: "Paneer", group: "Proteins and Dairy", unit: "g", packSize: "200 g" },
      { ingredient: "Paneer", group: "Proteins and Dairy", unit: "g" },
    ];
    expect(() => validateCatalogGroups(catalog)).toThrow(/Paneer.*appears 2 times/);
  });
});

describe("validateIngredientNamesResolve", () => {
  it("passes on live data: every dish ingredient resolves to a catalog row", () => {
    const { dishFiles, catalog } = loadLiveData();
    expect(() => validateIngredientNamesResolve(dishFiles, catalog)).not.toThrow();
  });

  it("throws and names an ingredient row absent from the catalog", () => {
    const dishFiles: DishFile[] = [
      {
        slug: "ghost-dish",
        dish: {
          id: 1,
          name: "Ghost dish",
          category: "Gravy dish",
          time: "Lunch",
          tags: [],
          primaryIngredient: "Chicken",
          preferred: "Yes",
          active: "Yes",
          satiety: "High",
          prepMinutes: 30,
          seasons: "All",
        },
        ingredients: [{ ingredient: "Phantom Spice", quantity: 5, unit: "g" }],
      },
    ];
    const catalog: CatalogIngredient[] = [
      { ingredient: "Chicken", group: "Proteins and Dairy", unit: "g" },
    ];
    expect(() => validateIngredientNamesResolve(dishFiles, catalog)).toThrow(
      /"Phantom Spice".*ghost-dish/,
    );
  });
});
