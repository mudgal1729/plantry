// Day card for the Menu screen. Ported from the DayCard primitive in
// design_handoff/hifi-primitives.jsx. Shows a date badge, each non-empty meal as
// a labelled list of dish rows, and (this slice) an Edit button that routes into
// the legacy editor. A skipped day shows its reason in place of meals.

import type { ShortDay, WeekSlot } from "../lib/types.js";
import { dayDate, dayLabel, mealLabel, mealOrderIndex } from "../lib/days.js";
import { Card } from "./primitives.js";
import { DishRow } from "./DishRow.js";

export interface DayCardModel {
  day: ShortDay;
  slots: WeekSlot[];
  skipReason: string | null;
}

interface DayCardProps {
  model: DayCardModel;
  weekStart: string;
  onEdit?: () => void;
}

export function DayCard({ model, weekStart, onEdit }: DayCardProps) {
  const { num, month } = dayDate(weekStart, model.day);
  const meals = [...model.slots]
    .filter((slot) => slot.dishes.length > 0)
    .sort((a, b) => mealOrderIndex(a.meal) - mealOrderIndex(b.meal));

  return (
    <Card className="day-card">
      <div className="date-badge">
        <div className="date-badge__short">{model.day}</div>
        <div className="date-badge__num">{num}</div>
        <div className="date-badge__month">{month}</div>
      </div>
      <div className="day-card__body">
        {model.skipReason !== null ? (
          <div className="day-card__skipped">
            <div className="day-card__skipped-title">Skipped</div>
            <div className="day-card__skipped-reason">&ldquo;{model.skipReason}&rdquo;</div>
          </div>
        ) : (
          meals.map((slot) => (
            <div key={slot.meal} className="day-card__meal">
              <div className="section-label">{mealLabel(slot.meal)}</div>
              {slot.dishes.map((pick, i) => (
                <DishRow key={i} pick={pick} compact={false} />
              ))}
            </div>
          ))
        )}
      </div>
      {onEdit && (
        <button
          type="button"
          className="day-card__edit"
          aria-label={`Edit ${dayLabel(model.day)}`}
          onClick={onEdit}
        >
          Edit
        </button>
      )}
    </Card>
  );
}
