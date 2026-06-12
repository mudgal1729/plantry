# Engine

The meal-planning rules. This document is the human-readable specification; `engine/src/` is its executable form. Both must change together; any pull request that edits this document without a paired change in `engine/src/` and `engine/test/` fails CI. See §11 for the parity rule in full.

## 1. Data and Eligibility

Sources:

- `data/dishes/<slug>.md`: dish library, one file per dish (YAML frontmatter for the dish fields, a `## Ingredients` table for its ingredient rows)
- `data/ingredients.md`: ingredient catalog, one row per canonical ingredient, carrying its grocery group, canonical unit, and pack size (present marks a tracked ingredient)
- `data/menu_history.md` (seed) and Convex `weekArchive` (runtime): record of past weeks

A dish is eligible for the current week if Active=Yes and its Seasons include the current Bangalore season.

Bangalore seasons: Summer (March to May), Monsoon (June to September), Winter (October to February). Seasons=All means year-round.

## 2. Weekly Schedule

| Day           | Breakfast | Lunch                      | Items |
| ------------- | --------- | -------------------------- | ----- |
| Mon, Wed, Fri | 2 items   | Menu 1 (3 items)           | 5     |
| Tue, Thu      | 1 item    | Menu 2 (4 items)           | 5     |
| Sat           | (none)    | Menu 3 or Menu 4 (3 items) | 3     |
| Sun           | (none)    | (none)                     | 0     |

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
3. **Ingredient consolidation (§8).** Prefer candidates that consume leftover from earlier picks in the week.
4. **Preferred=Yes** over Preferred=No.

Recency exemptions: dishes with `fruit` tag, and lunch carbs.

## 5. Picker Ranking

§4 ranks generation candidate sets. The picker is the separate ranking the swap and add affordances use when a user opens "Replace with..." or "Add a dish". It answers a different question: given the broad, non-restrictive pool (every Active, in-season, meal-time-matching dish; `docs/product.md` §6 "a ranked picker over the meal-time-matching library", and Principle 4), which alternatives surface first?

The picker does not narrow the pool (Principle 4: a swap may land on any meal-time dish; §3 composition violations are signal for the slow loop, not errors the fast loop blocks). It only orders it. The order is a **head** followed by a **tail**.

**Head ("fits this day").** Every pool dish whose meal-time matches the slot and that is not already placed on that day. Within the head, dishes are ordered by a deterministic score, lower first:

```
headScore(dish) = recencyRank(dish) + proteinPenalty(dish)
```

- **recencyRank** is the dish's zero-based position in the longest-unused ordering of the head: never-cooked dishes first, then oldest last-cooked first, dish id ascending as the final tie-break. A dish's last-cooked date is the most recent matching history row. This is the dominant term. Unlike §4, the picker does not exempt fruit or lunch carbs from recency: a swap is a deliberate user choice, so every dish is ranked by recency uniformly.
- **proteinPenalty** applies to swaps only (a dish is being replaced). It is the protein-band distance between the candidate and the outgoing dish, where a protein band is the per-person derived protein (§9) divided into fixed 5 g buckets. Same band scores zero; each band of distance adds a fraction bounded below 1, so the penalty only ever tie-breaks candidates that share a recencyRank. It can never push a more-recently-cooked dish above a longer-unused one. The effect: among equally fresh options, one in the same protein band as the dish being replaced surfaces first. For adds (no outgoing dish) the penalty is zero and the head is pure recency.

**Tail.** Every other pool dish (the same-day repeats the head excluded), ordered by the same score. The tail keeps the pool complete (nothing is dropped) while pushing dishes the day already has below fresh options.

**Determinism.** No RNG. Every tie resolves through a fixed chain: recencyRank, then proteinPenalty (swaps), then dish id ascending. The same inputs always produce the same order, and input order does not affect output.

## 6. Skipped Days

A skipped day is a fast-loop override applied after generation. Generation itself is untouched: the day keeps its generated dishes in the data so a restore is lossless. What changes is what a skipped day contributes downstream:

- **Grocery list.** A skipped day's dishes contribute nothing to the buy list. The grocery aggregator (whose list shape `docs/product.md` §3 item 3 fixes) accepts an optional set of skipped days and excludes those days' dishes before summing. With no days skipped, the list is exactly as before.
- **History append.** On finalize, the week's dishes append to the historical record that drives the §4 recency rule. A skipped day's dishes were not cooked, so they must not append: recency must not see them. The history-row derivation accepts the same optional set of skipped days and emits zero rows for each.

