import { describe, it, expect } from "vitest";
import {
  composeSlot,
  breakfastOptionA,
  breakfastOptionB,
  breakfastOptionC,
  breakfastSinglePick,
  menu1,
  menu2,
  menu3,
  menu4,
  lunchCarbPool,
  shouldSubstituteWeekday,
} from "../src/composition.js";
import type {
  BreakfastWeekdayPairCandidateSet,
  BreakfastSinglePickCandidateSet,
  Menu1CandidateSet,
  Menu2CandidateSet,
  Menu3CandidateSet,
  Menu4CandidateSet,
} from "../src/composition.js";
import type { Dish, MenuHistoryRow } from "../src/data/schemas.js";
import type { SlotPlan } from "../src/schedule.js";

let nextId = 1;

function makeDish(overrides: Partial<Dish> = {}): Dish {
  return {
    id: nextId++,
    name: `Dish ${nextId}`,
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

const emptyHistory: MenuHistoryRow[] = [];

function breakfast(day: SlotPlan["day"]): SlotPlan {
  return {
    day,
    meal: "Breakfast",
    itemCount: day === "Mon" || day === "Wed" || day === "Fri" ? 2 : 1,
  };
}

function lunch(day: SlotPlan["day"], lunchMenu: 1 | 2 | 3 | 4): SlotPlan {
  return {
    day,
    meal: "Lunch",
    itemCount: lunchMenu === 2 ? 4 : 3,
    lunchMenu,
  };
}

describe("composition — docs/engine.md §3", () => {
  describe("§3 breakfast Mon/Wed/Fri Option A: complete_meal + fruit", () => {
    it("includes complete_meal Breakfast dishes in pool A.completeMeal", () => {
      const cm = makeDish({
        time: "Breakfast",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const notCm = makeDish({ time: "Breakfast", category: "Bread" });
      const lunchCm = makeDish({
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const out = breakfastOptionA([cm, notCm, lunchCm]);
      expect(out.completeMeal).toEqual([cm]);
    });

    it("includes fruit-tagged dishes in pool A.fruit regardless of category", () => {
      const fruitTagged = makeDish({
        time: "Breakfast",
        category: "Fruit",
        tags: ["fruit"],
      });
      const noTag = makeDish({ time: "Breakfast", category: "Fruit" });
      const out = breakfastOptionA([fruitTagged, noTag]);
      expect(out.fruit).toEqual([fruitTagged]);
    });
  });

  describe("§3 breakfast Mon/Wed/Fri Option B: complete_carb + accompaniment", () => {
    it("includes complete_carb Breakfast dishes in pool B.completeCarb", () => {
      const cc = makeDish({
        time: "Breakfast",
        category: "Paratha",
        tags: ["complete_carb"],
      });
      const plain = makeDish({ time: "Breakfast", category: "Paratha" });
      const out = breakfastOptionB([cc, plain]);
      expect(out.completeCarb).toEqual([cc]);
    });

    it("requires Time=Breakfast and Category=Accompaniment for B.accompaniment", () => {
      const acc = makeDish({ time: "Breakfast", category: "Accompaniment" });
      const lunchAcc = makeDish({ time: "Lunch", category: "Accompaniment" });
      const out = breakfastOptionB([acc, lunchAcc]);
      expect(out.accompaniment).toEqual([acc]);
    });
  });

  describe("§3 breakfast Mon/Wed/Fri Option C: breakfast dry main + plain breakfast carb", () => {
    it("requires Time=Breakfast and Category=Dry dish for C.dryMain", () => {
      const dry = makeDish({ time: "Breakfast", category: "Dry dish" });
      const lunchDry = makeDish({ time: "Lunch", category: "Dry dish" });
      const out = breakfastOptionC([dry, lunchDry]);
      expect(out.dryMain).toEqual([dry]);
    });

    it("excludes complete_carb-tagged carbs from C.plainCarb", () => {
      const plain = makeDish({ time: "Breakfast", category: "Bread" });
      const stuffed = makeDish({
        time: "Breakfast",
        category: "Paratha",
        tags: ["complete_carb"],
      });
      const chilla = makeDish({ time: "Breakfast", category: "Chilla" });
      const out = breakfastOptionC([plain, stuffed, chilla]);
      expect(out.plainCarb).toEqual([plain, chilla]);
    });
  });

  describe("§3 breakfast Tue/Thu single pick: complete_meal OR complete_carb", () => {
    it("includes both complete_meal and complete_carb Breakfast dishes", () => {
      const cm = makeDish({
        time: "Breakfast",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const cc = makeDish({
        time: "Breakfast",
        category: "Paratha",
        tags: ["complete_carb"],
      });
      const plain = makeDish({ time: "Breakfast", category: "Bread" });
      const out = breakfastSinglePick([cm, cc, plain]);
      expect(out.pool).toEqual([cm, cc]);
    });

    it("excludes Lunch dishes even when complete_meal-tagged", () => {
      const lunchCm = makeDish({
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const out = breakfastSinglePick([lunchCm]);
      expect(out.pool).toEqual([]);
    });
  });

  describe("§3 Menu 1 (Mon/Wed/Fri lunch)", () => {
    it("HP pool requires HP tag AND (Gravy dish OR Dry dish) AND Lunch", () => {
      const hpGravy = makeDish({
        time: "Lunch",
        category: "Gravy dish",
        tags: ["HP"],
      });
      const hpDry = makeDish({
        time: "Lunch",
        category: "Dry dish",
        tags: ["HP"],
      });
      const hpKeto = makeDish({
        time: "Lunch",
        category: "Keto",
        tags: ["HP"],
      });
      const nonHpGravy = makeDish({ time: "Lunch", category: "Gravy dish" });
      const out = menu1([hpGravy, hpDry, hpKeto, nonHpGravy], []);
      expect(out.hp).toEqual([hpGravy, hpDry]);
    });

    it("partner pool when HP is Dry is non-HP Gravy; when HP is Gravy is Accompaniment", () => {
      const nonHpGravy = makeDish({ time: "Lunch", category: "Gravy dish" });
      const hpGravy = makeDish({
        time: "Lunch",
        category: "Gravy dish",
        tags: ["HP"],
      });
      const acc = makeDish({ time: "Lunch", category: "Accompaniment" });
      const out = menu1([nonHpGravy, hpGravy, acc], []);
      expect(out.partnerWhenHpIsDry).toEqual([nonHpGravy]);
      expect(out.partnerWhenHpIsGravy).toEqual([acc]);
    });

    it("lunchCarb pool defaults to Chapati and includes Rice when not already used this week", () => {
      const chapati = makeDish({ time: "Lunch", category: "Chapati" });
      const rice = makeDish({ time: "Lunch", category: "Rice" });
      const out = menu1([chapati, rice], []);
      expect(out.lunchCarb).toEqual([chapati, rice]);
    });
  });

  describe("§3 Menu 2 (Tue/Thu lunch)", () => {
    it("returns four independent pools: Keto, non-HP Gravy, non-HP Dry, lunch carb", () => {
      const keto = makeDish({ time: "Lunch", category: "Keto" });
      const nonHpGravy = makeDish({ time: "Lunch", category: "Gravy dish" });
      const hpGravy = makeDish({
        time: "Lunch",
        category: "Gravy dish",
        tags: ["HP"],
      });
      const nonHpDry = makeDish({ time: "Lunch", category: "Dry dish" });
      const hpDry = makeDish({
        time: "Lunch",
        category: "Dry dish",
        tags: ["HP"],
      });
      const chapati = makeDish({ time: "Lunch", category: "Chapati" });
      const out = menu2([keto, nonHpGravy, hpGravy, nonHpDry, hpDry, chapati], []);
      expect(out.keto).toEqual([keto]);
      expect(out.nonHpGravy).toEqual([nonHpGravy]);
      expect(out.nonHpDry).toEqual([nonHpDry]);
      expect(out.lunchCarb).toEqual([chapati]);
    });
  });

  describe("§3 Menu 3 (Saturday)", () => {
    it("returns complete_meal+HP, Accompaniment, Dessert pools", () => {
      const completeMealHp = makeDish({
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal", "HP"],
      });
      const completeMealNonHp = makeDish({
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const acc = makeDish({ time: "Lunch", category: "Accompaniment" });
      const dessert = makeDish({ time: "Lunch", category: "Dessert" });
      const out = menu3([completeMealHp, completeMealNonHp, acc, dessert]);
      expect(out.completeMealHp).toEqual([completeMealHp]);
      expect(out.accompaniment).toEqual([acc]);
      expect(out.dessert).toEqual([dessert]);
    });
  });

  describe("§3 Menu 4 (Saturday)", () => {
    it("returns complete_meal non-HP, Keto, Accompaniment pools", () => {
      const completeMealHp = makeDish({
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal", "HP"],
      });
      const completeMealNonHp = makeDish({
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const keto = makeDish({ time: "Lunch", category: "Keto" });
      const acc = makeDish({ time: "Lunch", category: "Accompaniment" });
      const out = menu4([completeMealHp, completeMealNonHp, keto, acc]);
      expect(out.completeMealNonHp).toEqual([completeMealNonHp]);
      expect(out.keto).toEqual([keto]);
      expect(out.accompaniment).toEqual([acc]);
    });
  });

  describe("§3.1 lunch carb rule", () => {
    it("defaults to Chapati when nothing has been picked this week", () => {
      const chapati = makeDish({ time: "Lunch", category: "Chapati" });
      const rice = makeDish({ time: "Lunch", category: "Rice" });
      const out = lunchCarbPool([chapati, rice], []);
      expect(out).toEqual([chapati, rice]);
    });

    it("excludes Rice when a Rice dish has already been picked this week", () => {
      const chapati = makeDish({ time: "Lunch", category: "Chapati" });
      const rice = makeDish({ time: "Lunch", category: "Rice" });
      const ricePicked = makeDish({ time: "Lunch", category: "Rice" });
      const out = lunchCarbPool([chapati, rice], [ricePicked]);
      expect(out).toEqual([chapati]);
    });

    it("excludes non-carb categories regardless of state", () => {
      const chapati = makeDish({ time: "Lunch", category: "Chapati" });
      const gravy = makeDish({ time: "Lunch", category: "Gravy dish" });
      const out = lunchCarbPool([chapati, gravy], []);
      expect(out).toEqual([chapati]);
    });

    it("does not apply recency (§4 exemption): never-cooked Rice still in pool", () => {
      const chapati = makeDish({ time: "Lunch", category: "Chapati" });
      const rice = makeDish({ time: "Lunch", category: "Rice" });
      // Even though a Chapati lunch carb has been "picked" earlier in the week,
      // both Chapati and Rice still appear (no recency filter).
      const earlier = makeDish({ time: "Lunch", category: "Chapati" });
      const out = lunchCarbPool([chapati, rice], [earlier]);
      expect(out).toEqual([chapati, rice]);
    });
  });

  describe("§3.2 weekday complete_meal substitution trigger", () => {
    it("returns null when no complete_meal Lunch dishes are eligible", () => {
      const lib = [
        makeDish({ time: "Lunch", category: "Gravy dish", tags: ["HP"] }),
        makeDish({ time: "Lunch", category: "Chapati" }),
      ];
      const decision = shouldSubstituteWeekday({
        library: lib,
        history: emptyHistory,
        season: "Summer",
      });
      expect(decision).toBeNull();
    });

    it("triggers when complete_meal is longest unused; returns Menu 3 form for HP-tagged lead", () => {
      const completeMealHp = makeDish({
        id: 100,
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal", "HP"],
      });
      const hpGravy = makeDish({
        id: 101,
        time: "Lunch",
        category: "Gravy dish",
        tags: ["HP"],
      });
      const history: MenuHistoryRow[] = [
        // hpGravy cooked recently; completeMealHp never cooked.
        {
          weekStart: "2026-05-25",
          day: "Monday",
          meal: "Lunch",
          dishName: hpGravy.name,
          dishId: 101,
        },
      ];
      const decision = shouldSubstituteWeekday({
        library: [completeMealHp, hpGravy],
        history,
        season: "Summer",
      });
      expect(decision).not.toBeNull();
      expect(decision!.form).toBe("menu-3");
      expect(decision!.leadDishId).toBe(100);
      expect(decision!.day).toBe("Mon");
    });

    it("non-trigger: complete_meal lead is newer than the day's protein candidate", () => {
      const completeMealHp = makeDish({
        id: 200,
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal", "HP"],
      });
      const hpGravy = makeDish({
        id: 201,
        time: "Lunch",
        category: "Gravy dish",
        tags: ["HP"],
      });
      const keto = makeDish({
        id: 202,
        time: "Lunch",
        category: "Keto",
      });
      const history: MenuHistoryRow[] = [
        // complete_meal cooked yesterday; HP and Keto candidates never cooked.
        {
          weekStart: "2026-05-25",
          day: "Saturday",
          meal: "Lunch",
          dishName: completeMealHp.name,
          dishId: 200,
        },
      ];
      const decision = shouldSubstituteWeekday({
        library: [completeMealHp, hpGravy, keto],
        history,
        season: "Summer",
      });
      expect(decision).toBeNull();
    });

    it("user-requested override picks that dish even when the longest-unused trigger would not fire", () => {
      const completeMealNonHp = makeDish({
        id: 300,
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const hpGravy = makeDish({
        id: 301,
        time: "Lunch",
        category: "Gravy dish",
        tags: ["HP"],
      });
      const history: MenuHistoryRow[] = [
        // complete_meal is the most recently cooked — trigger b would not fire.
        {
          weekStart: "2026-06-01",
          day: "Saturday",
          meal: "Lunch",
          dishName: completeMealNonHp.name,
          dishId: 300,
        },
      ];
      const decision = shouldSubstituteWeekday({
        library: [completeMealNonHp, hpGravy],
        history,
        season: "Summer",
        userRequestedDishId: 300,
      });
      expect(decision).not.toBeNull();
      expect(decision!.form).toBe("menu-4");
      expect(decision!.leadDishId).toBe(300);
    });

    it("user-requested override returns null if the requested dish is not an eligible complete_meal Lunch dish", () => {
      const completeMealHp = makeDish({
        id: 400,
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal", "HP"],
      });
      const breakfastCm = makeDish({
        id: 401,
        time: "Breakfast",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const decision = shouldSubstituteWeekday({
        library: [completeMealHp, breakfastCm],
        history: emptyHistory,
        season: "Summer",
        userRequestedDishId: 401,
      });
      expect(decision).toBeNull();
    });
  });

  describe("composeSlot dispatch", () => {
    it("dispatches Mon Breakfast to the three-option breakfast pair set", () => {
      const cm = makeDish({
        time: "Breakfast",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const out = composeSlot({
        slot: breakfast("Mon"),
        library: [cm],
        history: emptyHistory,
        season: "Summer",
      });
      const pair = out as BreakfastWeekdayPairCandidateSet;
      expect(pair.kind).toBe("breakfast-pair");
      expect(pair.optionA.completeMeal).toEqual([cm]);
    });

    it("dispatches Tue Breakfast to the single-pick set", () => {
      const cm = makeDish({
        time: "Breakfast",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const out = composeSlot({
        slot: breakfast("Tue"),
        library: [cm],
        history: emptyHistory,
        season: "Summer",
      });
      const single = out as BreakfastSinglePickCandidateSet;
      expect(single.kind).toBe("breakfast-single");
      expect(single.pool).toEqual([cm]);
    });

    it("dispatches Mon Lunch to Menu 1", () => {
      const hp = makeDish({
        time: "Lunch",
        category: "Gravy dish",
        tags: ["HP"],
      });
      const out = composeSlot({
        slot: lunch("Mon", 1),
        library: [hp],
        history: emptyHistory,
        season: "Summer",
      });
      const m1 = out as Menu1CandidateSet;
      expect(m1.kind).toBe("menu-1");
      expect(m1.hp).toEqual([hp]);
    });

    it("dispatches Tue Lunch to Menu 2", () => {
      const keto = makeDish({ time: "Lunch", category: "Keto" });
      const out = composeSlot({
        slot: lunch("Tue", 2),
        library: [keto],
        history: emptyHistory,
        season: "Summer",
      });
      const m2 = out as Menu2CandidateSet;
      expect(m2.kind).toBe("menu-2");
      expect(m2.keto).toEqual([keto]);
    });

    it("dispatches Sat Lunch lunchMenu=3 to Menu 3", () => {
      const cmhp = makeDish({
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal", "HP"],
      });
      const out = composeSlot({
        slot: lunch("Sat", 3),
        library: [cmhp],
        history: emptyHistory,
        season: "Summer",
      });
      const m3 = out as Menu3CandidateSet;
      expect(m3.kind).toBe("menu-3");
      expect(m3.completeMealHp).toEqual([cmhp]);
    });

    it("dispatches Sat Lunch lunchMenu=4 to Menu 4", () => {
      const cm = makeDish({
        time: "Lunch",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const out = composeSlot({
        slot: lunch("Sat", 4),
        library: [cm],
        history: emptyHistory,
        season: "Summer",
      });
      const m4 = out as Menu4CandidateSet;
      expect(m4.kind).toBe("menu-4");
      expect(m4.completeMealNonHp).toEqual([cm]);
    });

    it("applies §1 eligibility (active + season) before §3 composition", () => {
      const cmInactive = makeDish({
        time: "Breakfast",
        category: "Complete meal",
        tags: ["complete_meal"],
        active: "No",
      });
      const cmOutOfSeason = makeDish({
        time: "Breakfast",
        category: "Complete meal",
        tags: ["complete_meal"],
        seasons: ["Winter"],
      });
      const cmOk = makeDish({
        time: "Breakfast",
        category: "Complete meal",
        tags: ["complete_meal"],
      });
      const out = composeSlot({
        slot: breakfast("Mon"),
        library: [cmInactive, cmOutOfSeason, cmOk],
        history: emptyHistory,
        season: "Summer",
      });
      const pair = out as BreakfastWeekdayPairCandidateSet;
      expect(pair.optionA.completeMeal).toEqual([cmOk]);
    });

    it("threads weekLunchCarbs into Menu 1 / Menu 2 lunch carb pool", () => {
      const chapati = makeDish({ time: "Lunch", category: "Chapati" });
      const rice = makeDish({ time: "Lunch", category: "Rice" });
      const ricePicked = makeDish({ time: "Lunch", category: "Rice" });
      const hp = makeDish({
        time: "Lunch",
        category: "Gravy dish",
        tags: ["HP"],
      });
      const out = composeSlot({
        slot: lunch("Mon", 1),
        library: [chapati, rice, hp],
        history: emptyHistory,
        season: "Summer",
        weekLunchCarbs: [ricePicked],
      });
      const m1 = out as Menu1CandidateSet;
      expect(m1.lunchCarb).toEqual([chapati]);
    });

    it("throws if a lunch slot has no lunchMenu", () => {
      expect(() =>
        composeSlot({
          slot: {
            day: "Mon",
            meal: "Lunch",
            itemCount: 3,
          },
          library: [],
          history: emptyHistory,
          season: "Summer",
        }),
      ).toThrow(/lunchMenu/);
    });
  });
});
