export const VERSION = "0.0.0";

export * from "./data/schemas.js";
export { parseDishes, parseIngredients, parseMenuHistory } from "./data/parse.js";
export { serializeDishes, serializeIngredients, serializeMenuHistory } from "./data/serialize.js";
export { validateMenuHistoryAgainstLibrary, validatePackSizesUsed } from "./data/validators.js";
export { eligibleDishes } from "./eligibility.js";
export type { EligibleDishesArgs, Slot, Day, Meal } from "./eligibility.js";
export { weekSchedule } from "./schedule.js";
export type { SlotPlan, WeekScheduleArgs, LunchMenu } from "./schedule.js";
export {
  composeSlot,
  breakfastOptionA,
  breakfastOptionB,
  breakfastOptionC,
  breakfastWeekdayPair,
  breakfastSinglePick,
  menu1,
  menu2,
  menu3,
  menu4,
  lunchCarbPool,
  shouldSubstituteWeekday,
} from "./composition.js";
export type {
  CandidateSet,
  BreakfastWeekdayPairCandidateSet,
  BreakfastSinglePickCandidateSet,
  Menu1CandidateSet,
  Menu2CandidateSet,
  Menu3CandidateSet,
  Menu4CandidateSet,
  ComposeSlotArgs,
  ShouldSubstituteWeekdayArgs,
  WeekdaySubstitutionDay,
  WeekdaySubstitutionForm,
  WeekdaySubstitutionDecision,
} from "./composition.js";
export {
  rankCandidates,
  byLongestUnused,
  byNoSameDayPrimaryIngredient,
  byConsolidationStub,
  byIngredientConsolidation,
  byPreferredYes,
} from "./priority.js";
export type { RankCandidatesArgs, ConsolidationContext } from "./priority.js";
export {
  emptyLedger,
  applyPick,
  scoreCandidates,
  scoreSoftConsolidation,
  rankByConsolidation,
  DEFAULT_LEFTOVER_THRESHOLD_GRAMS,
  FRESH_PRODUCE_ITEMS,
} from "./consolidation.js";
export type { IngredientLedger, IngredientLedgerEntry } from "./consolidation.js";
export { applyCap, WEEKDAY_CAP, SATURDAY_CAP } from "./cap.js";
export type { SlotPick, ApplyCapArgs, ApplyCapResult } from "./cap.js";
