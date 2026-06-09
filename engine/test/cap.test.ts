import { describe, it, expect } from "vitest";
import {
  applyCap,
  WEEKDAY_CAP,
  SATURDAY_CAP,
  type SlotPick,
} from "../src/cap.js";
import type { Day } from "../src/eligibility.js";
import type { Dish } from "../src/data/schemas.js";

let nextId = 1;

function makeDish(overrides: Partial<Dish> = {}): SlotPick {
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

function dayMap(entries: Array<[Day, SlotPick[]]>): Map<Day, SlotPick[]> {
  return new Map(entries);
}

describe("cap — docs/engine.md §5", () => {
  describe("under or at the cap: passthrough", () => {
    it("weekday with 3 items: no drops, list returned as-is", () => {
      const a = makeDish();
      const b = makeDish();
      const c = makeDish();
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([["Mon", [a, b, c]]]),
      });
      expect(slotsByDay.get("Mon")?.map((d) => d.id)).toEqual([a.id, b.id, c.id]);
      expect(droppedDishIds).toEqual([]);
    });

    it("weekday at exactly the cap (5 items): no drops", () => {
      const picks = [makeDish(), makeDish(), makeDish(), makeDish(), makeDish()];
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([["Tue", picks]]),
      });
      expect(slotsByDay.get("Tue")?.length).toBe(WEEKDAY_CAP);
      expect(droppedDishIds).toEqual([]);
    });

    it("Saturday at exactly the cap (3 items): no drops", () => {
      const picks = [makeDish(), makeDish(), makeDish()];
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([["Sat", picks]]),
      });
      expect(slotsByDay.get("Sat")?.length).toBe(SATURDAY_CAP);
      expect(droppedDishIds).toEqual([]);
    });
  });

  describe("over the cap: §5 drop algorithm", () => {
    it("weekday over by one: drops the lowest-satiety dish", () => {
      const low = makeDish({ name: "Low", satiety: "Low", prepMinutes: 10 });
      const med1 = makeDish({ name: "Med1", satiety: "Medium" });
      const med2 = makeDish({ name: "Med2", satiety: "Medium" });
      const high1 = makeDish({ name: "High1", satiety: "High" });
      const high2 = makeDish({ name: "High2", satiety: "High" });
      const high3 = makeDish({ name: "High3", satiety: "High" });
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([
          ["Wed", [high1, low, med1, high2, med2, high3]],
        ]),
      });
      expect(slotsByDay.get("Wed")?.length).toBe(WEEKDAY_CAP);
      expect(droppedDishIds).toEqual([low.id]);
      expect(slotsByDay.get("Wed")?.map((d) => d.name)).toEqual([
        "High1",
        "Med1",
        "High2",
        "Med2",
        "High3",
      ]);
    });

    it("among lowest-satiety, drops the one with the longest Prep Min", () => {
      const lowFast = makeDish({ name: "LowFast", satiety: "Low", prepMinutes: 10 });
      const lowSlow = makeDish({ name: "LowSlow", satiety: "Low", prepMinutes: 45 });
      const med = makeDish({ name: "Med", satiety: "Medium" });
      const high1 = makeDish({ name: "High1", satiety: "High" });
      const high2 = makeDish({ name: "High2", satiety: "High" });
      const high3 = makeDish({ name: "High3", satiety: "High" });
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([
          ["Mon", [lowFast, lowSlow, med, high1, high2, high3]],
        ]),
      });
      expect(droppedDishIds).toEqual([lowSlow.id]);
      expect(slotsByDay.get("Mon")?.map((d) => d.name)).toEqual([
        "LowFast",
        "Med",
        "High1",
        "High2",
        "High3",
      ]);
    });

    it("repeats: drops one at a time until the cap is met", () => {
      // 8 items, cap 5 → drop 3.
      const lowSlow = makeDish({ name: "LowSlow", satiety: "Low", prepMinutes: 60 });
      const lowFast = makeDish({ name: "LowFast", satiety: "Low", prepMinutes: 15 });
      const medSlow = makeDish({ name: "MedSlow", satiety: "Medium", prepMinutes: 90 });
      const medMid = makeDish({ name: "MedMid", satiety: "Medium", prepMinutes: 30 });
      const medFast = makeDish({ name: "MedFast", satiety: "Medium", prepMinutes: 10 });
      const high1 = makeDish({ name: "High1", satiety: "High" });
      const high2 = makeDish({ name: "High2", satiety: "High" });
      const high3 = makeDish({ name: "High3", satiety: "High" });
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([
          [
            "Fri",
            [lowSlow, lowFast, medSlow, medMid, medFast, high1, high2, high3],
          ],
        ]),
      });
      // First drop: lowest satiety + longest prep = LowSlow.
      // Second drop: remaining lowest satiety is LowFast (only Low left).
      // Third drop: now lowest satiety is Medium; longest prep = MedSlow.
      expect(droppedDishIds).toEqual([lowSlow.id, lowFast.id, medSlow.id]);
      expect(slotsByDay.get("Fri")?.length).toBe(WEEKDAY_CAP);
      expect(slotsByDay.get("Fri")?.map((d) => d.name)).toEqual([
        "MedMid",
        "MedFast",
        "High1",
        "High2",
        "High3",
      ]);
    });

    it("Saturday over by one: cap 3 applies", () => {
      const low = makeDish({ name: "Low", satiety: "Low", prepMinutes: 5 });
      const med = makeDish({ name: "Med", satiety: "Medium" });
      const high = makeDish({ name: "High", satiety: "High" });
      const high2 = makeDish({ name: "High2", satiety: "High" });
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([["Sat", [low, med, high, high2]]]),
      });
      expect(slotsByDay.get("Sat")?.length).toBe(SATURDAY_CAP);
      expect(droppedDishIds).toEqual([low.id]);
      expect(slotsByDay.get("Sat")?.map((d) => d.name)).toEqual([
        "Med",
        "High",
        "High2",
      ]);
    });
  });

  describe("edge cases", () => {
    it("all dishes share the same satiety: drops by longest Prep Min only", () => {
      const a = makeDish({ name: "A", satiety: "Medium", prepMinutes: 20 });
      const b = makeDish({ name: "B", satiety: "Medium", prepMinutes: 45 });
      const c = makeDish({ name: "C", satiety: "Medium", prepMinutes: 30 });
      const d = makeDish({ name: "D", satiety: "Medium", prepMinutes: 25 });
      const e = makeDish({ name: "E", satiety: "Medium", prepMinutes: 15 });
      const f = makeDish({ name: "F", satiety: "Medium", prepMinutes: 10 });
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([["Thu", [a, b, c, d, e, f]]]),
      });
      expect(droppedDishIds).toEqual([b.id]);
      expect(slotsByDay.get("Thu")?.map((d) => d.name)).toEqual([
        "A",
        "C",
        "D",
        "E",
        "F",
      ]);
    });

    it("tie on satiety AND prepMinutes: drops the later one in the day's array", () => {
      const earlyTwin = makeDish({
        name: "EarlyTwin",
        satiety: "Low",
        prepMinutes: 25,
      });
      const lateTwin = makeDish({
        name: "LateTwin",
        satiety: "Low",
        prepMinutes: 25,
      });
      const fillers = [
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
      ];
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([["Mon", [earlyTwin, ...fillers, lateTwin]]]),
      });
      expect(droppedDishIds).toEqual([lateTwin.id]);
      expect(slotsByDay.get("Mon")?.map((d) => d.name)).toContain("EarlyTwin");
      expect(slotsByDay.get("Mon")?.map((d) => d.name)).not.toContain("LateTwin");
    });

    it("empty day: passes through with no drops", () => {
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([["Mon", []]]),
      });
      expect(slotsByDay.get("Mon")).toEqual([]);
      expect(droppedDishIds).toEqual([]);
    });

    it("Sunday key: passed through unchanged (defensive; §2 emits no Sunday slots)", () => {
      const a = makeDish();
      const b = makeDish();
      const c = makeDish();
      const d = makeDish();
      const e = makeDish();
      const f = makeDish();
      // Cast to Day for the test even though Sunday is not in the Day union;
      // applyCap accepts the input map shape and we want to document the
      // defensive passthrough.
      const slots = new Map<Day, SlotPick[]>([
        ["Mon" as Day, [a, b, c, d, e, f]],
      ]);
      // Add a Sunday entry via cast for documentation purposes.
      (slots as unknown as Map<string, SlotPick[]>).set("Sun", [a, b, c, d, e, f, a]);
      const { slotsByDay, droppedDishIds } = applyCap({ slotsByDay: slots });
      const sun = (slotsByDay as unknown as Map<string, SlotPick[]>).get("Sun");
      expect(sun?.length).toBe(7);
      // Mon was over the cap of 5 so one dish was dropped; Sunday added none.
      expect(droppedDishIds.length).toBe(1);
    });
  });

  describe("multi-day input", () => {
    it("each day is capped independently", () => {
      const lowMon = makeDish({ name: "LowMon", satiety: "Low", prepMinutes: 30 });
      const monRest = [
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
      ];
      const lowSat = makeDish({ name: "LowSat", satiety: "Low", prepMinutes: 20 });
      const satRest = [
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
      ];
      const tueOk = [
        makeDish({ satiety: "Low" }),
        makeDish({ satiety: "Low" }),
      ];
      const { slotsByDay, droppedDishIds } = applyCap({
        slotsByDay: dayMap([
          ["Mon", [lowMon, ...monRest]],
          ["Tue", tueOk],
          ["Sat", [lowSat, ...satRest]],
        ]),
      });
      expect(slotsByDay.get("Mon")?.length).toBe(WEEKDAY_CAP);
      expect(slotsByDay.get("Tue")?.length).toBe(2);
      expect(slotsByDay.get("Sat")?.length).toBe(SATURDAY_CAP);
      // Both Low dishes get dropped; order in droppedDishIds is the map's
      // iteration order (Mon first, Sat next).
      expect(droppedDishIds).toEqual([lowMon.id, lowSat.id]);
    });
  });

  describe("property: shape invariants", () => {
    it("every day's output length is min(input length, cap)", () => {
      const buildPicks = (n: number): SlotPick[] =>
        Array.from({ length: n }, (_, i) =>
          makeDish({
            satiety: (["Low", "Medium", "High"] as const)[i % 3],
            prepMinutes: 10 + (i % 5) * 7,
          }),
        );
      const slotsByDay = dayMap([
        ["Mon", buildPicks(8)],
        ["Tue", buildPicks(2)],
        ["Wed", buildPicks(5)],
        ["Thu", buildPicks(6)],
        ["Fri", buildPicks(0)],
        ["Sat", buildPicks(7)],
      ]);
      const totalInputIds = new Set<number>();
      for (const picks of slotsByDay.values()) {
        for (const p of picks) totalInputIds.add(p.id);
      }
      const result = applyCap({ slotsByDay });
      for (const [day, picks] of slotsByDay) {
        const cap = day === "Sat" ? SATURDAY_CAP : WEEKDAY_CAP;
        expect(result.slotsByDay.get(day)?.length).toBe(
          Math.min(picks.length, cap),
        );
      }
      // Dropped ids = input minus output.
      const outputIds = new Set<number>();
      for (const picks of result.slotsByDay.values()) {
        for (const p of picks) outputIds.add(p.id);
      }
      const expectedDropped = new Set<number>();
      for (const id of totalInputIds) {
        if (!outputIds.has(id)) expectedDropped.add(id);
      }
      expect(new Set(result.droppedDishIds)).toEqual(expectedDropped);
      // No duplicates introduced.
      expect(result.droppedDishIds.length).toBe(expectedDropped.size);
    });

    it("returns a fresh map; does not mutate the input map or arrays", () => {
      const picks = [
        makeDish({ satiety: "Low" }),
        makeDish({ satiety: "Low" }),
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
        makeDish({ satiety: "High" }),
      ];
      const input = dayMap([["Mon", picks]]);
      const snapshot = picks.map((p) => p.id);
      const result = applyCap({ slotsByDay: input });
      expect(input.get("Mon")?.map((p) => p.id)).toEqual(snapshot);
      expect(result.slotsByDay).not.toBe(input);
      expect(result.slotsByDay.get("Mon")).not.toBe(picks);
    });
  });
});
