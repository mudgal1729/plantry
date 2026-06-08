# Plantry Learnings

Design decisions and product direction for Plantry. Used as memory across sessions and as a brief for the eventual PWA.

---

## Rule design

### Tags over columns
Started with separate boolean columns (HP, complete_meal, etc.) and consolidated into one comma-separated `Tags` column. Easier to extend; rules reference tag presence directly. New tags only when they unlock distinct rule logic — not for descriptive labeling.

### Solve structurally, not by dish name
"Stuffed parathas don't need an extra dry/gravy" was first solved by hardcoding dish names. The right fix was the `complete_carb` tag, so the rule reads as a property check, not a name check. Default approach: turn special cases into tags.

### Fold edge cases into core rules
A "Carb–Plate Pairing" section was considered to prevent rice + dry-only plates. The issue only appears in Menu 1, so the fix lives inside Menu 1 ("if HP dish is dry, add a non-HP gravy"). Don't create cross-cutting sections when an inline conditional in the relevant menu does the job.

### Simulate before adding rules
A 5-week simulation surfaced four issues invisible in single-week tests: rice + dry-only conflict, keto pool too small, mislabeled HP carbs, dry HP + carb leaving no gravy. Always simulate forward before locking rules.

### Soft rules need soft language
The ingredient-reuse rule was almost framed as a hard preference. Reframed as suggestive with explicit lower priority (variety > no-repeat > preferred balance > consolidation). When adding a secondary rule, make its lower priority explicit in the wording — ambiguity leads to mechanical over-application.

### Don't materialize what can be inferred
We almost built `ingredient_master.md` with MOQ, category, and notes columns. None earned its place: category is inferable from name, notes were trivia, MOQs are store-dependent and the categorical knowledge ("chicken is high-MOQ") drives the heuristic without exact numbers. Before creating a reference file, ask whether the data actually changes outputs.

### Don't generalize from edge cases
A `canonical_name` / `buy_as` column was proposed to solve Chicken/Chicken Breast duplication. Investigation showed only 2 ingredient pairs in the entire dataset needed it. Fixed those at the data level (Hung Curd → Curd with quantity adjustment) instead of adding a column for everyone. Watch for "this would scale to a system!" thinking when 1–2 fixes will do.

---

## Output

### Decouple display from structure
Internal slots (Option A/B/C, Menu 1/2/3/4) drive *generation*. They never appear in output. Users want "Thursday: Bhindi, Dal tadka, Grilled chicken breast, Roti" — not the menu number. Slot labels stay in the engine and history; they're stripped from views.

### One shareable image at finalization
WhatsApp-friendly mobile card with full week + grocery list is the canonical "locked in" output. Per-day rows + grocery grouped by category. Compact prose during planning; image only at the end.

### Grocery list = what to buy
Don't list pantry staples (flour, oil, salt, common spices, base rice) unless explicitly part of a dish ingredient row. The list is a shopping aid, not a complete inventory.

---

## Data model

### Slot pools need depth
The 3-week no-repeat rule requires roughly 6 unique active dishes for any slot that appears 2x/week. Keto pool was originally 2 dishes (boiled eggs, chicken breast) — broke immediately. Audit slot pools before locking rules.

### Some categories don't fit the dish model
Fruit is tagged as a dish (`fruit` tag, "Seasonal fruit" entry) but exempt from no-repeat tracking. Use tags + carve-outs rather than forcing every category into the standard model.

### Tag categories that earned their place
- `HP`: drives Menu 1/2 split, Menu 3/4 split
- `complete_meal`: standalone lunches with no sides
- `complete_carb`: changes breakfast composition (stuffed parathas)
- `fruit`: exempt from no-repeat, paired with Option A breakfast

---

## Long-term direction (PWA)

Disruptions (travel, eating out, day swaps, dish dislikes) shouldn't be handled by adding rules. They should be handled in the app via direct user control.

### Build priorities

1. **Read-only shared menu view** — both Rajat and Tuhina see this week's menu. Highest immediate value, foundation for everything else.
2. **Day-level overrides** — Skip day, Eat out, Swap with another day, Custom entry. Solves ~80% of disruptions including travel and the Friday/Saturday swap case.
3. **Dish-level swap with auto-suggest** — engine suggests valid alternatives that satisfy the same slot and aren't in the no-repeat window. User just picks.
4. **Shared edit / suggest mode** — both users can edit; changes show with attribution. Lightweight, no heavy approval workflow for a two-person household.
5. **Calendar awareness (later)** — read shared calendar or "mark days unavailable" UI. Generator plans around absences upfront.

### Architectural principles

**Engine vs. data layer separation.** Structural rules live in the engine. User-level disruptions (skips, swaps, locks) are inputs to the engine, not exceptions inside rules. Keeps rules.md from accumulating edge cases.

**Iterative generation, not one-shot.** Lock dishes you want, mark days as constrained, regenerate the rest. The chat-based "generate then tweak" model won't scale to two users with different preferences.

**History as audit log.** Once collaborative, history needs `edited_by` and timestamps. Useful for variance analysis later ("we've had paneer 4 weeks running because Tuhina keeps voting it in").

**Tag system is the extension point.** New constraints (low-spice for sick days, kid-friendly, fasting variants) should be tags + small rule additions, not architectural changes. Keep the tag vocabulary intentional and small.
