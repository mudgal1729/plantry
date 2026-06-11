// Whitespace rule for round-trip serialization.
//
// The menu-history serializer and the per-dish file + catalog serializers below
// follow a fixed shape: a heading (level-1 file heading or per-dish frontmatter
// + level-2 section), a blank line, optional prose paragraphs, then one or more
// pipe tables, with a single trailing newline at end of file. Non-empty cells
// use a single-space
// pad on each side of the value. Empty cells emit as "| |" (pipe, one space,
// pipe) to match the markdown source. Divider rows use dashes whose count
// equals the header cell width (visible header text plus the two surrounding
// spaces). Body rows do not pad to header width. The prose around the tables
// is fixed text that the serializer emits verbatim, so the parser does not
// need to round-trip it.

import type { CatalogIngredient, DishFile, MenuHistoryRow, SeasonsField } from "./schemas.js";

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

function formatQuantity(q: number): string {
  if (Number.isInteger(q)) return String(q);
  return String(q);
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
      lines.push(bodyLine([r.weekStart, r.day, r.meal, r.dishName, String(r.dishId)]));
    }
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n") + "\n";
}

// Per-dish file format (data/dishes/<slug>.md).
//
// A YAML frontmatter block fenced by "---" lines, a blank line, then a single
// "## Ingredients" section holding a three-column pipe table. Frontmatter keys
// are emitted in a fixed order; list values (tags, seasons) use YAML flow
// sequences ("[HP]", "[Summer, Monsoon]", "[]"). All live scalar values are
// YAML-plain-safe (verified during the slice-1.2 migration); the serializer
// emits them bare and the parser (engine/src/data/parse.ts) reads them back via
// the `yaml` library, so any future value needing quoting fails the round-trip
// validator loudly rather than corrupting silently. Dishes with no ingredient
// rows still emit the header + divider with no body rows. Single trailing
// newline at end of file.

const DISH_INGREDIENT_HEADERS = ["Ingredient", "Quantity", "Unit"];

function flowList(values: string[]): string {
  return "[" + values.join(", ") + "]";
}

function frontmatterSeasons(seasons: SeasonsField): string {
  if (seasons === "All") return "All";
  return flowList(seasons);
}

export function serializeDishFile(file: DishFile): string {
  const { dish, ingredients } = file;
  const fm: string[] = [];
  fm.push("---");
  fm.push(`id: ${dish.id}`);
  fm.push(`name: ${dish.name}`);
  fm.push(`category: ${dish.category}`);
  fm.push(`time: ${dish.time}`);
  fm.push(`tags: ${flowList(dish.tags)}`);
  fm.push(`primaryIngredient: ${dish.primaryIngredient}`);
  fm.push(`preferred: ${dish.preferred}`);
  fm.push(`active: ${dish.active}`);
  fm.push(`satiety: ${dish.satiety}`);
  fm.push(`prepMinutes: ${dish.prepMinutes}`);
  fm.push(`seasons: ${frontmatterSeasons(dish.seasons)}`);
  // Enrichment frontmatter (design-revamp §1.1, slice 2.1). Emitted in a fixed
  // order, each line only when the field is present, so a dish with none of them
  // (every current file) serializes byte-identically to before.
  if (dish.complexity !== undefined) fm.push(`complexity: ${dish.complexity}`);
  if (dish.skill !== undefined) fm.push(`skill: ${dish.skill}`);
  if (dish.equipment !== undefined) fm.push(`equipment: ${dish.equipment}`);
  if (dish.buySpecially !== undefined) fm.push(`buySpecially: ${dish.buySpecially}`);
  if (dish.prePrep !== undefined) fm.push(`prePrep: ${dish.prePrep}`);
  if (dish.photo !== undefined) fm.push(`photo: ${dish.photo}`);
  fm.push("---");

  // Body: an optional description paragraph, the `## Ingredients` table, then an
  // optional `## Recipe` section. description and recipe live in the body prose,
  // not frontmatter (design-revamp §1.1). A dish with neither produces the same
  // bytes as before.
  const body: string[] = [];
  if (dish.description !== undefined) {
    body.push(dish.description);
    body.push("");
  }
  body.push("## Ingredients");
  body.push("");
  body.push(headerLine(DISH_INGREDIENT_HEADERS));
  body.push(dividerLine(DISH_INGREDIENT_HEADERS));
  for (const row of ingredients) {
    body.push(bodyLine([row.ingredient, formatQuantity(row.quantity), row.unit]));
  }
  if (dish.recipe !== undefined) {
    body.push("");
    body.push("## Recipe");
    body.push("");
    dish.recipe.forEach((step, idx) => {
      body.push(`${idx + 1}. ${step}`);
    });
  }

  return fm.join("\n") + "\n\n" + body.join("\n") + "\n";
}

