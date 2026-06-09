import { describe, it, expect, vi } from "vitest";
import { aggregateGroceryList, GROCERY_GROUPS } from "../src/groceryList.js";
import type { Dish, Ingredient, PackSizeHeader } from "../src/data/schemas.js";

let nextId = 1000;

function makeDish(overrides: Partial<Dish> = {}): Dish {
  const id = nextId++;
  return {
    id,
    name: `Dish ${id}`,
    category: "Gravy dish",
    time: "Lunch",
    tags: [],
    primaryIngredient: "Paneer",
    preferred: "No",
    active: "Yes",
    satiety: "Medium",
    prepMinutes: 30,
    seasons: "All",
    ...overrides,
  };
}

function row(
  dishId: number,
  dishName: string,
  ingredient: string,
  quantity: number,
  unit: "g" | "ml" | "pcs" = "g",
): Ingredient {
  return { dishId, dishName, ingredient, quantity, unit };
}

const PANEER_HEADER: PackSizeHeader = { ingredient: "Paneer", packSize: "200 g" };
const CURD_HEADER: PackSizeHeader = { ingredient: "Curd", packSize: "500 g" };
const MUSHROOM_HEADER: PackSizeHeader = {
  ingredient: "Mushroom",
  packSize: "200 g",
};
const PACK_SIZES_ALL: PackSizeHeader[] = [PANEER_HEADER, CURD_HEADER, MUSHROOM_HEADER];

