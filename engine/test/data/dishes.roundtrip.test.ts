import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseDishes } from "../../src/data/parse.js";
import { serializeDishes } from "../../src/data/serialize.js";

const here = dirname(fileURLToPath(import.meta.url));
const dishesPath = resolve(here, "../../../data/dishes.md");

describe("dishes round-trip", () => {
  it("parses and serializes data/dishes.md byte-identical", () => {
    const original = readFileSync(dishesPath, "utf8");
    const dishes = parseDishes(original);
    const out = serializeDishes(dishes);
    expect(out).toBe(original);
  });

  it("returns at least one dish with the expected shape", () => {
    const original = readFileSync(dishesPath, "utf8");
    const dishes = parseDishes(original);
    expect(dishes.length).toBeGreaterThan(0);
    const first = dishes[0];
    expect(first.id).toBe(1);
    expect(first.name).toBe("Chicken masala gravy");
    expect(first.category).toBe("Gravy dish");
    expect(first.tags).toEqual(["HP"]);
    expect(first.seasons).toBe("All");
  });

  it("throws a row-named error on malformed input", () => {
    const malformed = [
      "# Dishes",
      "",
      "| ID | Name | Category | Time | Tags | Primary Ingredient | Preferred | Active | Satiety | Prep Min | Seasons |",
      "|----|------|----------|------|------|--------------------|-----------|--------|---------|----------|---------|",
      "| 999 | Bad dish | Not A Category | Lunch |  | Chicken | Yes | Yes | High | 30 | All |",
      "",
    ].join("\n");
    expect(() => parseDishes(malformed)).toThrow(/999.*Bad dish/);
  });
});
