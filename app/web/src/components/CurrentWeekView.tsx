import { useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { dishes } from "@plantry/engine/library";
import type { CurrentWeek, WeekSlot } from "../lib/types.js";
import { dayLabel, dayOrderIndex, mealLabel, mealOrderIndex } from "../lib/days.js";
import { getCachedWeek, setCachedWeek } from "../lib/storage.js";

const DISH_NAME_BY_ID = new Map<number, string>(dishes.map((d) => [d.id, d.name]));

function slotPrimaryLabel(slot: WeekSlot): string {
  if (slot.customLabel) return slot.customLabel;
  if (slot.dishId !== null) {
    return DISH_NAME_BY_ID.get(slot.dishId) ?? `Dish #${slot.dishId}`;
  }
  return "Unknown dish";
}

function slotSourceLabel(source: WeekSlot["source"]): string {
  if (source === "generated") return "generated";
  if (source === "swapped") return "swapped";
  return "custom";
}

function groupByDay(week: CurrentWeek): Array<{
  day: WeekSlot["day"];
  slots: WeekSlot[];
}> {
  const buckets = new Map<WeekSlot["day"], WeekSlot[]>();
  for (const slot of week.slots) {
    const list = buckets.get(slot.day) ?? [];
    list.push(slot);
    buckets.set(slot.day, list);
  }
  const grouped = Array.from(buckets.entries()).map(([day, slots]) => ({
    day,
    slots: [...slots].sort((a, b) => mealOrderIndex(a.meal) - mealOrderIndex(b.meal)),
  }));
  grouped.sort((a, b) => dayOrderIndex(a.day) - dayOrderIndex(b.day));
  return grouped;
}

export function CurrentWeekView() {
  const result = useQuery(anyApi.queries.week.getCurrentWeek, {}) as CurrentWeek | null | undefined;

  const cached = useMemo(() => getCachedWeek(), []);

  useEffect(() => {
    if (result) {
      setCachedWeek({ cachedAt: Date.now(), week: result });
    }
  }, [result]);

  if (result === undefined) {
    if (cached) {
      return (
        <section className="week">
          <div className="offline-banner">Showing last known menu (offline).</div>
          <WeekBody week={cached.week} />
        </section>
      );
    }
    return (
      <section className="week week--loading">
        <p>Loading menu...</p>
      </section>
    );
  }

  if (result === null) {
    return (
      <section className="week week--empty">
        <p>No menu yet. The first menu will appear here.</p>
      </section>
    );
  }

  return (
    <section className="week">
      <WeekBody week={result} />
    </section>
  );
}

function WeekBody({ week }: { week: CurrentWeek }) {
  const grouped = groupByDay(week);
  return (
    <>
      <div className="week__header">
        <h2 className="week__title">Week of {week.weekStart}</h2>
        <span className={`week__status week__status--${week.status}`}>{week.status}</span>
      </div>
      <ol className="week__days">
        {grouped.map((bucket) => (
          <li key={bucket.day} className="day-card">
            <h3 className="day-card__title">{dayLabel(bucket.day)}</h3>
            <ul className="day-card__slots">
              {bucket.slots.map((slot) => (
                <li key={`${slot.day}-${slot.meal}`} className="slot">
                  <span className="slot__meal">{mealLabel(slot.meal)}</span>
                  <span className="slot__dish">{slotPrimaryLabel(slot)}</span>
                  <span className="slot__source">{slotSourceLabel(slot.source)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}
