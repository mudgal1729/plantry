import type { Dish, Ingredient, MenuHistoryRow, PackSizeHeader, Season } from "./data/schemas.js";
import type { Day, Meal } from "./eligibility.js";
import { weekSchedule, type SlotPlan } from "./schedule.js";
import {
  composeSlot,
  shouldSubstituteWeekday,
  type BreakfastWeekdayPairCandidateSet,
  type BreakfastSinglePickCandidateSet,
  type CandidateSet,
  type Menu1CandidateSet,
  type Menu2CandidateSet,
  type Menu3CandidateSet,
  type Menu4CandidateSet,
} from "./composition.js";
import { rankCandidates, type ConsolidationContext } from "./priority.js";
import { applyPick, emptyLedger, type IngredientLedger } from "./consolidation.js";
import { applyCap } from "./cap.js";

export interface GenerateWeekArgs {
  /** ISO date of the Monday that anchors the week. */
  weekStart: string;
  library: Dish[];
  history: MenuHistoryRow[];
  season: Season;
  /** Per-dish ingredient rows, used to drive the §6 consolidation ledger. */
  ingredients: Ingredient[];
  /** Tracked-ingredient pack sizes, derived from the ingredient catalog (data/ingredients.md). */
  packSizes: PackSizeHeader[];
  /** Optional RNG; defaults to Math.random for the Saturday alternation choice. */
  rng?: () => number;
  /** Last Saturday's menu form, when known, to drive §2 alternation. */
  lastSaturdayMenu?: 3 | 4 | null;
  /** §3.2 trigger: pin a specific complete_meal Lunch dish to a weekday. */
  userRequestedDishId?: number;
}

export interface GeneratedWeekSlot {
  day: Day;
  meal: Meal;
  /**
   * Dishes picked for this slot in pick order: the lead item first
   * (e.g. HP for Menu 1, complete_meal for Menu 3), then partner/companion(s),
   * then the lunch carb where applicable.
   */
  dishes: Dish[];
}

export interface GeneratedWeekDay {
  day: Day;
  slots: GeneratedWeekSlot[];
}

export interface GeneratedWeek {
  weekStart: string;
  days: GeneratedWeekDay[];
  /** Dish IDs dropped by §5 cap, in the order they were dropped. */
  droppedDishIds: number[];
  /** Human-readable warnings ("Friday over cap (5), dropped: ..."). */
  incidents: string[];
}

const WEEKDAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const ALL_DAYS: Day[] = [...WEEKDAYS, "Sat"];

/**
 * Top-level engine entry point. Composes §1 → §2 → §3 → §4 → §5 → §6:
 * schedule the week, compose each slot's candidate set, rank each pool with
 * priority (passing the running consolidation ledger), pick index 0, advance
 * the ledger, then apply the cap day by day and emit an incident per drop.
 */