Both are pure, additive functions: the skipped-day input defaults to none, so every existing caller is unchanged. Wiring the override into the running app (the Convex `skippedDays` field and the "Skipped" rendering on the menu share) is a later slice; the engine functions are skip-aware so that wiring is a thin call-site change.

## 7. Item Cap

Cap: 5 items per weekday, 3 on Saturday.

If §3 composition produces a menu over the cap, drop dishes one at a time:

1. From the dishes with the lowest Satiety value present in the menu
2. Among those, drop the one with the longest Prep Min

Repeat until at the cap.

## 8. Ingredient Consolidation

Tracked: ingredients whose catalog row in `ingredients.md` carries a `Pack Size`. By-weight items (curry-cut chicken, fresh fish sold loose, fresh vegetables) and pantry staples are not tracked (blank `Pack Size`); buy as needed.

Leftover threshold: 50 g.

Process:

1. After each dish is picked, compute leftover for its tracked ingredients: pack size minus dish usage, rounded up to the next pack multiple if a single pack falls short.
2. If leftover is at least 50 g, the next slot needing that ingredient prefers a dish that consumes the leftover.
3. If no such pairing fits §3 composition, accept the leftover (freeze or carry to next week's plan).

Soft consolidation: prefer dishes that share fresh produce already on the buy list (capsicum, tomato, cucumber, onion, mint, coriander). One purchase covering multiple dishes beats two small ones.

## 9. Nutrition

Dish macros are derived, never hand-stored. There is no per-dish protein or carb field and no override field: the single source of truth is each ingredient row's quantity and the catalog's per-100g macros (§10 field reference). `engine/src/nutrition.ts` computes them; correcting one ingredient's macros corrects every dish that uses it.

For one dish:

- **Protein (g per person)** = ( Σ over ingredient rows of `grams × Protein /100g ÷ 100` ) ÷ 2.
- **Carbs (g per person)** = the same with `Carbs /100g` ÷ 2.
- **Protein-to-carb ratio** = protein ÷ carbs (per-person and dish-total give the same ratio); undefined when carbs are zero.

The ÷ 2 is the household basis: every dish serves two and macros display per person.

Grams per ingredient row:

- `g` rows are already grams.
- `pcs` rows convert via the catalog's `Grams per piece` (an egg is about 50 g). A `pcs` row with no `Grams per piece` contributes zero (it cannot be weighed, so it cannot contribute macro mass).
- `ml` rows convert to grams 1:1, assuming a culinary liquid density of about 1 (milk and coconut milk both sit within noise of this for a display macro). No per-ingredient density column exists until a dish needs one (Principle 8).
- A blank `Protein /100g` or `Carbs /100g` reads as zero; an ingredient absent from the catalog contributes zero.

The macros are derived for display and for the reporting layer (below); they are not a §3 composition input or a §4 ranking input. The `HP` tag stays the rule input for high-protein composition; the reporting layer only surfaces drift between the tag and the derived protein.

### 9.1 Reports (non-blocking)

Alongside the blocking validators (§1, §10), a reporting layer in `engine/src/data/validators.ts` produces non-blocking reports, regenerated by `npm run reports` and printed in CI output without failing the build. They carry judgment CI cannot make and feed the slow loop:

- **Coverage report:** the share of active dishes carrying each enrichment field (description, recipe, complexity, photo) and the share of macro-relevant catalog rows carrying macros. Macro-relevant rows are the food groups (Proteins and Dairy, Pantry, Vegetables); aromatics, herbs, and the Other group may stay blank. This is the ratchet the enrichment work burns down; blank macros and unpopulated fields are expected until they are filled, so near-zero coverage is correct, not a failure.
- **Pool-coverage report:** for each §3 composition slot, per season, the count of eligible candidates. Surfaces thin pools (the source of repetition) and flags when a season change strands a slot. The pools come from the live §3 composition functions, so the report cannot drift from the engine.
- **HP-vs-protein consistency:** warns when a dish's derived protein and its `HP` tag disagree, using a high-protein threshold of 20 g per person. Dishes whose macros are not yet populated are skipped, so the report stays silent until macros exist. The `HP` tag remains the rule input; this only surfaces drift.

## 10. Field Reference

**Per-dish file (`data/dishes/<slug>.md`) frontmatter:**

- `id`, `name`: identifiers. The `<slug>` filename is derived from the name (lowercase, hyphenated, punctuation stripped), is unique and permanent, and must match the name; two dishes that share a name are disambiguated by suffixing the id.
- `category`: Gravy dish, Dry dish, Complete meal, Rice, Chapati, Paratha, Bread, Chilla, Accompaniment, Dessert, Keto, Fruit.
- `time`: Breakfast or Lunch.
- `tags` (a list, possibly empty):
  - `HP`: high-protein (paneer, chicken, egg, fish, prawn, soya).
  - `complete_meal`: standalone dish, no sides needed.
  - `complete_carb`: substantial carb needing only an accompaniment.
  - `fruit`: pairs with breakfast Option A; recency-exempt.
- `primaryIngredient`: dominant fresh or packaged ingredient. Drives §4.2 same-day deprioritisation and §8 consolidation. A free categorization label, not required to match a catalog ingredient name. Use `Mixed Veg` when no single vegetable dominates (it never triggers consolidation but does trigger same-day deduplication).
- `preferred`: Yes/No. Used as a tiebreaker in §4.4.
- `active`: Yes/No. Eligibility filter per §1.
- `satiety`: High, Medium, or Low. Used by §7.
- `prepMinutes`: estimated active prep time in minutes. Used by §7 tiebreaker.
- `seasons`: a season list, or `All` for year-round.

Enrichment fields, all optional (absent on a dish parses unchanged; the UI degrades gracefully when missing):

- `complexity`: cooking complexity, one of `Easy`, `Medium`, `Hard`. The data stores only the enum; the plain-language labels ("Easy to cook", "Cook will need some help", "Takes time and effort") live in the UI, not here.
- `skill`: free-text note on the skill a dish demands (e.g. "Comfortable, browning matters").
- `equipment`: free-text note on special equipment (e.g. "Heavy kadhai").
- `buySpecially`: free-text note on an ingredient that must be bought specially.
- `prePrep`: free-text day-before prep; present only when day-before work exists.
- `photo`: filename of the dish photo under `data/dish-photos/`.

**Per-dish file body conventions** (parsed into the dish, both optional):

- The first body paragraph, the prose before `## Ingredients`, is the one-line `description`.
- A `## Recipe` section after the `## Ingredients` table holds numbered steps (`1.`, `2.`, ...); each step parses into one `recipe` entry.

**Per-dish file `## Ingredients` table:** `Ingredient`, `Quantity`, `Unit`. Every `Ingredient` value must resolve to a catalog row by exact name (a blocking validator); a dish may have zero ingredient rows.

**Ingredient catalog (`data/ingredients.md`) columns:**

- `Ingredient`: canonical name, one row per ingredient (the union of all names used across dish ingredient rows plus any tracked ingredient).
- `Group`: the user-facing grocery-list bucket (Proteins and Dairy, Pantry, Vegetables, Aromatics and Herbs, Other).
- `Unit`: the canonical measure (g/ml/pcs) observed for that ingredient.
- `Pack Size`: present marks a tracked ingredient (used by §8); blank marks an untracked staple bought by weight.
- `Grams per piece`: for `pcs`-unit ingredients only (an egg is about 50 g), so §9 nutrition can convert pieces to grams; blank on every other row.
- `Protein /100g`: protein grams per 100 g, the §9 protein input; blank reads as zero.
- `Carbs /100g`: carbohydrate grams per 100 g, the §9 carbs input; blank reads as zero.

## 11. Spec-code parity

`docs/engine.md` is the source of truth for what the engine does; `engine/src/` is the source of truth for how it does it. Both must stay in lockstep. CI enforces this with two checks:

1. Any PR that modifies `docs/engine.md` must also modify at least one file under `engine/src/` and at least one file under `engine/test/`. The check fails with a message naming the missing pair.
2. Each numbered section above corresponds to a module under `engine/src/` plus a paired `engine/test/*.test.ts`: `eligibility.ts` for §1, `schedule.ts` for §2, `composition.ts` for §3, `priority.ts` for §4, `pickerRanking.ts` for §5, `groceryList.ts` (grocery half) and `historyRows.ts` (finalize half) for §6, `cap.ts` for §7, `consolidation.ts` for §8, `nutrition.ts` and the reporting layer in `data/validators.ts` for §9. The simulation harness (`test/simulation.test.ts`) exercises all sections end-to-end against `data/menu_history.md` plus four to six weeks of forward simulation, including a skipped-day week that asserts the §6 property: a skipped day contributes zero grocery rows and zero history rows.

When a rule changes, the order of operations is:

1. Edit this document.
2. Edit the corresponding `engine/src/` module.
3. Update or add tests.
4. Run the simulation harness locally; fix anything that fails.
5. Open the PR.

The slow loop, when it proposes a rule change, follows the same order and bundles all four changes into one PR.
