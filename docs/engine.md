# Engine

The meal-planning rules. This document is the human-readable specification; `engine/src/` is its executable form. Both must change together; any pull request that edits this document without a paired change in `engine/src/` and `engine/test/` fails CI. See §8 for the parity rule in full.

## 1. Data and Eligibility

Sources:
- `data/dishes.md`: dish library (one row per dish)
- `data/ingredients.md`: per-dish ingredient quantities, with a header listing tracked ingredients and their pack sizes
- `data/menu_history.md` (seed) and Convex `weekArchive` (runtime): record of past weeks

A dish is eligible for the current week if Active=Yes and its Seasons include the current Bangalore season.

Bangalore seasons: Summer (March to May), Monsoon (June to September), Winter (October to February). Seasons=All means year-round.

## 2. Weekly Schedule

| Day | Breakfast | Lunch | Items |
|-----|-----------|-------|-------|
| Mon, Wed, Fri | 2 items | Menu 1 (3 items) | 5 |
| Tue, Thu | 1 item | Menu 2 (4 items) | 5 |
| Sat | (none) | Menu 3 or Menu 4 (3 items) | 3 |
| Sun | (none) | (none) | 0 |

Saturday alternates between Menu 3 and Menu 4. Read `menu_history.md` for the most recent Saturday and pick the other menu. If history is empty, pick at random.

At most one weekday lunch per week may substitute Menu 3 or Menu 4 for its default Menu 1 or Menu 2. On the substituted day the lunch item count matches the substituted menu (3 items); the day's total drops accordingly. See §3.2 for the trigger.

## 3. Slot Composition

### Breakfast

Mon, Wed, Fri (2 items), pick exactly one option per day:
- Option A: 1 dish with `complete_meal` tag, plus 1 dish with `fruit` tag
- Option B: 1 dish with `complete_carb` tag, plus 1 breakfast accompaniment (Category=Accompaniment, Time=Breakfast)
- Option C: 1 breakfast main (Category=Dry dish, Time=Breakfast), plus 1 plain breakfast carb (Time=Breakfast, Category in {Bread, Paratha, Chilla}, without `complete_carb` tag)

Tue, Thu (1 item):
- 1 dish with `complete_meal` OR `complete_carb` tag (no accompaniment)

### Lunch

**Menu 1 (Mon, Wed, Fri), 3 items:**
- 1 HP dish (Category=Gravy dish or Dry dish)
- 1 partner: if HP is Dry, pick a non-HP Gravy dish; if HP is Gravy, pick an Accompaniment
- 1 lunch carb (see §3.1)

**Menu 2 (Tue, Thu), 4 items:**
- 1 Keto dish
- 1 non-HP Gravy dish (any satiety)
- 1 non-HP Dry dish
- 1 lunch carb (see §3.1)

**Menu 3 (Saturday), 3 items:**
- 1 dish with both `complete_meal` and HP tags
- 1 Accompaniment
- 1 Dessert

**Menu 4 (Saturday), 3 items:**
- 1 dish with `complete_meal` tag and no HP tag
- 1 Keto dish
- 1 Accompaniment

### 3.1 Lunch carb rule

Default: pick a dish with Category=Chapati.
Constraint: dishes with Category=Rice appear at most once per week.
The recency rule (§4) does not apply to lunch carbs.

### 3.2 Weekday complete meal substitution

One weekday lunch per week may swap its default menu for Menu 3 or Menu 4:
- Menu 3 form (complete_meal+HP + Accompaniment + Dessert) when the lead complete_meal is HP-tagged.
- Menu 4 form (complete_meal + Keto + Accompaniment) when the lead complete_meal is non-HP.

Substitution is triggered when either:
- a. The user requests a specific complete_meal Lunch dish for the week, or
- b. The longest-unused eligible complete_meal Lunch dish (per §4.1) is older than the longest-unused candidate that would otherwise fill the day's protein slot (HP for Menu 1, Keto for Menu 2).

The supporting items (Accompaniment, Dessert) are then picked per §4 from their composition-defined candidate sets. Saturday's own Menu 3/4 alternation (§2) is independent of this weekday substitution.

## 4. Selection Priority

After §3 composition has produced the candidate set for a slot, rank candidates in this order. Each step breaks ties from the previous.

