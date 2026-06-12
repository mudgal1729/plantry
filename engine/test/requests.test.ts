import { describe, it, expect } from "vitest";
import { planRequests, slotKey } from "../src/requests.js";
import { generateWeek } from "../src/generateWeek.js";
import { weekSchedule } from "../src/schedule.js";
import type { Dish, Ingredient, MenuHistoryRow, PackSizeHeader } from "../src/data/schemas.js";

/**
 * docs/engine.md §6 Requested dishes. A requested dish id is placed into a slot
 * whose §3 composition accepts it, overriding recency; an unplaceable or
 * out-of-season request produces an incident and no placement. Property: a
 * requested dish appears EXACTLY ONCE in the generated week OR produces an
 * incident (never both, never zero-without-incident).
 */

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

/** A library that fills every slot for a full week (mirrors generateWeek.test). */
function makeMinimalLibrary(): Dish[] {
  return [
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
    makeDish({ name: "Stir-fry Tofu", time: "Lunch", category: "Keto", primaryIngredient: "Tofu" }),
    makeDish({ name: "Egg Bhurji", time: "Lunch", category: "Keto", primaryIngredient: "Egg" }),
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
    makeDish({
      name: "Chapati",
      time: "Lunch",
      category: "Chapati",
      primaryIngredient: "Wheat flour",
    }),
    makeDish({ name: "Jeera Rice", time: "Lunch", category: "Rice", primaryIngredient: "Rice" }),
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
    // A second dessert. Saturday Menu 3 has exactly one Dessert slot, so a dessert
    // is placed at most once per week: requesting this one cleanly isolates the
    // request mechanism from the natural multi-slot repeats a thin library causes
    // for accompaniments and carbs.
    makeDish({ name: "Rasmalai", time: "Lunch", category: "Dessert", primaryIngredient: "Paneer" }),
  ];
}

function countOccurrences(week: ReturnType<typeof generateWeek>, dishId: number): number {
  let count = 0;
  for (const day of week.days) {
    for (const slot of day.slots) {
      for (const dish of slot.dishes) if (dish.id === dishId) count += 1;
    }
  }
  return count;
}

const baseArgs = (library: Dish[]) => ({
  weekStart: "2026-06-08",
  library,
  history: emptyHistory,
  season: "Summer" as const,
  ingredients: emptyIngredients,
  packSizes: emptyPackSizes,
  rng: () => 0.1,
  lastSaturdayMenu: null,
});

describe("§6 requested dishes — planRequests (pure planner)", () => {
  it("plans a request into the first slot whose composition accepts it", () => {
    nextId = 1;
    const library = makeMinimalLibrary();
    const raita = library.find((d) => d.name === "Cucumber Raita")!;
    const schedule = weekSchedule({
      weekStart: "2026-06-08",
      lastSaturdayMenu: null,
      rng: () => 0.1,
    });
    const plan = planRequests({
      requests: [raita.id],
      schedule,
      library,
      history: emptyHistory,
      season: "Summer",
    });
    expect(plan.incidents).toEqual([]);
    expect(plan.placements).toHaveLength(1);
    // Accompaniment fits a Menu 1 lunch (Mon is the first such slot).
    expect(plan.placements[0]).toEqual({ dishId: raita.id, day: "Mon", meal: "Lunch" });
  });

  it("returns an incident for an out-of-season request (no slot accepts it)", () => {
    nextId = 1;
    const library = makeMinimalLibrary();
    const winterOnly = makeDish({
      name: "Winter Greens",
      category: "Accompaniment",
      seasons: ["Winter"],
    });
    library.push(winterOnly);
    const schedule = weekSchedule({
      weekStart: "2026-06-08",
      lastSaturdayMenu: null,
      rng: () => 0.1,
    });
    const plan = planRequests({
      requests: [winterOnly.id],
      schedule,
      library,
      history: emptyHistory,
      season: "Summer",
    });
    expect(plan.placements).toEqual([]);
    expect(plan.unplaceableDishIds).toEqual([winterOnly.id]);
    expect(plan.incidents).toHaveLength(1);
    expect(plan.incidents[0]).toContain("Winter Greens");
  });

  it("returns an incident for an unknown dish id", () => {
    nextId = 1;
    const library = makeMinimalLibrary();
    const schedule = weekSchedule({
      weekStart: "2026-06-08",
      lastSaturdayMenu: null,
      rng: () => 0.1,
    });
    const plan = planRequests({
      requests: [99999],
      schedule,
      library,
      history: emptyHistory,
      season: "Summer",
    });
    expect(plan.placements).toEqual([]);
    expect(plan.unplaceableDishIds).toEqual([99999]);
    expect(plan.incidents).toHaveLength(1);
  });

  it("never collides two requests on one slot", () => {
    nextId = 1;
    const library = makeMinimalLibrary();
    const raita = library.find((d) => d.name === "Cucumber Raita")!;
    const onion = library.find((d) => d.name === "Onion Salad")!;
    const schedule = weekSchedule({
      weekStart: "2026-06-08",
      lastSaturdayMenu: null,
      rng: () => 0.1,
    });
    const plan = planRequests({
      requests: [raita.id, onion.id],
      schedule,
      library,
      history: emptyHistory,
      season: "Summer",
    });
    expect(plan.placements).toHaveLength(2);
    const keys = plan.placements.map((p) => slotKey(p.day, p.meal));
    expect(new Set(keys).size).toBe(2);
  });

  it("does not place into a reserved (substitution) slot", () => {
    nextId = 1;
    const library = makeMinimalLibrary();
    const raita = library.find((d) => d.name === "Cucumber Raita")!;
    const schedule = weekSchedule({
      weekStart: "2026-06-08",
      lastSaturdayMenu: null,
      rng: () => 0.1,
    });
    const plan = planRequests({
      requests: [raita.id],
      schedule,
      library,
      history: emptyHistory,
      season: "Summer",
      reservedSlots: new Set([slotKey("Mon", "Lunch")]),
    });
    expect(plan.placements).toHaveLength(1);
    // Mon/Lunch is reserved, so the accompaniment lands on the next accepting day.
    expect(plan.placements[0].day).not.toBe("Mon");
  });
});