export function generateWeek(args: GenerateWeekArgs): GeneratedWeek {
  const {
    weekStart,
    library,
    history,
    season,
    ingredients,
    packSizes,
    rng,
    lastSaturdayMenu,
    userRequestedDishId,
  } = args;

  const baseSchedule = weekSchedule({ weekStart, lastSaturdayMenu, rng });

  // §3.2: detect weekday complete_meal substitution and rewrite that day's
  // lunch SlotPlan to the substituted Menu 3/4 form (3 items, lunchMenu 3/4).
  const substitution = shouldSubstituteWeekday({
    library,
    history,
    season,
    userRequestedDishId,
  });
  const schedule = substitution
    ? baseSchedule.map((slot): SlotPlan => {
        if (slot.day !== substitution.day || slot.meal !== "Lunch") return slot;
        return {
          ...slot,
          itemCount: 3,
          lunchMenu: substitution.form === "menu-3" ? 3 : 4,
        };
      })
    : baseSchedule;

  // Mutable accumulators threaded through the slot loop.
  let ledger: IngredientLedger = emptyLedger(packSizes);
  const weekLunchCarbs: Dish[] = [];
  const slotResults: GeneratedWeekSlot[] = [];
  // Synthetic history for within-week recency: picks made earlier in the week
  // record a virtual cooking on `weekStart`, so §4 step 1 treats them as the
  // most recently cooked and pushes them down the pool. Lunch carbs and fruit
  // are recency-exempt in priority.ts, so this does not over-filter them.
  const inWeekHistory: MenuHistoryRow[] = [];
  // Same-day breakfast primary ingredient, set when we pick breakfast and
  // consumed by the same day's lunch slot to feed §4 step 2.
  const sameDayBreakfastPrimary = new Map<Day, string>();

  for (const slot of schedule) {
    const compositionHistory: MenuHistoryRow[] = [...history, ...inWeekHistory];
    const candidateSet = composeSlot({
      slot,
      library,
      history: compositionHistory,
      season,
      weekLunchCarbs,
    });
    const consolidationContext: ConsolidationContext = {
      ledger,
      ingredients,
    };
    const picks = pickSlot({
      slot,
      candidateSet,
      compositionHistory,
      consolidationContext,
      sameDayBreakfastPrimaryIngredient:
        slot.meal === "Lunch" ? sameDayBreakfastPrimary.get(slot.day) : undefined,
      substitutionLeadDishId:
        substitution && substitution.day === slot.day && slot.meal === "Lunch"
          ? substitution.leadDishId
          : undefined,
    });

    // Update ledger and within-week recency on each pick.
    for (const dish of picks) {
      ledger = applyPick(ledger, dish, ingredients);
      inWeekHistory.push({
        weekStart,
        day: longDay(slot.day),
        meal: slot.meal,
        dishName: dish.name,
        dishId: dish.id,
      });
    }

    // Track lunch carbs for §3.1 across the week.
    if (slot.meal === "Lunch") {
      for (const dish of picks) {
        if (dish.category === "Chapati" || dish.category === "Rice") {
          weekLunchCarbs.push(dish);
        }
      }
    }

    // Wire same-day breakfast primary ingredient to lunch's §4 step 2.
    if (slot.meal === "Breakfast" && picks.length > 0) {
      // Use the lead (index 0) breakfast pick as the headline ingredient.
      sameDayBreakfastPrimary.set(slot.day, picks[0].primaryIngredient);
    }

    slotResults.push({ day: slot.day, meal: slot.meal, dishes: picks });
  }

  // §5 cap: group by day, hand off to applyCap, emit one incident per drop.
  const slotsByDay = new Map<Day, Dish[]>();
  for (const day of ALL_DAYS) {
    slotsByDay.set(day, []);
  }
  for (const slot of slotResults) {
    const bucket = slotsByDay.get(slot.day);
    if (bucket) bucket.push(...slot.dishes);
  }
  const beforeCap = new Map<Day, Dish[]>();
  for (const [day, dishes] of slotsByDay) {
    beforeCap.set(day, [...dishes]);
  }
  const capped = applyCap({ slotsByDay });

  const incidents: string[] = [];
  for (const dishId of capped.droppedDishIds) {
    const dish = library.find((d) => d.id === dishId);
    const name = dish ? dish.name : `dish ${dishId}`;
    const droppedFromDay = findDroppedDay(beforeCap, capped.slotsByDay, dishId);
    const dayLabel = droppedFromDay ? longDay(droppedFromDay) : "Unknown day";
    const cap = droppedFromDay === "Sat" ? 3 : 5;
    incidents.push(`${dayLabel} over cap (${cap}), dropped: ${name}`);
  }

  // Reproject the capped slotsByDay back onto the slot results, preserving
  // pick order within each slot. We do this by walking each day's dishes in
  // capped order and matching them to the original (day, meal) slot they
  // came from. Drops show up as omissions.
  const cappedDays = projectCapBackToSlots(slotResults, capped.slotsByDay);

  return {
    weekStart,
    days: cappedDays,
    droppedDishIds: capped.droppedDishIds,
    incidents,
  };
}

