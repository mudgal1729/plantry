---
description: Run canonical-doc reconciliation. Reads CHANGELOG entries since the last reconcile, identifies which canonical docs are affected, rewrites them in place to match shipped reality, and opens a PR.
---

You are running canonical-doc reconciliation for Plantry. This is a thinking exercise, not a script. The full spec lives in `MAINTENANCE.md` §2. Re-read it now. Read `docs/product.md` §4 (principles) and `docs/development.md` §5 (diagnosis card). The style rules below are restated so this command stands on its own; the canonical wording lives in `MAINTENANCE.md` §2.6.

Reconcile-docs runs only when Rajat invokes it. Canonical docs in `docs/` must read as coherent present-tense specs with no historical seams; producing that quality of writing while shipping a feature is unreliable, so reconciliation runs as a separate human-triggered pass.

## Style rules (canonical in `MAINTENANCE.md` §2.6)

Apply to every rewrite the reconciliation job produces.

- **Present tense.** "The slow loop runs when Rajat invokes it." Not "The slow loop will run..." or "Slow loop was added in feat/E1...".
- **One coherent document.** Section order is stable. Updates happen in place.
- **No slice, round, sprint, or date references** inside the doc body. The reader should not see the historical seams.
- **No changelog phrasing.** Strip "previously", "now also", "we used to", "this was added because". The CHANGELOG holds the chronology.
- **Preserve voice.** Each doc has an established register; read the existing sections as a style anchor before writing new ones.
- **Cross-reference by section number within a doc**, by canonical filename across docs.
- **No em dashes.** Use commas, parentheses, semicolons, or sentence breaks.

## Anti-patterns to reject before opening the PR (canonical in `MAINTENANCE.md` §2.7)

- "Added in feat/X" or "introduced in slow-loop/2026-..."
- "Previously X, now Y"
- `(new)` or `(updated)` markers in headings
- Inline dates like "(as of 2026-06-08)"
- Past-tense narrative

If a rewrite needs any of these to make sense, the job is doing it wrong. The doc describes end state; the why goes in the CHANGELOG entry or the (now-archived) feature spec.

## Per-doc scope (canonical in `MAINTENANCE.md` §2.5)

| CHANGELOG entry touches…                                                                                                                              | Update target         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Product scope, persona, principles, tone, future direction                                                                                            | `docs/product.md`     |
| Rules, slot composition, selection priority, item cap, ingredient consolidation, field reference                                                      | `docs/engine.md`      |
| Stack, schema, data layer split, deploy model, hosting, integrations, env vars, image format                                                          | `docs/engineering.md` |
| Session model, worktree workflow, ship workflow, definition of done, diagnosis card, slow-loop trigger, escalation, commit conventions, anti-patterns | `docs/development.md` |

A single shipped change often touches more than one doc. Keeping cross-doc consistency is the reconciliation job's responsibility.

`MAINTENANCE.md` is not a canonical doc; it is the spec for the canonical-doc reconciliation. If the session finds drift in `MAINTENANCE.md` itself (for example, references to functions that were renamed), include the fix in this PR with a clear scope note in the description, but do not let it expand into a broader rewrite.

## Conflict handling (canonical in `MAINTENANCE.md` §2.8)

- **Two CHANGELOG entries disagree:** latest ships wins; older statement is overwritten in the canonical doc. Flag in PR description.
- **CHANGELOG disagrees with current code:** code wins; canonical doc updated to match code reality. Flag for human review.
- **Ambiguous which doc owns a change:** open the PR with the job's best guess; flag for review.

## Arguments

- `since:<date>`. Narrow to CHANGELOG entries from this ISO date forward. Default: read `.maintenance-state` and process everything since the `last_reconcile` marker.
- `dry-run`. Produce the per-doc diff sketches in the chat as if you were about to open the PR, but do not write files or push.

## What to do

1. **Load context.** Read `docs/product.md`, `docs/engine.md`, `docs/engineering.md`, `docs/development.md`, `MAINTENANCE.md`, and `CLAUDE.md`. Read `data/changelog.md` and `docs/CHANGELOG.md`. Read `features/` if anything is active, plus any feature spec referenced by recent CHANGELOG entries (`archive/features/<name>.md` after ship). Cross-check doc claims against current code under `engine/`, `app/`, plus the data files.

2. **Determine the input window.** Read `.maintenance-state.last_reconcile`. List every entry in `docs/CHANGELOG.md` since that date (or since the `since:<date>` argument). If none, write a one-line summary, bump `last_reconcile` to today, and exit. An empty reconciliation is a healthy outcome.

3. **Per-doc affect map.** For each CHANGELOG entry, decide which canonical doc(s) it affects per §2.5. A single entry can affect multiple docs; keep cross-doc consistency in mind from the start.

4. **Per affected doc, rewrite the relevant sections in place.** Not as appends, not as "now also" additions. The doc must still read as one coherent spec after the edit. Verify factual claims against current code where checkable. Apply the style rules above.

5. **Open the PR.**
   - Branch name: `docs/maintenance-<today's date>` in `YYYY-MM-DD` form (per `docs/development.md` §2).
   - Title: `docs/maintenance/<date>: <one-line summary>`. Under 70 characters.
   - Body opens with the CHANGELOG entries processed (one line each), then a list of canonical docs touched and what moved in each, then "## Out of scope" naming entries deferred, then any flagged conflicts per §2.8.
   - One commit per canonical doc touched, plus a final infrastructure commit for `.maintenance-state` and any `.claude/commands/` updates.
   - For a dry-run (the `dry-run` argument), produce the per-doc diff sketches in the chat as if you were about to open the PR, but do not write files or push.

6. **Update `.maintenance-state`.** Bump `last_reconcile` to today's date in the same PR.

7. **Mechanical checks (per `MAINTENANCE.md` §2.9).** Verify the root inventory: every entry at root must be one of `.gitignore`, `CLAUDE.md`, `MAINTENANCE.md`, `DECISIONS.md`, `.git`, `.claude`, `.github`, `docs/`, `data/`, `features/`, `engine/`, `app/`, `archive/`. Empty-but-anticipated directories carry `.gitkeep`. Folder naming follows the conventions in `docs/engineering.md` §14. Flag mismatches in the PR description; do not move or rename files autonomously.

8. **Hand off.** Post a one-paragraph status to Rajat: "PR opened, here is the URL, here are the docs touched, here is what I flagged for review."

## What to refuse

- Rewriting a doc to mention a specific PR, stream letter, or date.
- Adding "previously" or "now also" phrasing.
- Touching `docs/engine.md` without a paired engine code and test change (the CI parity gate also catches this; do not fight the gate). If shipped reality changed engine rules, the slow loop is the right tool, not reconciliation.
- Expanding scope beyond the CHANGELOG entries in the input window. If a doc is wrong about something not in the window, flag it in the PR description and leave the fix for next time or for a focused chore PR.

## Why this command exists

Canonical docs drift fastest under ship pressure: a feature lands, the CHANGELOG entry records the chronology honestly, but the canonical doc carries the old steady-state until someone notices. Reconciliation runs against the CHANGELOG so the docs catch up methodically, in present tense, without the seams the rest of the repo accumulates.