describe("§6 requested dishes — generateWeek integration", () => {
  it("default empty requests: behaviour is identical to today", () => {
    nextId = 1;
    const libA = makeMinimalLibrary();
    nextId = 1;
    const libB = makeMinimalLibrary();
    const withDefault = generateWeek(baseArgs(libA));
    const withEmpty = generateWeek({ ...baseArgs(libB), requests: [] });
    const ids = (w: ReturnType<typeof generateWeek>) =>
      w.days.flatMap((d) => d.slots.flatMap((s) => s.dishes.map((dish) => dish.id)));
    expect(ids(withEmpty)).toEqual(ids(withDefault));
    expect(withEmpty.incidents).toEqual(withDefault.incidents);
  });

  it("places a requested dish exactly once and emits no incident", () => {
    nextId = 1;
    const library = makeMinimalLibrary();
    const rasmalai = library.find((d) => d.name === "Rasmalai")!;
    const week = generateWeek({ ...baseArgs(library), requests: [rasmalai.id] });
    expect(countOccurrences(week, rasmalai.id)).toBe(1);
    expect(week.incidents).toEqual([]);
  });

  it("overrides recency: a very recently cooked requested dish is still placed", () => {
    nextId = 1;
    const library = makeMinimalLibrary();
    const rasmalai = library.find((d) => d.name === "Rasmalai")!;
    const gulab = library.find((d) => d.name === "Gulab Jamun")!;
    // Rasmalai was cooked this very week (most recent), so §4 recency would rank
    // it below the never-cooked Gulab Jamun for the single dessert slot; the
    // request must override that and place Rasmalai instead.
    const history: MenuHistoryRow[] = [
      {
        weekStart: "2026-06-01",
        day: "Saturday",
        meal: "Lunch",
        dishName: rasmalai.name,
        dishId: rasmalai.id,
      },
    ];
    const week = generateWeek({ ...baseArgs(library), history, requests: [rasmalai.id] });
    expect(countOccurrences(week, rasmalai.id)).toBe(1);
    // The request displaced the otherwise-fresher Gulab Jamun from the dessert slot.
    expect(countOccurrences(week, gulab.id)).toBe(0);
    expect(week.incidents).toEqual([]);
  });

  it("emits an incident and no placement for an out-of-season request", () => {
    nextId = 1;
    const library = makeMinimalLibrary();
    const winterOnly = makeDish({
      name: "Winter Greens",
      category: "Accompaniment",
      seasons: ["Winter"],
    });
    library.push(winterOnly);
    const week = generateWeek({ ...baseArgs(library), requests: [winterOnly.id] });
    expect(countOccurrences(week, winterOnly.id)).toBe(0);
    expect(week.incidents.some((i) => i.includes("Winter Greens"))).toBe(true);
  });

  it("property: every request appears exactly once OR yields an incident (never both/neither)", () => {
    nextId = 1;
    const library = makeMinimalLibrary();
    const winterOnly = makeDish({
      name: "Winter Greens",
      category: "Accompaniment",
      seasons: ["Winter"],
    });
    library.push(winterOnly);
    // Rasmalai is cleanly placeable into the single Saturday dessert slot;
    // Winter Greens is out of season; 99999 is unknown. Each must satisfy the
    // §6 contract: placed exactly once XOR an incident.
    const rasmalai = library.find((d) => d.name === "Rasmalai")!;
    const requests = [rasmalai.id, winterOnly.id, 99999];
    const week = generateWeek({ ...baseArgs(library), requests });

    for (const id of requests) {
      const occurrences = countOccurrences(week, id);
      const dish = library.find((d) => d.id === id);
      const name = dish ? dish.name : `dish ${id}`;
      const hasIncident = week.incidents.some(
        (i) => i.includes(`Requested ${name}`) || i.includes(`Requested dish ${id}`),
      );
      // Exactly one of: placed once, or an incident. Never both, never neither.
      const placedOnce = occurrences === 1;
      expect(placedOnce !== hasIncident).toBe(true);
      expect(occurrences).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic: same inputs reproduce the same requested-week", () => {
    nextId = 1;
    const libA = makeMinimalLibrary();
    nextId = 1;
    const libB = makeMinimalLibrary();
    const rasmalaiA = libA.find((d) => d.name === "Rasmalai")!;
    const rasmalaiB = libB.find((d) => d.name === "Rasmalai")!;
    const w1 = generateWeek({ ...baseArgs(libA), requests: [rasmalaiA.id] });
    const w2 = generateWeek({ ...baseArgs(libB), requests: [rasmalaiB.id] });
    const ids = (w: ReturnType<typeof generateWeek>) =>
      w.days.flatMap((d) => d.slots.flatMap((s) => s.dishes.map((dish) => dish.id)));
    expect(ids(w1)).toEqual(ids(w2));
  });
});
