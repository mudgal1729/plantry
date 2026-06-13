// Day picker for the Explore tab's "Use this week" flow. After picking an
// explored dish, the user chooses which day of the current week it joins; the
// dish's meal-time fixes whether it lands in breakfast or lunch (Explore is not
// slot-scoped, so the meal is not a choice here). Only days that actually have a
// slot for that meal are offered (Saturday has no breakfast slot), mirroring the
// addDish mutation's hard filters. Ported from the DayPickerSheet overlay in
// design_handoff/hifi-overlays.jsx. Picking a day hands back to the screen,
// which captures a reason (Decision #8) before calling `addDish`.

import type { CurrentWeek, Meal, ShortDay } from "../lib/types.js";
import { dayLabel, dayOrderIndex, mealLabel } from "../lib/days.js";
import { Sheet } from "./primitives.js";

interface ExploreDayPickerProps {
  dishName: string;
  meal: Meal;
  week: CurrentWeek;
  onPick: (day: ShortDay) => void;
  onClose: () => void;
}

export function ExploreDayPicker({ dishName, meal, week, onPick, onClose }: ExploreDayPickerProps) {
  // Days that hold a slot for this meal, in week order, with how many dishes the
  // meal currently has so the user can read each day's load before adding.
  const days = week.slots
    .filter((slot) => slot.meal === meal)
    .map((slot) => ({ day: slot.day, count: slot.dishes.length }))
    .sort((a, b) => dayOrderIndex(a.day) - dayOrderIndex(b.day));

  return (
    <Sheet onClose={onClose}>
      <div className="reason__title">Add {dishName}</div>
      <div className="reason__hint">Pick which {mealLabel(meal).toLowerCase()} it joins</div>
      {days.length === 0 ? (
        <div className="picker__hint">
          No {mealLabel(meal).toLowerCase()} this week to add it to.
        </div>
      ) : (
        <div className="explore-daypicker">
          {days.map(({ day, count }) => (
            <button
              key={day}
              type="button"
              className="explore-daypicker__row"
              onClick={() => onPick(day)}
            >
              <span className="explore-daypicker__day">{dayLabel(day)}</span>
              <span className="explore-daypicker__count">
                {count} {count === 1 ? "dish" : "dishes"}
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
