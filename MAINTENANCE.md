# Plantry — Maintenance

Spec for the two human-triggered jobs that keep the repo healthy: the slow loop (turning accumulated user feedback into structural change) and canonical-doc reconciliation (keeping `docs/product.md`, `docs/engine.md`, `docs/engineering.md`, `docs/development.md` aligned to shipped reality).

Both jobs run from Claude Code sessions invoked by Rajat. Neither is on a cron. The session is the trigger; the output is always a pull request; the merge is the approval.

## 1. The slow loop

### 1.1 Why

User feedback accumulates in Convex during the week as three signal channels: queued `comments` rows (explicit feedback the user typed), queued `manualChanges` rows (observed behavior, one row per swap or custom one-off with the user's stated reason), and runtime `incidents` from the auto-recovery middleware. None of these can be applied directly: each cluster needs right-size diagnosis before becoming a structural change. The slow loop is the only path by which `data/dishes.md`, `data/ingredients.md`, `docs/engine.md`, `engine/`, or `data/changelog.md` change.

### 1.2 Trigger

Rajat opens a Claude Code session in the main repo directory and types `/slow-loop`. Convention is Sunday morning around 11am IST, but the cadence is not enforced. The session can also be passed a specific date range (`/slow-loop since:2026-05-01`), a focus theme (`/slow-loop focus:spice`), or a fixture path (`/slow-loop --fixture data/test-fixtures/slow-loop`). The fixture path is for EM dry-runs against the synthetic comments, manual changes, and incidents at `data/test-fixtures/slow-loop/queued-comments.example.json`, `manual-changes.example.json`, and `incidents.example.json`; when passed, the session reads from those files instead of Convex.

### 1.3 Inputs the session reads

- All `queued` rows in Convex `comments` (via `npx convex run queries/comments:listQueuedComments`).
- All `queued` rows in Convex `manualChanges` (via `npx convex run queries/manualChanges:listQueuedManualChanges`).
- All open `incidents` from Convex (via `npx convex run queries/incidents:listIncidents`).
- Current `data/dishes.md`, `data/ingredients.md`, `data/menu_history.md`, `data/changelog.md`.
- Current `docs/engine.md` plus `engine/src/` for the engine state.
- Recent Convex `weekArchive` rows for context on what was actually cooked.

### 1.4 What the session does

1. Cluster comments + manual changes + incidents by theme (e.g. "spice tolerance varies day to day", "we never cook lauki anymore", "fish pack size feels off", "Tuhina ordered in Thursdays in May", "rajma keeps getting swapped to chole with reason 'bored of rajma'"). A cluster can mix rows from any of the three tables when they touch the same underlying property. Manual changes are observed behavior, not rule violations; the slow loop reads them as signal for what the engine got wrong, then asks whether the rule should change.
2. For each cluster, apply right-size discipline (`docs/product.md` §4 Principle 1):
   - Size: one-off, small pattern, structural.
   - Smallest level that fixes it: data row, new tag, rule wording, engine code, UI affordance, infrastructure.
   - Generality: does the fix unlock other latent improvements, or is it brittle to this case.
3. Pick a level. "No change warranted" is a valid output and gets written as an explicit decision, not silence.
4. Produce concrete edits:
   - Data fix: edit the row in `data/dishes.md` or `data/ingredients.md`.
   - Tag addition: add the tag to relevant dishes + edit the rule text in `docs/engine.md` + edit the engine module + add tests.
   - Rule change: edit `docs/engine.md` + the engine module + tests + run the simulation harness.
   - Append the rationale to `data/changelog.md`.

### 1.5 Output

A single PR titled `slow-loop/<date>: <one-line summary of themes>`. PR description includes:

- A short list of clusters processed.
- A diagnosis card per cluster (problem size, fix level, generality, rejected alternatives).
- File diffs across `data/`, `docs/engine.md`, `engine/`, and the appended `data/changelog.md`.

### 1.6 On merge

A GitHub Action posts back to Convex:

- Marks the consumed `comments` rows as `applied` with the merged PR URL, or `reviewed_no_change` for clusters with "no change warranted" as the chosen level.
- Marks the consumed `manualChanges` rows with the same outcome per cluster, using the same per-cluster fence section.
- Marks the corresponding `incidents` as resolved.

The action then triggers a redeploy: build emits new typed library/history modules from the updated markdown, Convex picks up the new functions, Vercel rebuilds the frontend. The next generated week uses the new rules.

### 1.7 Right-size examples

| Comment pattern                                                                         | Right-sized fix                                                                                                      | Wrong response (rejected)                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| "We never cook lauki" appearing 3+ weeks running                                        | Set `Active = No` on lauki dishes in `data/dishes.md`.                                                               | Delete the dishes (loses optionality) or wait for more data.            |
| "Too spicy on a sick day" appearing once                                                | No change. Record reason: "single instance, not a pattern; user can swap via the dish-swap affordance."              | Add a `low_spice` tag.                                                  |
| "Too spicy" + "want milder dinner when traveling" + "after gym I want light" (5+ weeks) | Add `low_spice` tag to relevant dishes, edit `docs/engine.md` to add the slot rule, update engine module, add tests. | Add a `low_spice` tag to two dishes and ship without updating the rule. |
| Custom one-off "lemon coriander rice" used 4 weeks running                              | Add as a new row in `data/dishes.md` with `data/ingredients.md` quantities.                                          | Make the engine learn one-off entries automatically.                    |
| Pack size for Paneer feels wrong                                                        | Edit pack size in the header table of `data/ingredients.md`.                                                         | Add a per-dish override column.                                         |

### 1.8 Anti-patterns the slow loop must not produce

- Sycophantic agreement: "the comment said X so I added a flag for X" without checking pattern size.
- Generalizing from one or two cases.
- Adding a column when a row fix or a tag would do.
- Modifying `docs/engine.md` without paired engine code and test edits.
- Silent dismissal of a comment without writing a diagnosis card.

## 2. Canonical-doc reconciliation

### 2.1 Why

Canonical docs in `docs/` must read as coherent present-tense specs with no historical seams. Producing that quality of writing while shipping a feature is unreliable, so reconciliation runs as a separate human-triggered pass.

### 2.2 Trigger

Rajat invokes `/reconcile-docs` after a notable run of CHANGELOG entries (typically every two to four weeks, or when something clearly changed the steady state). Sessions can also fire it on demand right after a feature ships.

### 2.3 Inputs the session reads

- `docs/CHANGELOG.md` entries since the last reconciliation (last-run marker stored in `.maintenance-state`, committed).
- The `features/` directory if anything is active, and any feature spec referenced by recent CHANGELOG entries (`archive/features/<name>.md` after ship).
- Current `docs/product.md`, `docs/engine.md`, `docs/engineering.md`, `docs/development.md` — to preserve voice and structure.
- Current code state under `engine/`, `app/`, plus the data files — to cross-check that doc claims match reality.

### 2.4 What the session does

1. Determine the set of CHANGELOG entries since the last run.
2. For each canonical doc, decide which entries affect it.
3. For each affected doc, rewrite the relevant sections in place. Not as appends, not as "now also" additions. The doc must still read as one coherent spec after the edit.
4. Verify factual claims against current code where checkable.
5. Open a PR with one commit per canonical doc touched.
6. Update `.maintenance-state` with the new last-run marker.

### 2.5 Per-doc scope

| CHANGELOG entry touches…                                                                                                                              | Update target         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Product scope, persona, principles, tone, future direction                                                                                            | `docs/product.md`     |
| Rules, slot composition, selection priority, item cap, ingredient consolidation, field reference                                                      | `docs/engine.md`      |
| Stack, schema, data layer split, deploy model, hosting, integrations, env vars, image format                                                          | `docs/engineering.md` |
| Session model, worktree workflow, ship workflow, definition of done, diagnosis card, slow-loop trigger, escalation, commit conventions, anti-patterns | `docs/development.md` |

A single shipped change often touches more than one doc. Keeping cross-doc consistency is the reconciliation job's responsibility.

### 2.6 Style rules for canonical docs

Apply to every rewrite the reconciliation job produces.

- **Present tense.** "The slow loop runs when Rajat invokes it." Not "The slow loop will run…" or "Slow loop was added in feat/E1…".
- **One coherent document.** Section order is stable. Updates happen in place.
- **No slice, round, sprint, or date references** inside the doc body. The reader should not see the historical seams.
- **No changelog phrasing.** Strip "previously", "now also", "we used to", "this was added because". The CHANGELOG holds the chronology.
- **Preserve voice.** Each doc has an established register; read the existing sections as a style anchor before writing new ones.
- **Cross-reference by section number within a doc**, by canonical filename across docs.
- **No em dashes.** Use commas, parentheses, semicolons, or sentence breaks.

### 2.7 Anti-patterns to reject before opening the PR

- "Added in feat/X" or "introduced in slow-loop/2026-..."
- "Previously X, now Y"
- `(new)` or `(updated)` markers in headings
- Inline dates like "(as of 2026-06-08)"
- Past-tense narrative

If a rewrite needs any of these to make sense, the job is doing it wrong. The doc describes end state; the why goes in the CHANGELOG entry or the (now-archived) feature spec.

### 2.8 Conflict handling

- **Two CHANGELOG entries disagree:** latest ships wins; older statement is overwritten in the canonical doc. Flag in PR description.
- **CHANGELOG disagrees with current code:** code wins; canonical doc updated to match code reality. Flag for human review.
- **Ambiguous which doc owns a change:** open the PR with the job's best guess; flag for review.

### 2.9 Repository structure consistency check

The reconciliation job also runs mechanical checks against `docs/engineering.md` §14:

- Root inventory: every entry at root must be one of these. Files: `.gitignore`, `.githooks/`, `.maintenance-state`, `.prettierignore`, `.prettierrc`, `CLAUDE.md`, `DECISIONS.md`, `MAINTENANCE.md`, `claude-design.md`, `eslint.config.js`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.base.json`, `vercel.json`. Directories: `.claude/`, `.github/`, `app/`, `archive/`, `data/`, `design_handoff/`, `docs/`, `engine/`, `features/`, `scripts/`. Gitignored entries the check tolerates: `.git`, `.vercel`, `node_modules`.
- Empty-but-anticipated directories carry `.gitkeep`.
- Folder naming follows the conventions in `docs/engineering.md` §14.

Mismatches flag in the PR description. The job does not move or rename files autonomously.

## 3. Slow-loop mark-applied action

A GitHub Action at `.github/workflows/slow-loop-applied.yml` closes the slow-loop feedback cycle: when a `slow-loop/*` PR merges into `main`, the action calls internal Convex mutations to mark the consumed `comments` and `manualChanges` rows `applied` or `reviewed_no_change` and the consumed `incidents` rows resolved. Without it, the next `/slow-loop` run would reread the same queued signal and reprocess it.

### 3.1 PR body contract

`/slow-loop` produces a PR body with two sources of truth for the action:

1. A `## Consumed comments by cluster` section with one fenced ` ```cluster ` block per cluster. Each block has four keys: `outcome:` (either `applied` or `reviewed_no_change`, derived from that cluster's diagnosis card "Chosen level"), `comment_ids:` (comma-separated comment ids consumed by this cluster, or `-` if none), `manual_change_ids:` (comma-separated `manualChanges` row ids, or `-`), and `incident_ids:` (comma-separated, or `-`). The action parses this section to map each id to the correct outcome.
2. Flat `Consumed comment IDs:`, `Consumed manual-change IDs:`, and `Consumed incident IDs:` lines for human readability and as a fallback. If the per-cluster section is absent, the action treats every listed id as `applied` (conservative default for a PR that touched files).

### 3.2 Convex mutations called

Five `internalMutation` functions (not exposed to the browser), split across `app/convex/comments.ts` and `app/convex/manualChangesMutations.ts`:

- `comments:markCommentsApplied({ commentIds, resolvedPr })` sets each row `status: "applied"`, `resolvedAt: now`, `resolvedPr: <PR URL>`.
- `comments:markCommentsReviewedNoChange({ commentIds, resolvedPr })` same shape, status `reviewed_no_change`.
- `comments:markIncidentsResolved({ incidentIds, resolvedPr })` sets `resolvedAt: now` on each incident row.
- `manualChangesMutations:markManualChangesApplied({ ids, resolvedPr })` sets each `manualChanges` row `status: "applied"`, `resolvedAt: now`, `resolvedPr: <PR URL>`.
- `manualChangesMutations:markManualChangesReviewedNoChange({ ids, resolvedPr })` same shape, status `reviewed_no_change`.

Each mutation handles missing or already-resolved ids by inserting a `warn`-severity `incidents` row noting which id was skipped, then continuing. The mutations never throw; the post-merge step is best-effort and must not block a merge.

### 3.3 Debugging a failed run

If the action runs but the next `/slow-loop` invocation still sees stale `queued` comments, follow these steps in order:

1. Open the Actions tab on GitHub, find the `Slow-loop mark applied` run for the merged slow-loop PR, and read the log lines prefixed `[slow-loop-mark-applied]`. They report how many cluster blocks parsed, the applied/reviewed_no_change/incidents counts, and any Convex CLI exit codes.
2. If the parse counts read zero clusters and zero flat ids, the slow-loop PR body did not include either section; edit `.claude/commands/slow-loop.md` if `/slow-loop`'s output drifted, or hand-correct the comments via `npx convex run --prod comments:markCommentsApplied '{ "commentIds": ["..."], "resolvedPr": "..." }'`.
3. If the Convex CLI returned non-zero, check the production deployment (`disciplined-chameleon-263`) for incident rows written by the mutations themselves; they record which ids were skipped and why.
4. The action skips entirely when `pull_request.merged` is false or the head ref is not `slow-loop/*`; that is by design and not a failure.

## 4. State file

`.maintenance-state` at root holds the input-window marker for the reconciliation job:

```
last_reconcile: 2026-07-12
last_slow_loop: 2026-07-13
```

Committed to the repo. The job history becomes part of `git log` and is visible to anyone who clones.

## 5. First run notes

- The first `/reconcile-docs` run is a no-op: the canonical docs were written fresh as part of the restructure.
- The first `/slow-loop` run after the app is live will have zero queued comments (none have been logged yet). The session writes a one-line PR or simply exits with a status report; an empty slow loop is a healthy outcome, not a failure.
