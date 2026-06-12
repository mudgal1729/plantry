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

  it("round-trips a fully enriched dish file byte-identical", () => {
    // A synthetic file exercising every enrichment field + body convention:
    // optional frontmatter (complexity/skill/equipment/buySpecially/prePrep/
    // photo), a description paragraph, and a numbered ## Recipe section.
    const original = [
      "---",
      "id: 999",
      "name: Test enriched dish",
      "category: Gravy dish",
      "time: Lunch",
      "tags: [HP]",
      "primaryIngredient: Chicken",
      "preferred: Yes",
      "active: Yes",
      "satiety: High",
      "prepMinutes: 40",
      "seasons: All",
      "complexity: Medium",
      "skill: Comfortable, browning matters",
      "equipment: Heavy kadhai",
      "buySpecially: Curry cut chicken, 600g",
      "prePrep: Marinate chicken overnight",
      "photo: test-enriched-dish.jpg",
      "---",
      "",
      "Everyday curry built on slow browned onions.",
      "",
      "## Ingredients",
      "",
      "| Ingredient | Quantity | Unit |",
      "|------------|----------|------|",
      "| Chicken | 300 | g |",
      "",
      "## Recipe",
      "",
      "1. Brown onions slowly, add ginger garlic paste.",
      "2. Add tomato and spices, cook till oil separates.",
      "3. Add chicken, simmer covered 25 minutes.",
      "",
    ].join("\n");
    const parsed = parseDishFile("test-enriched-dish", original);
    expect(parsed.dish.complexity).toBe("Medium");
    expect(parsed.dish.skill).toBe("Comfortable, browning matters");
    expect(parsed.dish.equipment).toBe("Heavy kadhai");
    expect(parsed.dish.buySpecially).toBe("Curry cut chicken, 600g");
    expect(parsed.dish.prePrep).toBe("Marinate chicken overnight");
    expect(parsed.dish.photo).toBe("test-enriched-dish.jpg");
    expect(parsed.dish.description).toBe("Everyday curry built on slow browned onions.");
    expect(parsed.dish.recipe).toEqual([
      "Brown onions slowly, add ginger garlic paste.",
      "Add tomato and spices, cook till oil separates.",
      "Add chicken, simmer covered 25 minutes.",
    ]);
    expect(serializeDishFile(parsed)).toBe(original);
  });

  it("round-trips a description-only dish (no recipe, no enrichment frontmatter)", () => {
    const original = [
      "---",
      "id: 998",
      "name: Desc only",
      "category: Dry dish",
      "time: Lunch",
      "tags: []",
      "primaryIngredient: Potato",
      "preferred: No",
      "active: Yes",
      "satiety: Low",
      "prepMinutes: 20",
      "seasons: All",
      "---",
      "",
      "A simple everyday dry dish.",
      "",
      "## Ingredients",
      "",
      "| Ingredient | Quantity | Unit |",
      "|------------|----------|------|",
      "| Potato | 150 | g |",
      "",
    ].join("\n");
    const parsed = parseDishFile("desc-only", original);
    expect(parsed.dish.description).toBe("A simple everyday dry dish.");
    expect(parsed.dish.recipe).toBeUndefined();
    expect(parsed.dish.complexity).toBeUndefined();
    expect(serializeDishFile(parsed)).toBe(original);
  });

  it("a bare dish file (no enrichment) parses with all enrichment fields absent", () => {
    // Synthetic in-memory bare dish: valid frontmatter + ## Ingredients table,
    // no description paragraph and no ## Recipe. Once both enrichment batches
    // land, no real dish file is bare, so this case must not depend on one.
    const original = [
      "---",
      "id: 997",
      "name: Bare dish",
      "category: Dry dish",
      "time: Lunch",
      "tags: []",
      "primaryIngredient: Bottle Gourd",
      "preferred: No",
      "active: Yes",
      "satiety: Low",
      "prepMinutes: 20",
      "seasons: [Summer, Monsoon]",
      "---",
      "",
      "## Ingredients",
      "",
      "| Ingredient | Quantity | Unit |",
      "|------------|----------|------|",
      "| Bottle Gourd | 300 | g |",
      "| Onion | 80 | g |",
      "",
    ].join("\n");
    const parsed = parseDishFile("bare-dish", original);
    expect(parsed.dish.description).toBeUndefined();
    expect(parsed.dish.recipe).toBeUndefined();
    expect(parsed.dish.complexity).toBeUndefined();
    expect(parsed.dish.skill).toBeUndefined();
    expect(parsed.dish.photo).toBeUndefined();
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

  it("parses and re-emits populated macro columns (incl. pcs Grams per piece)", () => {
    // Proves the three macro columns parse when non-blank and serialize back to
    // the same cells, including a pcs-unit row with Grams per piece and a
    // fractional macro. (Live data ships all blank until slice 2.2. The
    // serializer always prepends the catalog preamble, so we compare the table
    // rows rather than the whole file here.)
    const input = [
      "# Ingredient Catalog",
      "",
      "| Ingredient | Group | Unit | Pack Size | Grams per piece | Protein /100g | Carbs /100g | Special |",
      "|------------|-------|------|-----------|-----------------|---------------|-------------|---------|",
      "| Egg | Proteins and Dairy | pcs | | 50 | 13 | 1.1 | |",
      "| Paneer | Proteins and Dairy | g | 200 g | | 18 | 4 | |",
      "| Onion | Aromatics and Herbs | g | | | | | |",
      "| Tahini | Pantry | g | | | 17 | 21 | Yes |",
      "",
    ].join("\n");
    const catalog = parseIngredientCatalog(input);
    const egg = catalog.find((c) => c.ingredient === "Egg")!;
    expect(egg.gramsPerPiece).toBe(50);
    expect(egg.proteinPer100g).toBe(13);
    expect(egg.carbsPer100g).toBe(1.1);
    expect(egg.special).toBe(false);
    const onion = catalog.find((c) => c.ingredient === "Onion")!;
    expect(onion.gramsPerPiece).toBeUndefined();
    expect(onion.proteinPer100g).toBeUndefined();
    expect(onion.special).toBe(false);
    const tahini = catalog.find((c) => c.ingredient === "Tahini")!;
    expect(tahini.special).toBe(true);

    const out = serializeIngredientCatalog(catalog);
    expect(out).toContain("| Egg | Proteins and Dairy | pcs | | 50 | 13 | 1.1 | |");
    expect(out).toContain("| Paneer | Proteins and Dairy | g | 200 g | | 18 | 4 | |");
    expect(out).toContain("| Onion | Aromatics and Herbs | g | | | | | |");
    expect(out).toContain("| Tahini | Pantry | g | | | 17 | 21 | Yes |");
    // And a re-parse of the serialized output is stable (idempotent).
    expect(serializeIngredientCatalog(parseIngredientCatalog(out))).toBe(out);
  });

  it("throws a row-named error on an invalid group", () => {
    const malformed = [
      "# Ingredient Catalog",
      "",
      "| Ingredient | Group | Unit | Pack Size | Grams per piece | Protein /100g | Carbs /100g | Special |",
      "|------------|-------|------|-----------|-----------------|---------------|-------------|---------|",
      "| Paneer | Not A Group | g | 200 g | | | | |",
      "",
    ].join("\n");
    expect(() => parseIngredientCatalog(malformed)).toThrow(/Paneer/);
  });
});
