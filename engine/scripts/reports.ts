import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  catalogToPackSizes,
  dishFilesToLibrary,
  parseIngredientCatalog,
  parseMenuHistory,
} from "../src/data/parse.js";
import {
  coverageReport,
  poolCoverageReport,
  hpProteinConsistencyReport,
  specialSourcingReport,
} from "../src/data/validators.js";
import { loadDishFiles } from "./bake.js";

// Non-blocking reporting driver (design-revamp §1.3, slice 2.1). Mirrors
// bake.ts's load path so the reports read the same live data the engine bakes.
// This script NEVER exits non-zero on a coverage gap or a thin pool: coverage
// and pool health are judgment the slow loop acts on, not a CI gate. It exits
// non-zero only if the data cannot be loaded at all (which the blocking
// validators in `npm run bake` would already have caught).

interface ReportsOptions {
  dataDir: string;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "n/a";
  return `${((numerator / denominator) * 100).toFixed(0)}%`;
}

export function runReports(options: ReportsOptions): string {
  const { dataDir } = options;

  const dishFiles = loadDishFiles(resolve(dataDir, "dishes"));
  const { dishes, ingredients } = dishFilesToLibrary(dishFiles);
  const catalog = parseIngredientCatalog(readFileSync(resolve(dataDir, "ingredients.md"), "utf8"));
  // Loaded for parity with the bake load path; not directly reported on here.
  catalogToPackSizes(catalog);
  parseMenuHistory(readFileSync(resolve(dataDir, "menu_history.md"), "utf8"));

  const lines: string[] = [];

  // --- Coverage report ----------------------------------------------------
  const cov = coverageReport(dishes, catalog);
  lines.push("=== Coverage report (enrichment + macros) ===");
  lines.push(`Active dishes: ${cov.activeDishCount}`);
  lines.push(
    `  description: ${cov.withDescription}/${cov.activeDishCount} (${pct(cov.withDescription, cov.activeDishCount)})`,
  );
  lines.push(
    `  recipe:      ${cov.withRecipe}/${cov.activeDishCount} (${pct(cov.withRecipe, cov.activeDishCount)})`,
  );
  lines.push(
    `  complexity:  ${cov.withComplexity}/${cov.activeDishCount} (${pct(cov.withComplexity, cov.activeDishCount)})`,
  );
  lines.push(
    `  photo:       ${cov.withPhoto}/${cov.activeDishCount} (${pct(cov.withPhoto, cov.activeDishCount)})`,
  );
  lines.push(
    `Macro-relevant catalog rows with macros: ${cov.macroRelevantWithMacros}/${cov.macroRelevantCount} (${pct(cov.macroRelevantWithMacros, cov.macroRelevantCount)})`,
  );
  lines.push(
    "  (Blank macros are expected until slice 2.2; near-zero here is correct, not a failure.)",
  );
  lines.push("");

  // --- Pool-coverage report -----------------------------------------------
  const pools = poolCoverageReport(dishes);
  lines.push("=== Pool-coverage report (eligible candidates per slot, per season) ===");
  const seasons = [...new Set(pools.map((p) => p.season))];
  for (const season of seasons) {
    lines.push(`${season}:`);
    for (const row of pools.filter((p) => p.season === season)) {
      const thin = row.count <= 2 ? "  <- thin" : "";
      lines.push(`  ${row.slot.padEnd(38)} ${String(row.count).padStart(3)}${thin}`);
    }
  }
  lines.push("");

  // --- HP-vs-protein consistency -----------------------------------------
  const drift = hpProteinConsistencyReport(dishes, ingredients, catalog);
  lines.push("=== HP-vs-protein consistency ===");
  if (drift.length === 0) {
    lines.push(
      "No drift. (Empty until macros are populated in slice 2.2; the HP tag stays the rule input.)",
    );
  } else {
    for (const d of drift) {
      const verb = d.hasHpTag ? "tagged HP but below" : "above threshold but not tagged HP";
      lines.push(
        `  dish ${d.dishId} "${d.dishName}": ${verb} (${d.proteinPerPerson.toFixed(1)} g/person vs ${d.threshold} g)`,
      );
    }
  }
  lines.push("");

  // --- Special-sourcing report --------------------------------------------
  const special = specialSourcingReport(dishes, ingredients, catalog);
  lines.push("=== Special-sourcing report (active dishes needing a special trip) ===");
  if (special.length === 0) {
    lines.push("No active dish uses a special-sourcing ingredient.");
  } else {
    for (const s of special) {
      lines.push(`  dish ${s.dishId} "${s.dishName}": ${s.ingredients.join(", ")}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

function defaultOptions(): ReportsOptions {
  const here = dirname(fileURLToPath(import.meta.url));
  // Compiled to engine/dist/scripts/reports.js; the repo root is three up.
  const repoRoot = resolve(here, "../../..");
  return { dataDir: resolve(repoRoot, "data") };
}

function isEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  try {
    process.stdout.write(runReports(defaultOptions()) + "\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`reports failed: ${message}\n`);
    process.exit(1);
  }
}
