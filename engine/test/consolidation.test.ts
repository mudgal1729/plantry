import { describe, it, expect } from "vitest";
import {
  emptyLedger,
  applyPick,
  scoreCandidates,
  scoreSoftConsolidation,
  rankByConsolidation,
  DEFAULT_LEFTOVER_THRESHOLD_GRAMS,
  FRESH_PRODUCE_ITEMS,
} from "../src/consolidation.js";
import type {
  Dish,
  Ingredient,
  PackSizeHeader,
} from "../src/data/schemas.js";

let nextId = 1;

function makeDish(overrides: Partial<Dish> = {}): Dish {
  const id = nextId++;
  return {
    id,
    name: `Dish ${id}`,
    category: "Gravy dish",
    time: "Lunch",
    tags: [],
    primaryIngredient: "Paneer",
    preferred: "No",
    active: "Yes",
    satiety: "Medium",
    prepMinutes: 30,
    seasons: "All",
    ...overrides,
  };
}

function row(
  dishId: number,
  dishName: string,
  ingredient: string,
  quantity: number,
  unit: "g" | "ml" | "pcs" = "g",
): Ingredient {
  return { dishId, dishName, ingredient, quantity, unit };
}

const PANEER_HEADER: PackSizeHeader = { ingredient: "Paneer", packSize: "200 g" };
const CURD_HEADER: PackSizeHeader = { ingredient: "Curd", packSize: "500 g" };
const FISH_HEADER: PackSizeHeader = { ingredient: "Fish", packSize: "500 g" };

