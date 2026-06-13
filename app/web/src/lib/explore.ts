// Frontend phrasing for the Explore feed's "why it fits" line. The engine ranks
// each dish and hands back a STRUCTURED affinity key (`shared-ingredient` /
// `protein-match` / `familiar-category`), never UI prose (Principle 7: display
// decoupled from structure). This module is the one place that turns the key
// into a plain, calm sentence; no internal label ("HP", "primaryIngredient",
// the key strings themselves) ever reaches a screen.

import type { ExploreAffinityKey } from "@plantry/engine";

// One plain line per affinity key. Phrased the way the design handoff's
// EXPLORE_WHY lines read: warm, second-person, no jargon, no em dashes.
const AFFINITY_LINES: Record<ExploreAffinityKey, string> = {
  "shared-ingredient": "Made with ingredients you cook often",
  "protein-match": "Fits the protein in your usual meals",
  "familiar-category": "Close to the kind of dishes you usually cook",
};

/** The plain "why it fits" sentence for a dish's dominant affinity key. */
export function affinityLine(key: ExploreAffinityKey): string {
  return AFFINITY_LINES[key];
}
