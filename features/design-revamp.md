# Feature: Design revamp

Execution plan for implementing the first Claude Design handoff (`design_handoff/`, June 2026). Prepared by the EM on 2026-06-11, decisions resolved with Rajat the same day. Read alongside the four canonical specs and `design_handoff/README.md`.

This is not a reskin. The handoff implies a new per-dish data model (photos, descriptions, recipes, macros, complexity, pre-prep), new behaviors (day skipping, dish add and delete, a next-week queue, an Explore tab, a Changes tab, a multi-image share family), and new engine rules (picker ranking, requested dishes, explore ranking, skipped-day handling). The plan lands all of it as one coherent end-state architecture, sliced into serially shippable PRs, with the dish library expansion, an upgraded slow loop, and the future ordering automation designed in from the start.

---

## 0. How to run this plan (resume protocol)

To execute or resume, Rajat opens a session in the main repo directory and says:

> Read `features/design-revamp.md`. We are on slice X.Y.

The session then:

1. Assumes the EM role (`CLAUDE.md`, `docs/development.md` §1). The EM never writes feature code; it spawns engineers in worktrees.
2. Reads this doc fully, plus the four canonical specs.
3. **Verifies actual state before trusting the stated slice.** Check `git log --oneline -15`, `gh pr list --state all --limit 15`, and the status column in the slice index (§5). Git and merged PRs are the truth; if they disagree with "we are on X.Y" or with the table, reconcile and tell Rajat what the real position is before spawning anything.
4. Confirms the slice's dependencies (§5 table) are merged. If not, the dependency runs first.
5. Spawns an engineer via `/new-stream <branch> <stream>` using the slice's branch name and brief (§6 to §8). The brief is the slice's block in this doc plus the standard pointers (`docs/development.md`, definition of done, diagnosis card).
6. Reviews the PR against principles and CI gates, merges, verifies the live deploy, appends the `docs/CHANGELOG.md` entry, removes the worktree.
7. **Status updates ride the PR:** every slice's PR also flips its own row in the §5 table to `shipped (#PR)`. The EM checks this at review. This doc stays accurate without the EM ever committing from the main directory.

Cold start note: until slice 1.1 merges, this file, `design_handoff/`, and the CLAUDE.md/DECISIONS.md planning edits exist only as uncommitted files in the main directory. Slice 1.1's engineer copies them into the worktree as its first act (paths in §6.1).

Multiple slices can be in flight when the §5 table marks them parallel-safe. "We are on slice 5.2 and B1.2" is a valid position.

---

## 1. End-state architecture

The guiding idea: **one canonical home per fact, everything else derived, validators that keep it true, and a slow loop that reads every new signal the system produces.** Where the current system stores a fact in two places (grocery groups in engine code and ingredient names in data; HP tags hand-assigned while protein lives nowhere), the end state stores it once and computes the rest. That is what makes the system self-healing: adding a dish or an ingredient cannot silently break grocery grouping, macro display, or ordering automation, because CI validators check referential integrity on every PR, and the structures the validators cannot judge (taste, repetition, thin pools) flow to the slow loop as reports.

(Referential integrity: the guarantee that every reference between two data sets actually resolves, e.g. every ingredient named in a dish exists in the ingredient catalog. Borrowed from relational databases, where foreign keys enforce it; here CI enforces it on markdown.)

### 1.1 Canonical data layer (git)

**`data/dishes/<slug>.md`, one file per dish.** Replaces the single `data/dishes.md` table and absorbs each dish's rows from `data/ingredients.md`. The dish file is the one place a dish is described. Format: YAML frontmatter for structured fields, markdown body for prose.

(YAML frontmatter: a block of `key: value` metadata fenced by `---` lines at the top of a markdown file; the standard pattern for "structured data plus prose" files. It parses to a typed object and diffs cleanly in PRs.)

```markdown
---
id: 1
name: Chicken masala gravy
category: Gravy dish
time: Lunch
tags: [HP]
primaryIngredient: Chicken
preferred: Yes
active: Yes
satiety: High
prepMinutes: 40
seasons: All
complexity: Medium
skill: Comfortable, browning matters
equipment: Heavy kadhai
buySpecially: Curry cut chicken, 600g
prePrep:                  # optional; present only when day-before work exists
photo: chicken-masala-gravy.jpg   # optional; filename under data/dish-photos/
---

Everyday curry built on slow browned onions.

## Ingredients

| Ingredient | Quantity | Unit |
|---|---|---|
| Chicken | 300 | g |
| Onion | 150 | g |
| ... | | |

## Recipe

1. Brown onions slowly, add ginger garlic paste.
2. Add tomato and spices, cook till oil separates.
3. Add chicken, simmer covered 25 minutes.
```

