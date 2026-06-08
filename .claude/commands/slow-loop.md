---
description: Run the slow loop. Reads queued comments + incidents from Convex, applies right-size discipline, opens a PR with structural changes (or a no-change-warranted card).
---

You are running the slow loop for Plantry. This is a thinking exercise, not a script. The full spec lives in `MAINTENANCE.md` §1. Re-read it now. Read `docs/product.md` §4 (principles) and `docs/development.md` §5 (diagnosis card). The right-size discipline below is restated so this command stands on its own, but the canonical wording lives in those docs.

Slow-loop runs only when Rajat invokes them. Comments and incidents accumulate during the week; this session is the only path by which `data/dishes.md`, `data/ingredients.md`, `docs/engine.md`, `engine/src/`, and `data/changelog.md` change.

## Right-size discipline (inline, canonical in `docs/product.md` §4 Principle 1)

Before any change lands, state:

1. **Problem size.** One-off, small pattern, or structural. One comment is usually one-off; two or three comments touching the same property over different weeks is a small pattern; five-plus comments or a recurring incident is structural.
2. **Smallest level that fixes it.** In ascending invasiveness:
   - data row (a single value in `data/dishes.md` or `data/ingredients.md`),
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
**Trigger:** comment IDs and incident IDs in this cluster
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

For clusters that resolve to no change, the card states problem size, the cluster's comment IDs, the levels considered, "no change warranted" as the chosen level, and the reason. The consumed comments still get marked `reviewed_no_change` on merge.

## Arguments

- `--fixture <path>`. Read comments and incidents from JSON files at that path instead of Convex. Used by the EM to dry-run before real comments accumulate. The path is a directory containing `queued-comments.json` and `incidents.json` (matching the filenames in `data/test-fixtures/slow-loop/`, dropping the `.example` suffix), or a single JSON file with `{ "comments": [...], "incidents": [...] }`. The synthetic fixture at `data/test-fixtures/slow-loop/` is the reference shape; pass it as `--fixture data/test-fixtures/slow-loop` for a dry-run, mapping `queued-comments.example.json` and `incidents.example.json`.
- `since:<date>`. Narrow to comments and incidents from this ISO date forward. Default: process everything queued since the `last_slow_loop` marker in `.maintenance-state`.
- `focus:<keyword>`. Narrow to clusters that touch this keyword (e.g. `focus:spice`, `focus:paneer`).
- `dry-run`. Produce the diagnosis cards but do not edit files or open a PR.

## What to do

1. **Load context.** Read `docs/product.md`, `docs/engine.md`, `docs/engineering.md`, `docs/development.md`, `MAINTENANCE.md`, and `CLAUDE.md`. Read `data/dishes.md`, `data/ingredients.md`, `data/menu_history.md`, `data/changelog.md`, and the last few entries of `docs/CHANGELOG.md` for ship context.

2. **Read inputs.**
   - If `--fixture <path>` was passed, read comments and incidents from that path. Treat the fixture as authoritative for this run; do not also call Convex. Validate the JSON parses and that each row has the shape declared in `app/convex/schema.ts` for the `comments` and `incidents` tables.
   - Otherwise call the production Convex deployment, `disciplined-chameleon-263`. Queued comments come from `npx convex run --prod comments:listQueued`. Open incidents come from `npx convex run --prod incidents:listOpen`. The dev deployment, `lovely-curlew-631`, is for live coding only; never source slow-loop input from it. If `since:<date>` or `focus:<keyword>` was passed, narrow client-side after the fetch.

3. **Empty-input case.** If zero comments and zero incidents came back (whether from fixture or Convex), write a one-line summary PR that touches only `.maintenance-state` (updates `last_slow_loop` to today's date) and exit. An empty slow loop is a healthy outcome, not a failure.

4. **Cluster.** Group comments and incidents into themes. State each theme in one short sentence. A theme can be a single comment if that comment is structural on its own (e.g. an incident); a theme can also span comments across different days or weeks if they share the underlying property. Two comments about the same dish on the same day are usually one theme; two comments about different paneer dishes on different days are a different kind of theme (paneer fatigue) and need clustering judgment.

5. **Per cluster, diagnose.** Write the diagnosis card above. Be honest: most one-off comments resolve to no change. Some clusters resolve to a single data row edit. A few resolve to a new tag plus rule wording plus engine plus tests. Very few resolve to an engine code change in a single run.

6. **Produce edits.** For each cluster that needs a change:
   - **Data row fix:** edit the row in `data/dishes.md` or `data/ingredients.md`. No new columns. No name-matching.
   - **Tag addition:** add the tag value on the handful of relevant rows in `data/dishes.md`, edit the rule text in `docs/engine.md`, edit the engine module in `engine/src/` to consume the tag, add unit tests. Tags are properties, not labels for one dish.
   - **Rule edit:** edit `docs/engine.md` and the matching engine module and tests. Run the simulation harness locally; rule changes that newly break the harness are not ready to ship.
   - **Engine code:** same as rule edit, but the change is algorithmic rather than wording. Same gates.
   - Append a one-paragraph rationale to `data/changelog.md` (the structural changelog at `data/changelog.md`, not `docs/CHANGELOG.md`). The entry names the cluster, the chosen fix level, and the comment or incident IDs consumed.

7. **No change warranted.** Some clusters resolve to no change. The PR still includes the diagnosis card and still consumes those comments; the consumed comments get marked `reviewed_no_change` (not `applied`) on merge, with the documented reason. If every cluster in this run resolves to no change, the PR touches only `data/changelog.md` (a deferral note) and `.maintenance-state`.

8. **Verify.** Run the CI gates locally before opening the PR: round-trip parsers on the markdown you touched, `npm run typecheck`, `npm run lint`, `npm run test`, and the simulation harness. Fix anything that fails. The PR cannot ship a regression.

9. **Open the PR.**
   - Branch name: `slow-loop/<today's date>` in `YYYY-MM-DD` form (per `docs/development.md` §2).
   - Title: `slow-loop/<date>: <one-line summary of themes>`. Under 70 characters.
   - Body opens with the cluster list (one line each), then one diagnosis card per cluster, then "## File changes" enumerating what moved and why, then "## Out of scope" naming clusters deferred. Include a one-line "Consumed comment IDs" and "Consumed incident IDs" list so the merge action can mark them on Convex.
   - For a dry-run (the `dry-run` argument), produce the cards in the chat as if you were about to open the PR, but do not write files or push.

10. **Hand off.** Post a one-paragraph status to Rajat: "PR opened, here is the URL, here are the themes touched, here is what I deliberately did not."

## What to refuse

- Sycophantic agreement to a single comment ("the comment said too spicy, so I added a `low_spice` tag"). A single comment is almost never a tag.
- Generalizing from one or two cases. Two paneer comments do not justify a `paneer_alternative` tag; they justify watching for a third.
- Modifying `docs/engine.md` without paired engine code and test edits. The CI gate also catches this; do not fight the gate.
- Hard-coding dish names into the engine. If a special case needs the engine, identify the property and encode the property.
- Silently dropping a comment. Every queued comment this session reads gets either an `applied` PR action, a `reviewed_no_change` PR action, or a `deferred` note in `data/changelog.md` for next time.

## Why this command exists

Comments arrive sycophantically by nature (someone is annoyed at one bad meal and types it; the model wants to please). The slow loop is the firewall: it forces the right-size discipline above to be applied and audited, and it puts every structural change through human review. Read it as a thinking exercise, not a transformation pipeline.
