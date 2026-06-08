// Whitespace rule for round-trip serialization.
//
// Both dishes.md and ingredients.md follow a fixed shape: a level-1 heading,
// a blank line, optional prose paragraphs, then one or more pipe tables, with a
// single trailing newline at end of file. Non-empty cells use a single-space
// pad on each side of the value. Empty cells emit as "| |" (pipe, one space,
// pipe) to match the markdown source. Divider rows use dashes whose count
// equals the header cell width (visible header text plus the two surrounding
// spaces). Body rows do not pad to header width. The prose around the tables
// is fixed text that the serializer emits verbatim, so the parser does not
// need to round-trip it.

import type {
  Dish,
  Ingredient,
  MenuHistoryRow,
  PackSizeHeader,
  SeasonsField,
} from "./schemas.js";

function cell(value: string): string {
  if (value.length === 0) return " ";
  return ` ${value} `;
}

function headerLine(headers: string[]): string {
  return "|" + headers.map(cell).join("|") + "|";
}

function dividerLine(headers: string[]): string {
  return "|" + headers.map((h) => "-".repeat(h.length + 2)).join("|") + "|";
}

function bodyLine(cells: string[]): string {
  return "|" + cells.map(cell).join("|") + "|";
}

function seasonsToCell(seasons: SeasonsField): string {
  if (seasons === "All") return "All";
  return seasons.join(", ");
}

function tagsToCell(tags: string[]): string {
  return tags.join(", ");
}

const DISHES_PREAMBLE = "# Dishes\n\n";

const DISH_HEADERS = [
  "ID",
  "Name",
  "Category",
  "Time",
  "Tags",
  "Primary Ingredient",
  "Preferred",
  "Active",
  "Satiety",
  "Prep Min",
  "Seasons",
];

export function serializeDishes(dishes: Dish[]): string {
  const lines: string[] = [];
  lines.push(headerLine(DISH_HEADERS));
  lines.push(dividerLine(DISH_HEADERS));
  for (const d of dishes) {
    lines.push(
      bodyLine([
        String(d.id),
        d.name,
        d.category,
        d.time,
        tagsToCell(d.tags),
        d.primaryIngredient,
        d.preferred,
        d.active,
        d.satiety,
        String(d.prepMinutes),
        seasonsToCell(d.seasons),
      ]),
    );
  }
  return DISHES_PREAMBLE + lines.join("\n") + "\n";
}

const INGREDIENTS_PREAMBLE = "# Dish Ingredients\n\nTracked ingredients (used by §6 Ingredient Consolidation) and their pack sizes:\n\n";

const INGREDIENTS_INTERLUDE = "\n\nAll other ingredients in the table below are untracked: pantry staples (dals, grains, nuts, frozen peas, etc.) or fresh items bought by weight (curry-cut chicken, fresh vegetables, aromatics).\n\n";

const PACK_HEADERS = ["Ingredient", "Pack Size"];
const INGREDIENT_HEADERS = ["Dish ID", "Dish Name", "Ingredient", "Quantity", "Unit"];

function formatQuantity(q: number): string {
  if (Number.isInteger(q)) return String(q);
  return String(q);
}

export function serializeIngredients(
  packSizes: PackSizeHeader[],
  rows: Ingredient[],
): string {
  const packLines: string[] = [];
  packLines.push(headerLine(PACK_HEADERS));
  packLines.push(dividerLine(PACK_HEADERS));
  for (const p of packSizes) {
    packLines.push(bodyLine([p.ingredient, p.packSize]));
  }

  const rowLines: string[] = [];
  rowLines.push(headerLine(INGREDIENT_HEADERS));
  rowLines.push(dividerLine(INGREDIENT_HEADERS));
  for (const r of rows) {
    rowLines.push(
      bodyLine([
        String(r.dishId),
        r.dishName,
        r.ingredient,
        formatQuantity(r.quantity),
        r.unit,
      ]),
    );
  }

  return (
    INGREDIENTS_PREAMBLE +
    packLines.join("\n") +
    INGREDIENTS_INTERLUDE +
    rowLines.join("\n") +
    "\n"
  );
}

// Whitespace rule additions for menu_history.md.
//
// The file is a sequence of week sections. Each section is a level-2 heading
// "## Week of YYYY-MM-DD", one blank line, a five-column pipe table (Week
// Start, Day, Meal, Dish Name, Dish ID), and one blank line as the section
// separator. The file ends after the final section's last data row with a
// single trailing newline (no blank line after it). Rows preserve the order
// they appear in; grouping is by weekStart in first-seen order.

const MENU_HISTORY_HEADERS = ["Week Start", "Day", "Meal", "Dish Name", "Dish ID"];

export function serializeMenuHistory(rows: MenuHistoryRow[]): string {
  const groups: { weekStart: string; rows: MenuHistoryRow[] }[] = [];
  const indexByWeek = new Map<string, number>();
  for (const r of rows) {
    let idx = indexByWeek.get(r.weekStart);
    if (idx === undefined) {
      idx = groups.length;
      indexByWeek.set(r.weekStart, idx);
      groups.push({ weekStart: r.weekStart, rows: [] });
    }
    groups[idx].rows.push(r);
  }

  const parts: string[] = [];
  for (let g = 0; g < groups.length; g += 1) {
    const group = groups[g];
    const lines: string[] = [];
    lines.push(`## Week of ${group.weekStart}`);
    lines.push("");
    lines.push(headerLine(MENU_HISTORY_HEADERS));
    lines.push(dividerLine(MENU_HISTORY_HEADERS));
    for (const r of group.rows) {
      lines.push(
        bodyLine([
          r.weekStart,
          r.day,
          r.meal,
          r.dishName,
          String(r.dishId),
        ]),
      );
    }
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n") + "\n";
}
