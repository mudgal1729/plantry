# CHANGELOG

Append-only chronology of shipped changes. One entry per change. Newest first.

Format:

```
## YYYY-MM-DD  short title

Brief description in present tense, one to three sentences. Reference the PR.
```

---

## 2026-06-08  Stream E slice 1: slow-loop slash command + dry-run fixtures

Defines `/slow-loop` as a Claude Code slash command at `.claude/commands/slow-loop.md`. The prompt inlines the right-size discipline (`docs/product.md` §4 Principle 1) and the diagnosis card format (`docs/development.md` §5), supports a `--fixture <path>` argument for EM dry-runs before real comments accumulate, and names the production Convex deployment (`disciplined-chameleon-263`) explicitly. Adds synthetic queued-comments and incidents JSON fixtures at `data/test-fixtures/slow-loop/` matching the `comments` and `incidents` table shapes in `app/convex/schema.ts`, including a cross-input cluster (paneer fatigue across two comments plus a recency incident) so the EM can exercise clustering judgement during dry-run. (#4)

## 2026-06-08  Stream A slice 1: dish + ingredient parsers

Typed schemas and round-trip parsers for `data/dishes.md` and `data/ingredients.md`. Adds `zod` to the engine package and a small set of Zod schemas + inferred TS types for `Dish`, `Ingredient`, `PackSizeHeader`. `parseDishes` and `parseIngredients` validate via Zod and throw row-named errors on bad input. `serializeDishes` and `serializeIngredients` round-trip byte-identical to the source files (modulo a documented whitespace rule). Round-trip tests run against the live data files in CI. Out of scope and queued for later Stream A slices: `data/menu_history.md` parser, cross-file validators, the build-pipeline emit of `library.ts` / `history.ts`. (#3)

## 2026-06-08  Deploy pipeline live; custom domains resolving

DNS auto-configured via the Vercel-Cloudflare integration; `plantry.mudgal.xyz` and `plantry-dev.mudgal.xyz` both serve the PWA over HTTPS (200 OK). The GitHub-Vercel integration auto-deploys the frontend on push to main. A new `Deploy Convex` GitHub Action deploys schema and functions to `disciplined-chameleon-263.convex.cloud` on push to main when `app/convex/`, `engine/`, or `data/` changes. CI workflow runs unchanged on every PR and push.

## 2026-06-08  Bootstrap: monorepo, PWA shell, Convex schema, hooks, CI

Stream 0 ships. npm workspaces across `engine/`, `app/web/`, `app/convex/` with shared TypeScript config (strict). The frontend is a minimal Vite + React + Workbox PWA loading a Hello Plantry page. `app/convex/schema.ts` declares the five runtime tables (`currentWeek`, `weekArchive`, `comments`, `incidents`, `userProfiles`) from `docs/engineering.md` §3. A pre-commit hook installed by `scripts/install-hooks.sh` refuses code-path commits from the main coordination directory while allowing them from worktrees, detecting which by whether `.git` is a directory or a file at the toplevel. CI runs lint, typecheck, frontend build, and the engine smoke test on Node 20. ESLint 9 flat config and Prettier with sensible defaults. (#1)
