import { describe, it, expect } from "vitest";
import { generateWeek } from "../src/generateWeek.js";
import { loadLiveData } from "./loadLive.js";
import type {
  Dish,
  Ingredient,
  MenuHistoryRow,
  PackSizeHeader,
  Season,
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

const emptyHistory: MenuHistoryRow[] = [];
const emptyIngredients: Ingredient[] = [];
const emptyPackSizes: PackSizeHeader[] = [];

/**
 * Builds a minimum-viable library that can fill every slot for a full week.
 * Two of each role so step-1 longest-unused has something to alternate over.
 */
function makeMinimalLibrary(): Dish[] {
  return [
    // Breakfast Option A: complete_meal + fruit (Mon/Wed/Fri pair)
    makeDish({
      name: "Idli Sambar",
      time: "Breakfast",
      category: "Complete meal",
      tags: ["complete_meal"],
      primaryIngredient: "Idli batter",
    }),
    makeDish({
      name: "Apple",
      time: "Breakfast",
      category: "Fruit",
      tags: ["fruit"],
      primaryIngredient: "Apple",
    }),
    makeDish({
      name: "Poha",
      time: "Breakfast",
      category: "Complete meal",
      tags: ["complete_meal"],
      primaryIngredient: "Poha",
    }),
    makeDish({
      name: "Banana",
      time: "Breakfast",
      category: "Fruit",
      tags: ["fruit"],
      primaryIngredient: "Banana",
    }),
    makeDish({
      name: "Upma",
      time: "Breakfast",
      category: "Complete meal",
      tags: ["complete_meal"],
      primaryIngredient: "Semolina",
    }),
    // Single-pick breakfast (Tue/Thu): complete_meal or complete_carb
    makeDish({
      name: "Stuffed Paratha",
      time: "Breakfast",
      category: "Paratha",
      tags: ["complete_carb"],
      primaryIngredient: "Wheat flour",
    }),
    makeDish({
      name: "Masala Dosa",
      time: "Breakfast",
      category: "Complete meal",
      tags: ["complete_meal"],
      primaryIngredient: "Dosa batter",
    }),
    // Lunch Menu 1 pool: HP gravy + non-HP gravy + lunch carb
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
      name: "Bhindi Masala",
      time: "Lunch",
      category: "Dry dish",
      tags: ["HP"],
      primaryIngredient: "Bhindi",
    }),
    makeDish({
      name: "Cucumber Raita",
      time: "Lunch",
      category: "Accompaniment",
      primaryIngredient: "Curd",
    }),
    makeDish({
      name: "Onion Salad",
      time: "Lunch",
      category: "Accompaniment",
      primaryIngredient: "Onion",
    }),
    // Lunch Menu 2 pool: Keto + non-HP gravy + non-HP dry + carb
    makeDish({
      name: "Stir-fry Tofu",
      time: "Lunch",
      category: "Keto",
      primaryIngredient: "Tofu",
    }),
    makeDish({
      name: "Egg Bhurji",
      time: "Lunch",
      category: "Keto",
      primaryIngredient: "Egg",
    }),
    makeDish({
      name: "Cabbage Sabzi",
      time: "Lunch",
      category: "Dry dish",
      primaryIngredient: "Cabbage",
    }),
    makeDish({
      name: "Dal Tadka",
      time: "Lunch",
      category: "Gravy dish",
      primaryIngredient: "Dal",
    }),
    // Lunch carbs
    makeDish({
      name: "Chapati",
      time: "Lunch",
      category: "Chapati",
      primaryIngredient: "Wheat flour",
    }),
    makeDish({
      name: "Jeera Rice",
      time: "Lunch",
      category: "Rice",
      primaryIngredient: "Rice",
    }),
    // Saturday Menu 3 + Menu 4 pools
    makeDish({
      name: "Biryani Chicken",
      time: "Lunch",
      category: "Complete meal",
      tags: ["complete_meal", "HP"],
      primaryIngredient: "Chicken",
    }),
    makeDish({
      name: "Veg Pulao",
      time: "Lunch",
      category: "Complete meal",
      tags: ["complete_meal"],
      primaryIngredient: "Rice",
    }),
    makeDish({
      name: "Gulab Jamun",
      time: "Lunch",
      category: "Dessert",
      primaryIngredient: "Khoya",
    }),
  ];
}