interface PickSlotArgs {
  slot: SlotPlan;
  candidateSet: CandidateSet;
  compositionHistory: MenuHistoryRow[];
  consolidationContext: ConsolidationContext;
  sameDayBreakfastPrimaryIngredient?: string;
  /** §3.2: when set, the substituted day's lead complete_meal is pinned. */
  substitutionLeadDishId?: number;
}

function pickSlot(args: PickSlotArgs): Dish[] {
  const { candidateSet } = args;
  switch (candidateSet.kind) {
    case "breakfast-pair":
      return pickBreakfastPair(args, candidateSet);
    case "breakfast-single":
      return pickBreakfastSingle(args, candidateSet);
    case "menu-1":
      return pickMenu1(args, candidateSet);
    case "menu-2":
      return pickMenu2(args, candidateSet);
    case "menu-3":
      return pickMenu3(args, candidateSet);
    case "menu-4":
      return pickMenu4(args, candidateSet);
  }
}

function rank(args: PickSlotArgs, pool: Dish[]): Dish[] {
  return rankCandidates({
    pool,
    history: args.compositionHistory,
    sameDayBreakfastPrimaryIngredient: args.sameDayBreakfastPrimaryIngredient,
    consolidationContext: args.consolidationContext,
  });
}

/**
 * §3 breakfast Mon/Wed/Fri: try Option A (complete_meal + fruit) first,
 * then B (complete_carb + accompaniment), then C (dry main + plain carb).
 * The first option whose pools both yield a pick wins.
 */
function pickBreakfastPair(args: PickSlotArgs, set: BreakfastWeekdayPairCandidateSet): Dish[] {
  const optionA = tryPair(args, set.optionA.completeMeal, set.optionA.fruit);
  if (optionA) return optionA;
  const optionB = tryPair(args, set.optionB.completeCarb, set.optionB.accompaniment);
  if (optionB) return optionB;
  const optionC = tryPair(args, set.optionC.dryMain, set.optionC.plainCarb);
  if (optionC) return optionC;
  return [];
}

function tryPair(args: PickSlotArgs, leadPool: Dish[], partnerPool: Dish[]): Dish[] | null {
  if (leadPool.length === 0 || partnerPool.length === 0) return null;
  const leadRanked = rank(args, leadPool);
  const lead = leadRanked[0];
  // Avoid double-picking the same dish across positions when pools overlap.
  const partnerRanked = rank(
    args,
    partnerPool.filter((d) => d.id !== lead.id),
  );
  if (partnerRanked.length === 0) return null;
  return [lead, partnerRanked[0]];
}

function pickBreakfastSingle(args: PickSlotArgs, set: BreakfastSinglePickCandidateSet): Dish[] {
  const ranked = rank(args, set.pool);
  if (ranked.length === 0) return [];
  return [ranked[0]];
}

/**
 * §3 Menu 1: HP first, then partner pool chosen by HP's category
 * (Dry → non-HP Gravy; Gravy → Accompaniment), then lunch carb.
 */
function pickMenu1(args: PickSlotArgs, set: Menu1CandidateSet): Dish[] {
  const hpRanked = rank(args, set.hp);
  if (hpRanked.length === 0) {
    return pickLunchCarbOnly(args, set.lunchCarb);
  }
  const hp = hpRanked[0];
  const partnerPool =
    hp.category === "Dry dish" ? set.partnerWhenHpIsDry : set.partnerWhenHpIsGravy;
  const partnerRanked = rank(
    args,
    partnerPool.filter((d) => d.id !== hp.id),
  );
  const partner = partnerRanked[0];
  const carbRanked = rank(args, set.lunchCarb);
  const carb = carbRanked[0];
  return compact([hp, partner, carb]);
}

function pickMenu2(args: PickSlotArgs, set: Menu2CandidateSet): Dish[] {
  const ketoRanked = rank(args, set.keto);
  const keto = ketoRanked[0];
  const gravyRanked = rank(
    args,
    set.nonHpGravy.filter((d) => keto && d.id !== keto.id),
  );
  const gravy = gravyRanked[0];
  const dryRanked = rank(
    args,
    set.nonHpDry.filter((d) => (!keto || d.id !== keto.id) && (!gravy || d.id !== gravy.id)),
  );
  const dry = dryRanked[0];
  const carbRanked = rank(args, set.lunchCarb);
  const carb = carbRanked[0];
  return compact([keto, gravy, dry, carb]);
}

