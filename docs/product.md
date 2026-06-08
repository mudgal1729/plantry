# Product

Plantry is a weekly meal planner for a two-adult Indian household in Bangalore. Each week it produces a Monday-to-Saturday menu (breakfast and lunch) from a fixed dish library, following composition and selection rules, then a shareable menu image and a grocery list. Sunday is a rest day. The system runs as a small Progressive Web App (PWA) installable on both phones, with a slow review loop that turns accumulated feedback into structural improvements through human-approved pull requests.

## 1. Persona and household

Two adults: Rajat (product owner) and Tuhina (second user). Cooking style is high-protein and lean, with a strong vegetarian baseline and frequent paneer, eggs, chicken, fish, and prawns. Seasonality matters: ingredients shift across Bangalore's three seasons (Summer March to May, Monsoon June to September, Winter October to February). Both users hold equal control of the week; either can swap a dish, drop in a one-off, or leave a comment.

## 2. Weekly loop

| Day | Breakfast | Lunch | Items |
|---|---|---|---|
| Mon, Wed, Fri | 2 items | 3 items | 5 |
| Tue, Thu | 1 item | 4 items | 5 |
| Sat | none | 3 items | 3 |
| Sun | none | none | 0 |

Each week, the engine reads the dish library, the rules, the season, and the recent history, then produces a complete valid menu plus a grocery list. Either user can swap a dish (the engine offers in-slot alternatives), drop in a custom one-off, or leave a comment. Swaps and one-offs apply immediately and are recorded against the week with author and timestamp. Comments do nothing immediately; they queue for the slow loop.

## 3. What Plantry produces

1. **Shared current-week view.** A read-only-by-default page both phones see, with six day cards (Mon to Sat) showing breakfast and lunch dishes, plus a date badge per day and the grocery list below.
2. **Menu image (PNG).** One card per day, day and date badge on the left, meals on the right, grocery list underneath. No internal labels (no "Menu 3", no "weekend", no ingredient-reuse callouts). Calm, kitchen-friendly. WhatsApp-friendly to share at week-start. This is the "locked in" output.
3. **Grocery list.** Grouped in fixed order: Proteins and Dairy, then Pantry, then Vegetables, then Aromatics and Herbs, then Other. Quantities aggregated across the week's dishes. Tracked ingredients (those with a declared pack size) are rounded up to the next pack multiple. Common pantry staples (flour, oil, salt, common spices, base rice) are omitted unless a dish explicitly lists them.
4. **History update.** On finalize, the week's dishes append to the historical record. The record drives the no-repeat (recency) logic on subsequent weeks.

## 4. Principles

These are decision rules. Every change to Plantry (engineer pull request, slow-loop proposal, EM autonomous call) is judged against them.

1. **Right-size the fix.** Before any change lands, state the size of the problem (one-off, small pattern, structural), the smallest level it can be solved at (data row, new tag, rule wording, engine code, UI affordance, infrastructure), and whether the proposed fix generalizes. A single-row data fix beats a new column; a new tag beats a new cross-cutting rule; a UI affordance beats a new rule altogether. Do not generalize from one or two cases.
2. **Solve structurally, not by name.** When a special case appears, identify the property that makes it special and encode that property. Tag presence is preferred over dish-name matching.
3. **Spec and code stay in lockstep.** `docs/engine.md` is the human-readable rules spec; `engine/` is its executable form. Any change to one without the other is a continuous-integration failure.
4. **Two loops, never one.** The fast loop is operational and immediate (swap, one-off, comment). The slow loop is structural and human-approved (library, rules, engine). The fast loop never silently mutates the rules.
5. **Record, do not apply.** Feedback that implies structural change is queued, not applied. The slow loop is the only path by which structure changes.
6. **Non-sycophantic feedback handling.** When feedback arrives, diagnose size and level before proposing a fix. "No change warranted" is a valid output, with a stated reason. Agreeable acceptance of every request is a failure mode.
7. **Decouple display from structure.** Internal labels (Option A/B/C, Menu 1/2/3/4, tag names) never leak to the user-facing output.
8. **Simplicity over flexibility.** Three similar rows beat a premature abstraction. A column earns its place by changing outputs.
9. **Reversibility first.** Fast-loop actions are easily undone. Slow-loop actions are not, so they always pass through human approval.

## 5. Tone

The user-facing output is plain, readable, and uncluttered. No internal jargon, no rule citations, no labels users do not need. Prose in any doc Rajat reads (specs, decision log, PR descriptions, EM status updates) avoids em dashes and long dashes; uses commas, parentheses, semicolons, or sentence breaks. Brief is preferred to long; complete sentences are preferred to fragments.

## 6. Scope (v1)

- Six day cards (Mon to Sat) with breakfast and lunch, plus the grocery list.
- Dish swap with engine-suggested alternatives.
- Custom one-off entry for a single day.
- Comments attached to a dish or day, queued for the slow loop.
- Identity is light: a device-stored "I am Rajat" or "I am Tuhina" profile attributes edits; a shared passcode keeps the URL private. No accounts.

## 7. Out of scope (v1)

- Day-level overrides (skip a day, mark eating out, swap two days). Designed for so they slot in cleanly later; not built in v1.
- Calendar awareness (read shared calendar; mark days unavailable upfront).
- Per-user dietary variants.
- Multi-household support.

## 8. Future scope

- **Day-level overrides.** Fast-follow after v1; solves an estimated 80 percent of weekly disruptions (travel, eating out, day swaps). Data model and UI are designed to accept these without restructuring.
- **Swiggy MCP integration.** A future Convex action consumes the engine's structured grocery list and builds a Swiggy cart via the Swiggy MCP, returning a deep link the user opens to checkout. Three design invariants protect this path:
  1. Ingredient names are canonical and machine-resolvable (one name per ingredient, no spelling drift, no inline qualifiers like "(200g)").
  2. The grocery list is available as structured data via a dedicated query, not parsed from markdown.
  3. Pack sizes live in a machine-readable header table, distinct from per-dish quantity rows.
  Brand preference and substitution policy are future additive fields, not v1 columns. No SKU or store-specific identifier ever lives in the canonical data.
- **Calendar awareness.** Generator plans around stated absences upfront, removes the need for after-the-fact day overrides.
- **Variance analysis.** Once a few months of history accumulates with author attribution, surface patterns like "paneer appears in 70 percent of weeks because Rajat or Tuhina keep voting it in".

## 9. Glossary

- **PWA, Progressive Web App.** A website built so a phone can install it to the home screen and run it full-screen like a native app, with the page cached for instant, offline-tolerant loads. Avoids the app stores; one web codebase serves both phones.
- **Slow loop and fast loop.** The fast loop is what happens this week (swap, one-off, comment), applied immediately to one week. The slow loop is how the system itself evolves (library, rules, engine code), applied via a human-approved pull request.
- **Structural vs operational.** Operational changes are local to one week and reversible. Structural changes touch the library or the rules and affect every future menu, so they pass through review.
- **MCP, Model Context Protocol.** An open standard for letting a language model call external tools through a uniform interface. A Swiggy MCP would expose Swiggy's catalog and cart actions as MCP tools the engine could call.
