import type { Dish, Ingredient, MenuHistoryRow, PackSizeHeader } from "./schemas.js";

export function validateMenuHistoryAgainstLibrary(
  history: MenuHistoryRow[],
  dishes: Dish[],
): void {
  const dishIds = new Set(dishes.map((d) => d.id));
  const missing = new Map<number, MenuHistoryRow[]>();
  for (const row of history) {
    if (!dishIds.has(row.dishId)) {
      const list = missing.get(row.dishId) ?? [];
      list.push(row);
      missing.set(row.dishId, list);
    }
  }
  if (missing.size === 0) return;
  const sortedIds = Array.from(missing.keys()).sort((a, b) => a - b);
  const parts = sortedIds.map((id) => {
    const rows = missing.get(id)!;
    const refs = rows
      .map((r) => `week=${r.weekStart} day=${r.day} meal=${r.meal} name="${r.dishName}"`)
      .join("; ");
    return `dish id ${id} (referenced by: ${refs})`;
  });
  throw new Error(
    `validateMenuHistoryAgainstLibrary: ${missing.size} dish id(s) in history not present in dish library: ${parts.join(" | ")}`,
  );
}

export function validatePackSizesUsed(
  packSizes: PackSizeHeader[],
  ingredients: Ingredient[],
): void {
  const usedNames = new Set(ingredients.map((i) => i.ingredient));
  const unused: string[] = [];
  for (const p of packSizes) {
    if (!usedNames.has(p.ingredient)) {
      unused.push(p.ingredient);
    }
  }
  if (unused.length === 0) return;
  throw new Error(
    `validatePackSizesUsed: ${unused.length} tracked ingredient(s) in pack-size header not referenced by any ingredient row: ${unused.map((n) => `"${n}"`).join(", ")}`,
  );
}
