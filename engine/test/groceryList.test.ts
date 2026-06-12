import { describe, it, expect, vi } from "vitest";
import { aggregateGroceryList } from "../src/groceryList.js";
import type { CatalogIngredient, Dish, Ingredient, PackSizeHeader } from "../src/data/schemas.js";

// Test catalog: the grocery group + unit for every ingredient these tests use.
// Mirrors the live ingredient catalog (data/ingredients.md Group column). An
// ingredient deliberately absent here ("Dragonfruit") exercises the "Other"
// fallback, which the live name-resolution validator makes unreachable for
// real dishes but the aggregator still guards.
const CATALOG: CatalogIngredient[] = [
  { ingredient: "Paneer", group: "Proteins and Dairy", unit: "g", packSize: "200 g" },
  { ingredient: "Curd", group: "Proteins and Dairy", unit: "g", packSize: "500 g" },
  { ingredient: "Mushroom", group: "Vegetables", unit: "g", packSize: "200 g" },
  { ingredient: "Chickpea", group: "Pantry", unit: "g" },
  { ingredient: "Coconut Milk", group: "Pantry", unit: "ml" },
  { ingredient: "Onion", group: "Aromatics and Herbs", unit: "g" },
  { ingredient: "Tomato", group: "Aromatics and Herbs", unit: "g" },
  { ingredient: "Garlic", group: "Aromatics and Herbs", unit: "g" },
  { ingredient: "Coriander Leaf", group: "Aromatics and Herbs", unit: "g" },
  { ingredient: "Lemon", group: "Aromatics and Herbs", unit: "pcs" },
];

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
      catalog: CATALOG,
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
      catalog: CATALOG,
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
      catalog: CATALOG,
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
      catalog: CATALOG,
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
      catalog: CATALOG,
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
      catalog: CATALOG,
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
      catalog: CATALOG,
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
      catalog: CATALOG,
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
      catalog: CATALOG,
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
        catalog: CATALOG,
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
      catalog: CATALOG,
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
      catalog: CATALOG,
    });
    const paneer = result.groups[0]?.items.find((i) => i.ingredient === "Paneer");
    expect(paneer?.quantity).toBe(100);
  });
});

describe("catalog-driven grouping (single-homed in data/ingredients.md)", () => {
  it("places each ingredient in its catalog Group", () => {
    const byName = new Map(CATALOG.map((c) => [c.ingredient, c.group]));
    expect(byName.get("Paneer")).toBe("Proteins and Dairy");
    expect(byName.get("Curd")).toBe("Proteins and Dairy");
    expect(byName.get("Chickpea")).toBe("Pantry");
    expect(byName.get("Mushroom")).toBe("Vegetables");
    expect(byName.get("Onion")).toBe("Aromatics and Herbs");
    expect(byName.get("Coriander Leaf")).toBe("Aromatics and Herbs");
  });

  it("groups picks by the catalog Group, honoring the judgment calls", () => {
    // Onion/Tomato/Lemon -> Aromatics; Mushroom -> Vegetables; Coconut Milk ->
    // Pantry. These are the institutional-memory groupings now living in the
    // catalog rather than a code map.
    const dish = makeDish();
    const ingredients: Ingredient[] = [
      row(dish.id, dish.name, "Mushroom", 200),
      row(dish.id, dish.name, "Onion", 80),
      row(dish.id, dish.name, "Coconut Milk", 100, "ml"),
    ];
    const result = aggregateGroceryList({
      weekPicks: [dish],
      ingredients,
      packSizes: PACK_SIZES_ALL,
      catalog: CATALOG,
    });
    const groupOf = (name: string) =>
      result.groups.find((g) => g.items.some((i) => i.ingredient === name))?.group;
    expect(groupOf("Mushroom")).toBe("Vegetables");
    expect(groupOf("Onion")).toBe("Aromatics and Herbs");
    expect(groupOf("Coconut Milk")).toBe("Pantry");
  });
});

describe("skip-aware day input (docs/engine.md §6 Skipped days)", () => {
  it("day-tagged input with no skipped days equals the flattened weekPicks", () => {
    const monDish = makeDish();
    const friDish = makeDish();
    const ingredients: Ingredient[] = [
      row(monDish.id, monDish.name, "Paneer", 150),
      row(friDish.id, friDish.name, "Chickpea", 100),
    ];
    const viaDays = aggregateGroceryList({
      days: [
        { day: "Mon", dishes: [monDish] },
        { day: "Fri", dishes: [friDish] },
      ],
      ingredients,
      packSizes: PACK_SIZES_ALL,
      catalog: CATALOG,
    });
    const viaFlat = aggregateGroceryList({
      weekPicks: [monDish, friDish],
      ingredients,
      packSizes: PACK_SIZES_ALL,
      catalog: CATALOG,
    });
    expect(viaDays).toEqual(viaFlat);
  });

  it("excludes a skipped day's dishes from the grocery list", () => {
    const monDish = makeDish();
    const friDish = makeDish();
    const ingredients: Ingredient[] = [
      row(monDish.id, monDish.name, "Paneer", 150),
      row(friDish.id, friDish.name, "Chickpea", 100),
    ];
    const result = aggregateGroceryList({
      days: [
        { day: "Mon", dishes: [monDish] },
        { day: "Fri", dishes: [friDish] },
      ],
      skippedDays: ["Fri"],
      ingredients,
      packSizes: PACK_SIZES_ALL,
      catalog: CATALOG,
    });
    // Fri's Chickpea is gone; only Mon's Paneer survives.
    const allItems = result.groups.flatMap((g) => g.items.map((i) => i.ingredient));
    expect(allItems).toContain("Paneer");
    expect(allItems).not.toContain("Chickpea");
  });

  it("a fully skipped week yields an empty grocery list", () => {
    const monDish = makeDish();
    const ingredients: Ingredient[] = [row(monDish.id, monDish.name, "Paneer", 150)];
    const result = aggregateGroceryList({
      days: [{ day: "Mon", dishes: [monDish] }],
      skippedDays: ["Mon"],
      ingredients,
      packSizes: PACK_SIZES_ALL,
      catalog: CATALOG,
    });
    expect(result.groups).toEqual([]);
  });
});
