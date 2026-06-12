export const VERSION = "0.0.0";

export * from "./data/schemas.js";
export {
  parseMenuHistory,
  parseDishFile,
  parseIngredientCatalog,
  dishFilesToLibrary,
  catalogToPackSizes,
} from "./data/parse.js";
export {
  serializeMenuHistory,
  serializeDishFile,
  serializeIngredientCatalog,
} from "./data/serialize.js";
export {
  validateMenuHistoryAgainstLibrary,
  validatePackSizesUsed,
  validateDishFiles,
  validateCatalogGroups,
  validateIngredientNamesResolve,
  validateDishFileRoundTrip,
  coverageReport,
  poolCoverageReport,
  hpProteinConsistencyReport,
  HP_PROTEIN_THRESHOLD_PER_PERSON,
} from "./data/validators.js";
export type { CoverageReport, PoolCount, HpProteinDrift } from "./data/validators.js";
export { baseSlug, slugForDishes } from "./data/slug.js";
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
export { generateWeek, rankCandidatesForSlot } from "./generateWeek.js";
export type {
  GenerateWeekArgs,
  GeneratedWeek,
  GeneratedWeekDay,
  GeneratedWeekSlot,
  RankCandidatesForSlotArgs,
} from "./generateWeek.js";
export { aggregateGroceryList } from "./groceryList.js";
export type { GroceryItem, GroceryList, GroceryDayPicks } from "./groceryList.js";
export { deriveDishMacros, proteinToCarbRatio, HOUSEHOLD_SERVINGS } from "./nutrition.js";
export type { DishMacros } from "./nutrition.js";
export { rankPickerAlternatives, PROTEIN_BAND_WIDTH_GRAMS } from "./pickerRanking.js";
export type { PickerRankingArgs } from "./pickerRanking.js";
export { deriveHistoryRows } from "./historyRows.js";
export type { DeriveHistoryRowsArgs } from "./historyRows.js";