/**
 * §3 Menu 3: complete_meal+HP + Accompaniment + Dessert. If §3.2 has pinned
 * a lead complete_meal Lunch dish, use it (overriding §4); otherwise rank.
 */
function pickMenu3(args: PickSlotArgs, set: Menu3CandidateSet): Dish[] {
  const lead = pickSubstitutedLead(args, set.completeMealHp);
  const acc = rank(
    args,
    set.accompaniment.filter((d) => !lead || d.id !== lead.id),
  )[0];
  const dessert = rank(
    args,
    set.dessert.filter((d) => !lead || d.id !== lead.id),
  )[0];
  return compact([lead, acc, dessert]);
}

function pickMenu4(args: PickSlotArgs, set: Menu4CandidateSet): Dish[] {
  const lead = pickSubstitutedLead(args, set.completeMealNonHp);
  const keto = rank(
    args,
    set.keto.filter((d) => !lead || d.id !== lead.id),
  )[0];
  const acc = rank(
    args,
    set.accompaniment.filter((d) => !lead || d.id !== lead.id),
  )[0];
  return compact([lead, keto, acc]);
}

/**
 * §3.2 substitution: when a specific complete_meal dish was pinned, prefer
 * it directly (rank still consulted for fallback). Otherwise rank normally.
 */
function pickSubstitutedLead(args: PickSlotArgs, pool: Dish[]): Dish | undefined {
  if (args.substitutionLeadDishId !== undefined) {
    const pinned = pool.find((d) => d.id === args.substitutionLeadDishId);
    if (pinned) return pinned;
  }
  const ranked = rank(args, pool);
  return ranked[0];
}

function pickLunchCarbOnly(args: PickSlotArgs, lunchCarbPool: Dish[]): Dish[] {
  const carbRanked = rank(args, lunchCarbPool);
  return carbRanked[0] ? [carbRanked[0]] : [];
}

function compact(dishes: Array<Dish | undefined>): Dish[] {
  return dishes.filter((d): d is Dish => d !== undefined);
}

function longDay(day: Day): MenuHistoryRow["day"] {
  const map: Record<Day, MenuHistoryRow["day"]> = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
  };
  return map[day];
}

function findDroppedDay(
  before: Map<Day, Dish[]>,
  after: Map<Day, Dish[]>,
  dishId: number,
): Day | null {
  for (const day of ALL_DAYS) {
    const wasIn = (before.get(day) ?? []).some((d) => d.id === dishId);
    const stillIn = (after.get(day) ?? []).some((d) => d.id === dishId);
    if (wasIn && !stillIn) return day;
  }
  return null;
}

/**
 * Re-bucket capped day-level dish lists back into per-(day, meal) slots,
 * preserving the original slot order. Any dish dropped by the cap is simply
 * absent from the returned slot's `dishes`.
 */
function projectCapBackToSlots(
  preCap: GeneratedWeekSlot[],
  cappedByDay: Map<Day, Dish[]>,
): GeneratedWeekDay[] {
  const slotsGrouped = new Map<Day, GeneratedWeekSlot[]>();
  for (const day of ALL_DAYS) slotsGrouped.set(day, []);
  for (const slot of preCap) {
    slotsGrouped.get(slot.day)?.push(slot);
  }

  const days: GeneratedWeekDay[] = [];
  for (const day of ALL_DAYS) {
    const remaining = new Set<number>((cappedByDay.get(day) ?? []).map((d) => d.id));
    const slots = (slotsGrouped.get(day) ?? []).map((slot) => ({
      day: slot.day,
      meal: slot.meal,
      dishes: slot.dishes.filter((d) => remaining.has(d.id)),
    }));
    // Skip days with no slots (Sun is not scheduled at all).
    if (slots.length === 0) continue;
    days.push({ day, slots });
  }
  return days;
}

