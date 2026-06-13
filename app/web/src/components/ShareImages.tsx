// Share-image components. The shareable output family (slice 8.1): a menu image,
// a grocery image, and one recipe sheet per dish marked "include recipe when
// sharing". These are a separate surface from the PWA chrome: calm, label-free,
// legible at phone size on WhatsApp, rendered on a warm cream card. Ported from
// design_handoff/hifi-share-image.jsx, with the prototype's inline styles moved
// to namespaced CSS classes (share-img__*) appended to index.css.
//
// Both the swipe-rail preview (SharePreviewSheet) and the exported PNGs render
// from these same components, so the preview and the shared image cannot drift
// (design-revamp §1.7, the DOM-to-image discipline). The export library walks
// the live DOM of one of these nodes and paints it to a PNG; nothing here is
// export-specific.

import type { ReactNode } from "react";
import type { Dish } from "@plantry/engine";
import type { CurrentWeek, DishPick, ShortDay } from "../lib/types.js";
import { dayOrderIndex, dayDate, weekRangeLabel } from "../lib/days.js";
import { dishById } from "../lib/library.js";

// One grocery group as the skip-aware query returns it (mirrors GroceryScreen's
// local shape and the engine GroceryList). The preview passes the live result
// straight through, so the share image and the Grocery tab show the same list.
export interface ShareGroceryItem {
  ingredient: string;
  quantity: number;
  unit: "g" | "ml" | "pcs";
  tracked: boolean;
  packs?: number;
  packTotalGrams?: number;
}

export interface ShareGroceryGroup {
  group: string;
  items: ShareGroceryItem[];
}

function ShareFrame({ children }: { children: ReactNode }) {
  return (
    <div className="share-img">
      {children}
      <div className="share-img__wordmark">Plantry</div>
    </div>
  );
}

function ShareHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="share-img__heading">
      <div className="share-img__title">{title}</div>
      {sub && <div className="share-img__sub">{sub}</div>}
    </div>
  );
}

// One (day, meal) display model for the menu image: the picked dish names in
// position order. A skipped day renders "Skipped" in place of its meals.
interface ShareDayModel {
  day: ShortDay;
  short: string;
  dateNum: number;
  breakfast: string[];
  lunch: string[];
  skipped: boolean;
}

const SHORT_DAY_LABEL: Record<ShortDay, string> = {
  Mon: "Mon",
  Tue: "Tue",
  Wed: "Wed",
  Thu: "Thu",
  Fri: "Fri",
  Sat: "Sat",
};

function pickName(pick: DishPick): string {
  if (pick.customLabel) return pick.customLabel;
  if (pick.dishId !== null) return dishById(pick.dishId)?.name ?? "From the library";
  return "One off";
}

function buildShareDayModels(week: CurrentWeek): ShareDayModel[] {
  const skipped = new Set<ShortDay>((week.skippedDays ?? []).map((s) => s.day));
  const byDay = new Map<ShortDay, { breakfast: string[]; lunch: string[] }>();
  for (const slot of week.slots) {
    const entry = byDay.get(slot.day) ?? { breakfast: [], lunch: [] };
    const names = slot.dishes.map(pickName);
    if (slot.meal === "breakfast") entry.breakfast.push(...names);
    else entry.lunch.push(...names);
    byDay.set(slot.day, entry);
  }
  const days = new Set<ShortDay>([...byDay.keys(), ...skipped]);
  return [...days]
    .sort((a, b) => dayOrderIndex(a) - dayOrderIndex(b))
    .map((day) => {
      const meals = byDay.get(day) ?? { breakfast: [], lunch: [] };
      return {
        day,
        short: SHORT_DAY_LABEL[day],
        dateNum: dayDate(week.weekStart, day).num,
        breakfast: meals.breakfast,
        lunch: meals.lunch,
        skipped: skipped.has(day),
      };
    });
}

// Image 1: the week's menu. One card per day, date badge left, meals right.
export function MenuShareImage({ week }: { week: CurrentWeek }) {
  const models = buildShareDayModels(week);
  const range = weekRangeLabel(week.weekStart);
  return (
    <ShareFrame>
      <ShareHeading title="This week" sub={range} />
      <div className="share-img__days">
        {models.map((day) => (
          <div key={day.day} className="share-img__day">
            <div className="share-img__badge">
              <div className="share-img__badge-day">{day.short}</div>
              <div className="share-img__badge-date">{day.dateNum}</div>
            </div>
            <div className="share-img__meals">
              {day.skipped ? (
                <div className="share-img__skipped">Skipped</div>
              ) : (
                <>
                  {day.breakfast.length > 0 && (
                    <div className="share-img__meal">
                      <span className="share-img__meal-label">Breakfast</span>
                      {day.breakfast.join(", ")}
                    </div>
                  )}
                  {day.lunch.length > 0 && (
                    <div className="share-img__meal">
                      <span className="share-img__meal-label">Lunch</span>
                      {day.lunch.join(", ")}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </ShareFrame>
  );
}

// Image 2: the grocery list, in the fixed catalog group order the query returns.
export function GroceryShareImage({
  groups,
  weekStart,
}: {
  groups: ShareGroceryGroup[];
  weekStart: string;
}) {
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  return (
    <ShareFrame>
      <ShareHeading title="Groceries" sub={weekRangeLabel(weekStart)} />
      {nonEmpty.length === 0 ? (
        <div className="share-img__empty">Nothing to buy this week.</div>
      ) : (
        <div className="share-img__groups">
          {nonEmpty.map((g) => (
            <div key={g.group} className="share-img__group">
              <div className="share-img__group-label">{g.group}</div>
              <div className="share-img__group-items">
                {g.items.map((it) => (
                  <div key={it.ingredient} className="share-img__group-item">
                    {it.ingredient}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </ShareFrame>
  );
}

// Image 3+: one recipe sheet per dish marked "include recipe when sharing". The
// cook fields and recipe steps degrade gracefully when a dish lacks them (the
// enrichment coverage ramp, §1.5): the sheet only renders the rows it has.
export function RecipeShareImage({ dish }: { dish: Dish }) {
  const cookNotes: Array<{ key: string; value: string }> = [];
  if (dish.equipment) cookNotes.push({ key: "Equipment", value: dish.equipment });
  if (dish.buySpecially) cookNotes.push({ key: "Buy specially", value: dish.buySpecially });
  if (dish.prePrep) cookNotes.push({ key: "Pre prep", value: dish.prePrep });
  const sub = dish.prepMinutes > 0 ? `About ${dish.prepMinutes} minutes · serves 2` : "Serves 2";
  return (
    <ShareFrame>
      <ShareHeading title={dish.name} sub={sub} />
      {cookNotes.length > 0 && (
        <div className="share-img__cook">
          {cookNotes.map((note) => (
            <div key={note.key}>
              <span className="share-img__cook-key">{note.key}:</span> {note.value}
            </div>
          ))}
        </div>
      )}
      {dish.recipe && dish.recipe.length > 0 ? (
        <div className="share-img__recipe">
          {dish.recipe.map((step, i) => (
            <div key={i} className="share-img__recipe-step">
              <span className="share-img__recipe-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="share-img__empty">Recipe coming soon.</div>
      )}
    </ShareFrame>
  );
}
