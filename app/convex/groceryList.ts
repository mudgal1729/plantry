import { query } from "./_generated/server.js";
import { v, ConvexError } from "convex/values";
import { dishes, packSizes, ingredients, catalog } from "@plantry/engine/library";
import { aggregateGroceryList, type Dish, type GroceryList } from "@plantry/engine";

/**
 * Returns the structured grocery list for `currentWeek[weekStart]`. Drives the
 * GroceryList component (Stream D slice 4) below the week body, and is the
 * shape the future Swiggy MCP integration (per `docs/engineering.md` §13) will
 * consume.
 *
 * Per `docs/product.md` §3 item 3: groups in fixed order
 * (Proteins and Dairy, Pantry, Vegetables, Aromatics and Herbs, Other),
 * quantities aggregated across the week, tracked items rounded to the next
 * pack multiple. Pantry staples (flour, oil, salt, common spices, base rice)
 * are omitted unless a dish lists them explicitly. Here every ingredient that
 * a picked dish lists (in its `data/dishes/<slug>.md` Ingredients table) is
 * listed; the slow loop is the path that prunes an ingredient row out of a dish
 * file if Rajat decides a given pantry staple should not be on the list.
 *
 * Custom one-offs (slots whose `dishId` is null) do not contribute to the
 * grocery list in v1: their ingredient quantities are not modelled in the
 * library, and the user adds those ingredients themselves. This is consistent
 * with `docs/product.md` §3 item 3 (the list is built from the week's library
 * dishes) and `features/phase2.md` §3 Stream C.
 */

type ShortDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
type LowerMeal = "breakfast" | "lunch";
type DishPickShape = {
  dishId: number | null;
};
type SlotShape = {
  day: ShortDay;
  meal: LowerMeal;
  dishes: DishPickShape[];
};

/**
 * Browser-callable query. The PWA subscribes via
 * `useQuery(anyApi.groceryList.getGroceryList, { weekStart })`. Throws when
 * the `currentWeek` row for `weekStart` is missing; callers should not ask if
 * `getCurrentWeek` has returned null.
 */
export const getGroceryList = query({
  args: { weekStart: v.string() },
  handler: async (ctx, args): Promise<GroceryList> => {
    const week = await ctx.db
      .query("currentWeek")
      .withIndex("by_weekStart", (q) => q.eq("weekStart", args.weekStart))
      .unique();
    if (!week) {
      throw new ConvexError("no current week for this weekStart");
    }

    // Iterate every position in every (day, meal) slot. Custom one-offs
    // (`dishId === null`) are skipped: their ingredient quantities are not in
    // the library, and v1 expects the user to add those ingredients themselves.
    const libraryById = new Map<number, Dish>(dishes.map((d) => [d.id, d]));
    const weekPicks: Dish[] = [];
    for (const slot of week.slots as SlotShape[]) {
      for (const pick of slot.dishes) {
        if (pick.dishId === null) continue;
        const dish = libraryById.get(pick.dishId);
        if (dish) weekPicks.push(dish);
      }
    }

    return aggregateGroceryList({
      weekPicks,
      ingredients,
      packSizes,
      catalog,
    });
  },
});