export interface RankCandidatesForSlotArgs {
  weekStart: string;
  day: Day;
  meal: Meal;
  library: Dish[];
  history: MenuHistoryRow[];
  season: Season;
  ingredients: Ingredient[];
  packSizes: PackSizeHeader[];
  /**
   * Dishes already locked into the in-progress week. Used to build the same
   * §6 consolidation ledger, the same §3.1 weekLunchCarbs, and the same §4
   * step 2 same-day breakfast Primary Ingredient that generateWeek used.
   */
  currentWeekPicks?: Dish[];
  /** Optional sibling input: the breakfast pick already on the same day. */
  sameDayBreakfastPick?: Dish;
  lastSaturdayMenu?: 3 | 4 | null;
}

/**
 * Returns a flat ranked list of alternative dishes for a single slot. Used by
 * the swap UI ("Replace with..."). Reuses the same composition + priority +
 * consolidation pipeline as generateWeek, but applied to one slot only.
 *
 * Where the slot has multiple positions (Menu 1 has HP + partner + carb), we
 * union the pools and dedupe by id, preserving the highest rank. This matches
 * the swap UX: the user is offered any eligible alternative for any slot of
 * the meal, ranked by §4.
 */
export function rankCandidatesForSlot(args: RankCandidatesForSlotArgs): Dish[] {
  const {
    weekStart,
    day,
    meal,
    library,
    history,
    season,
    ingredients,
    packSizes,
    currentWeekPicks = [],
    sameDayBreakfastPick,
    lastSaturdayMenu,
  } = args;

  // Reconstitute the SlotPlan with the same itemCount + lunchMenu generateWeek
  // would have used (subject to substitution being signalled via currentWeek-
  // Picks, which the caller can pre-apply; the swap UI calls this for one
  // slot at a time without re-running substitution).
  const schedule = weekSchedule({ weekStart, lastSaturdayMenu });
  const slot = schedule.find((s) => s.day === day && s.meal === meal);
  if (!slot) return [];

  // Rebuild a ledger and weekLunchCarbs from currentWeekPicks.
  let ledger: IngredientLedger = emptyLedger(packSizes);
  for (const dish of currentWeekPicks) {
    ledger = applyPick(ledger, dish, ingredients);
  }
  const weekLunchCarbs = currentWeekPicks.filter(
    (d) => d.category === "Chapati" || d.category === "Rice",
  );

  // Synthetic within-week history so already-picked dishes rank as recently
  // cooked. The caller is responsible for not double-counting the slot being
  // ranked (i.e. not including its current pick in currentWeekPicks).
  const inWeekHistory: MenuHistoryRow[] = currentWeekPicks.map((d) => ({
    weekStart,
    day: longDay(day),
    meal,
    dishName: d.name,
    dishId: d.id,
  }));

  const candidateSet = composeSlot({
    slot,
    library,
    history: [...history, ...inWeekHistory],
    season,
    weekLunchCarbs,
  });

  const sameDayPrimary =
    meal === "Lunch" && sameDayBreakfastPick ? sameDayBreakfastPick.primaryIngredient : undefined;

  const context: ConsolidationContext = { ledger, ingredients };

  const pools = poolsOf(candidateSet);
  const ranked: Dish[] = [];
  const seen = new Set<number>();
  for (const pool of pools) {
    const r = rankCandidates({
      pool,
      history: [...history, ...inWeekHistory],
      sameDayBreakfastPrimaryIngredient: sameDayPrimary,
      consolidationContext: context,
    });
    for (const dish of r) {
      if (seen.has(dish.id)) continue;
      seen.add(dish.id);
      ranked.push(dish);
    }
  }
  return ranked;
}

/**
 * Union of all position pools inside a candidate set, in their natural order.
 * Used by rankCandidatesForSlot to flatten the per-position pools that
 * composition.ts exposes into one ranked list for the swap UI.
 */
function poolsOf(set: CandidateSet): Dish[][] {
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
