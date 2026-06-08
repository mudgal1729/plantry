export const VERSION = "0.0.0";

export * from "./data/schemas.js";
export { parseDishes, parseIngredients, parseMenuHistory } from "./data/parse.js";
export {
  serializeDishes,
  serializeIngredients,
  serializeMenuHistory,
} from "./data/serialize.js";
export {
  validateMenuHistoryAgainstLibrary,
  validatePackSizesUsed,
} from "./data/validators.js";
export { eligibleDishes } from "./eligibility.js";
export type { EligibleDishesArgs, Slot, Day, Meal } from "./eligibility.js";
export { weekSchedule } from "./schedule.js";
export type { SlotPlan, WeekScheduleArgs, LunchMenu } from "./schedule.js";
