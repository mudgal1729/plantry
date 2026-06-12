import type { Dish, MenuHistoryRow, Season } from "./data/schemas.js";
import type { Day } from "./eligibility.js";
import { eligibleDishes } from "./eligibility.js";
import type { SlotPlan } from "./schedule.js";

/**
 * A per-position candidate pool returned by composeSlot. Each kind mirrors a
 * sub-clause of docs/engine.md §3; ranking among pools is §4's job.
 */
export type CandidateSet =
  | BreakfastWeekdayPairCandidateSet
  | BreakfastSinglePickCandidateSet
  | Menu1CandidateSet
  | Menu2CandidateSet
  | Menu3CandidateSet
  | Menu4CandidateSet;

export interface BreakfastWeekdayPairCandidateSet {
  kind: "breakfast-pair";
  optionA: { completeMeal: Dish[]; fruit: Dish[] };
  optionB: { completeCarb: Dish[]; accompaniment: Dish[] };
  optionC: { dryMain: Dish[]; plainCarb: Dish[] };
}

export interface BreakfastSinglePickCandidateSet {
  kind: "breakfast-single";
  pool: Dish[];
}

export interface Menu1CandidateSet {
  kind: "menu-1";
  hp: Dish[];
  partnerWhenHpIsDry: Dish[];
  partnerWhenHpIsGravy: Dish[];
  lunchCarb: Dish[];
}

export interface Menu2CandidateSet {
  kind: "menu-2";
  keto: Dish[];
  nonHpGravy: Dish[];
  nonHpDry: Dish[];
  lunchCarb: Dish[];
}

export interface Menu3CandidateSet {
  kind: "menu-3";
  completeMealHp: Dish[];
  accompaniment: Dish[];
  dessert: Dish[];
}

export interface Menu4CandidateSet {
  kind: "menu-4";
  completeMealNonHp: Dish[];
  keto: Dish[];
  accompaniment: Dish[];
}

export interface ComposeSlotArgs {
  slot: SlotPlan;
  library: Dish[];
  history: MenuHistoryRow[];
  season: Season;
  /** Lunch carbs already picked elsewhere in the week. Used by §3.1. */
  weekLunchCarbs?: Dish[];
}

/** Composition entry point. Mirrors docs/engine.md §3. */
export function composeSlot(args: ComposeSlotArgs): CandidateSet {
  const { slot, library, history, season } = args;
  const eligible = eligibleDishes({
    library,
    history,
    season,
    slot: { day: slot.day, meal: slot.meal },
  });

  if (slot.meal === "Breakfast") {
    if (isBigBreakfastDay(slot.day)) {
      return breakfastWeekdayPair(eligible);
    }
    return breakfastSinglePick(eligible);
  }

  switch (slot.lunchMenu) {
    case 1:
      return menu1(eligible, args.weekLunchCarbs ?? []);
    case 2:
      return menu2(eligible, args.weekLunchCarbs ?? []);
    case 3:
      return menu3(eligible);
    case 4:
      return menu4(eligible);
    default:
      throw new Error(`composeSlot: lunch slot missing lunchMenu (${slot.day} ${slot.meal})`);
  }
}

/**
 * Flatten a candidate set into its position pools, in their natural order. A
 * dish appears here iff §3 composition accepts it in some position of the slot.
 * Used by the swap picker (rankCandidatesForSlot) to union the pools and by the
 * §6 requested-dishes planner to test whether a slot's composition accepts a
 * requested dish.
 */
export function candidateSetPools(set: CandidateSet): Dish[][] {
  switch (set.kind) {
    case "breakfast-pair":
      return [
        set.optionA.completeMeal,
        set.optionA.fruit,
        set.optionB.completeCarb,
        set.optionB.accompaniment,
        set.optionC.dryMain,
        set.optionC.plainCarb,
      ];
    case "breakfast-single":
      return [set.pool];
    case "menu-1":
      return [set.hp, set.partnerWhenHpIsDry, set.partnerWhenHpIsGravy, set.lunchCarb];
    case "menu-2":
      return [set.keto, set.nonHpGravy, set.nonHpDry, set.lunchCarb];
    case "menu-3":
      return [set.completeMealHp, set.accompaniment, set.dessert];
    case "menu-4":
      return [set.completeMealNonHp, set.keto, set.accompaniment];
  }
}

function isBigBreakfastDay(day: Day): boolean {
  return day === "Mon" || day === "Wed" || day === "Fri";
}

function hasTag(dish: Dish, tag: string): boolean {
  return dish.tags.includes(tag);
}

const PLAIN_BREAKFAST_CARB_CATEGORIES = new Set(["Bread", "Paratha", "Chilla"]);

