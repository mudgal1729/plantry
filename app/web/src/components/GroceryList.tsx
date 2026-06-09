import { useQuery } from "convex/react";
import { anyApi } from "convex/server";

interface GroceryListProps {
  weekStart: string;
}

type GroceryGroupName =
  | "Proteins and Dairy"
  | "Pantry"
  | "Vegetables"
  | "Aromatics and Herbs"
  | "Other";

interface GroceryItem {
  ingredient: string;
  quantity: number;
  unit: "g" | "ml" | "pcs";
  tracked: boolean;
  packs?: number;
  packTotalGrams?: number;
}

interface GroceryGroup {
  group: GroceryGroupName;
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
  // Untracked: show the raw sum. Drop trailing zeros for clean readouts like
  // "150 g" rather than "150.0 g".
  const q = Number.isInteger(item.quantity) ? item.quantity.toString() : item.quantity.toFixed(1);
  return `${q} ${item.unit}`;
}

export function GroceryList({ weekStart }: GroceryListProps) {
  const result = useQuery(anyApi.groceryList.getGroceryList, { weekStart }) as
    | GroceryListResult
    | undefined;

  if (result === undefined) {
    return (
      <section className="grocery-list grocery-list--loading">
        <p>Loading grocery list...</p>
      </section>
    );
  }

  const nonEmptyGroups = result.groups.filter((g) => g.items.length > 0);
  if (nonEmptyGroups.length === 0) {
    return null;
  }

  return (
    <section className="grocery-list" aria-label="Grocery list for this week">
      <h3 className="grocery-list__title">Grocery list</h3>
      {nonEmptyGroups.map((group) => (
        <div key={group.group} className="grocery-group">
          <h4 className="grocery-group__title">{group.group}</h4>
          <ul className="grocery-group__items">
            {group.items.map((item) => (
              <li key={item.ingredient} className="grocery-item">
                <span className="grocery-item__name">{item.ingredient}</span>
                <span className="grocery-item__qty">{formatQuantity(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
