---
description: Run the slow loop. Reads queued comments + incidents from Convex, applies right-size discipline, opens a PR with structural changes (or a no-change-warranted card).
---

You are running the slow loop for Plantry. The full spec lives in `MAINTENANCE.md` §1. The right-size discipline you must apply lives in `docs/product.md` §4 Principle 1. The diagnosis card format lives in `docs/development.md` §5.

## What to do

1. **Load context.** Read `docs/product.md`, `docs/engine.md`, `docs/engineering.md`, `docs/development.md`, `MAINTENANCE.md`. Read `data/dishes.md`, `data/ingredients.md`, `data/menu_history.md`, `data/changelog.md`. Read recent CHANGELOG entries.
2. **Read Convex inputs.** Run `npx convex run comments:listQueued` and `npx convex run incidents:listOpen`. If the user passed `since:<date>` or `focus:<theme>`, narrow accordingly.
3. **Cluster.** Group comments + incidents by theme. Be explicit about themes (one short sentence each).
4. **Per cluster, diagnose.** Apply the right-size discipline. State:
   - Problem size: one-off, small pattern, or structural.
   - Smallest level that fixes it: data row, new tag, rule edit, engine code, UI affordance, infrastructure, or no change warranted.
   - Generality: does this fix also unlock other latent improvements, or is it brittle.
   - Two rejected alternatives with one-sentence reasons.
5. **Produce edits.** For each cluster needing change:
   - Data fix: edit the relevant row in `data/dishes.md` or `data/ingredients.md`.
   - Tag addition: tag the dishes + edit the rule text in `docs/engine.md` + edit the engine module + add tests.
   - Rule change: edit `docs/engine.md` + the engine module + tests + run the simulation harness locally.
   - Append a rationale entry to `data/changelog.md`.
6. **Verify.** Run round-trip parsers, type-check, tests, and the simulation harness. Fix anything that fails.
7. **Open PR.** Create a feature branch `slow-loop/<today's date>`. Open a PR titled `slow-loop/<date>: <one-line summary of themes>`. PR description carries:
   - A short list of clusters processed.
   - A diagnosis card per cluster.
   - File diffs across `data/`, `docs/engine.md`, `engine/`, and the appended `data/changelog.md`.
8. **Hand off.** Post a one-paragraph status to Rajat: "PR opened, here is the URL, here is what I touched, here is what I deliberately did not."

## What to refuse

- Sycophantic agreement to a comment without diagnosis. If a comment arrived once and does not fit a larger pattern, the right output is a no-change PR (or a "deferred until pattern emerges" note in the changelog, no PR).
- Generalizing from one or two cases. Two paneer comments do not justify a `paneer_alternative` tag.
- Modifying `docs/engine.md` without paired engine code and test edits.
- Hard-coding dish names into the engine. If a special case needs the engine, identify the property and encode the property.

## Empty-input case

If no queued comments and no open incidents exist, write a one-line summary PR that touches only `.maintenance-state` (last_slow_loop date) and exit. An empty slow loop is a healthy outcome.

## Arguments

- `since:<date>` — narrow to comments and incidents from this date forward.
- `focus:<keyword>` — narrow to clusters touching this keyword.
- `dry-run` — produce the diagnosis cards but do not write files or open a PR.

Defaults: no arguments = process everything queued since the last `last_slow_loop` marker.
