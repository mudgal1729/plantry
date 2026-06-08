import { describe, it, expect } from "vitest";
import {
  rankCandidates,
  byLongestUnused,
  byNoSameDayPrimaryIngredient,
  byConsolidationStub,
  byIngredientConsolidation,
  byPreferredYes,
} from "../src/priority.js";
import { emptyLedger } from "../src/consolidation.js";
import type {
  Dish,
  Ingredient,
  MenuHistoryRow,
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

function historyRow(dishId: number, dishName: string, weekStart: string): MenuHistoryRow {
  return {
    weekStart,
    day: "Monday",
    meal: "Lunch",
    dishName,
    dishId,
  };
}

describe("priority — docs/engine.md §4", () => {
  describe("§4 step 1: longest unused", () => {
    it("sorts the pool oldest last-cooked date first", () => {
      const oldest = makeDish({ name: "Oldest" });
      const middle = makeDish({ name: "Middle" });
      const newest = makeDish({ name: "Newest" });
      const history: MenuHistoryRow[] = [
        historyRow(oldest.id, oldest.name, "2026-01-05"),
        historyRow(middle.id, middle.name, "2026-03-09"),
        historyRow(newest.id, newest.name, "2026-05-04"),
      ];
      const out = byLongestUnused([newest, middle, oldest], history);
      expect(out.map((d) => d.name)).toEqual(["Oldest", "Middle", "Newest"]);
    });

    it("treats never-cooked dishes as the longest unused", () => {
      const cooked = makeDish({ name: "Cooked" });
      const neverCooked = makeDish({ name: "NeverCooked" });
      const history = [historyRow(cooked.id, cooked.name, "2026-05-04")];
      const out = byLongestUnused([cooked, neverCooked], history);
      expect(out.map((d) => d.name)).toEqual(["NeverCooked", "Cooked"]);
    });

    it("uses the most recent matching row when history has multiple cook dates for one dish", () => {
      const a = makeDish({ name: "A" });
      const b = makeDish({ name: "B" });
      // A's most recent cook is 2026-05-04 (newer than B's 2026-04-01), so B
      // is the longest unused even though A appears more often.
      const history = [
        historyRow(a.id, a.name, "2026-01-05"),
        historyRow(a.id, a.name, "2026-05-04"),
        historyRow(b.id, b.name, "2026-04-01"),
      ];
      const out = byLongestUnused([a, b], history);
      expect(out.map((d) => d.name)).toEqual(["B", "A"]);
    });

    it("exempts fruit-tagged dishes from reordering", () => {
      const recentFruit = makeDish({ name: "RecentFruit", tags: ["fruit"] });
      const oldFruit = makeDish({ name: "OldFruit", tags: ["fruit"] });
      const history = [
        historyRow(recentFruit.id, recentFruit.name, "2026-05-04"),
        historyRow(oldFruit.id, oldFruit.name, "2026-01-05"),
      ];
      const out = byLongestUnused([recentFruit, oldFruit], history);
      // Pool order preserved despite oldFruit being older.
      expect(out.map((d) => d.name)).toEqual(["RecentFruit", "OldFruit"]);
    });

    it("exempts lunch carbs (Chapati, Rice) from reordering", () => {
      const recentChapati = makeDish({
        name: "RecentChapati",
        category: "Chapati",
      });
      const oldRice = makeDish({ name: "OldRice", category: "Rice" });
      const history = [
        historyRow(recentChapati.id, recentChapati.name, "2026-05-04"),
        historyRow(oldRice.id, oldRice.name, "2026-01-05"),
      ];
      const out = byLongestUnused([recentChapati, oldRice], history);
      expect(out.map((d) => d.name)).toEqual(["RecentChapati", "OldRice"]);
    });

    it("keeps exempt items in place even when mixed with non-exempt items", () => {
      const exemptFirst = makeDish({ name: "ExemptFirst", tags: ["fruit"] });
      const oldNonExempt = makeDish({ name: "OldNonExempt" });
      const recentNonExempt = makeDish({ name: "RecentNonExempt" });
      const history = [
        historyRow(oldNonExempt.id, oldNonExempt.name, "2026-01-05"),
        historyRow(recentNonExempt.id, recentNonExempt.name, "2026-05-04"),
      ];
      const out = byLongestUnused([exemptFirst, recentNonExempt, oldNonExempt], history);
      // Exempt stays at index 0; non-exempt entries keep their input position
      // because exempt comparisons collapse to a neutral tiebreak; the sort
      // never sees a non-exempt vs non-exempt pair adjacent to swap.
      // The current implementation preserves input order whenever an exempt
      // item is involved, so the relative ordering of the two non-exempt
      // dishes is governed only by their direct comparison, which sorts old
      // before recent.
      expect(out.map((d) => d.name)).toEqual(["ExemptFirst", "OldNonExempt", "RecentNonExempt"]);
    });
  });

  describe("§4 step 2: same-day Primary Ingredient deprioritisation", () => {
    it("pushes candidates whose Primary Ingredient matches breakfast to the bottom", () => {
      const paneer = makeDish({ name: "PaneerLunch", primaryIngredient: "Paneer" });
      const chicken = makeDish({ name: "ChickenLunch", primaryIngredient: "Chicken" });
      const out = byNoSameDayPrimaryIngredient([paneer, chicken], "Paneer");
      expect(out.map((d) => d.name)).toEqual(["ChickenLunch", "PaneerLunch"]);
    });

    it("is a no-op when no breakfast Primary Ingredient is supplied", () => {
      const paneer = makeDish({ name: "PaneerLunch", primaryIngredient: "Paneer" });
      const chicken = makeDish({ name: "ChickenLunch", primaryIngredient: "Chicken" });
      const out = byNoSameDayPrimaryIngredient([paneer, chicken], undefined);
      expect(out.map((d) => d.name)).toEqual(["PaneerLunch", "ChickenLunch"]);
    });

    it("returns the pool unchanged when every candidate matches (§4 fallback)", () => {
      const paneerA = makeDish({ name: "PaneerA", primaryIngredient: "Paneer" });
      const paneerB = makeDish({ name: "PaneerB", primaryIngredient: "Paneer" });
      const out = byNoSameDayPrimaryIngredient([paneerA, paneerB], "Paneer");
      // No viable alternative → §4 allows the repeat: order from prior step
      // is preserved verbatim.
      expect(out.map((d) => d.name)).toEqual(["PaneerA", "PaneerB"]);
    });

    it("preserves prior-step order within the kept and pushed groups", () => {
      const keepA = makeDish({ name: "KeepA", primaryIngredient: "Chicken" });
      const pushA = makeDish({ name: "PushA", primaryIngredient: "Paneer" });
      const keepB = makeDish({ name: "KeepB", primaryIngredient: "Fish" });
      const pushB = makeDish({ name: "PushB", primaryIngredient: "Paneer" });
      const out = byNoSameDayPrimaryIngredient([keepA, pushA, keepB, pushB], "Paneer");
      expect(out.map((d) => d.name)).toEqual(["KeepA", "KeepB", "PushA", "PushB"]);
    });
  });

  describe("§4 step 3: ingredient consolidation (§6 wiring)", () => {
    it("is a no-op when no consolidation context is supplied", () => {
      const a = makeDish({ name: "A" });
      const b = makeDish({ name: "B" });
      const c = makeDish({ name: "C" });
      const pool = [a, b, c];
      const out = byIngredientConsolidation(pool, undefined);
      expect(out.map((d) => d.name)).toEqual(["A", "B", "C"]);
    });

    it("byConsolidationStub remains aliased for slice-4 callers (no-op when context absent)", () => {
      const a = makeDish({ name: "A" });
      const b = makeDish({ name: "B" });
      // The legacy slice-4 export still resolves and stays a no-op without a
      // ledger; only its identity widened to accept the §6 context.
      const out = byConsolidationStub([a, b], undefined);
      expect(out.map((d) => d.name)).toEqual(["A", "B"]);
    });

    it("reorders the pool when a ledger with above-threshold leftover is supplied", () => {
      const paneerHeader: PackSizeHeader = { ingredient: "Paneer", packSize: "200 g" };
      const usesPaneer = makeDish({ name: "UsesPaneer" });
      const noPaneer = makeDish({ name: "NoPaneer" });
      const ingredients: Ingredient[] = [
        {
          dishId: usesPaneer.id,
          dishName: usesPaneer.name,
          ingredient: "Paneer",
          quantity: 100,
          unit: "g",
        },
        {
          dishId: noPaneer.id,
          dishName: noPaneer.name,
          ingredient: "Onion",
          quantity: 100,
          unit: "g",
        },
      ];
      const ledger = emptyLedger([paneerHeader]);
      const paneer = ledger.get("Paneer")!;
      paneer.packsOnBuyList = 1;
      paneer.usedGrams = 50;
      paneer.leftoverGrams = 150; // above the 50 g default threshold

      const out = byIngredientConsolidation([noPaneer, usesPaneer], {
        ledger,
        ingredients,
      });
      expect(out.map((d) => d.name)).toEqual(["UsesPaneer", "NoPaneer"]);
    });
  });

  describe("§4 step 4: Preferred=Yes over Preferred=No", () => {
    it("ranks Preferred=Yes above Preferred=No", () => {
      const noPref = makeDish({ name: "NoPref", preferred: "No" });
      const yesPref = makeDish({ name: "YesPref", preferred: "Yes" });
      const out = byPreferredYes([noPref, yesPref]);
      expect(out.map((d) => d.name)).toEqual(["YesPref", "NoPref"]);
    });

    it("preserves prior-step order within each preference group", () => {
      const yesA = makeDish({ name: "YesA", preferred: "Yes" });
      const noA = makeDish({ name: "NoA", preferred: "No" });
      const yesB = makeDish({ name: "YesB", preferred: "Yes" });
      const noB = makeDish({ name: "NoB", preferred: "No" });
      // Prior step left them in interleaved order; step 4 should keep
      // yesA before yesB and noA before noB while pulling all Yes above all No.
      const out = byPreferredYes([yesA, noA, yesB, noB]);
      expect(out.map((d) => d.name)).toEqual(["YesA", "YesB", "NoA", "NoB"]);
    });
  });

  describe("rankCandidates end-to-end composition", () => {
    it("composes all four steps with each breaking ties from the previous", () => {
      // Build a pool where each step is decisive:
      //  - step 1 longest-unused puts dishes in order: old, middle, new
      //  - step 2 same-day Paneer match pushes the "PaneerNew" dish down
      //  - step 3 is a no-op
      //  - step 4 lifts Preferred=Yes within each group
      const old = makeDish({
        name: "OldChicken",
        primaryIngredient: "Chicken",
        preferred: "No",
      });
      const middlePreferredPaneer = makeDish({
        name: "MiddlePaneerYes",
        primaryIngredient: "Paneer",
        preferred: "Yes",
      });
      const middlePlain = makeDish({
        name: "MiddleFishNo",
        primaryIngredient: "Fish",
        preferred: "No",
      });
      const newishYes = makeDish({
        name: "NewishPrawnYes",
        primaryIngredient: "Prawn",
        preferred: "Yes",
      });
      const history: MenuHistoryRow[] = [
        historyRow(old.id, old.name, "2026-01-05"),
        historyRow(middlePreferredPaneer.id, middlePreferredPaneer.name, "2026-03-02"),
        historyRow(middlePlain.id, middlePlain.name, "2026-03-02"),
        historyRow(newishYes.id, newishYes.name, "2026-05-04"),
      ];

      const out = rankCandidates({
        pool: [newishYes, middlePlain, middlePreferredPaneer, old],
        history,
        sameDayBreakfastPrimaryIngredient: "Paneer",
      });

      // After step 1 (oldest first, stable index for ties):
      //   [OldChicken, MiddlePaneerYes, MiddleFishNo, NewishPrawnYes]
      // After step 2 (push Paneer matches to bottom):
      //   [OldChicken, MiddleFishNo, NewishPrawnYes, MiddlePaneerYes]
      // After step 3 (no-op):
      //   [OldChicken, MiddleFishNo, NewishPrawnYes, MiddlePaneerYes]
      // After step 4 (Preferred=Yes lifted, stable within group):
      //   Yes group in step-3 order: [NewishPrawnYes, MiddlePaneerYes]
      //   No  group in step-3 order: [OldChicken, MiddleFishNo]
      //   final: [NewishPrawnYes, MiddlePaneerYes, OldChicken, MiddleFishNo]
      expect(out.map((d) => d.name)).toEqual([
        "NewishPrawnYes",
        "MiddlePaneerYes",
        "OldChicken",
        "MiddleFishNo",
      ]);
    });

    it("respects recency exemption end-to-end (a fruit pool never reorders by date)", () => {
      const recentFruit = makeDish({
        name: "RecentMango",
        tags: ["fruit"],
        category: "Fruit",
        preferred: "No",
      });
      const oldFruit = makeDish({
        name: "OldBanana",
        tags: ["fruit"],
        category: "Fruit",
        preferred: "No",
      });
      const history = [
        historyRow(recentFruit.id, recentFruit.name, "2026-05-04"),
        historyRow(oldFruit.id, oldFruit.name, "2026-01-05"),
      ];
      const out = rankCandidates({
        pool: [recentFruit, oldFruit],
        history,
      });
      expect(out.map((d) => d.name)).toEqual(["RecentMango", "OldBanana"]);
    });

    it("respects recency exemption for lunch carbs and still lifts Preferred=Yes", () => {
      const recentChapatiYes = makeDish({
        name: "ChapatiYes",
        category: "Chapati",
        preferred: "Yes",
      });
      const oldRiceNo = makeDish({
        name: "RiceNo",
        category: "Rice",
        preferred: "No",
      });
      const history = [
        historyRow(recentChapatiYes.id, recentChapatiYes.name, "2026-05-04"),
        historyRow(oldRiceNo.id, oldRiceNo.name, "2026-01-05"),
      ];
      // Step 1 exempt (both are lunch carbs), so pool stays as input.
      // Step 4 lifts ChapatiYes above RiceNo regardless.
      const out = rankCandidates({
        pool: [oldRiceNo, recentChapatiYes],
        history,
      });
      expect(out.map((d) => d.name)).toEqual(["ChapatiYes", "RiceNo"]);
    });

    it("step 3 reorders the pool when a ledger with non-zero leftover is supplied", () => {
      const paneerHeader: PackSizeHeader = { ingredient: "Paneer", packSize: "200 g" };
      // Two same-Preferred, same-history candidates. Without a ledger they
      // come out in input order; with a ledger that has 150 g Paneer
      // leftover, the dish that consumes Paneer ranks above the one that
      // doesn't.
      const usesPaneer = makeDish({
        name: "UsesPaneer",
        primaryIngredient: "Chicken",
        preferred: "No",
      });
      const noPaneer = makeDish({
        name: "NoPaneer",
        primaryIngredient: "Chicken",
        preferred: "No",
      });
      const ingredients: Ingredient[] = [
        {
          dishId: usesPaneer.id,
          dishName: usesPaneer.name,
          ingredient: "Paneer",
          quantity: 100,
          unit: "g",
        },
        {
          dishId: noPaneer.id,
          dishName: noPaneer.name,
          ingredient: "Onion",
          quantity: 100,
          unit: "g",
        },
      ];
      const ledger = emptyLedger([paneerHeader]);
      const paneer = ledger.get("Paneer")!;
      paneer.packsOnBuyList = 1;
      paneer.usedGrams = 50;
      paneer.leftoverGrams = 150;

      // Baseline: no ledger → input order preserved (no step would reorder).
      const baseline = rankCandidates({
        pool: [noPaneer, usesPaneer],
        history: [],
      });
      expect(baseline.map((d) => d.name)).toEqual(["NoPaneer", "UsesPaneer"]);

      // With ledger: step 3 reorders so UsesPaneer comes first.
      const withLedger = rankCandidates({
        pool: [noPaneer, usesPaneer],
        history: [],
        consolidationContext: { ledger, ingredients },
      });
      expect(withLedger.map((d) => d.name)).toEqual(["UsesPaneer", "NoPaneer"]);
    });

    it("step 3 is a no-op when no ledger is supplied (preserves slice-4 behaviour)", () => {
      const a = makeDish({ name: "A", preferred: "No" });
      const b = makeDish({ name: "B", preferred: "No" });
      const c = makeDish({ name: "C", preferred: "No" });
      const out = rankCandidates({ pool: [a, b, c], history: [] });
      expect(out.map((d) => d.name)).toEqual(["A", "B", "C"]);
    });
  });

  describe("property: result is a permutation of the input", () => {
    it("preserves length and membership for a varied pool", () => {
      const dishes = [
        makeDish({ name: "P1", primaryIngredient: "Paneer", preferred: "Yes" }),
        makeDish({ name: "P2", primaryIngredient: "Chicken", preferred: "No" }),
        makeDish({ name: "P3", primaryIngredient: "Fish", preferred: "Yes" }),
        makeDish({
          name: "P4",
          tags: ["fruit"],
          category: "Fruit",
          preferred: "No",
        }),
        makeDish({ name: "P5", category: "Chapati", preferred: "Yes" }),
        makeDish({ name: "P6", primaryIngredient: "Paneer", preferred: "No" }),
      ];
      const history: MenuHistoryRow[] = [
        historyRow(dishes[0].id, dishes[0].name, "2026-01-05"),
        historyRow(dishes[1].id, dishes[1].name, "2026-02-02"),
        historyRow(dishes[2].id, dishes[2].name, "2026-03-09"),
        historyRow(dishes[4].id, dishes[4].name, "2026-04-06"),
        historyRow(dishes[5].id, dishes[5].name, "2026-05-04"),
      ];
      const out = rankCandidates({
        pool: dishes,
        history,
        sameDayBreakfastPrimaryIngredient: "Paneer",
      });
      expect(out).toHaveLength(dishes.length);
      // Set equality on ids: every input appears exactly once.
      const inIds = new Set(dishes.map((d) => d.id));
      const outIds = new Set(out.map((d) => d.id));
      expect(outIds).toEqual(inIds);
      // No dish appears twice.
      expect(new Set(out.map((d) => d.id)).size).toBe(out.length);
    });

    it("returns an empty array unchanged", () => {
      const out = rankCandidates({ pool: [], history: [] });
      expect(out).toEqual([]);
    });
  });
});