Field notes:
- `id` stays numeric (Convex tables, history, and archive all key on it). The filename slug is stable once created and never reused.
- `tags` gains `healthy` as a plain tag (Principle 1: a new tag beats a new column; it is a filter, not a rule input).
- `complexity` is a new enum: Easy, Medium, Hard. Plain-language labels ("Easy to cook", "Cook will need some help", "Takes time and effort") live in the UI layer, not in data (Principle 7, display decoupled from structure).
- `prepMinutes` remains the single time field; the UI labels it "Time". No second time column.
- The first body paragraph is the one-line description. `## Recipe` holds numbered steps.
- `skill`, `equipment`, `buySpecially`, `prePrep`, `photo`, description, and recipe are all **optional during the transition**; the UI degrades gracefully when they are missing (see §1.5 on the coverage ratchet).

**`data/ingredients.md` becomes the ingredient catalog**, one row per canonical ingredient, the single source of truth for everything per-ingredient:

```
| Ingredient | Group | Unit | Pack Size | Grams per piece | Protein /100g | Carbs /100g |
```

- `Group` is the grocery-list group (Proteins and Dairy, Pantry, Vegetables, Aromatics and Herbs, Other). This **replaces the hand-maintained `GROCERY_GROUPS` map in `engine/src/groceryList.ts`**, which is today a second copy of the ingredient list living in code: exactly the dual-home fact this revamp eliminates. The map's documented judgment calls (onion and tomato under Aromatics, coconut milk under Pantry, and so on) carry over verbatim.
- `Pack Size` present means tracked (drives consolidation and pack rounding); blank means untracked. Same semantics as today's header table, now one table for all ingredients.
- `Grams per piece` applies only to `pcs`-unit ingredients (an egg is about 50 g) so macro math can convert pieces to grams.
- `Protein /100g` and `Carbs /100g` power derived dish macros (§1.2). Blank reads as zero and shows up in the coverage report; spices and aromatics can stay blank forever, protein sources and staples cannot.
- This table is exactly the machine-readable surface the Swiggy ordering automation needs (product.md §8 invariants 1 and 3): canonical names, no qualifiers, pack sizes in their own column. Brand preference and substitution policy slot in later as additive columns.

**Unchanged:** `data/menu_history.md`, `data/changelog.md`. **New:** `data/dish-photos/<slug>.jpg` (web-ready images committed to the repo, copied into the PWA bundle at build time) and `data/dish-photos/STYLE.md` (the photo style spec, §4.2).

### 1.2 Derived data (computed, never hand-entered)

- **Dish protein and protein-to-carb ratio** are computed by a new engine module from the dish's ingredient quantities times the catalog's per-100g macros, divided by two (the household basis: every dish serves two, macros display per person). Adding a dish never involves typing a protein number; correcting one ingredient's macros corrects every dish that uses it. A per-dish override field is deliberately **not** included until a real dish needs one (Principle 8).
- **Last cooked** derives from `menu_history.md` plus the Convex `weekArchive`; it is never stored on the dish.
- **HP-tag consistency check:** a validator warns when a dish's computed protein and its HP tag disagree. The HP tag remains the rule input; the validator only surfaces drift. Whether HP eventually becomes fully derived from a threshold is a future slow-loop question, not part of this revamp.

(The pattern is "single source of truth with derived views": store the primitive facts once, compute presentation facts from them. The alternative, storing protein per dish by hand, goes stale silently; 200 hand-entered numbers with no validator is how data rots.)

### 1.3 Validators and reports (the self-healing layer)

An expansion of `engine/src/data/validators.ts` plus a CI step. Two severities:

**Blocking (CI fails):**
- Every dish ingredient resolves to a catalog row, exact name match. This is the anti-spelling-drift gate that protects ordering automation.
- Every catalog row has a Group; every `pcs` ingredient with macros has Grams per piece.
- Frontmatter parses and validates against the Zod schema; ids unique; slugs unique and matching filenames.
- A declared `photo` file exists in `data/dish-photos/`.
- Round-trip: parse then serialize is byte-identical, per file (existing discipline, new file layout).

