// Grocery screen: the skip-aware buy list for the current week. Ported from the
// GroceryScreen layout in design_handoff/hifi-screens.jsx, wired to the real
// skip-aware query (groceryList.getGroceryList, slice 4.2) instead of the
// prototype's static list. Groups render in the catalog Group order the query
// returns; each item shows quantity, unit, and packs as in slice 1.

import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { CurrentWeek } from "../lib/types.js";
import { weekRangeLabel } from "../lib/days.js";
import { Card } from "./primitives.js";

interface GroceryItem {
  ingredient: string;
  quantity: number;
  unit: "g" | "ml" | "pcs";
  tracked: boolean;
  packs?: number;
  packTotalGrams?: number;
}

interface GroceryGroup {
  group: string;
  items: GroceryItem[];
}

interface GroceryListResult {
  groups: GroceryGroup[];
}

function formatQuantity(item: GroceryItem): string {
  if (item.tracked && item.packTotalGrams !== undefined && item.packs !== undefined) {
    const packsLabel = item.packs === 1 ? "1 pack" : `${item.packs} packs`;
    return `${item.packTotalGrams} g (${packsLabel})`;
  }
  const q = Number.isInteger(item.quantity) ? item.quantity.toString() : item.quantity.toFixed(1);
  return `${q} ${item.unit}`;
}

function GroceryHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="screen__header">
      <h1 className="screen__title">Grocery</h1>
      <div className="screen__subtitle">{subtitle}</div>
    </div>
  );
}

export function GroceryScreen() {
  const week = useQuery(anyApi.queries.week.getCurrentWeek, {}) as CurrentWeek | null | undefined;

  // The grocery query is keyed by weekStart; only request it once we have one.
  const weekStart = week?.weekStart;
  const grocery = useQuery(
    anyApi.groceryList.getGroceryList,
    weekStart ? { weekStart } : "skip",
  ) as GroceryListResult | undefined;

  if (week === null) {
    return (
      <div className="screen__scroll">
        <GroceryHeader subtitle="" />
        <div className="empty-state">
          <div className="empty-state__title">No grocery list yet</div>
          The buy list appears once the first menu is generated.
        </div>
      </div>
    );
  }

  if (week === undefined || grocery === undefined) {
    return (
      <div className="screen__scroll">
        <GroceryHeader subtitle="" />
        <div className="empty-state">Loading grocery list...</div>
      </div>
    );
  }

  const nonEmpty = grocery.groups.filter((g) => g.items.length > 0);
  const count = nonEmpty.reduce((n, g) => n + g.items.length, 0);
  const range = weekStart ? weekRangeLabel(weekStart) : "";
  const subtitle =
    count === 0 ? "Nothing to order this week" : `${count} items to order for ${range}`;

  return (
    <div className="screen__scroll">
      <GroceryHeader subtitle={subtitle} />
      {nonEmpty.length === 0 ? (
        <div className="empty-state">
          Every day this week is covered or skipped, so there is nothing to buy.
        </div>
      ) : (
        <div className="screen__list">
          {nonEmpty.map((group) => (
            <Card key={group.group} className="grocery-card">
              <div className="section-label">{group.group}</div>
              <ul className="grocery-card__items">
                {group.items.map((item) => (
                  <li key={item.ingredient} className="grocery-item">
                    <span className="grocery-item__name">{item.ingredient}</span>
                    <span className="grocery-item__qty">{formatQuantity(item)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
