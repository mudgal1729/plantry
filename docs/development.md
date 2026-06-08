# Development

How changes are made in this repo. Session model, worktree workflow, ship workflow, definition of done, diagnosis card discipline, slow loop trigger, escalation, commit conventions, anti-patterns.

## 1. Session model

Plantry has one persistent Claude Code session that holds the engineering manager (EM) role and short-lived engineer sessions spawned by the EM for scoped work. Rajat talks to the EM. The EM never writes feature code directly; it spawns engineers, reviews their PRs, decides what merges, escalates only when it cannot decide alone.

**EM responsibilities:**
- Hold and re-read the four canonical docs and `features/phase2.md` at the start of every session.
- Identify the next unblocked stream from the current feature's stream-state table.
- Spawn an engineer for that stream in its own git worktree on its own branch, with a scoped brief, a pointer to the canonical docs, and a definition of done.
- Review every engineer PR before merge against the principles in `docs/product.md` §4 and the CI gates in `docs/engineering.md` §15.
- Track cross-stream consistency (a schema change should ripple to engine, Convex schema, frontend).
- Maintain `DECISIONS.md`: append-only log of non-trivial choices taken without Rajat.
- Surface batched open items to Rajat at natural checkpoints, never piecemeal.

**EM does not:**
- Write feature code.
- Create or change the GitHub repo, the Convex deployment, or hosting choices without Rajat's go-ahead.
- Push to remote without Rajat's first-push authorization.
- Edit `docs/engine.md` without a matching engine code and test change in the same PR. (CI also blocks this.)
- Accept work that violates the principles, even on push-back.
- Run destructive git operations.

**Engineer responsibilities:**
- Read `CLAUDE.md`, `docs/development.md` (this doc), and the relevant canonical docs.
- Stay in one stream and one PR-sized chunk.
- Carry a diagnosis card in every PR description (see §5).
- Ask the EM clarifying questions in the PR rather than guess.
- Self-test against the CI gates locally before opening the PR.

## 2. Worktree workflow

Every code-touching session works in its own git worktree on its own feature branch. The main repo directory at `/Users/rajatmugdal/Downloads/AI Products/Plantry` is the EM's read-coordinate-review space; a pre-commit hook in `.git/hooks/` rejects commits from it. Engineers commit from their worktree, not the main directory.

**To start a new engineer stream:** the EM invokes `/new-stream <branch> <stream-letter>` (see `.claude/commands/new-stream.md`). The command creates `../plantry-<branch>/` as a worktree, checks out a fresh branch, drops the engineer brief into the worktree, and opens a new Claude Code session anchored there.

**Branch naming:**
- `feat/<stream-letter>-<short-name>` for engineer streams. Example: `feat/B-engine-section-1-3`.
- `slow-loop/<date>` for slow-loop PRs. Example: `slow-loop/2026-07-12`.
- `docs/maintenance-<date>` for canonical-doc reconciliation. Example: `docs/maintenance-2026-07-12`.
- `chore/<short>` for tooling, deps, CI.

**Cleanup:** on merge, the EM removes the worktree (`git worktree remove`) and deletes the local branch.

## 3. Ship workflow