describe("consolidation — docs/engine.md §6", () => {
  describe("emptyLedger", () => {
    it("includes one entry per tracked ingredient and zero usage", () => {
      const ledger = emptyLedger([PANEER_HEADER, CURD_HEADER]);
      expect(ledger.size).toBe(2);
      const paneer = ledger.get("Paneer");
      expect(paneer).toBeDefined();
      expect(paneer?.packSizeGrams).toBe(200);
      expect(paneer?.packsOnBuyList).toBe(0);
      expect(paneer?.usedGrams).toBe(0);
      expect(paneer?.leftoverGrams).toBe(0);
      const curd = ledger.get("Curd");
      expect(curd?.packSizeGrams).toBe(500);
    });

    it("never includes untracked ingredients", () => {
      const ledger = emptyLedger([PANEER_HEADER]);
      expect(ledger.has("Onion")).toBe(false);
      expect(ledger.has("Tomato")).toBe(false);
      expect(ledger.has("Coriander Leaf")).toBe(false);
    });

    it("returns an empty map when no tracked ingredients are declared", () => {
      const ledger = emptyLedger([]);
      expect(ledger.size).toBe(0);
    });
  });

  describe("applyPick", () => {
    it("commits one pack when dish usage fits inside a single pack", () => {
      const dish = makeDish({ name: "Palak paneer" });
      const ingredients = [
        row(dish.id, dish.name, "Paneer", 150),
        row(dish.id, dish.name, "Onion", 80), // untracked
      ];
      const ledger = applyPick(emptyLedger([PANEER_HEADER]), dish, ingredients);
      const paneer = ledger.get("Paneer");
      expect(paneer?.packsOnBuyList).toBe(1);
      expect(paneer?.usedGrams).toBe(150);
      expect(paneer?.leftoverGrams).toBe(50);
    });

    it("rounds up to the next pack multiple when one pack falls short", () => {
      const dish = makeDish({ name: "Chilli paneer dry" });
      const ingredients = [row(dish.id, dish.name, "Paneer", 250)];
      // 250 g requested, 200 g pack: need 2 packs → 400 g committed, 150 g leftover.
      const ledger = applyPick(emptyLedger([PANEER_HEADER]), dish, ingredients);
      const paneer = ledger.get("Paneer");
      expect(paneer?.packsOnBuyList).toBe(2);
      expect(paneer?.usedGrams).toBe(250);
      expect(paneer?.leftoverGrams).toBe(150);
    });

    it("accumulates across successive picks of the same ingredient", () => {
      const a = makeDish({ name: "Palak paneer" });
      const b = makeDish({ name: "Paneer bhurji" });
      const ingredients = [
        row(a.id, a.name, "Paneer", 150),
        row(b.id, b.name, "Paneer", 100),
      ];
      // After A: 1 pack, 150 g used, 50 g leftover.
      // After B: 250 g used > 200 g committed → bump to 2 packs (400 g),
      // leftover = 400 - 250 = 150 g.
      let ledger = emptyLedger([PANEER_HEADER]);
      ledger = applyPick(ledger, a, ingredients);
      ledger = applyPick(ledger, b, ingredients);
      const paneer = ledger.get("Paneer");
      expect(paneer?.packsOnBuyList).toBe(2);
      expect(paneer?.usedGrams).toBe(250);
      expect(paneer?.leftoverGrams).toBe(150);
    });

    it("does not mutate the input ledger", () => {
      const dish = makeDish();
      const ingredients = [row(dish.id, dish.name, "Paneer", 150)];
      const before = emptyLedger([PANEER_HEADER]);
      const after = applyPick(before, dish, ingredients);
      expect(before).not.toBe(after);
      expect(before.get("Paneer")?.usedGrams).toBe(0);
      expect(after.get("Paneer")?.usedGrams).toBe(150);
    });

    it("ignores ingredients not in the ledger and ml/pcs units (no g fallback)", () => {
      const dish = makeDish({ name: "Egg curry" });
      // Egg is pcs, not in the tracked header at all → still ignored.
      // Coconut Milk would be ml; we add a synthetic ml row for a tracked
      // name to prove the unit guard kicks in (no g committed).
      const ingredients = [
        row(dish.id, dish.name, "Egg", 4, "pcs"),
        row(dish.id, dish.name, "Onion", 100, "g"),
        row(dish.id, dish.name, "Paneer", 100, "ml"),
      ];
      const ledger = applyPick(emptyLedger([PANEER_HEADER]), dish, ingredients);
      const paneer = ledger.get("Paneer");
      expect(paneer?.usedGrams).toBe(0);
      expect(paneer?.packsOnBuyList).toBe(0);
      expect(paneer?.leftoverGrams).toBe(0);
    });

    it("recomputes leftover to zero when usage exactly fills the packs", () => {
      const dish = makeDish({ name: "Paneer do pyaza" });
      const ingredients = [row(dish.id, dish.name, "Paneer", 200)];
      const ledger = applyPick(emptyLedger([PANEER_HEADER]), dish, ingredients);
      expect(ledger.get("Paneer")?.leftoverGrams).toBe(0);
      expect(ledger.get("Paneer")?.packsOnBuyList).toBe(1);
    });
  });

  describe("scoreCandidates", () => {
    function ledgerWithLeftover(leftover: number) {
      const ledger = emptyLedger([PANEER_HEADER]);
      const paneer = ledger.get("Paneer")!;
      paneer.packsOnBuyList = 1;
      paneer.usedGrams = 200 - leftover;
      paneer.leftoverGrams = leftover;
      return ledger;
    }

    it("ranks candidates that consume above-threshold leftover above those that don't", () => {
      const usesPaneer = makeDish({ name: "UsesPaneer" });
      const noPaneer = makeDish({ name: "NoPaneer" });
      const ingredients = [
        row(usesPaneer.id, usesPaneer.name, "Paneer", 100),
        row(noPaneer.id, noPaneer.name, "Onion", 100),
      ];
      const out = scoreCandidates(
        [noPaneer, usesPaneer],
        ledgerWithLeftover(150),
        ingredients,
      );
      expect(out.map((d) => d.name)).toEqual(["UsesPaneer", "NoPaneer"]);
    });

    it("treats a leftover at exactly the threshold as in-bounds (>= 50 g)", () => {
      const usesPaneer = makeDish({ name: "UsesPaneer" });
      const noPaneer = makeDish({ name: "NoPaneer" });
      const ingredients = [row(usesPaneer.id, usesPaneer.name, "Paneer", 50)];
      const out = scoreCandidates(
        [noPaneer, usesPaneer],
        ledgerWithLeftover(DEFAULT_LEFTOVER_THRESHOLD_GRAMS),
        ingredients,
      );
      expect(out.map((d) => d.name)).toEqual(["UsesPaneer", "NoPaneer"]);
    });

    it("treats a leftover just below the threshold as below the threshold (49 g)", () => {
      const usesPaneer = makeDish({ name: "UsesPaneer" });
      const noPaneer = makeDish({ name: "NoPaneer" });
      const ingredients = [row(usesPaneer.id, usesPaneer.name, "Paneer", 50)];
      const out = scoreCandidates(
        [noPaneer, usesPaneer],
        ledgerWithLeftover(DEFAULT_LEFTOVER_THRESHOLD_GRAMS - 1),
        ingredients,
      );
      // No leftover to consume → input order preserved.
      expect(out.map((d) => d.name)).toEqual(["NoPaneer", "UsesPaneer"]);
    });

    it("preserves input order when scores tie", () => {
      const a = makeDish({ name: "A" });
      const b = makeDish({ name: "B" });
      const c = makeDish({ name: "C" });
      const ingredients = [row(a.id, a.name, "Onion", 100)];
      const ledger = ledgerWithLeftover(150);
      const out = scoreCandidates([a, b, c], ledger, ingredients);
      expect(out.map((d) => d.name)).toEqual(["A", "B", "C"]);
    });

    it("sums multiple tracked-ingredient matches into one score", () => {
      const usesBoth = makeDish({ name: "UsesBoth" });
      const usesOne = makeDish({ name: "UsesOne" });
      const ingredients = [
        row(usesBoth.id, usesBoth.name, "Paneer", 50),
        row(usesBoth.id, usesBoth.name, "Curd", 50),
        row(usesOne.id, usesOne.name, "Paneer", 50),
      ];
      // Both Paneer and Curd have 150 g leftover.
      const ledger = emptyLedger([PANEER_HEADER, CURD_HEADER]);
      const paneer = ledger.get("Paneer")!;
      paneer.packsOnBuyList = 1;
      paneer.usedGrams = 50;
      paneer.leftoverGrams = 150;
      const curd = ledger.get("Curd")!;
      curd.packsOnBuyList = 1;
      curd.usedGrams = 350;
      curd.leftoverGrams = 150;

      const out = scoreCandidates([usesOne, usesBoth], ledger, ingredients);
      expect(out.map((d) => d.name)).toEqual(["UsesBoth", "UsesOne"]);
    });
  });

  describe("scoreSoftConsolidation", () => {
    it("ranks dishes that share a named fresh-produce item above those that don't", () => {
      const usesCapsicum = makeDish({
        name: "PaneerCapsicum",
        primaryIngredient: "Paneer",
      });
      const noFresh = makeDish({ name: "PlainDal", primaryIngredient: "Toor Dal" });
      const ingredients = [
        row(usesCapsicum.id, usesCapsicum.name, "Capsicum", 100),
        row(noFresh.id, noFresh.name, "Toor Dal", 100),
      ];
      const out = scoreSoftConsolidation(
        [noFresh, usesCapsicum],
        new Set(["Capsicum"]),
        ingredients,
      );
      expect(out.map((d) => d.name)).toEqual(["PaneerCapsicum", "PlainDal"]);
    });

    it("counts overlap by named fresh items only (capsicum, tomato, cucumber, onion, mint, coriander)", () => {
      // FRESH_PRODUCE_ITEMS is the authoritative list straight from §6.
      expect(FRESH_PRODUCE_ITEMS.has("Capsicum")).toBe(true);
      expect(FRESH_PRODUCE_ITEMS.has("Tomato")).toBe(true);
      expect(FRESH_PRODUCE_ITEMS.has("Cucumber")).toBe(true);
      expect(FRESH_PRODUCE_ITEMS.has("Onion")).toBe(true);
      expect(FRESH_PRODUCE_ITEMS.has("Mint Leaf")).toBe(true);
      expect(FRESH_PRODUCE_ITEMS.has("Coriander Leaf")).toBe(true);
      // Not in the soft list.
      expect(FRESH_PRODUCE_ITEMS.has("Paneer")).toBe(false);
      expect(FRESH_PRODUCE_ITEMS.has("Ginger")).toBe(false);
    });

    it("ranks higher overlap above lower overlap", () => {
      const sharesTwo = makeDish({ name: "SharesTwo" });
      const sharesOne = makeDish({ name: "SharesOne" });
      const ingredients = [
        row(sharesTwo.id, sharesTwo.name, "Capsicum", 50),
        row(sharesTwo.id, sharesTwo.name, "Tomato", 50),
        row(sharesOne.id, sharesOne.name, "Capsicum", 50),
      ];
      const out = scoreSoftConsolidation(
        [sharesOne, sharesTwo],
        new Set(["Capsicum", "Tomato"]),
        ingredients,
      );
      expect(out.map((d) => d.name)).toEqual(["SharesTwo", "SharesOne"]);
    });

    it("preserves input order when nothing is shared (score zero for all)", () => {
      const a = makeDish({ name: "A", primaryIngredient: "Paneer" });
      const b = makeDish({ name: "B", primaryIngredient: "Chicken" });
      const ingredients: Ingredient[] = [];
      const out = scoreSoftConsolidation([a, b], new Set(["Capsicum"]), ingredients);
      expect(out.map((d) => d.name)).toEqual(["A", "B"]);
    });

    it("counts the dish's Primary Ingredient as a fresh-item match even without a row", () => {
      const tomatoRice = makeDish({
        name: "TomatoRice",
        primaryIngredient: "Tomato",
      });
      const plain = makeDish({ name: "Plain", primaryIngredient: "Paneer" });
      const ingredients: Ingredient[] = [];
      const out = scoreSoftConsolidation([plain, tomatoRice], new Set(["Tomato"]), ingredients);
      expect(out.map((d) => d.name)).toEqual(["TomatoRice", "Plain"]);
    });
  });

  describe("rankByConsolidation composition", () => {
    it("uses hard score as primary and soft score as secondary tiebreak", () => {
      // Three dishes:
      //  - hardOnly: uses leftover Paneer (hard=1, soft=0)
      //  - softOnly: shares Capsicum (hard=0, soft=1)
      //  - bothMatch: uses leftover Paneer + shares Capsicum (hard=1, soft=1)
      //  - neither:  no overlap on either axis (hard=0, soft=0)
      const hardOnly = makeDish({ name: "HardOnly" });
      const bothMatch = makeDish({ name: "BothMatch" });
      const softOnly = makeDish({ name: "SoftOnly" });
      const neither = makeDish({ name: "Neither" });
      const ingredients = [
        row(hardOnly.id, hardOnly.name, "Paneer", 100),
        row(bothMatch.id, bothMatch.name, "Paneer", 100),
        row(bothMatch.id, bothMatch.name, "Capsicum", 50),
        row(softOnly.id, softOnly.name, "Capsicum", 50),
      ];
      const ledger = emptyLedger([PANEER_HEADER]);
      const paneer = ledger.get("Paneer")!;
      paneer.packsOnBuyList = 1;
      paneer.usedGrams = 50;
      paneer.leftoverGrams = 150;

      const out = rankByConsolidation(
        [neither, softOnly, hardOnly, bothMatch],
        ledger,
        ingredients,
        { lastFreshItemsUsed: new Set(["Capsicum"]) },
      );
      // hard=1 group: BothMatch (soft=1), HardOnly (soft=0) → BothMatch first.
      // hard=0 group: SoftOnly (soft=1), Neither (soft=0) → SoftOnly first.
      expect(out.map((d) => d.name)).toEqual([
        "BothMatch",
        "HardOnly",
        "SoftOnly",
        "Neither",
      ]);
    });

    it("behaves like scoreCandidates when no soft signal is supplied", () => {
      const usesPaneer = makeDish({ name: "UsesPaneer" });
      const noPaneer = makeDish({ name: "NoPaneer" });
      const ingredients = [row(usesPaneer.id, usesPaneer.name, "Paneer", 100)];
      const ledger = emptyLedger([PANEER_HEADER]);
      const paneer = ledger.get("Paneer")!;
      paneer.packsOnBuyList = 1;
      paneer.usedGrams = 50;
      paneer.leftoverGrams = 150;

      const composite = rankByConsolidation([noPaneer, usesPaneer], ledger, ingredients);
      const hard = scoreCandidates([noPaneer, usesPaneer], ledger, ingredients);
      expect(composite.map((d) => d.id)).toEqual(hard.map((d) => d.id));
    });
  });

  describe("end-to-end leftover threshold (50 g)", () => {
    it("exposes the threshold constant at the value §6 names", () => {
      expect(DEFAULT_LEFTOVER_THRESHOLD_GRAMS).toBe(50);
    });

    it("a Fish (500 g pack) used at 300 g leaves 200 g, above threshold", () => {
      const dish = makeDish({ name: "Fish curry", primaryIngredient: "Fish" });
      const ingredients = [row(dish.id, dish.name, "Fish", 300)];
      const ledger = applyPick(emptyLedger([FISH_HEADER]), dish, ingredients);
      expect(ledger.get("Fish")?.leftoverGrams).toBe(200);
    });
  });
});