/** §3 Breakfast Mon/Wed/Fri Option A: complete_meal + fruit. */
export function breakfastOptionA(eligible: Dish[]): {
  completeMeal: Dish[];
  fruit: Dish[];
} {
  return {
    completeMeal: eligible.filter((d) => d.time === "Breakfast" && hasTag(d, "complete_meal")),
    fruit: eligible.filter((d) => hasTag(d, "fruit")),
  };
}

/** §3 Breakfast Mon/Wed/Fri Option B: complete_carb + breakfast accompaniment. */
export function breakfastOptionB(eligible: Dish[]): {
  completeCarb: Dish[];
  accompaniment: Dish[];
} {
  return {
    completeCarb: eligible.filter((d) => d.time === "Breakfast" && hasTag(d, "complete_carb")),
    accompaniment: eligible.filter((d) => d.time === "Breakfast" && d.category === "Accompaniment"),
  };
}

/** §3 Breakfast Mon/Wed/Fri Option C: breakfast dry main + plain breakfast carb. */
export function breakfastOptionC(eligible: Dish[]): {
  dryMain: Dish[];
  plainCarb: Dish[];
} {
  return {
    dryMain: eligible.filter((d) => d.time === "Breakfast" && d.category === "Dry dish"),
    plainCarb: eligible.filter(
      (d) =>
        d.time === "Breakfast" &&
        PLAIN_BREAKFAST_CARB_CATEGORIES.has(d.category) &&
        !hasTag(d, "complete_carb"),
    ),
  };
}

/** §3 Breakfast Mon/Wed/Fri composite: exposes all three options as pools. */
export function breakfastWeekdayPair(eligible: Dish[]): BreakfastWeekdayPairCandidateSet {
  return {
    kind: "breakfast-pair",
    optionA: breakfastOptionA(eligible),
    optionB: breakfastOptionB(eligible),
    optionC: breakfastOptionC(eligible),
  };
}

/** §3 Breakfast Tue/Thu single pick: complete_meal OR complete_carb. */
export function breakfastSinglePick(eligible: Dish[]): BreakfastSinglePickCandidateSet {
  return {
    kind: "breakfast-single",
    pool: eligible.filter(
      (d) => d.time === "Breakfast" && (hasTag(d, "complete_meal") || hasTag(d, "complete_carb")),
    ),
  };
}

/** §3 Menu 1 (Mon/Wed/Fri lunch): HP dish + partner (HP-dependent) + lunch carb. */
export function menu1(eligible: Dish[], weekLunchCarbs: Dish[]): Menu1CandidateSet {
  const lunch = eligible.filter((d) => d.time === "Lunch");
  return {
    kind: "menu-1",
    hp: lunch.filter(
      (d) => hasTag(d, "HP") && (d.category === "Gravy dish" || d.category === "Dry dish"),
    ),
    partnerWhenHpIsDry: lunch.filter((d) => !hasTag(d, "HP") && d.category === "Gravy dish"),
    partnerWhenHpIsGravy: lunch.filter((d) => d.category === "Accompaniment"),
    lunchCarb: lunchCarbPool(eligible, weekLunchCarbs),
  };
}

/** §3 Menu 2 (Tue/Thu lunch): Keto + non-HP Gravy + non-HP Dry + lunch carb. */
export function menu2(eligible: Dish[], weekLunchCarbs: Dish[]): Menu2CandidateSet {
  const lunch = eligible.filter((d) => d.time === "Lunch");
  return {
    kind: "menu-2",
    keto: lunch.filter((d) => d.category === "Keto"),
    nonHpGravy: lunch.filter((d) => !hasTag(d, "HP") && d.category === "Gravy dish"),
    nonHpDry: lunch.filter((d) => !hasTag(d, "HP") && d.category === "Dry dish"),
    lunchCarb: lunchCarbPool(eligible, weekLunchCarbs),
  };
}

/** §3 Menu 3 (Saturday): complete_meal+HP + Accompaniment + Dessert. */
export function menu3(eligible: Dish[]): Menu3CandidateSet {
  const lunch = eligible.filter((d) => d.time === "Lunch");
  return {
    kind: "menu-3",
    completeMealHp: lunch.filter((d) => hasTag(d, "complete_meal") && hasTag(d, "HP")),
    accompaniment: lunch.filter((d) => d.category === "Accompaniment"),
    dessert: lunch.filter((d) => d.category === "Dessert"),
  };
}

/** §3 Menu 4 (Saturday): complete_meal-non-HP + Keto + Accompaniment. */
export function menu4(eligible: Dish[]): Menu4CandidateSet {
  const lunch = eligible.filter((d) => d.time === "Lunch");
  return {
    kind: "menu-4",
    completeMealNonHp: lunch.filter((d) => hasTag(d, "complete_meal") && !hasTag(d, "HP")),
    keto: lunch.filter((d) => d.category === "Keto"),
    accompaniment: lunch.filter((d) => d.category === "Accompaniment"),
  };
}

