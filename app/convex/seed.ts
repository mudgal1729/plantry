import { internalMutation } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";

/**
 * Inserts one sample currentWeek row valid against the schema; returns its id.
 *
 * Each (day, meal) slot under shape (a) carries a `dishes[]` list. For the
 * seed we put one dish per slot (the lead) so the seed exercises the new
 * shape without inventing fake partner/carb dish IDs that may not exist in
 * the baked library at seed time.
 */
export const seedCurrentWeek = internalMutation({
  args: {},
  handler: async (ctx): Promise<Id<"currentWeek">> => {
    const now = Date.now();
    const weekStart = "2026-06-08";

    function leadOnly(dishId: number) {
      return [
        {
          dishId: dishId as number | null,
          customLabel: null as string | null,
          source: "generated" as const,
          author: "system" as const,
          updatedAt: now,
        },
      ];
    }

    const id = await ctx.db.insert("currentWeek", {
      weekStart,
      status: "draft",
      version: 1,
      slots: [
        { day: "Mon", meal: "breakfast", dishes: leadOnly(1) },
        { day: "Mon", meal: "lunch", dishes: leadOnly(2) },
        { day: "Tue", meal: "breakfast", dishes: leadOnly(3) },
        { day: "Tue", meal: "lunch", dishes: leadOnly(4) },
        { day: "Wed", meal: "breakfast", dishes: leadOnly(5) },
        { day: "Wed", meal: "lunch", dishes: leadOnly(6) },
        { day: "Thu", meal: "breakfast", dishes: leadOnly(7) },
        { day: "Thu", meal: "lunch", dishes: leadOnly(8) },
        { day: "Fri", meal: "breakfast", dishes: leadOnly(9) },
        { day: "Fri", meal: "lunch", dishes: leadOnly(10) },
        { day: "Sat", meal: "lunch", dishes: leadOnly(11) },
      ],
    });

    return id;
  },
});
