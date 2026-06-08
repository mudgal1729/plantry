import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseIngredients } from "../../src/data/parse.js";
import { serializeIngredients } from "../../src/data/serialize.js";

const here = dirname(fileURLToPath(import.meta.url));
const ingredientsPath = resolve(here, "../../../data/ingredients.md");

describe("ingredients round-trip", () => {
  it("parses and serializes data/ingredients.md byte-identical", () => {
    const original = readFileSync(ingredientsPath, "utf8");
    const { packSizes, rows } = parseIngredients(original);
    const out = serializeIngredients(packSizes, rows);
    expect(out).toBe(original);
  });

  it("returns pack-size header and per-dish rows in the expected shape", () => {
    const original = readFileSync(ingredientsPath, "utf8");
    const { packSizes, rows } = parseIngredients(original);
    expect(packSizes.length).toBeGreaterThan(0);
    expect(packSizes[0]).toEqual({ ingredient: "Paneer", packSize: "200 g" });
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0];
    expect(first.dishId).toBe(1);
    expect(first.dishName).toBe("Chicken masala gravy");
    expect(first.ingredient).toBe("Chicken");
    expect(first.quantity).toBe(300);
    expect(first.unit).toBe("g");
  });

  it("throws a row-named error on malformed input", () => {
    const malformed = [
      "# Dish Ingredients",
      "",
      "Tracked ingredients (used by §6 Ingredient Consolidation) and their pack sizes:",
      "",
      "| Ingredient | Pack Size |",
      "|------------|-----------|",
      "| Paneer | 200 g |",
      "",
      "All other ingredients in the table below are untracked: pantry staples (dals, grains, nuts, frozen peas, etc.) or fresh items bought by weight (curry-cut chicken, fresh vegetables, aromatics).",
      "",
      "| Dish ID | Dish Name | Ingredient | Quantity | Unit |",
      "|---------|-----------|------------|----------|------|",
      "| 1 | Chicken masala gravy | Chicken | 300 | kilograms |",
      "",
    ].join("\n");
    expect(() => parseIngredients(malformed)).toThrow(
      /dish_id=1.*ingredient="Chicken"/,
    );
  });
});
