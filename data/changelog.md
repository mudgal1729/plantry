# Structural changelog

Append-only audit of structural changes to the library and rules. Distinct from `docs/CHANGELOG.md`, which tracks shipped code and feature changes. Entries here are written by the slow loop on merged PRs.

Format:

```
## YYYY-MM-DD  short title  (slow-loop PR #N)

- What changed (dish, ingredient, rule, tag).
- Triggering comment(s) summarized.
- One-line rationale.
```

---

## 2026-06-09  First fixture-driven slow-loop run (slow-loop PR pending)

The test-fixture dry-run that proves the slow-loop pipeline end-to-end. All five queued comments in `data/test-fixtures/slow-loop/queued-comments.example.json` and both incidents in `data/test-fixtures/slow-loop/incidents.example.json` were considered under the right-size discipline (`docs/product.md` §4 Principle 1). Every cluster resolved to no change warranted. The pipeline (`/slow-loop` slash command + structural-changelog write + GitHub Action for marking consumed Convex rows) is validated end-to-end; the lack of code changes is the honest output for one synthetic week, not a failure of the discipline.

- Cluster A (cmt_fixture_001, "prawn stir fry too oily"): one-off; oil quantity is a per-cook decision and not in the library; reviewed_no_change. Path back to action: a real future comment hitting the same theme upgrades this to a recipe-note proposal.
- Cluster B (cmt_fixture_002, "no low-spice dish all week"): one comment from one week; one comment does not justify a new dish property such as `low_spice`; reviewed_no_change. Path back: 3+ comments across non-overlapping weeks would trigger a `low_spice` tag proposal.
- Cluster C (cmt_fixture_003, "loved the chicken curry"): positive feedback, no action; reviewed_no_change.
- Cluster D (cmt_fixture_004 + cmt_fixture_005 + inc_fixture_002, paneer fatigue): small pattern within a single week. The engine already flagged it via incident, which is the correct level of behavior. Two cases is not yet a pattern per the right-size discipline; reviewed_no_change. Path back: 3+ weeks of paneer-frequency incidents upgrades to a per-week Primary Ingredient cap rule in §4 priority.
- Cluster E (inc_fixture_001, Wednesday no-gravy dish): the engine's incident system is operating as designed; reviewed_no_change. Path back: when auto-recovery middleware (queued Stream C slice) ships, this incident gates a roll-back to last-good week; no rule edit needed in `docs/engine.md`.