describe("aggregateGroceryList — docs/product.md §3 item 3", () => {
  it("returns an empty groups array for no picks", () => {
    const result = aggregateGroceryList({
      weekPicks: [],
      ingredients: [],
      packSizes: PACK_SIZES_ALL,
    });
    expect(result.groups).toEqual([]);
  });

  it("rounds two tracked ingredients up to the next pack multiple and categorizes them", () => {
    const dish = makeDish({ name: "Paneer + Curd dish", primaryIngredient: "Paneer" });
    const ingredients: Ingredient[] = [
      row(dish.id, dish.name, "Paneer", 150),
      row(dish.id, dish.name, "Curd", 300),
    ];

    const result = aggregateGroceryList({
      weekPicks: [dish],
      ingredients,
      packSizes: PACK_SIZES_ALL,
    });

    const proteins = result.groups.find((g) => g.group === "Proteins and Dairy");
    expect(proteins).toBeDefined();
    expect(proteins!.items).toHaveLength(2);
    const paneer = proteins!.items.find((i) => i.ingredient === "Paneer");
    const curd = proteins!.items.find((i) => i.ingredient === "Curd");
    expect(paneer).toMatchObject({
      ingredient: "Paneer",
      quantity: 150,
      unit: "g",
      tracked: true,
      packs: 1,
      packTotalGrams: 200,
    });
    expect(curd).toMatchObject({
      ingredient: "Curd",
      quantity: 300,
      unit: "g",
      tracked: true,
      packs: 1,
      packTotalGrams: 500,
    });
  });

  it("aggregates a shared ingredient across dishes and rounds once on the sum", () => {
    const dishA = makeDish({ name: "Palak paneer" });
    const dishB = makeDish({ name: "Paneer bhurji" });
    const ingredients: Ingredient[] = [
      row(dishA.id, dishA.name, "Paneer", 250),
      row(dishB.id, dishB.name, "Paneer", 100),
    ];

    const result = aggregateGroceryList({
      weekPicks: [dishA, dishB],
      ingredients,
      packSizes: PACK_SIZES_ALL,
    });

    const proteins = result.groups.find((g) => g.group === "Proteins and Dairy");
    expect(proteins).toBeDefined();
    const paneer = proteins!.items.find((i) => i.ingredient === "Paneer");
    // 250 + 100 = 350 g; pack size 200 g; next multiple is 2 packs / 400 g.
    expect(paneer).toMatchObject({
      ingredient: "Paneer",
      quantity: 350,
      tracked: true,
      packs: 2,
      packTotalGrams: 400,
    });
  });

  it("aggregates the same dish picked on multiple days as duplicates", () => {
    const roti = makeDish({ name: "Roti" });
    const ingredients: Ingredient[] = [row(roti.id, roti.name, "Paneer", 100)];
    const result = aggregateGroceryList({
      weekPicks: [roti, roti, roti],
      ingredients,
      packSizes: PACK_SIZES_ALL,
    });
    const paneer = result.groups[0]?.items.find((i) => i.ingredient === "Paneer");
    expect(paneer?.quantity).toBe(300);
    // 300 g requires 2 packs of 200 g.
    expect(paneer?.packs).toBe(2);
    expect(paneer?.packTotalGrams).toBe(400);
  });

  it("passes untracked ingredients through unrounded", () => {
    const dish = makeDish({ name: "Onion-heavy", primaryIngredient: "Onion" });
    const ingredients: Ingredient[] = [row(dish.id, dish.name, "Onion", 175)];
    const result = aggregateGroceryList({
      weekPicks: [dish],
      ingredients,
      packSizes: PACK_SIZES_ALL,
    });
    const aromatics = result.groups.find((g) => g.group === "Aromatics and Herbs");
    expect(aromatics).toBeDefined();
    const onion = aromatics!.items.find((i) => i.ingredient === "Onion");
    expect(onion).toMatchObject({
      ingredient: "Onion",
      quantity: 175,
      unit: "g",
      tracked: false,
    });
    expect(onion).not.toHaveProperty("packs");
    expect(onion).not.toHaveProperty("packTotalGrams");
  });

  it("falls back to 'Other' for an ingredient absent from GROCERY_GROUPS", () => {
    const dish = makeDish({ name: "Exotic" });
    const ingredients: Ingredient[] = [row(dish.id, dish.name, "Dragonfruit", 1, "pcs")];
    const result = aggregateGroceryList({
      weekPicks: [dish],
      ingredients,
      packSizes: PACK_SIZES_ALL,
    });
    const other = result.groups.find((g) => g.group === "Other");
    expect(other).toBeDefined();
    expect(other!.items[0]).toMatchObject({
      ingredient: "Dragonfruit",
      quantity: 1,
      unit: "pcs",
      tracked: false,
    });
  });

  it("emits groups in the §3 fixed order, omitting empty ones", () => {
    const proteinDish = makeDish();
    const pantryDish = makeDish();
    const aromaticDish = makeDish();
    const ingredients: Ingredient[] = [
      row(proteinDish.id, proteinDish.name, "Paneer", 100),
      row(pantryDish.id, pantryDish.name, "Chickpea", 150),
      row(aromaticDish.id, aromaticDish.name, "Onion", 80),
    ];
    const result = aggregateGroceryList({
      weekPicks: [proteinDish, pantryDish, aromaticDish],
      ingredients,
      packSizes: PACK_SIZES_ALL,
    });
    expect(result.groups.map((g) => g.group)).toEqual([
      "Proteins and Dairy",
      "Pantry",
      "Aromatics and Herbs",
    ]);
  });

  it("sorts items alphabetically inside each group", () => {
    const dish = makeDish();
    const ingredients: Ingredient[] = [
      row(dish.id, dish.name, "Tomato", 100),
      row(dish.id, dish.name, "Coriander Leaf", 10),
      row(dish.id, dish.name, "Onion", 80),
      row(dish.id, dish.name, "Garlic", 10),
    ];
    const result = aggregateGroceryList({
      weekPicks: [dish],
      ingredients,
      packSizes: PACK_SIZES_ALL,
    });
    const aromatics = result.groups.find((g) => g.group === "Aromatics and Herbs");
    expect(aromatics!.items.map((i) => i.ingredient)).toEqual([
      "Coriander Leaf",
      "Garlic",
      "Onion",
      "Tomato",
    ]);
  });

  it("keeps the same ingredient in different units as separate items", () => {
    // Defensive case; live data does not split a single ingredient across units.
    const dish = makeDish();
    const ingredients: Ingredient[] = [
      row(dish.id, dish.name, "Coconut Milk", 100, "ml"),
      row(dish.id, dish.name, "Coconut Milk", 50, "g"),
    ];
    const result = aggregateGroceryList({
      weekPicks: [dish],
      ingredients,
      packSizes: PACK_SIZES_ALL,
    });
    const pantry = result.groups.find((g) => g.group === "Pantry");
    expect(pantry).toBeDefined();
    const coconutItems = pantry!.items.filter((i) => i.ingredient === "Coconut Milk");
    expect(coconutItems).toHaveLength(2);
    const byUnit = Object.fromEntries(coconutItems.map((i) => [i.unit, i.quantity]));
    expect(byUnit).toEqual({ ml: 100, g: 50 });
  });

  it("falls through to untracked + warn when a tracked header is used in a non-gram unit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const dish = makeDish();
      const ingredients: Ingredient[] = [row(dish.id, dish.name, "Paneer", 4, "pcs")];
      const result = aggregateGroceryList({
        weekPicks: [dish],
        ingredients,
        packSizes: [PANEER_HEADER],
      });
      const proteins = result.groups.find((g) => g.group === "Proteins and Dairy");
      const paneer = proteins!.items.find((i) => i.ingredient === "Paneer");
      expect(paneer).toMatchObject({
        ingredient: "Paneer",
        quantity: 4,
        unit: "pcs",
        tracked: false,
      });
      expect(paneer).not.toHaveProperty("packs");
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("partition property: groups union equals the set of summed (ingredient, unit) pairs", () => {
    const d1 = makeDish();
    const d2 = makeDish();
    const ingredients: Ingredient[] = [
      row(d1.id, d1.name, "Paneer", 150),
      row(d1.id, d1.name, "Onion", 80),
      row(d1.id, d1.name, "Tomato", 100),
      row(d2.id, d2.name, "Paneer", 100), // aggregates with above
      row(d2.id, d2.name, "Chickpea", 150),
      row(d2.id, d2.name, "Lemon", 1, "pcs"),
      row(d2.id, d2.name, "Coconut Milk", 100, "ml"),
      row(d2.id, d2.name, "Dragonfruit", 1, "pcs"), // falls into Other
    ];
    const result = aggregateGroceryList({
      weekPicks: [d1, d2],
      ingredients,
      packSizes: PACK_SIZES_ALL,
    });

    const flat = result.groups.flatMap((g) => g.items.map((i) => `${i.ingredient}|${i.unit}`));

    const expectedKeys = new Set([
      "Paneer|g",
      "Onion|g",
      "Tomato|g",
      "Chickpea|g",
      "Lemon|pcs",
      "Coconut Milk|ml",
      "Dragonfruit|pcs",
    ]);
    expect(new Set(flat)).toEqual(expectedKeys);
    // No duplicates across groups.
    expect(flat).toHaveLength(expectedKeys.size);
  });

  it("ignores picks with a missing/null dish id (defensive)", () => {
    const dish = makeDish();
    const phantom = { ...dish, id: undefined as unknown as number };
    const ingredients: Ingredient[] = [row(dish.id, dish.name, "Paneer", 100)];
    const result = aggregateGroceryList({
      weekPicks: [dish, phantom],
      ingredients,
      packSizes: PACK_SIZES_ALL,
    });
    const paneer = result.groups[0]?.items.find((i) => i.ingredient === "Paneer");
    expect(paneer?.quantity).toBe(100);
  });
});

describe("GROCERY_GROUPS map", () => {
  it("covers every group as a value", () => {
    const groups = new Set(Object.values(GROCERY_GROUPS));
    expect(groups.has("Proteins and Dairy")).toBe(true);
    expect(groups.has("Pantry")).toBe(true);
    expect(groups.has("Vegetables")).toBe(true);
    expect(groups.has("Aromatics and Herbs")).toBe(true);
    expect(groups.has("Other")).toBe(true);
  });

  it("places the headline ingredients per docs/product.md §3", () => {
    expect(GROCERY_GROUPS["Paneer"]).toBe("Proteins and Dairy");
    expect(GROCERY_GROUPS["Chicken"]).toBe("Proteins and Dairy");
    expect(GROCERY_GROUPS["Chickpea"]).toBe("Pantry");
    expect(GROCERY_GROUPS["Potato"]).toBe("Vegetables");
    expect(GROCERY_GROUPS["Onion"]).toBe("Aromatics and Herbs");
    expect(GROCERY_GROUPS["Coriander Leaf"]).toBe("Aromatics and Herbs");
  });
});