**Reporting (printed in CI output, regenerated by a `npm run reports` script, consumed by the slow loop, never blocking):**
- **Coverage report:** percent of active dishes with description, recipe, complexity, photo; percent of macro-relevant catalog rows with macros. The enrichment work (§4) burns this down; the report is the ratchet that shows progress and catches regressions.
- **Pool-coverage report:** for each composition slot in `docs/engine.md` §3, per season, the count of eligible candidates. Thin pools (today: Chilla 1, Bread 1, Chapati 1, Fruit 1, Rice 4, Dessert 5, Keto 7) are where repetition comes from; this report directs the library expansion (§4.3) and flags when a season change strands a slot.
- **HP-vs-protein consistency** (per §1.2).

### 1.4 Engine additions (each is an engine.md section + module + tests, per the parity rule)

Four new rule areas, written as new numbered sections in `docs/engine.md` (renumbered so the parity section stays last; all cross-references updated in the same PR so the spec reads as one coherent document, not an appendix trail):

1. **Picker ranking** (`engine/src/pickerRanking.ts`). The swap and add pickers currently reuse §4 priority; the handoff specifies a richer ranking: meal-time match, not already in the day, recency, and protein-band similarity to the outgoing dish (for swaps). This becomes its own spec'd rule: the "fits this day" head of the picker is ranked by recency plus protein similarity; the tail is the rest of the meal-time-matching library. The handoff README flags the prototype heuristics as design intent, not spec; this section is where they become spec, with exact deterministic scoring.
2. **Requested dishes** (`engine/src/requests.ts`). `generateWeek` gains a `requests` input: dish ids the next generation must place (fed by the next-week queue, §1.5). This generalizes the existing §3.2 trigger (a) into one mechanism: a requested dish is placed into a slot whose composition accepts it, overriding recency. A request that cannot be placed (composition never accepts it, out of season) produces an incident and stays queued for the following week. Kept deliberately minimal: a list of dish ids, not a generic directive language; calendar awareness can extend it later if it earns it.
3. **Skipped days.** A skipped day keeps its generated dishes in the data (restore must be lossless) but contributes nothing to the grocery list and nothing to the history append on finalize (the dishes were not cooked, so recency must not see them). The menu share image renders the day as "Skipped". Generation itself is untouched; skipping is a fast-loop override.
4. **Explore ranking** (`engine/src/explore.ts`). Eligible (active, in-season), never-cooked dishes, ranked familiar-but-new: affinity to cooking history via shared primary ingredient frequency, protein band proximity to the household's cooked median, and category familiarity. The "why it fits" line in the UI derives from whichever affinity signal dominated, phrased plainly with no internal labels.

Plus one supporting module with no rule semantics: **nutrition derivation** (`engine/src/nutrition.ts`, per §1.2), documented in engine.md's field reference.

### 1.5 Convex schema and functions

All changes are **additive** (new optional fields, new union members, new table), so existing rows validate against the new schema and no wipe-and-regenerate is needed. The one near-miss is `manualChanges.meal`/`position` becoming optional for day-level kinds, which is safe because loosening required to optional keeps existing rows valid.

- `currentWeek`: add optional `skippedDays: array of { day, reason, author, skippedAt }`; add optional `includeRecipe: boolean` to each dish entry (lives on the week, so it resets naturally when a new week document is created).
- `manualChanges.changeKind`: add `"delete" | "add" | "skip_day" | "restore_day" | "save_next_week"`. `meal` and `position` become optional (meaningless for day-level kinds). `before`/`after` use null entries for add and delete. This table plus `comments` is the data behind the Changes tab; no new activity table is needed.
- New table `nextWeekQueue`: `{ createdAt, author, dishId, reason, status: "queued" | "placed" | "dropped", consumedWeekStart: string | null }`. The generation run reads queued rows as `requests`, marks placed ones `placed` with the week, and leaves unplaceable ones queued (incident logged). The slow loop may mark stale rows `dropped` (§1.8).
- New mutations (each writing its `manualChanges` row in the same transaction, same pattern as `swapDish`): `deleteDish`, `addDish` (library dish into a day, appends a position), `skipDay`, `restoreDay`, `saveForNextWeek`, plus `setIncludeRecipe` (share preference, not a menu change, so it does **not** write a manualChanges row).
- Queries: activity feed (manualChanges for the week; the client merges in the existing comments query), explore feed (engine explore ranking joined with archive-derived last-cooked), grocery list excluding skipped days.
- `weekArchive` append on finalize excludes skipped days' rows.
- Convex file naming stays camelCase (hyphenated filenames silently break the Deploy Convex action; verify the action after every `app/convex/` merge).