1. **Longest unused.** Sort by last-cooked date in `menu_history.md`, oldest first. Never-cooked counts as longest unused.
2. **Same-day key ingredient deprioritisation.** If breakfast's Primary Ingredient on the same day matches a candidate's Primary Ingredient, deprioritise the candidate. If no viable alternative exists, allow the repeat.
3. **Ingredient consolidation (§6).** Prefer candidates that consume leftover from earlier picks in the week.
4. **Preferred=Yes** over Preferred=No.

Recency exemptions: dishes with `fruit` tag, and lunch carbs.

## 5. Item Cap

Cap: 5 items per weekday, 3 on Saturday.

If §3 composition produces a menu over the cap, drop dishes one at a time:
1. From the dishes with the lowest Satiety value present in the menu
2. Among those, drop the one with the longest Prep Min

Repeat until at the cap.

## 6. Ingredient Consolidation

Tracked: ingredients listed in the pack-size header of `ingredients.md`. By-weight items (curry-cut chicken, fresh fish sold loose, fresh vegetables) and pantry staples are not tracked; buy as needed.

Leftover threshold: 50 g.

Process:
1. After each dish is picked, compute leftover for its tracked ingredients: pack size minus dish usage, rounded up to the next pack multiple if a single pack falls short.
2. If leftover is at least 50 g, the next slot needing that ingredient prefers a dish that consumes the leftover.
3. If no such pairing fits §3 composition, accept the leftover (freeze or carry to next week's plan).

Soft consolidation: prefer dishes that share fresh produce already on the buy list (capsicum, tomato, cucumber, onion, mint, coriander). One purchase covering multiple dishes beats two small ones.

## 7. Field Reference

**`dishes.md` columns:**
- `ID`, `Name`: identifiers.
- `Category`: Gravy dish, Dry dish, Complete meal, Rice, Chapati, Paratha, Bread, Chilla, Accompaniment, Dessert, Keto, Fruit.
- `Time`: Breakfast or Lunch.
- `Tags` (zero or more, comma-separated):
  - `HP`: high-protein (paneer, chicken, egg, fish, prawn, soya).
  - `complete_meal`: standalone dish, no sides needed.
  - `complete_carb`: substantial carb needing only an accompaniment.
  - `fruit`: pairs with breakfast Option A; recency-exempt.
- `Primary Ingredient`: dominant fresh or packaged ingredient. Drives §4.2 same-day deprioritisation and §6 consolidation. Use `Mixed Veg` when no single vegetable dominates (it never triggers consolidation but does trigger same-day deduplication).
- `Preferred`: Yes/No. Used as a tiebreaker in §4.4.
- `Active`: Yes/No. Eligibility filter per §1.
- `Satiety`: High, Medium, or Low. Used by §5.
- `Prep Min`: estimated active prep time in minutes. Used by §5 tiebreaker.
- `Seasons`: comma-separated season list, or `All` for year-round.

**`ingredients.md` columns:**
- `Dish ID`, `Dish Name`, `Ingredient`, `Quantity`, `Unit`.
- A separate header table lists tracked ingredients (those with a Pack Size) used by §6.

## 8. Spec-code parity

`docs/engine.md` is the source of truth for what the engine does; `engine/src/` is the source of truth for how it does it. Both must stay in lockstep. CI enforces this with two checks:

1. Any PR that modifies `docs/engine.md` must also modify at least one file under `engine/src/` and at least one file under `engine/test/`. The check fails with a message naming the missing pair.
2. Each numbered section above corresponds to a module under `engine/src/` (e.g. `eligibility.ts` for §1, `schedule.ts` for §2, `composition.ts` for §3, `priority.ts` for §4, `cap.ts` for §5, `consolidation.ts` for §6) plus a paired `engine/test/*.test.ts`. The simulation harness exercises all sections end-to-end against `data/menu_history.md` plus four to six weeks of forward simulation.

When a rule changes, the order of operations is:
1. Edit this document.
2. Edit the corresponding `engine/src/` module.
3. Update or add tests.
4. Run the simulation harness locally; fix anything that fails.
5. Open the PR.

The slow loop, when it proposes a rule change, follows the same order and bundles all four changes into one PR.