/**
 * §3.1 lunch carb rule. Default: Chapati. Rice appears at most once per week,
 * so once any weekLunchCarbs contains a Rice dish, Rice drops from the pool.
 * The recency rule does not apply here (§4), so history is not consulted.
 */
export function lunchCarbPool(eligible: Dish[], weekLunchCarbs: Dish[]): Dish[] {
  const riceAlreadyUsed = weekLunchCarbs.some((d) => d.category === "Rice");
  return eligible.filter((d) => {
    if (d.time !== "Lunch") return false;
    if (d.category === "Chapati") return true;
    if (d.category === "Rice") return !riceAlreadyUsed;
    return false;
  });
}

export type WeekdaySubstitutionDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
export type WeekdaySubstitutionForm = "menu-3" | "menu-4";

export interface WeekdaySubstitutionDecision {
  day: WeekdaySubstitutionDay;
  form: WeekdaySubstitutionForm;
  leadDishId: number;
}

export interface ShouldSubstituteWeekdayArgs {
  library: Dish[];
  history: MenuHistoryRow[];
  season: Season;
  /** Optional user-requested complete_meal Lunch dish; forces substitution. */
  userRequestedDishId?: number;
}

const WEEKDAYS_FOR_SUBSTITUTION: WeekdaySubstitutionDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const LUNCH_MENU_BY_WEEKDAY: Record<WeekdaySubstitutionDay, 1 | 2> = {
  Mon: 1,
  Tue: 2,
  Wed: 1,
  Thu: 2,
  Fri: 1,
};

/**
 * §3.2 weekday complete_meal substitution trigger. Returns the weekday and
 * Menu 3 / Menu 4 form to substitute, or null. Two triggers: a user-requested
 * complete_meal Lunch dish (optional argument) or the longest-unused eligible
 * complete_meal Lunch dish being older than the protein candidate (HP for
 * Menu 1, Keto for Menu 2) that would otherwise fill the slot.
 */
export function shouldSubstituteWeekday(
  args: ShouldSubstituteWeekdayArgs,
): WeekdaySubstitutionDecision | null {
  const { library, history, season, userRequestedDishId } = args;

  const lunchEligible = eligibleDishes({
    library,
    history,
    season,
    slot: { day: "Mon", meal: "Lunch" },
  }).filter((d) => d.time === "Lunch");

  const completeMealLunch = lunchEligible.filter((d) => hasTag(d, "complete_meal"));

  if (userRequestedDishId !== undefined) {
    const requested = completeMealLunch.find((d) => d.id === userRequestedDishId);
    if (!requested) return null;
    return {
      day: pickEarliestSubstitutionDay(),
      form: formFor(requested),
      leadDishId: requested.id,
    };
  }

  if (completeMealLunch.length === 0) return null;

  const lastCooked = lastCookedMap(history);
  const completeMealLead = pickLongestUnused(completeMealLunch, lastCooked);
  if (!completeMealLead) return null;
  const leadDate = lastCooked.get(completeMealLead.id);

  for (const day of WEEKDAYS_FOR_SUBSTITUTION) {
    const menuType = LUNCH_MENU_BY_WEEKDAY[day];
    const proteinCandidates =
      menuType === 1
        ? lunchEligible.filter(
            (d) => hasTag(d, "HP") && (d.category === "Gravy dish" || d.category === "Dry dish"),
          )
        : lunchEligible.filter((d) => d.category === "Keto");
    const proteinLead = pickLongestUnused(proteinCandidates, lastCooked);
    if (!proteinLead) continue;
    const proteinDate = lastCooked.get(proteinLead.id);
    if (isOlder(leadDate, proteinDate)) {
      return {
        day,
        form: formFor(completeMealLead),
        leadDishId: completeMealLead.id,
      };
    }
  }
  return null;
}

function formFor(dish: Dish): WeekdaySubstitutionForm {
  return hasTag(dish, "HP") ? "menu-3" : "menu-4";
}

function pickEarliestSubstitutionDay(): WeekdaySubstitutionDay {
  return WEEKDAYS_FOR_SUBSTITUTION[0];
}

function lastCookedMap(history: MenuHistoryRow[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of history) {
    const existing = map.get(row.dishId);
    if (existing === undefined || row.weekStart > existing) {
      map.set(row.dishId, row.weekStart);
    }
  }
  return map;
}

function pickLongestUnused(pool: Dish[], lastCooked: Map<number, string>): Dish | null {
  if (pool.length === 0) return null;
  let best: Dish | null = null;
  let bestDate: string | undefined;
  for (const dish of pool) {
    const date = lastCooked.get(dish.id);
    if (isOlder(date, bestDate)) {
      best = dish;
      bestDate = date;
    } else if (best === null) {
      best = dish;
      bestDate = date;
    }
  }
  return best;
}

/** Treat "never cooked" (undefined) as the oldest possible date. */
function isOlder(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined && b === undefined) return false;
  if (a === undefined) return true;
  if (b === undefined) return false;
  return a < b;
}
