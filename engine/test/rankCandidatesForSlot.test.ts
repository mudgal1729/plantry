import { describe, it, expect } from "vitest";
import { rankCandidatesForSlot } from "../src/generateWeek.js";
import { loadLiveData } from "./loadLive.js";
import type { Dish, MenuHistoryRow } from "../src/data/schemas.js";

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

describe("rankCandidatesForSlot — swap-UI ranking", () => {
  describe("hand-built library", () => {
    it("returns a non-empty list for a typical Menu 1 lunch slot, lead is eligible", () => {
      nextId = 1;
      const library: Dish[] = [
        makeDish({
          name: "Paneer Butter Masala",
          time: "Lunch",
          category: "Gravy dish",
          tags: ["HP"],
          primaryIngredient: "Paneer",
        }),
        makeDish({
          name: "Chicken Curry",
          time: "Lunch",
          category: "Gravy dish",
          tags: ["HP"],
          primaryIngredient: "Chicken",
        }),
        makeDish({
          name: "Aloo Gobi",
          time: "Lunch",
          category: "Gravy dish",
          primaryIngredient: "Cauliflower",
        }),
        makeDish({
          name: "Chapati",
          time: "Lunch",
          category: "Chapati",
          primaryIngredient: "Wheat flour",
        }),
      ];
      const ranked = rankCandidatesForSlot({
        weekStart: "2026-06-08",
        day: "Mon",
        meal: "Lunch",
        library,
        history: [] as MenuHistoryRow[],
        season: "Summer",
        ingredients: [],
        packSizes: [],
      });
      expect(ranked.length).toBeGreaterThan(0);
      // The top result must be a valid eligible dish (active Yes, lunch time).
      expect(ranked[0].active).toBe("Yes");
      expect(ranked[0].time).toBe("Lunch");
    });

    it("dedupes dishes that appear in multiple position pools", () => {
      nextId = 1;
      // Same Accompaniment dish appears in both Menu 1 partnerWhenHpIsGravy
      // and lunchCarb? No, accompaniments are not carbs. But a Gravy can be HP
      // (Menu 1 hp pool) and non-HP gravy pool (no — partnerWhenHpIsDry needs
      // non-HP). So we test simpler: union has no duplicates.
      const acc = makeDish({
        name: "Cucumber Raita",
        time: "Lunch",
        category: "Accompaniment",
        primaryIngredient: "Curd",
      });
      const hp = makeDish({
        name: "Paneer Butter Masala",
        time: "Lunch",
        category: "Gravy dish",
        tags: ["HP"],
        primaryIngredient: "Paneer",
      });
      const chapati = makeDish({
        name: "Chapati",
        time: "Lunch",
        category: "Chapati",
        primaryIngredient: "Wheat flour",
      });
      const library = [acc, hp, chapati];
      const ranked = rankCandidatesForSlot({
        weekStart: "2026-06-08",
        day: "Mon",
        meal: "Lunch",
        library,
        history: [],
        season: "Summer",
        ingredients: [],
        packSizes: [],
      });
      const ids = ranked.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it("returns an empty list when no slot matches the requested day/meal", () => {
      // Sunday has no slot.
      const ranked = rankCandidatesForSlot({
        weekStart: "2026-06-08",
        day: "Sat",
        meal: "Breakfast",
        library: [],
        history: [],
        season: "Summer",
        ingredients: [],
        packSizes: [],
      });
      expect(ranked).toEqual([]);
    });
  });

  describe("live data smoke", () => {
    const { library, packSizes, ingredients, history } = loadLiveData();

    it("returns a non-empty ranked list for Mon Lunch against the live library", () => {
      const ranked = rankCandidatesForSlot({
        weekStart: "2026-06-08",
        day: "Mon",
        meal: "Lunch",
        library,
        history,
        season: "Summer",
        ingredients,
        packSizes,
      });
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].active).toBe("Yes");
      expect(ranked[0].time).toBe("Lunch");
    });
  });
});