describe("generateWeek — top-level engine", () => {
  describe("structural week shape against a minimal library", () => {
    nextId = 1;
    const library = makeMinimalLibrary();

    it("returns a Mon-to-Sat week (no Sunday)", () => {
      const week = generateWeek({
        weekStart: "2026-06-08",
        library,
        history: emptyHistory,
        season: "Summer",
        ingredients: emptyIngredients,
        packSizes: emptyPackSizes,
        rng: () => 0.1, // Sat picks menu 3
        lastSaturdayMenu: null,
      });
      const dayNames = week.days.map((d) => d.day);
      expect(dayNames).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    });

    it("returns 5 items on each weekday (2 breakfast + 3/4 lunch) and 3 on Saturday", () => {
      const week = generateWeek({
        weekStart: "2026-06-08",
        library,
        history: emptyHistory,
        season: "Summer",
        ingredients: emptyIngredients,
        packSizes: emptyPackSizes,
        rng: () => 0.1,
        lastSaturdayMenu: null,
      });
      const dishesPerDay = week.days.map((d) =>
        d.slots.reduce((sum, s) => sum + s.dishes.length, 0),
      );
      // Mon/Wed/Fri: 2 breakfast + 3 lunch = 5
      // Tue/Thu: 1 breakfast + 4 lunch = 5
      // Sat: 3
      expect(dishesPerDay).toEqual([5, 5, 5, 5, 5, 3]);
    });

    it("emits no incidents and no dropped dish ids under the identity cap stub", () => {
      const week = generateWeek({
        weekStart: "2026-06-08",
        library,
        history: emptyHistory,
        season: "Summer",
        ingredients: emptyIngredients,
        packSizes: emptyPackSizes,
        rng: () => 0.1,
        lastSaturdayMenu: null,
      });
      expect(week.droppedDishIds).toEqual([]);
      expect(week.incidents).toEqual([]);
    });

    it("respects §3.1 Rice-at-most-once across the week", () => {
      const week = generateWeek({
        weekStart: "2026-06-08",
        library,
        history: emptyHistory,
        season: "Summer",
        ingredients: emptyIngredients,
        packSizes: emptyPackSizes,
        rng: () => 0.1,
        lastSaturdayMenu: null,
      });
      const lunchCarbs: Dish[] = [];
      for (const day of week.days) {
        for (const slot of day.slots) {
          if (slot.meal !== "Lunch") continue;
          for (const dish of slot.dishes) {
            if (dish.category === "Rice") lunchCarbs.push(dish);
          }
        }
      }
      expect(lunchCarbs.length).toBeLessThanOrEqual(1);
    });
  });

  describe("§3.2 weekday substitution via userRequestedDishId", () => {
    it("places the pinned complete_meal Lunch dish on a weekday and switches that day to the substitution form", () => {
      nextId = 1;
      const library = makeMinimalLibrary();
      const pinned = library.find((d) => d.name === "Biryani Chicken");
      expect(pinned).toBeDefined();
      const week = generateWeek({
        weekStart: "2026-06-08",
        library,
        history: emptyHistory,
        season: "Summer",
        ingredients: emptyIngredients,
        packSizes: emptyPackSizes,
        rng: () => 0.9, // Sat picks menu 4 -> different from Mon substitution form
        lastSaturdayMenu: null,
        userRequestedDishId: pinned!.id,
      });
      // The pinned dish should appear on a weekday lunch (not Saturday).
      const weekdaysWithPinned = week.days
        .filter((d) => d.day !== "Sat")
        .filter((d) =>
          d.slots.some(
            (s) => s.meal === "Lunch" && s.dishes.some((dish) => dish.id === pinned!.id),
          ),
        );
      expect(weekdaysWithPinned.length).toBe(1);
      // The substituted day's lunch should have 3 items (Menu 3 or 4 form),
      // not 3 (Menu 1) or 4 (Menu 2). For an HP-tagged lead it's Menu 3 form.
      const substitutedDay = weekdaysWithPinned[0];
      const lunchSlot = substitutedDay.slots.find((s) => s.meal === "Lunch")!;
      expect(lunchSlot.dishes.length).toBe(3);
      // Substituted Menu 3 form: complete_meal+HP + Accompaniment + Dessert.
      expect(lunchSlot.dishes[0].tags).toContain("complete_meal");
    });
  });

  describe("determinism under a fixed RNG", () => {
    it("produces the same week on identical inputs", () => {
      nextId = 1;
      const lib1 = makeMinimalLibrary();
      nextId = 1;
      const lib2 = makeMinimalLibrary();
      const rng1 = () => 0.42;
      const rng2 = () => 0.42;
      const w1 = generateWeek({
        weekStart: "2026-06-08",
        library: lib1,
        history: emptyHistory,
        season: "Summer",
        ingredients: emptyIngredients,
        packSizes: emptyPackSizes,
        rng: rng1,
        lastSaturdayMenu: null,
      });
      const w2 = generateWeek({
        weekStart: "2026-06-08",
        library: lib2,
        history: emptyHistory,
        season: "Summer",
        ingredients: emptyIngredients,
        packSizes: emptyPackSizes,
        rng: rng2,
        lastSaturdayMenu: null,
      });
      const ids = (w: typeof w1) =>
        w.days.flatMap((d) => d.slots.flatMap((s) => s.dishes.map((dish) => dish.id)));
      expect(ids(w1)).toEqual(ids(w2));
    });
  });

  describe("smoke against the live library + history", () => {
    const { library, packSizes, ingredients, history } = loadLiveData();

    for (const season of ["Summer", "Monsoon", "Winter"] as Season[]) {
      it(`generates a complete week against live data in ${season}`, () => {
        const week = generateWeek({
          weekStart: "2026-06-08",
          library,
          history,
          season,
          ingredients,
          packSizes,
          rng: () => 0.3,
          lastSaturdayMenu: 3,
        });
        expect(week.days.map((d) => d.day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
        // Every slot has at least one dish.
        for (const day of week.days) {
          for (const slot of day.slots) {
            expect(slot.dishes.length).toBeGreaterThan(0);
          }
        }
      });
    }

    it("Saturday is Menu 3 or Menu 4 (alternating from last Saturday)", () => {
      const lastSat = 4 as const;
      const week = generateWeek({
        weekStart: "2026-06-08",
        library,
        history,
        season: "Summer",
        ingredients,
        packSizes,
        rng: () => 0.3,
        lastSaturdayMenu: lastSat,
      });
      const sat = week.days.find((d) => d.day === "Sat")!;
      const satLunch = sat.slots.find((s) => s.meal === "Lunch")!;
      // Menu 3 lead is complete_meal+HP; Menu 4 lead is complete_meal non-HP.
      const lead = satLunch.dishes[0];
      expect(lead.tags).toContain("complete_meal");
      // lastSaturdayMenu=4 → this Saturday must be 3 → HP-tagged lead.
      expect(lead.tags).toContain("HP");
    });
  });
});
