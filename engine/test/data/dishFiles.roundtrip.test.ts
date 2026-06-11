import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import { parseDishFile, parseIngredientCatalog } from "../../src/data/parse.js";
import { serializeDishFile, serializeIngredientCatalog } from "../../src/data/serialize.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../../../data");
const dishesDir = resolve(dataDir, "dishes");
const catalogPath = resolve(dataDir, "ingredients.md");

describe("per-dish file round-trip", () => {
  const files = readdirSync(dishesDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  it("finds the live per-dish files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`parses and serializes data/dishes/${file} byte-identical`, () => {
      const slug = basename(file, ".md");
      const original = readFileSync(resolve(dishesDir, file), "utf8");
      const parsed = parseDishFile(slug, original);
      expect(serializeDishFile(parsed)).toBe(original);
    });
  }

  it("parses a known dish with its ingredient rows", () => {
    const original = readFileSync(resolve(dishesDir, "chicken-masala-gravy.md"), "utf8");
    const parsed = parseDishFile("chicken-masala-gravy", original);
    expect(parsed.dish.id).toBe(1);
    expect(parsed.dish.name).toBe("Chicken masala gravy");
    expect(parsed.dish.category).toBe("Gravy dish");
    expect(parsed.dish.tags).toEqual(["HP"]);
    expect(parsed.dish.seasons).toBe("All");
    expect(parsed.ingredients[0]).toEqual({
      ingredient: "Chicken",
      quantity: 300,
      unit: "g",
    });
  });

  it("parses a dish with zero ingredient rows", () => {
    const original = readFileSync(resolve(dishesDir, "toast.md"), "utf8");
    const parsed = parseDishFile("toast", original);
    expect(parsed.dish.id).toBe(109);
    expect(parsed.ingredients).toEqual([]);
    expect(serializeDishFile(parsed)).toBe(original);
  });

  it("throws a slug-named error on invalid frontmatter", () => {
    const malformed = [
      "---",
      "id: 999",
      "name: Bad dish",
      "category: Not A Category",
      "time: Lunch",
      "tags: []",
      "primaryIngredient: Chicken",
      "preferred: Yes",
      "active: Yes",
      "satiety: High",
      "prepMinutes: 30",
      "seasons: All",
      "---",
      "",
      "## Ingredients",
      "",
      "| Ingredient | Quantity | Unit |",
      "|------------|----------|------|",
      "",
    ].join("\n");
    expect(() => parseDishFile("bad-dish", malformed)).toThrow(/bad-dish/);
  });
});

describe("ingredient catalog round-trip", () => {
  it("parses and serializes data/ingredients.md byte-identical", () => {
    const original = readFileSync(catalogPath, "utf8");
    const catalog = parseIngredientCatalog(original);
    expect(serializeIngredientCatalog(catalog)).toBe(original);
  });

  it("returns one row per ingredient with tracked/untracked semantics", () => {
    const original = readFileSync(catalogPath, "utf8");
    const catalog = parseIngredientCatalog(original);
    expect(catalog.length).toBeGreaterThan(0);
    const paneer = catalog.find((c) => c.ingredient === "Paneer");
    expect(paneer).toBeDefined();
    expect(paneer!.group).toBe("Proteins and Dairy");
    expect(paneer!.unit).toBe("g");
    expect(paneer!.packSize).toBe("200 g");
    const onion = catalog.find((c) => c.ingredient === "Onion");
    expect(onion!.group).toBe("Aromatics and Herbs");
    expect(onion!.packSize).toBeUndefined();
  });

  it("throws a row-named error on an invalid group", () => {
    const malformed = [
      "# Ingredient Catalog",
      "",
      "| Ingredient | Group | Unit | Pack Size |",
      "|------------|-------|------|-----------|",
      "| Paneer | Not A Group | g | 200 g |",
      "",
    ].join("\n");
    expect(() => parseIngredientCatalog(malformed)).toThrow(/Paneer/);
  });
});