// Ingredient catalog format (data/ingredients.md).
//
// One row per canonical ingredient: `| Ingredient | Group | Unit | Pack Size |`.
// Pack Size present marks a tracked ingredient; blank marks untracked. Rows are
// emitted in the order the catalog array carries (catalog rows are kept
// alphabetical by ingredient name). The judgment-call grouping reasoning is
// preserved as a prose block above the table so the institutional memory that
// formerly lived next to the aggregator survives in the data file itself.

const CATALOG_PREAMBLE = [
  "# Ingredient Catalog",
  "",
  "One row per canonical ingredient. `Group` is the user-facing grocery-list",
  "bucket (fixed order: Proteins and Dairy, Pantry, Vegetables, Aromatics and",
  "Herbs, Other). `Unit` is the canonical measure (g/ml/pcs). `Pack Size`",
  "present marks a tracked ingredient (used by §6 Ingredient Consolidation and",
  "rounded up to whole packs on the buy list); blank marks an untracked staple",
  "bought by weight.",
  "",
  "`Grams per piece` applies only to `pcs`-unit ingredients (an egg is about",
  "50 g) so macro derivation can convert pieces to grams; blank on every other",
  "row. `Protein /100g` and `Carbs /100g` power derived dish macros (engine.md",
  "Nutrition section); a blank cell reads as zero. These three columns are",
  "schema-present from slice 2.1 and populated in slice 2.2; until then every",
  "macro cell is blank, which the coverage report expects.",
  "",
  "Grouping judgment calls (institutional memory; do not silently re-bucket):",
  "",
  "- Onion and Tomato: Aromatics and Herbs. Both are the base of nearly every",
  "  curry; grouping them with herbs matches how the buy list is shopped at the",
  "  aromatics counter.",
  "- Lemon: Aromatics and Herbs. Used as a flavoring agent, never as the body of",
  "  a dish.",
  "- Capsicum: Vegetables, not Aromatics. Bought as a veg by weight; the engine's",
  "  soft-consolidation list (engine/src/consolidation.ts FRESH_PRODUCE_ITEMS) is",
  "  a separate concept and lives in code, not here.",
  "- Cucumber: Vegetables. Eaten as a vegetable in salads.",
  "- Coconut Milk: Pantry. A shelf-stable tin/carton, bought rarely, not dairy.",
  "- Sprout: Pantry. Dry pulse pre-sprouted, slots with the other dry pulses.",
  '- Fruit: Other. A placeholder ingredient name for the "Seasonal fruit" dish',
  "  (id 123); it is not a specific item to put on a buy list, so Other keeps it",
  "  visible without forcing a wrong category.",
  "",
].join("\n");

const CATALOG_HEADERS = [
  "Ingredient",
  "Group",
  "Unit",
  "Pack Size",
  "Grams per piece",
  "Protein /100g",
  "Carbs /100g",
];

/** A macro/grams-per-piece cell: blank when absent, else the bare number. */
function macroCell(value: number | undefined): string {
  if (value === undefined) return "";
  return String(value);
}

export function serializeIngredientCatalog(catalog: CatalogIngredient[]): string {
  const lines: string[] = [];
  lines.push(headerLine(CATALOG_HEADERS));
  lines.push(dividerLine(CATALOG_HEADERS));
  for (const row of catalog) {
    lines.push(
      bodyLine([
        row.ingredient,
        row.group,
        row.unit,
        row.packSize ?? "",
        macroCell(row.gramsPerPiece),
        macroCell(row.proteinPer100g),
        macroCell(row.carbsPer100g),
      ]),
    );
  }
  return CATALOG_PREAMBLE + lines.join("\n") + "\n";
}
