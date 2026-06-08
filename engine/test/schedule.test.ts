import { describe, it, expect } from "vitest";
import { weekSchedule } from "../src/schedule.js";
import type { SlotPlan } from "../src/schedule.js";
import type { Day, Meal } from "../src/eligibility.js";

const MONDAY = "2026-06-08";

function key(slot: SlotPlan): string {
  return `${slot.day}-${slot.meal}`;
}

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

describe("weekSchedule — docs/engine.md §2", () => {
  describe("Canonical slot order and count", () => {
    it("returns five weekday breakfasts and five weekday lunches in canonical order", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      const weekday = slots.filter((s) => s.day !== "Sat");
      expect(weekday).toHaveLength(10);
      const expectedOrder: Array<[Day, Meal]> = [
        ["Mon", "Breakfast"],
        ["Mon", "Lunch"],
        ["Tue", "Breakfast"],
        ["Tue", "Lunch"],
        ["Wed", "Breakfast"],
        ["Wed", "Lunch"],
        ["Thu", "Breakfast"],
        ["Thu", "Lunch"],
        ["Fri", "Breakfast"],
        ["Fri", "Lunch"],
      ];
      expect(weekday.map((s) => [s.day, s.meal])).toEqual(expectedOrder);
    });

    it("places Saturday lunch last and emits no Saturday breakfast", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      expect(slots[slots.length - 1].day).toBe("Sat");
      expect(slots[slots.length - 1].meal).toBe("Lunch");
      expect(slots.filter((s) => s.day === "Sat" && s.meal === "Breakfast")).toHaveLength(0);
    });

    it("emits no Sunday slots", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      expect(slots.find((s) => (s.day as string) === "Sun")).toBeUndefined();
    });

    it("emits 11 slots in total for a normal week", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      expect(slots).toHaveLength(11);
    });
  });

  describe("Item counts per §2 table", () => {
    it("Mon, Wed, Fri breakfast has 2 items", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      for (const day of ["Mon", "Wed", "Fri"] as Day[]) {
        const b = slots.find((s) => s.day === day && s.meal === "Breakfast")!;
        expect(b.itemCount).toBe(2);
      }
    });

    it("Tue, Thu breakfast has 1 item", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      for (const day of ["Tue", "Thu"] as Day[]) {
        const b = slots.find((s) => s.day === day && s.meal === "Breakfast")!;
        expect(b.itemCount).toBe(1);
      }
    });

    it("Mon, Wed, Fri lunch is Menu 1 with 3 items", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      for (const day of ["Mon", "Wed", "Fri"] as Day[]) {
        const l = slots.find((s) => s.day === day && s.meal === "Lunch")!;
        expect(l.lunchMenu).toBe(1);
        expect(l.itemCount).toBe(3);
      }
    });

    it("Tue, Thu lunch is Menu 2 with 4 items", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      for (const day of ["Tue", "Thu"] as Day[]) {
        const l = slots.find((s) => s.day === day && s.meal === "Lunch")!;
        expect(l.lunchMenu).toBe(2);
        expect(l.itemCount).toBe(4);
      }
    });

    it("Saturday lunch has 3 items", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      const sat = slots.find((s) => s.day === "Sat")!;
      expect(sat.itemCount).toBe(3);
    });

    it("weekday totals match §2 (Mon/Wed/Fri = 5, Tue/Thu = 5)", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"] as Day[]) {
        const dayTotal = slots
          .filter((s) => s.day === day)
          .reduce((acc, s) => acc + s.itemCount, 0);
        expect(dayTotal).toBe(5);
      }
    });
  });

  describe("Saturday alternation per §2", () => {
    it("picks Menu 4 when the previous Saturday was Menu 3", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 3 });
      const sat = slots.find((s) => s.day === "Sat")!;
      expect(sat.lunchMenu).toBe(4);
    });

    it("picks Menu 3 when the previous Saturday was Menu 4", () => {
      const slots = weekSchedule({ weekStart: MONDAY, lastSaturdayMenu: 4 });
      const sat = slots.find((s) => s.day === "Sat")!;
      expect(sat.lunchMenu).toBe(3);
    });

    it("with no history (lastSaturdayMenu null), picks via injected rng", () => {
      const lowRng = () => 0.1;
      const highRng = () => 0.9;
      const a = weekSchedule({
        weekStart: MONDAY,
        lastSaturdayMenu: null,
        rng: lowRng,
      });
      const b = weekSchedule({
        weekStart: MONDAY,
        lastSaturdayMenu: null,
        rng: highRng,
      });
      expect(a.find((s) => s.day === "Sat")!.lunchMenu).toBe(3);
      expect(b.find((s) => s.day === "Sat")!.lunchMenu).toBe(4);
    });

    it("with lastSaturdayMenu omitted, falls back to rng", () => {
      const slots = weekSchedule({ weekStart: MONDAY, rng: () => 0.0 });
      expect(slots.find((s) => s.day === "Sat")!.lunchMenu).toBe(3);
    });
  });

  describe("Input validation", () => {
    it("rejects a non-ISO weekStart", () => {
      expect(() =>
        weekSchedule({ weekStart: "06/08/2026", lastSaturdayMenu: 3 }),
      ).toThrow(/ISO date/);
    });

    it("rejects a non-Monday weekStart", () => {
      expect(() =>
        weekSchedule({ weekStart: "2026-06-09", lastSaturdayMenu: 3 }),
      ).toThrow(/Monday/);
    });

    it("rejects an impossible calendar date", () => {
      expect(() =>
        weekSchedule({ weekStart: "2026-02-30", lastSaturdayMenu: 3 }),
      ).toThrow(/calendar date/);
    });
  });

  describe("Property: schedule shape is consistent across many weekStart dates", () => {
    it("over six months of Mondays, every week has 11 unique slots and totals 28 items", () => {
      let current = MONDAY;
      let lastSat: 3 | 4 = 3;
      for (let i = 0; i < 26; i += 1) {
        const slots = weekSchedule({
          weekStart: current,
          lastSaturdayMenu: lastSat,
        });
        expect(slots).toHaveLength(11);

        const keys = new Set(slots.map(key));
        expect(keys.size).toBe(11);

        for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"] as Day[]) {
          expect(slots.filter((s) => s.day === day && s.meal === "Breakfast")).toHaveLength(1);
          expect(slots.filter((s) => s.day === day && s.meal === "Lunch")).toHaveLength(1);
        }
        expect(slots.filter((s) => s.day === "Sat")).toHaveLength(1);

        const totalItems = slots.reduce((acc, s) => acc + s.itemCount, 0);
        expect(totalItems).toBe(28);

        const sat = slots.find((s) => s.day === "Sat")!;
        expect(sat.lunchMenu === 3 || sat.lunchMenu === 4).toBe(true);
        lastSat = sat.lunchMenu as 3 | 4;
        current = isoAddDays(current, 7);
      }
    });
  });
});
