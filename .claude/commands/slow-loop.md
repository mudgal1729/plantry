---
description: Run the slow loop. Reads queued comments, queued manual changes, and incidents from Convex, applies right-size discipline, opens a PR with structural changes (or a no-change-warranted card).
---

You are running the slow loop for Plantry. This is a thinking exercise, not a script. The full spec lives in `MAINTENANCE.md` §1. Re-read it now. Read `docs/product.md` §4 (principles) and `docs/development.md` §5 (diagnosis card). The right-size discipline below is restated so this command stands on its own, but the canonical wording lives in those docs.

Slow-loop runs only when Rajat invokes them. Comments, manual changes, saved-for-next-week rows, dislikes, and incidents accumulate during the week; the coverage and pool-coverage reports describe the library's health independent of any user action. This session is the only path by which the dish library (`data/dishes/<slug>.md`), the ingredient catalog (`data/ingredients.md`), `docs/engine.md`, `engine/src/`, and `data/changelog.md` change.

## Right-size discipline (inline, canonical in `docs/product.md` §4 Principle 1)

Before any change lands, state:

1. **Problem size.** One-off, small pattern, or structural. One comment is usually one-off; two or three comments touching the same property over different weeks is a small pattern; five-plus comments or a recurring incident is structural.
2. **Smallest level that fixes it.** In ascending invasiveness:
   - data row (a single value in a dish's `data/dishes/<slug>.md` file or an `data/ingredients.md` catalog row),
   - new tag (one column value added on a handful of rows, with rule wording that consumes it),
   - rule edit (wording in `docs/engine.md` plus the matching engine module change plus tests),
   - engine code (algorithmic or structural change to `engine/src/`),
   - UI affordance (let the user resolve in-week via swap, one-off, or comment),
   - infrastructure (tooling, CI, command, schema),
   - or no change warranted.
3. **Generality check.** Does the fix unlock other latent improvements, or is it brittle to this one case? A fix that solves only one case in only one direction is usually the wrong level.

A single-row data fix beats a new column. A new tag beats a new cross-cutting rule. A UI affordance beats a new rule altogether. Three similar rows beat a premature abstraction. Do not generalize from one or two cases. "No change warranted" is a valid output and gets written as an explicit decision, not silence.

## Diagnosis card (one per cluster; canonical in `docs/development.md` §5)

```
## Diagnosis

**Problem size:** one-off | small pattern | structural
**Trigger:** comment IDs, manual-change IDs, next-week-queue IDs, dislike IDs, and incident IDs in this cluster (or "reports: <which report>" for a proactive cluster with no consumed rows)
**Candidate fix levels considered:**
  - data row: <what would change, or "not applicable" with one reason>
  - new tag: <what would change, or "not applicable" with one reason>
  - rule edit: <what would change, or "not applicable" with one reason>
  - engine code: <what would change, or "not applicable" with one reason>
  - UI affordance: <what would change, or "not applicable" with one reason>
  - infrastructure: <what would change, or "not applicable" with one reason>
**Chosen level:** <one>
**Why this level:** <one or two sentences>
**Generality check:** <does this unlock latent improvements, or is it brittle to this case>
**Rejected alternatives:** <one sentence per rejected level>
```

For clusters that resolve to no change, the card states problem size, the cluster's consumed IDs (comments, manual changes, queue rows, dislikes, incidents), the levels considered, "no change warranted" as the chosen level, and the reason. The consumed comments and manual changes still get marked `reviewed_no_change` on merge; consumed queue rows are still dropped; consumed incidents are still resolved. (Dislikes are listed for the record but stay queued until the 7.1 mutation exists.)

## Arguments

- `--fixture <path>`. Read comments, manual changes, saved-for-next-week rows, dislikes, and incidents from JSON files at that path instead of Convex. Used by the EM to dry-run before real signals accumulate. The path is a directory containing `queued-comments.json`, `manual-changes.json`, `next-week-queue.json`, `dish-dislikes.json`, and `incidents.json` (matching the filenames in `data/test-fixtures/slow-loop/`, dropping the `.example` suffix), or a single JSON file with `{ "comments": [...], "manualChanges": [...], "nextWeekQueue": [...], "dishDislikes": [...], "incidents": [...] }`. The synthetic fixture at `data/test-fixtures/slow-loop/` is the reference shape; pass it as `--fixture data/test-fixtures/slow-loop` for a dry-run, mapping the `.example.json` files. Any fixture file that is absent reads as zero queued rows of that signal: older fixtures predate a given channel (`manual-changes` predates Stream I; `next-week-queue` and `dish-dislikes` predate slice 9.1), and they still dry-run cleanly. The reports are read live from `npm run reports`, not from a fixture.
- `since:<date>`. Narrow to comments and incidents from this ISO date forward. Default: process everything queued since the `last_slow_loop` marker in `.maintenance-state`.
- `focus:<keyword>`. Narrow to clusters that touch this keyword (e.g. `focus:spice`, `focus:paneer`).
- `dry-run`. Produce the diagnosis cards but do not edit files or open a PR.

## What to do

1. **Load context.** Read `docs/product.md`, `docs/engine.md`, `docs/engineering.md`, `docs/development.md`, `MAINTENANCE.md`, and `CLAUDE.md`. Read the dish library under `data/dishes/`, the `data/ingredients.md` catalog, `data/menu_history.md`, `data/changelog.md`, and the last few entries of `docs/CHANGELOG.md` for ship context. Run `npm run reports` and read its coverage report and pool-coverage report; these are the proactive inputs (see step 3b and `MAINTENANCE.md` §1.8). The reports never block; a thin pool or a coverage gap is judgment for this loop to act on, not a CI failure.

2. **Read inputs.**
   - If `--fixture <path>` was passed, read comments, manual changes, saved-for-next-week rows, dislikes, and incidents from that path. Treat the fixture as authoritative for this run; do not also call Convex. Validate the JSON parses and that each row has the shape declared in `app/convex/schema.ts` for the `comments`, `manualChanges`, `nextWeekQueue`, `dishDislikes`, and `incidents` tables. Any fixture file that is absent reads as zero queued rows of that signal (`manual-changes` predates Stream I; `next-week-queue` and `dish-dislikes` predate slice 9.1).
   - Otherwise call the production Convex deployment, `disciplined-chameleon-263`. Queued comments come from `npx convex run --prod queries/comments:listQueuedComments`. Queued manual changes come from `npx convex run --prod queries/manualChanges:listQueuedManualChanges`. Queued saved-for-next-week rows come from the `nextWeekQueue` table (`queued` status). Queued dislikes come from the `dishDislikes` table (`queued` status; this table lands in slice 7.1, so until it exists treat it as zero queued dislikes). Open incidents come from `npx convex run --prod queries/incidents:listIncidents`. The dev deployment, `lovely-curlew-631`, is for live coding only; never source slow-loop input from it. If `since:<date>` or `focus:<keyword>` was passed, narrow client-side after the fetch.

3. **Empty-input case.** If zero comments, zero manual changes, zero queue rows, zero dislikes, and zero incidents came back (whether from fixture or Convex), AND the reports surface nothing worth a proactive proposal, write a one-line summary PR that touches only `.maintenance-state` (updates `last_slow_loop` to today's date) and exit. An empty slow loop is a healthy outcome, not a failure. But note that a zero-signal week is not automatically empty: check the reports first (step 3b).

3b. **Proactive read (reports).** Even with zero reactive signals, scan the pool-coverage report for thin pools (slots flagged `<- thin`, two or fewer eligible candidates per season) and the coverage report for gaps. A thin pool or a real gap can justify a proactive cluster: "Monsoon strands the Dessert slot at N candidates, propose activating X and Y" or "the latest expansion batch landed undescribed, here is the enrichment priority". Recipe coverage is currently 100%, so frame coverage proposals around the live gaps (thin pools, or a freshly-landed undescribed batch), not recipes. Activating an existing dish is a slow-loop data-row edit; adding net-new dishes is a B3 expansion content batch the slow loop proposes as a priority rather than authoring. A proactive cluster carries a diagnosis card like any other and consumes no Convex rows.

4. **Cluster.** Group comments, manual changes, queue rows, dislikes, and incidents into themes. State each theme in one short sentence. A theme can be a single row from any table if structural on its own; a theme can also span rows from multiple tables when they touch the same underlying property. A swap from palak paneer to a non-paneer dish with reason "bored of paneer" clusters naturally with a queued comment "palak paneer again, feels like a lot of paneer this week". The manual-changes log, the queue, and dislikes are observed behavior; comments are explicit feedback; incidents are runtime violations. The slow loop does NOT treat a swap or a save or a dislike as a violation; it reads them as signal for what the engine got wrong, then asks whether the rule should change. Per `docs/product.md` §4 Principle 4 the fast loop is permissive; the slow loop redesigns rules so generated picks move closer to what users actually pick. The new signal patterns to look for, each subject to right-size discipline (a single instance is almost always no change; the threshold is a pattern across weeks or across both household members):
   - **Skips** (`skip_day`): recurring same-day skips are a calendar pattern (three Fridays is a standing override; one is one eat-out night).
   - **Deletes** (`delete`): repeated deletes from one slot type read as over-generation (an item-cap or composition adjustment, not a per-dish edit).
   - **Adds** (`add`): repeated manual adds of one category read as under-generation (the mirror of deletes).
   - **Saves** (`save_next_week` + `nextWeekQueue`): a dish saved repeatedly is under-picked (consider flipping `preferred` or its recency treatment); stale queued rows (saved weeks ago, never placed) may be marked `dropped` with a reason.
   - **Unplaceable requests** (`nextWeekQueue` rows stuck `queued` with an incident trail): the dish is mis-categorized (data-row recategorization) or the composition is too rigid (rule loosening).
   - **Dislikes** (`dishDislikes`): one dislike is no change; a dish disliked repeatedly or by both members is a deactivation or explore down-rank candidate. The optional reason sharpens the call. The fast loop never acts on a dislike; the slow loop is the only path to any consequence (Principle 5).

5. **Per cluster, diagnose.** Write the diagnosis card above. Be honest: most one-off comments and most one-off manual changes resolve to no change. Some clusters resolve to a single data row edit. A few resolve to a new tag plus rule wording plus engine plus tests. Very few resolve to an engine code change in a single run.

6. **Produce edits.** For each cluster that needs a change:
   - **Data row fix:** edit the dish's `data/dishes/<slug>.md` file (frontmatter field or ingredient row) or the relevant `data/ingredients.md` catalog row. No new frontmatter keys or catalog columns. No name-matching.
   - **Tag addition:** add the tag value to the `tags` list in the handful of relevant `data/dishes/<slug>.md` files, edit the rule text in `docs/engine.md`, edit the engine module in `engine/src/` to consume the tag, add unit tests. Tags are properties, not labels for one dish.
   - **Rule edit:** edit `docs/engine.md` and the matching engine module and tests. Run the simulation harness locally; rule changes that newly break the harness are not ready to ship.
   - **Engine code:** same as rule edit, but the change is algorithmic rather than wording. Same gates.
   - **Preferred / deactivation data fix (saves and dislikes):** for an under-picked saved dish, flip `preferred: Yes` in its `data/dishes/<slug>.md` (or revisit its recency treatment); for a dish disliked repeatedly or by both members, set `active: No`, or lower its explore ranking if it should stay browsable. These are data-row edits, not new fields. (The dislike path is documented now and goes live once the `dishDislikes` table lands in slice 7.1.)
   - **Drop a stale queue row:** when a saved-for-next-week dish has sat queued for weeks without placing and the cluster decides it is dead intent, list its `nextWeekQueue` id in the cluster block; the merge action marks it `dropped`. No file edit is required for a pure drop.
   - Append a one-paragraph rationale to `data/changelog.md` (the structural changelog at `data/changelog.md`, not `docs/CHANGELOG.md`). The entry names the cluster, the chosen fix level, and the comment, manual-change, queue, dislike, or incident IDs consumed.

7. **No change warranted.** Some clusters resolve to no change. The PR still includes the diagnosis card and still consumes those rows; the consumed comments and manual changes get marked `reviewed_no_change` (not `applied`) on merge, consumed incidents are resolved, and consumed queue rows are dropped, all with the documented reason. (Consumed dislike ids are listed for the record but stay queued until the 7.1 mutation exists.) If every cluster in this run resolves to no change, the PR touches only `data/changelog.md` (a deferral note) and `.maintenance-state`.

8. **Verify.** Run the CI gates locally before opening the PR: round-trip parsers on the markdown you touched, `npm run typecheck`, `npm run lint`, `npm run test`, and the simulation harness. Fix anything that fails. The PR cannot ship a regression.

9. **Open the PR.**
   - Branch name: `slow-loop/<today's date>` in `YYYY-MM-DD` form (per `docs/development.md` §2).
   - Title: `slow-loop/<date>: <one-line summary of themes>`. Under 70 characters.
   - Body opens with the cluster list (one line each), then one diagnosis card per cluster, then "## File changes" enumerating what moved and why, then "## Out of scope" naming clusters deferred. Include one-line "Consumed comment IDs", "Consumed manual-change IDs", "Consumed incident IDs", "Consumed next-week-queue IDs", and "Consumed dislike IDs" lists so the merge action can mark them on Convex. Also include a "## Consumed comments by cluster" section: one fenced `cluster` block per cluster, each block containing `outcome: applied` or `outcome: reviewed_no_change` (taken verbatim from the cluster's diagnosis card; the outcome is `reviewed_no_change` if the chosen level is "no change warranted", otherwise `applied`), `comment_ids: <comma-separated list>` (use `-` when none), `manual_change_ids: <comma-separated list>` (use `-` when none), `incident_ids: <comma-separated list>` (use `-` when none), `next_week_queue_ids: <comma-separated list>` (use `-` when none), and `dislike_ids: <comma-separated list>` (use `-` when none). The mark-applied GitHub Action parses this section: it maps `outcome` to comment ids and manual-change ids per cluster, drops every listed queue id (outcome-independent), and parses dislike ids but does NOT write them back yet (the `dishDislikes` table lands in slice 7.1; until then a listed dislike id stays queued, by design).
   - For a dry-run (the `dry-run` argument), produce the cards in the chat as if you were about to open the PR, but do not write files or push.

10. **Hand off.** Post a one-paragraph status to Rajat: "PR opened, here is the URL, here are the themes touched, here is what I deliberately did not."

## What to refuse

- Sycophantic agreement to a single comment ("the comment said too spicy, so I added a `low_spice` tag"). A single comment is almost never a tag.
- Generalizing from one or two cases. Two paneer comments do not justify a `paneer_alternative` tag; they justify watching for a third.
- Modifying `docs/engine.md` without paired engine code and test edits. The CI gate also catches this; do not fight the gate.
- Hard-coding dish names into the engine. If a special case needs the engine, identify the property and encode the property.
- Silently dropping a signal. Every queued comment, manual change, queue row, dislike, and incident this session reads gets either an `applied` / `reviewed_no_change` / `dropped` / resolved PR action, or a `deferred` note in `data/changelog.md` for next time. (A dislike's only consumed-action today is being listed in the PR; the write-back lands in 7.1.)
- Acting on a single instance of any new signal. One skip is not a calendar override; one delete is not an over-generation finding; one save is not a `preferred` flip; one dislike is not a deactivation. The threshold is a pattern across weeks or across both members.

## Why this command exists

Comments arrive sycophantically by nature (someone is annoyed at one bad meal and types it; the model wants to please). The slow loop is the firewall: it forces the right-size discipline above to be applied and audited, and it puts every structural change through human review. Read it as a thinking exercise, not a transformation pipeline.
