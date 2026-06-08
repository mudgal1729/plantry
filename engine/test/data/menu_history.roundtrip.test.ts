import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseMenuHistory } from "../../src/data/parse.js";
import { serializeMenuHistory } from "../../src/data/serialize.js";

const here = dirname(fileURLToPath(import.meta.url));
const historyPath = resolve(here, "../../../data/menu_history.md");

describe("menu_history round-trip", () => {
  it("parses and serializes data/menu_history.md byte-identical", () => {
    const original = readFileSync(historyPath, "utf8");
    const rows = parseMenuHistory(original);
    const out = serializeMenuHistory(rows);
    expect(out).toBe(original);
  });

  it("returns rows in file order with the expected first-row shape", () => {
    const original = readFileSync(historyPath, "utf8");
    const rows = parseMenuHistory(original);
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0];
    expect(first.weekStart).toBe("2026-06-08");
    expect(first.day).toBe("Monday");
    expect(first.meal).toBe("Breakfast");
    expect(first.dishName).toBe("Paneer bhurji");
    expect(first.dishId).toBe(106);
  });

  it("throws a row-named error on malformed input", () => {
    const malformed = [
      "## Week of 2026-06-08",
      "",
      "| Week Start | Day | Meal | Dish Name | Dish ID |",
      "|------------|-----|------|-----------|---------|",
      "| 2026-06-08 | Funday | Lunch | Mystery dish | 999 |",
      "",
    ].join("\n");
    expect(() => parseMenuHistory(malformed)).toThrow(
      /week=2026-06-08.*day=Funday/,
    );
  });
});
