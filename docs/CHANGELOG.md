# CHANGELOG

Append-only chronology of shipped changes. One entry per change. Newest first.

Format:

```
## YYYY-MM-DD  short title

Brief description in present tense, one to three sentences. Reference the PR.
```

---

## 2026-06-08  Stream C slice 1: schema audit, read-only queries, dev seed

Three new Convex queries under `app/convex/queries/`: `getCurrentWeek` (latest `currentWeek` row or null), `listQueuedComments` (queued comments ascending by `createdAt`), `listIncidents` (open incidents descending by `createdAt`). Plus `app/convex/seed.ts` exporting `seedCurrentWeek`, an internal mutation that inserts a sample week for dev, runnable as `npx convex run seed:seedCurrentWeek`. Schema audit against `docs/engineering.md` §3: matches spec on all five tables. Indexes present in the schema (used by these queries) are not enumerated in §3; deferred to a docs maintenance pass. `app/convex/_generated/` is now tracked in git so CI's typecheck has the types without needing a Convex deploy key on every PR. (#6)

Mutations (`swapDish`, `addCustomOneOff`, `addComment`, `finalizeWeek`), auto-recovery middleware, and `getGroceryList` are deferred to later Stream C slices that depend on Stream B engine integration.

Surfaces the same `weekArchive` vs `MenuHistoryRow` shape question PR #7 raised; reconciliation still deferred.

## 2026-06-08  Stream B slice 1: engine eligibility

`engine/src/eligibility.ts` exports `eligibleDishes({ library, history, season, slot })` mirroring `docs/engine.md` §1. The §1 predicates implemented are `Active=Yes` and the seasons match (`seasons === "All" || seasons.includes(season)`). Pure functions, no I/O, library order preserved. The `slot` argument is accepted for forward-compatible signature but not consumed by §1 itself (Time-vs-meal match is §3 composition's job). 14 unit tests cover each predicate independently and combined; total engine suite now 29 tests across 6 files. (#5)

Foundation for `schedule.ts`, `composition.ts`, `priority.ts`, `cap.ts`, `consolidation.ts`, and the `generateWeek` and `rankCandidatesForSlot` public APIs, all queued for later Stream B slices.

## 2026-06-08  Stream A slice 2: menu_history parser + cross-file validators

`MenuHistoryRow` Zod schema in `engine/src/data/schemas.ts` (plus reusable `DayNameSchema` and `IsoDateSchema`). `parseMenuHistory` walks the multi-section `## Week of <date>` structure in `data/menu_history.md` and validates rows with row-named errors. `serializeMenuHistory` round-trips byte-identical. Two cross-file validators in a new `engine/src/data/validators.ts`: `validateMenuHistoryAgainstLibrary` (every dish id in history exists in dishes) and `validatePackSizesUsed` (every tracked ingredient in the pack-size header is used somewhere). Both throw a single message listing every offender. (#7)

Surfaces two follow-ups: (1) `weekArchive` shape in `app/convex/schema.ts` does not currently match `MenuHistoryRow` casing or `weekStart` placement; spec says they should mirror; reconciliation deferred. (2) Live `data/menu_history.md` references dish id 7 (Rajma) that is absent from `data/dishes.md`; validator caught it; route to slow-loop.

## 2026-06-08  Stream E slice 1: slow-loop slash command + dry-run fixtures

Defines `/slow-loop` as a Claude Code slash command at `.claude/commands/slow-loop.md`. The prompt inlines the right-size discipline (`docs/product.md` §4 Principle 1) and the diagnosis card format (`docs/development.md` §5), supports a `--fixture <path>` argument for EM dry-runs before real comments accumulate, and names the production Convex deployment (`disciplined-chameleon-263`) explicitly. Adds synthetic queued-comments and incidents JSON fixtures at `data/test-fixtures/slow-loop/` matching the `comments` and `incidents` table shapes in `app/convex/schema.ts`, including a cross-input cluster (paneer fatigue across two comments plus a recency incident) so the EM can exercise clustering judgement during dry-run. (#4)

## 2026-06-08  Stream A slice 1: dish + ingredient parsers

Typed schemas and round-trip parsers for `data/dishes.md` and `data/ingredients.md`. Adds `zod` to the engine package and a small set of Zod schemas + inferred TS types for `Dish`, `Ingredient`, `PackSizeHeader`. `parseDishes` and `parseIngredients` validate via Zod and throw row-named errors on bad input. `serializeDishes` and `serializeIngredients` round-trip byte-identical to the source files (modulo a documented whitespace rule). Round-trip tests run against the live data files in CI. Out of scope and queued for later Stream A slices: `data/menu_history.md` parser, cross-file validators, the build-pipeline emit of `library.ts` / `history.ts`. (#3)

## 2026-06-08  Deploy pipeline live; custom domains resolving

DNS auto-configured via the Vercel-Cloudflare integration; `plantry.mudgal.xyz` and `plantry-dev.mudgal.xyz` both serve the PWA over HTTPS (200 OK). The GitHub-Vercel integration auto-deploys the frontend on push to main. A new `Deploy Convex` GitHub Action deploys schema and functions to `disciplined-chameleon-263.convex.cloud` on push to main when `app/convex/`, `engine/`, or `data/` changes. CI workflow runs unchanged on every PR and push.

## 2026-06-08  Bootstrap: monorepo, PWA shell, Convex schema, hooks, CI

Stream 0 ships. npm workspaces across `engine/`, `app/web/`, `app/convex/` with shared TypeScript config (strict). The frontend is a minimal Vite + React + Workbox PWA loading a Hello Plantry page. `app/convex/schema.ts` declares the five runtime tables (`currentWeek`, `weekArchive`, `comments`, `incidents`, `userProfiles`) from `docs/engineering.md` §3. A pre-commit hook installed by `scripts/install-hooks.sh` refuses code-path commits from the main coordination directory while allowing them from worktrees, detecting which by whether `.git` is a directory or a file at the toplevel. CI runs lint, typecheck, frontend build, and the engine smoke test on Node 20. ESLint 9 flat config and Prettier with sensible defaults. (#1)