1. Engineer finishes work in worktree, runs CI gates locally (lint, type-check, tests, simulation harness, round-trip), opens a PR with a diagnosis card.
2. Vercel deploys a preview to `plantry-dev.mudgal.xyz` (aliased to the current PR's preview URL). Convex deploys a preview environment with an isolated DB.
3. EM reviews the PR against principles and gates. Either merges or sends back with specific notes.
4. On merge to `main`, Vercel and Convex promote to production at `plantry.mudgal.xyz`. The EM verifies the live deploy (open the URL, check the current week renders, no console errors).
5. EM appends an entry to `docs/CHANGELOG.md` (one line: date + what shipped + PR link).
6. EM removes the worktree.

## 4. Definition of done

A PR is done when ALL of:

- All CI gates pass (see `docs/engineering.md` §15).
- The diagnosis card is present in the PR description.
- New behavior has tests; the simulation harness still passes.
- No scope creep: the PR changes only what its brief described.
- No principle violation: an EM reviewer would not flag anything in `docs/product.md` §4.
- No `// TODO` left behind without a tracked follow-up in `features/phase2.md` or a new feature doc.
- For UI changes: a screenshot or short Loom in the PR description; the EM has opened the preview URL and clicked through the new feature.

## 5. Diagnosis card

Every PR description starts with a diagnosis card. Engineer PRs, slow-loop PRs, EM-authored chore PRs, all of them. The card forces right-size discipline (Principle 1) to be auditable.

```
## Diagnosis

**Problem size:** one-off | small pattern | structural
**Trigger:** (PR brief link, comment ID, incident ID, or rule citation)
**Candidate fix levels considered:**
  - data row: <what would change>
  - new tag: <what would change>
  - rule edit: <what would change>
  - engine code: <what would change>
  - UI affordance: <what would change>
  - infrastructure: <what would change>
**Chosen level:** <one>
**Why this level:** <one or two sentences>
**Generality check:** <does this also unlock other latent improvements, or is it brittle to this one case>
**Rejected alternatives:** <one or two sentences per rejected level>
```

For trivial changes (a typo fix, a dep bump) the card is one line: `**Problem size:** trivial; no diagnosis needed.` The EM uses judgment on what counts as trivial.

For PRs that propose no behavior change after diagnosis ("the comment looks like a one-week aberration"), the card states this explicitly and the PR exists only to mark the queued items `reviewed_no_change` with the reason.

## 6. Slow loop trigger

The slow loop runs only when Rajat invokes it. Convention is Sunday around 11am IST, but the cadence is not enforced.

**To run the slow loop:**
1. Rajat opens a Claude Code session in the main repo directory.
2. Types `/slow-loop`. (Definition lives at `.claude/commands/slow-loop.md`.)
3. The session reads queued comments from Convex (via `npx convex run`), reads `data/dishes.md`, `data/ingredients.md`, `data/menu_history.md`, `docs/engine.md`, and recent `incidents` from Convex.
4. The session clusters comments + incidents into themes and applies right-size discipline. For each theme it picks one of: data fix, tag addition, rule edit, no change warranted.
5. The session opens a PR with a diagnosis card per theme, file diffs across `data/dishes.md`, `data/ingredients.md`, `docs/engine.md`, `engine/src/`, and an appended `data/changelog.md` entry.
6. Rajat reviews on GitHub. Merge applies. On merge a GitHub Action posts back to Convex to mark consumed comments `applied` and link the PR.

Full slow-loop spec: `MAINTENANCE.md`.

## 7. Escalation rules

The EM decides on its own:
- Stream sequencing and engineer brief shape.
- PR merges that pass principles and gates.
- File and folder organization changes within the agreed layout.
- Test-only changes, dep bumps, lint fixes.
- Most slow-loop reasoning (the card makes the reasoning auditable).

The EM surfaces to Rajat before acting:
- Visibly destructive operations (force-push, history rewrite, dropping a Convex table, deleting branches).
- Cross-stream product behavior changes (e.g., changing what the menu image looks like).
- Cost or hosting changes (Convex paid tier, switching frontend host, buying a domain).
- Adding a tool, service, or library not named in `docs/engineering.md`.
- Any structural change to canonical data (`data/dishes.md`, `data/ingredients.md`, `docs/engine.md`) initiated by the EM rather than the slow loop.
- Genuine judgment ties where the EM has weighed both sides.

EM-without-Rajat decisions go into `DECISIONS.md`. Rajat scans periodically; can override anything by replying in chat or editing the doc.

## 8. Commit conventions

- One concern per commit. Resist piling unrelated fixes into one commit.
- Imperative present tense in the subject. "Add round-trip test for ingredients" not "Added" or "Adding".
- Subject <= 70 characters; wrap body at 72.
- Body is optional for tiny commits; required for anything non-obvious.
- No "WIP" commits on `main`; squash before merge if needed.
- No co-author trailers unless Rajat asks.

## 9. Anti-patterns

The EM rejects PRs that exhibit any of:

- Sycophantic agreement to a comment without applying right-size discipline ("the comment said too spicy, so I added a low_spice tag" without considering whether one comment justifies a tag).
- Generalizing from one or two cases ("we could add a column to handle this and three other hypothetical cases").
- Adding a Pydantic-style abstraction or helper before two existing call sites need it.
- Touching `docs/engine.md` without a matching engine code change.
- Touching `data/dishes.md` or `data/ingredients.md` outside a slow-loop PR.
- Past-tense narrative in canonical docs ("we used to do X but now do Y").
- "Refactor while I'm here" scope creep.
- New libraries or platform services not in `docs/engineering.md` §1.
- TODO comments without a tracked follow-up.
- Mocking the database in tests that should hit the real Convex preview deployment.

## 10. Asking for help

When an engineer is blocked, the engineer posts a single comment on the PR addressed to the EM:

```
## EM check needed

**What I'm trying to do:** <one sentence>
**What I tried:** <bullets>
**Where I'm stuck:** <one sentence>
**Two options I see:** <a>, <b>
**My lean:** <a or b, with one reason>
```

The EM either answers or escalates to Rajat. Engineers do not ping Rajat directly.

## 11. Glossary

- **Worktree.** A git feature: multiple working directories sharing one repository, each on a different branch. Lets the EM spawn engineers in parallel without their changes overlapping until merge.
- **Pre-commit hook.** A script in `.git/hooks/` that runs before every commit and can refuse the commit. Used here to keep commits out of the main coordination directory.
- **Convex preview deployment.** Convex's per-PR isolated environment with its own database. Lets you test a PR's backend without touching production.
- **Vercel preview deployment.** Same idea, for the frontend. Every PR gets a unique URL.
- **Squash merge.** Combining all of a PR's commits into one before landing on `main`. Keeps `main` history clean.
- **CI gate.** A check defined in `.github/workflows/ci.yml` that runs on every PR. Failing any gate blocks merge.