The dish library (now with photos, recipes, macros) continues to reach the frontend via the build-time bake, not via Convex: library changes already require a PR and deploy, so static bundling stays correct, and it keeps Convex bandwidth at zero for the heaviest data.

### 1.6 PWA (full rebuild to the handoff)

Four tabs: Menu, Grocery, Explore, Changes. Editing is day-level or dish-level only, entered from a day card's Edit button; meal blocks are never edited as a unit. Every screen, overlay, and token ports from `design_handoff/` (tokens verbatim into `app/web/src/index.css`). Old components (`CurrentWeekView`, `SlotEditor`, the comments sidebar) retire. Dish photos render with a graceful no-photo fallback (text-only card) so partial photo coverage never looks broken. Day-level comments keep an entry point: a "Comment on this day" affordance on the Day screen, alongside the handoff's dish-level entry in the details sheet. The prototype's behaviors are the contract; its implementation (window globals, localStorage state) is not: the real app keeps Convex subscriptions and optimistic concurrency exactly as today.

### 1.7 Share output (image family)

The single weekly PNG becomes a family sent together: menu image, grocery image, then one recipe sheet per dish marked "include recipe when sharing". Rendered client-side from the same React components the share preview uses (DOM-to-image: a library walks the rendered DOM and paints it to a canvas, producing a PNG without a server; `html-to-image`, approved). Shared via the Web Share API (the browser API behind the native share sheet; level 2 supports sharing files, works in installed PWAs on both iOS and Android Chrome), with download-all as the fallback. This replaces the headless-render Convex action described in `docs/engineering.md` §12; that section gets rewritten in slice 8. `data/menu_images/` stays as the historical archive only.

### 1.8 Slow loop, upgraded to read every new signal

The revamp multiplies what the slow loop can learn from, and the slow-loop machinery (`MAINTENANCE.md`, `.claude/commands/slow-loop.md`, the mark-applied action, the fixtures) is updated in two stages: mechanical path updates ride the slices that move the files (lockstep, so the spec never points at dead paths), and a dedicated slice (slice 9) does the value upgrade. The end state:

**New signal channels the slow loop clusters on:**
- **Skip reasons.** Recurring "eating out Friday" or travel skips are precisely the day-override and calendar-awareness signal product.md §8 anticipates. Three Friday skips in a month is a pattern worth a structural look; one is not.
- **Delete patterns.** Repeated deletes from the same slot type read as over-generation (item count, satiety mix); the right-size answer may be a cap or composition adjustment.
- **Add patterns.** Repeated manual adds of the same category read as under-generation.
- **Save-for-next-week patterns.** A dish queued repeatedly is a dish the engine under-picks: maybe `preferred` should flip, maybe its recency treatment is wrong. Stale queued rows (saved but never placed for weeks) are also signal; the slow loop may mark them `dropped` with a reason.
- **Unplaceable requests.** A queued dish that composition keeps rejecting (incident trail) means either the dish is mis-categorized or the composition is too rigid. Both are classic right-size calls.
- **Dish-level comment volume per dish** (the new entry point will raise comment frequency; per-dish clustering becomes natural).

**Proactive inputs, not just reactive ones.** The slow loop also reads the coverage report and the pool-coverage report each run. Even a week with zero comments can produce a useful PR: "Monsoon strands the Dessert slot at 2 candidates, propose activating X and Y" or "12 dishes still lack recipes, here is the next enrichment batch priority". This is the self-healing half the validators cannot do alone: validators keep facts true, the slow loop keeps the library good.

**Targets change.** The slow loop edits `data/dishes/<slug>.md` files and catalog rows instead of table rows in two monolithic files. One dish change is one file diff, which makes slow-loop PRs materially easier for Rajat to review.

**Mark-applied closes the loop for the queue too.** The PR-body cluster blocks gain a `next_week_queue_ids:` key, and a new internal mutation marks consumed queue rows, so a slow-loop decision about a stale saved dish gets written back to Convex like every other consumed signal.

---

## 2. Folder and canonical-doc structure review (2026-06-11)

Conclusions from reviewing the repo structure against the docs that describe it:

