# Plantry — Repo orientation

Read this first.

## What Plantry is

A weekly meal planner for Rajat and Tuhina in Bangalore. A Progressive Web App reads a fixed dish library and a rules spec, generates a Mon-to-Sat menu (breakfast and lunch) every week, renders a shareable menu image and grocery list, and supports in-week dish swaps, custom one-offs, and queued comments. A separate slow loop turns accumulated comments into structural changes via human-approved pull requests.

Full product spec: `docs/product.md`.

## Doc hierarchy

Four canonical specs plus a changelog in `docs/`, three operational docs at root.

- `docs/product.md` — what we are building, persona, scope, principles, tone, future scope. Owns scope decisions.
- `docs/engine.md` — the meal-planning rules spec. The TS engine mirrors this; CI fails if they drift. Owns rule decisions.
- `docs/engineering.md` — stack, Convex schema, data layer split, deploy model, hosting, Swiggy MCP shape, env vars. Owns stack and integration decisions.
- `docs/development.md` — session isolation, worktree workflow, ship workflow, definition of done, diagnosis card, slow-loop trigger, escalation rules, commit conventions. Owns "how to make changes" decisions.
- `docs/CHANGELOG.md` — append-only chronological index of shipped changes. One entry per change.

Read order by task:

- Starting any session that will touch code → `docs/development.md`. Always.
- Touching the rules or the engine → `docs/engine.md` + the matching `engine/src/` module.
- Touching Convex schema, frontend, deploy, hosting, integrations → `docs/engineering.md`.
- Asking why something exists → `docs/CHANGELOG.md`, then `archive/`.
- Starting or planning a feature → all four canonical specs + `features/<name>.md`.

## Currently building

> `features/manual-changes.md` — Stream I. Persist every manual swap and custom one-off with a required user reason; feed the log into the slow loop so rule redesign is grounded in observed behavior.

When no feature is active, this line reads "_none_".

## Working folders

- `data/` — human-edited library, ingredient quantities, history seed, structural changelog, generated menu images. The slow loop's target.
- `engine/` — TypeScript engine module. Pure functions; imported by Convex functions and tests.
- `app/convex/` — Convex schema and server functions. The backend lives here.
- `app/web/` — Vite + React + TS PWA. Frontend.
- `features/` — active feature spec. Empty (.gitkeep) between features.
- `archive/` — history. **Do not read for current truth.** Old plans, handoffs, retired docs.
- `.claude/commands/` — repo-scoped Claude Code slash commands (`/slow-loop`, `/new-stream`).

## Working in this repo

Code-touching sessions work in their own git worktree. The main directory at `/Users/rajatmugdal/Downloads/AI Products/Plantry` is the EM's coordinate-and-review space; a pre-commit hook in `.git/hooks/` rejects commits from it. Engineers commit from their worktree.

The EM (this session by default) spawns engineers via `/new-stream <branch> <stream>`. Rajat invokes the slow loop via `/slow-loop`. Both commands are defined under `.claude/commands/`.

Full ground rules (session model, branch naming, commit style, definition of done, ship workflow, escalation, anti-patterns) live in `docs/development.md`.

## Operational docs

- `MAINTENANCE.md` — spec for the slow loop and for canonical-doc reconciliation. Read before running `/slow-loop`.
- `DECISIONS.md` — append-only log of decisions the EM has taken on Rajat's behalf, with reasoning. Scannable.
- `docs/development.md` — ground rules for making changes in this repo.

## Project-specific style

- No em dashes or long dashes in user-facing content: PWA UI strings, generated menu images, grocery lists, share images. Em dashes are fine in internal docs (specs, CHANGELOG, DECISIONS, briefs, PR descriptions, code comments, commit messages); use them sparingly there too.
- Canonical docs in `docs/` read as present-tense steady-state specs. No "added in", no "previously", no historical seams. The CHANGELOG holds the chronology.
- Explain non-obvious software, infra, data, finance, or business-strategy concepts inline; Rajat prefers more information, never less, on terms an experienced PM would not already know. Skip explanations for PM-craft and Indian quick-commerce knowledge.