1. **The four-canonical-docs structure holds.** No new canonical doc is needed: design truth deliberately lives in the live app plus `design_handoff/` (per `claude-design.md`), not in a `docs/design.md`. The revamp changes what the docs say, not what docs exist.
2. **Root inventory drift, fix in slice 1.** `docs/engineering.md` §14 and `MAINTENANCE.md` §2.9 list a root inventory that no longer matches reality: `scripts/`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.base.json`, `eslint.config.js`, and `vercel.json` exist at root but are not listed; `design_handoff/` and `claude-design.md` are new permanent residents (the design contract requires the handoff folder at root). The CI structure check, engineering.md §14, and MAINTENANCE.md §2.9 must agree on one list; slice 1 aligns all three.
3. **`data/` layout changes** (dishes/, dish-photos/) update engineering.md §2 and §14 in slice 1; `data/menu_images/` stays as archive.
4. **Feature spec lifecycle:** this file moves to `archive/features/design-revamp.md` when slice 10 ships, per the existing convention; CLAUDE.md's "Currently building" line returns to "_none_".
5. **Slow-loop spec accuracy:** `MAINTENANCE.md` and `.claude/commands/slow-loop.md` reference `data/dishes.md`/`data/ingredients.md` throughout; slice 1 updates paths mechanically, slice 9 upgrades substance (§1.8).

---

## 3. Decisions (resolved 2026-06-11 with Rajat, plus EM defaults)

| # | Decision | Outcome |
|---|---|---|
| 1 | Day-skipping scope pull-forward | **Confirmed.** product.md §7/§8 amended when slice 5 ships it. |
| 2 | Share image family replaces single PNG | **Confirmed.** product.md §3 and engineering.md §12 rewritten in slice 8. |
| 3 | Day-level comments | **Kept**, via "Comment on this day" on the Day screen (slice 5.2). |
| 4 | Photos | **AI-generated**, one consistent style across the existing library AND all expansion batches. A committed style spec (`data/dish-photos/STYLE.md`: prompt template, framing, lighting, plating, crop) is the consistency mechanism; every photo, current or future, is generated from it. |
| 5 | New libraries: `yaml`, `html-to-image` | **Approved.** engineering.md §1 updated in the slices that introduce them (1 and 8). |
| 6 | Expansion target ~200 active dishes | **Confirmed.** Four batches of ~20 (§4.3). |
| 7 | Tab name | EM default: **"Changes"** (matches the summary line's language; Activity/Logs/Journal read as software words). Override any time before slice 6. |
| 8 | Reason on "save for next week" | EM default: **required**, one uniform rule for every fast-loop write; reasons feed the slow loop's save-pattern signal (§1.8). |
| 9 | Explore hides dishes already placed this week or queued for next | EM default: **yes** (the tab's promise is "new on the plate"; showing something already scheduled breaks it). |
| 10 | "Include recipe when sharing" resets weekly | EM default: **yes** (it marks "this week's tricky dish", not a permanent property; permanent would re-attach stale recipes forever). |
| 11 | Delete may leave a day below its composition shape | EM default: **allowed** (the fast loop is permissive by principle; swaps already skip composition checks; the share image simply shows fewer items). |

EM defaults are logged in `DECISIONS.md` and reversible until their slice ships; say the word to flip any.

---

## 4. Content tracks (parallel to the engineering spine)

### 4.1 Enrichment of the existing 121 dishes (track B1)

Descriptions, recipes, complexity, cook fields. Batches of ~30, branch `data/enrichment-<n>`, LLM-drafted and household-calibrated (serves two, Bangalore ingredients, the handoff's recipe voice of three to five short steps), reviewed by Rajat personally since recipes and descriptions are taste. The coverage report is the progress meter; the UI never blocks on coverage. This amends a development.md anti-pattern ("touching the dish library outside a slow-loop PR"): feature-sanctioned content batches with Rajat review become the second legitimate path for canonical-data PRs; development.md §9 is updated in slice 1.

### 4.2 Photos (track B2)

First deliverable is `data/dish-photos/STYLE.md`: the committed prompt template and style parameters every photo is generated from, so the 121 existing dishes and all ~80 expansion dishes look like one photographer shot them. Images are generated outside the session (Claude Code cannot generate images), dropped into `data/dish-photos/` slug-named and pre-sized for web (no image-processing dependency needed), and land in batch PRs alongside or after enrichment batches. CI validates declared photos exist; the UI's no-photo fallback covers the gap until coverage completes.

### 4.3 Library expansion, 121 to ~200 (track B3)

Starts only after enrichment batches are flowing, so every new dish ships complete on arrival (full frontmatter, ingredients resolving to the catalog, recipe, macros derived, photo from the style spec); the library never becomes two-tier. Four batches of ~20 (`data/expansion-<n>`), each chosen by the pool-coverage report rather than by whim: the thin composition pools (Chilla 1, Bread 1, Chapati 1, Fruit 1, Rice 4, Dessert 5, Keto 7, plus breakfast at 28 of 121) are where new dishes most reduce repetition. Candidates respect the household profile (high-protein lean, vegetarian baseline, paneer/egg/chicken/fish/prawn rotation, three-season Bangalore seasonality). New ingredients arrive with Group, pack size where tracked, and macros, enforced by validators. Rajat reviews every batch; dishes he would not actually cook get cut in review, not after. Explore is the consumer: new dishes are never-cooked by definition, so expansion directly feeds the familiar-but-new rail.

---

## 5. Slice index (the x.y map)

Statuses: `not started`, `in progress (branch)`, `shipped (#PR)`. Every slice's PR updates its own row.

| Slice | Stream/branch | Scope (one line) | Depends on | Parallel-safe with | Status |
|---|---|---|---|---|---|
| 1.1 | `feat/J-bookkeeping` | Commit plan, handoff, planning edits; align root inventories | none | none | shipped (#31) |
| 1.2 | `feat/J-dish-files-catalog` | Per-dish files + ingredient catalog migration, validators, golden master | 1.1 | none | shipped (#32) |
| 2.1 | `feat/K-enrichment-schema` | Enrichment frontmatter schema, nutrition.ts, reports | 1.2 | none | shipped (#34) |
| 2.2 | `data/enrichment-0` | Catalog macros populated; first ~30 dishes enriched | 2.1 | none | shipped (#35) |
| 3.1 | `feat/L-picker-skips` | Picker ranking + skipped days (spec + engine + tests) | 2.1 | 2.2, B-track | shipped (#36) |
| 3.2 | `feat/L-requests-explore` | Requested dishes + explore ranking (spec + engine + tests) | 3.1 | 2.2, B-track | not started |
| 4.1 | `feat/M-convex-schema` | Schema extensions, nextWeekQueue, six mutations | 3.2 | B-track | not started |
| 4.2 | `feat/M-convex-queries` | Feed/explore/grocery queries, generation consumes queue, archive skip-exclusion | 4.1 | B-track | not started |
| 5.1 | `feat/N-pwa-shell` | Tokens, primitives, tab bar, Menu + Grocery read-only, photo fallback | 4.2 | B-track | not started |
| 5.2 | `feat/N-pwa-editing` | Day screen + full editing family + comments entry points | 5.1 | B-track | not started |
| 6.1 | `feat/O-changes-tab` | Changes tab + summary line; old comments sidebar retires | 5.2 | 7.1, 8.1, 9.1 | not started |
| 7.1 | `feat/P-explore` | Explore tab + use-this-week + next-week flow | 5.2 | 6.1, 8.1, 9.1 | not started |
| 8.1 | `feat/Q-share-family` | Share image family, includeRecipe toggle, Web Share | 5.2 | 6.1, 7.1, 9.1 | not started |
| 9.1 | `feat/R-slow-loop-upgrade` | Slow loop reads new signals + reports; mark-applied + fixtures updated | 4.2 (and 2.1 for reports) | 5.x, 6.1, 7.1, 8.1 | not started |
| 10.1 | `docs/maintenance-<date>` | product.md full rewrite to current state; /reconcile-docs sweep; archive this spec | 6.1, 7.1, 8.1, 9.1 | B-track tails | not started |
| B1.1–B1.3 | `data/enrichment-<n>` | Remaining ~90 dishes enriched, ~30 per batch | 2.2 | everything | not started |
| B2.1 | `data/photos-style` | STYLE.md photo spec + first photo batch | 2.1 | everything | in progress (#PR — STYLE.md committed; first photo batch pending external image generation) |
| B2.2+ | `data/photos-<n>` | Photo batches to full coverage | B2.1 | everything | not started |
| B3.1–B3.4 | `data/expansion-<n>` | ~80 new dishes, ~20 per batch, pool-report-driven | 2.2, B1 flowing | everything | not started |

The serial spine is 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 4.1 → 4.2 → 5.1 → 5.2, then 6.1/7.1/8.1/9.1 fan out in parallel, then 10.1 closes. B-track runs alongside from 2.2 onward. (9.1 can start any time after 4.2; it needs the new manualChanges kinds and the reports to exist.)

---

## 6. Slice briefs, spine

Each block is the core of the engineer brief. The EM adds the standard wrapper: read `docs/development.md`, diagnosis card required, CI gates, definition of done, screenshot for UI slices.

### 6.1 Bookkeeping + structure alignment

Copy into the worktree and commit: `features/design-revamp.md`, `design_handoff/` (whole folder), `claude-design.md`, the updated CLAUDE.md "Currently building" line, the DECISIONS.md planning entries. Align the three root-inventory lists (CI structure check, `docs/engineering.md` §14, `MAINTENANCE.md` §2.9) with actual reality including `scripts/`, the root config files, `design_handoff/`, and `claude-design.md`. Update development.md §9's canonical-data anti-pattern to sanction reviewed content-batch PRs (`data/enrichment-*`, `data/photos-*`, `data/expansion-*`) and add those branch conventions to development.md §2. No behavior change anywhere. Diagnosis card: trivial-tier.

### 6.2 Data foundation (per-dish files + ingredient catalog)

The riskiest structural move, done alone. A one-shot migration script (in `scripts/`, deleted in the same PR after its output is committed) explodes `data/dishes.md` + `data/ingredients.md` into `data/dishes/<slug>.md` files and the catalog, carrying existing fields only (no enrichment fields yet). Parsers (`yaml` dependency, approved), serializers, round-trip tests, and the bake step move to the new layout. Grocery grouping moves from the `GROCERY_GROUPS` code map into the catalog's Group column, values verbatim. Blocking validators from §1.3 land. Mechanical path updates in MAINTENANCE.md, `.claude/commands/slow-loop.md`, engineering.md §2/§4/§14, engine.md §1/§7 (lockstep: nothing may reference the dead paths after merge).

**The gate: a golden-master test.** Before migrating, capture `generateWeek`'s exact output for fixed inputs (pinned week, season, history, RNG); after, the same inputs must produce byte-identical output. Delete the golden master in the same PR once it passes. (A golden-master test pins current behavior as a snapshot so a pure refactor can prove it changed nothing.)

### 6.3 Enrichment schema + derived macros (2.1)

Frontmatter gains optional `complexity`, `skill`, `equipment`, `buySpecially`, `prePrep`, `photo`; body conventions for description and recipe parse into the Dish type. Catalog gains Grams per piece, Protein /100g, Carbs /100g columns (schema only; population is 2.2). `engine/src/nutrition.ts` derives per-dish protein and protein-to-carb ratio (per person, dish divided by two). HP-consistency check, coverage report, pool-coverage report, `npm run reports`. engine.md field reference + nutrition section with src and test pairing for the parity gate. App visually unchanged.

### 6.4 First content pass (2.2)

Populate macros for all current catalog rows (standard nutrition-table values, spot-checked; blank only where genuinely negligible). Enrich ~30 dishes end to end (description, recipe, complexity, cook fields) to prove the content pipeline and the review loop with Rajat. Coverage report shows the burn-down.

### 6.5 Engine rules, first half (3.1)

Picker ranking and skipped days, per §1.4 items 1 and 3. New engine.md sections, renumbered coherently, parity section last, cross-references updated. `getSlotAlternatives` switches to the new picker ranking in this PR so spec and shipped behavior match from day one. Simulation harness gains a skipped-day week; property test: skipped days contribute zero grocery rows and zero history rows.

### 6.6 Engine rules, second half (3.2)

Requested dishes and explore ranking, per §1.4 items 2 and 4. Property test: a requested dish appears exactly once or produces an incident. Both ship engine-side and dormant until 4.x and 7.1 wire them up; they are pure functions, fully tested, which is how the engine is meant to grow.

### 6.7 Convex schema + mutations (4.1)

Everything in §1.5's first four bullets: schema extensions (all additive; verify against existing rows), `nextWeekQueue`, the six mutations with their manualChanges rows in-transaction. camelCase filenames; verify the Deploy Convex action post-merge. Current frontend keeps working untouched.

### 6.8 Convex queries + generation wiring (4.2)

Feed, explore, and skip-aware grocery queries; `generateCurrentWeek` consumes queued `nextWeekQueue` rows as engine `requests` and marks them; finalize excludes skipped days from `weekArchive`. engineering.md §3/§5 updated.

### 6.9 PWA shell (5.1)

Tokens from `hifi-tokens.jsx` verbatim into `index.css`; primitives (day card, dish row, sheet, chips, avatar, buttons, tab bar); restyled passcode gate and identity picker; Menu screen (day cards with photos and pre-prep markers, change-summary placeholder, week header); Grocery screen. Photo fallback. Read-only: editing still goes through the old SlotEditor until 5.2 (keep it reachable, unstyled is acceptable for one slice). EM clicks through on a phone-sized viewport before merge.

### 6.10 PWA editing (5.2)

Day screen and the full editing family: details-and-recipe sheet, action sheet, swap picker (new ranking), add-a-dish with one-off fallback, delete, skip and restore, reason dialog with quick chips, dish comments in the details sheet, "Comment on this day" on the Day screen. Old `CurrentWeekView`/`SlotEditor` retire. product.md §2/§6/§7 minimal lockstep edits (day skipping enters scope; full rewrite waits for 10.1).

### 6.11 Changes tab (6.1)

Feed over manualChanges + comments, the Menu summary line wired to real data, old comments sidebar fully retired. All five manualChanges kinds plus comments render with author, time, reason.

### 6.12 Explore tab (7.1)

Explore feed query + filters (Easy to cook, Healthy, Breakfast, Lunch) + dish sheet opening with recipe visible + "Use this week" (day picker, `addDish`) + "Next week" (`saveForNextWeek`). Hides dishes placed this week or queued (decision 9).

### 6.13 Share family (8.1)

Menu, grocery, and recipe share-image components; includeRecipe toggle wiring; swipe-rail preview; `html-to-image` render; Web Share with download fallback. Rewrites engineering.md §12 and product.md §3 (decision 2). Investigate and retire whatever exists of the old single-PNG path; `data/menu_images/` becomes archive-only.

### 6.14 Slow-loop upgrade (9.1)

The substance upgrade from §1.8. MAINTENANCE.md §1: inputs gain the coverage and pool-coverage reports and `nextWeekQueue`; clustering guidance gains the five new signal patterns (skips, deletes, adds, saves, unplaceable requests); right-size examples table rewritten for the per-dish-file structure; a "proactive run" subsection (zero comments can still produce a useful PR from the reports). `.claude/commands/slow-loop.md`: same updates, plus reading `npm run reports` output. Mark-applied: `next_week_queue_ids:` key in cluster blocks, new internal mutation for queue rows, script and MAINTENANCE.md §3 updated. Fixtures: add new-kind manualChanges examples and a nextWeekQueue example; keep backward tolerance for older fixtures. Dry-run the upgraded loop against the fixtures before opening the PR.

### 6.15 Docs close-out (10.1)

Full rewrite of product.md to describe the shipped product as steady state (Rajat's direction: product.md displays the existing state of the product once changes are implemented). Run `/reconcile-docs` to sweep all four canonical docs against the CHANGELOG run. Move this spec to `archive/features/design-revamp.md`; CLAUDE.md "Currently building" back to "_none_". Update `.maintenance-state`.

---

## 7. Ordering-automation readiness (designed in, not built)

What the next project needs is exactly what this structure produces; the checklist that keeps it true:

1. Canonical machine-resolvable ingredient names: the catalog plus the blocking name-resolution validator (slice 1.2).
2. Structured grocery list via a dedicated query: exists today; slice 4.2 keeps it structured while adding skip-exclusion. Items continue to carry ingredient, quantity, unit, tracked, packs, packTotalGrams.
3. Pack sizes machine-readable and separate from per-dish rows: the catalog's Pack Size column (slice 1.2).
4. No SKU or store identifier in canonical data, ever; brand preference and substitution policy as future additive catalog columns.
5. The Swiggy MCP shape in engineering.md §13 stays accurate after the data-layer rewrite (slice 1.2 updates its references).

## 8. Concepts used in this plan (reference)

- **Golden-master test:** snapshot current output, assert the refactor reproduces it exactly, delete the snapshot after. Proof-of-no-change for pure restructures.
- **Migration script:** one-shot code that transforms data from the old layout to the new, run once, reviewed via its output diff, then deleted. The script is disposable; the migrated data is the deliverable.
- **Additive schema change:** only adding optional fields, new union members, or new tables, so every existing database row still validates. Convex validates all existing rows against a new schema at deploy, so non-additive changes need a data migration plan; this revamp avoids needing one entirely.
- **Coverage ratchet:** a report that measures completeness (here: enrichment fields, macros) and is expected to only improve; regressions are visible in CI output without blocking unrelated work.
- **DOM-to-image rendering:** generating a PNG in the browser by painting the live HTML/CSS of a component onto a canvas. Avoids running a server-side browser; the share preview and the shared image come from the same component, so they cannot drift.
- **Web Share API:** the browser API that opens the phone's native share sheet from a web app; level 2 shares files (our PNGs) directly into WhatsApp. Works in installed PWAs; the fallback is downloading the images.
- **Style spec (for generated images):** a committed document fixing the prompt template and visual parameters (framing, lighting, plating, crop) so images generated months apart by different runs still look like one set. The consistency lives in the committed spec, not in anyone's memory.
