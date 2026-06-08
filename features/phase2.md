# Phase 2 — Two-user collaborative PWA

The active feature spec. Replaces the original `HANDOFF_phase2.md` (archived). Tracks streams, current state, open items, risks. Moves to `archive/features/phase2.md` when shipped.

## 1. Goal

Make Plantry usable by Rajat and Tuhina together as a small PWA:

1. Both phones see the same current-week menu and grocery list.
2. Either can swap a dish (engine-suggested alternatives), drop in a custom one-off, or leave a comment.
3. Fast-loop edits apply immediately and are author-stamped; never touch the rules or library.
4. The slow loop reads queued comments and proposes structural changes via PR.

Ships when both Rajat and Tuhina have the PWA installed on their phones, can swap and comment in real time, and at least one slow-loop run has produced and merged a structural PR end-to-end.

## 2. Streams

Eight streams; up to four run in parallel at peak. The EM spawns engineers; Rajat does not need to start sessions.

```
Stream 0  Repo + CI scaffold + Convex/Vercel project init   [serial, first]
   |
   +--> Stream A  Data layer (parsers + typed schemas + library bake)
   |       |
   |       +--> Stream B  Engine (rules.md to TS, simulation harness)
   |       |
   |       +--> Stream C  Convex backend (schema + functions)
   |       |
   |       +--> Stream E  Slow-loop session + /slow-loop command  [after A]
   |
   +--> Stream D  PWA frontend (read-only first, then interactive)
   |
   +--> Stream F  Identity + concurrency + deploy integration   [late]
   |
   +--> Stream G  EM/agent infrastructure   [continuous]
```

At peak: B, C, D, E run concurrently in four worktrees.

## 3. Stream briefs

### Stream 0 — Repo + CI scaffold + project init (serial)

Outcomes:
- GitHub repo `plantry` created public under Rajat's account, pushed.
- `.gitignore`, `.github/workflows/ci.yml` with placeholder gates.
- Pre-commit hook installed in `.git/hooks/pre-commit` that rejects commits from the main directory (engineers must work in worktrees).
- Convex project initialized (`npx convex dev`) with prod + preview deployments.
- Vercel project initialized; `plantry.mudgal.xyz` and `plantry-dev.mudgal.xyz` DNS records added by Rajat; aliases wired.
- `.maintenance-state` file with initial markers.

Definition of done: `git clone`, `npm install`, `npm run dev`, and the empty-but-correct PWA shell loads against the Convex preview deployment. CI runs on PRs.

### Stream A — Data layer

Outcomes:
- TypeScript types for Dish, Ingredient, PackSizeHeader, MenuHistoryRow, ChangeRequest, Incident, WeekState.
- Markdown parser (`engine/src/data/parse.ts`) and serializer (`engine/src/data/serialize.ts`) for `data/dishes.md` and `data/ingredients.md`. Round-trip byte-identical (modulo declared whitespace).
- Cross-file validators: every Dish ID in `menu_history.md` exists in `dishes.md`; every tracked ingredient in pack-size header is used somewhere in `ingredients.md`.
- Build pipeline emits `engine/src/data/library.ts` and `engine/src/data/history.ts` (typed exports) from the markdown on every build.
- Round-trip + cross-file validation tests in CI.

### Stream B — Engine

Outcomes:
- TS engine module under `engine/src/`. Sections mirror `docs/engine.md`: `eligibility.ts`, `schedule.ts`, `composition.ts` (Option A/B/C + Menu 1/2/3/4), `priority.ts`, `cap.ts`, `consolidation.ts`.
- Unit tests per section.
- Two public APIs: `generateWeek(weekStart, library, history, season)` returns a full valid week; `rankCandidatesForSlot(weekStart, day, slot, library, history)` returns the ranked alternatives (used by dish-swap auto-suggest).
- 5-week forward simulation harness. Replays four known bugs from `archive/learnings-v0.md` ("Simulate before adding rules"): rice + dry-only, keto pool too small, mislabeled HP carbs, dry HP + carb leaving no gravy.
- Property tests: item cap, no-repeat, Saturday alternation.

### Stream C — Convex backend

Outcomes:
- `app/convex/schema.ts` with the tables in `docs/engineering.md` §3.
- Mutations: `swapDish`, `addCustomOneOff`, `addComment`, `finalizeWeek`. All require `author`; reject otherwise.
- Queries: `getCurrentWeek`, `getGroceryList` (structured, the same shape Swiggy MCP will consume), `listQueuedComments`, `listIncidents`.
- Auto-recovery middleware: every generated menu validates against engine rules before commit; on failure, `incident` row written and last-good week returned.
- Optimistic concurrency on `currentWeek` via `version`.

### Stream D — PWA frontend

Outcomes:
- Vite + React + TS + Workbox PWA under `app/web/`.
- Splash with passcode gate; on success, identity picker ("I am Rajat", "I am Tuhina"), stored in `userProfiles` and localStorage.
- Read-only current-week view + grocery list (the highest-value milestone per `archive/learnings-v0.md`).
- Dish swap UI with engine-suggested alternatives.
- Custom one-off entry.
- Comment-on-dish + comment-on-day affordances.
- Service worker caches the app shell and last-good week.
- Installable on iOS Safari and Android Chrome.

### Stream E — Slow-loop session and /slow-loop command

Outcomes:
- `.claude/commands/slow-loop.md` defines the slash command.
- The command's prompt encodes the right-size discipline (`docs/product.md` §4 Principle 1) and the diagnosis card format (`docs/development.md` §5).
- Helper script to read Convex `comments` and `incidents` from the session.
- A test fixture (synthetic queued comments) the EM can use to dry-run the slow loop before the app is live.
- A GitHub Action that, on merge of a `slow-loop/*` branch, marks consumed Convex comments `applied` and triggers redeploy.

### Stream F — Identity + concurrency + deploy

Outcomes:
- Passcode gate wired end to end.
- Optimistic-concurrency UI: on version mismatch, prompt with reload-and-retry.
- Vercel `plantry-dev` alias auto-updates to the current open PR's preview URL.
- Convex preview branch is created per PR; teardown on merge.
- One end-to-end test: open the PWA, swap a dish, both phones update.

### Stream G — EM scaffolding

Continuous. Maintains:
- `.claude/commands/new-stream.md` — spawn-engineer helper.
- `.claude/commands/slow-loop.md` — slow-loop trigger.
- This file (`features/phase2.md`) — stream state table.
- `DECISIONS.md` — autonomy log.

## 4. Current stream state

| Stream | Status | Owner | Notes |
|---|---|---|---|
| 0 Bootstrap (monorepo, PWA shell, schema, hooks, CI) | shipped | EM | PR #1 merged 2026-06-08. One-time exception: EM did the work in the worktree because subagent sandbox blocked sibling-path access. Convex/Vercel project creation is a separate browser-auth step. |
| 0.5 Convex + Vercel project init + deploy CI | partial | EM + Rajat | EM linked both via CLI (PR #2 merged). Preview deploy verified. Open: domain aliases (Rajat); production Convex deploy + GH Actions deploy step (EM after Rajat confirms domains). |
| A Data layer | not started | TBD | Starts after subagent permissions are fixed; first PR is dish/ingredient parsers + round-trip tests. |
| B Engine | not started | TBD | Starts after A's first PR. |
| C Convex backend | not started | TBD | Starts after Convex project exists + A's first PR. |
| D Frontend | not started | TBD | Starts after Convex client codegen lands (early in C). |
| E Slow-loop session | not started | TBD | Starts after A is live; can stub with fixtures meanwhile. |
| F Identity + concurrency + deploy | not started | TBD | Integrates near end. Includes automated hook test (followup from PR #1). |
| G EM scaffolding | continuous | EM | Initial scaffolding shipped with the restructure. |

EM updates this table at the start and end of every session.

## 5. Open items for Rajat

Items the EM cannot decide alone. Surfaced in batches at natural checkpoints, never piecemeal.

| # | Item | EM recommendation | Status |
|---|---|---|---|
| 1 | GitHub handle to create the public `plantry` repo under | `mudgal1729`. | Done; repo at https://github.com/mudgal1729/plantry. |
| 2 | DNS records for `plantry.mudgal.xyz` and `plantry-dev.mudgal.xyz` | Two CNAMEs in Cloudflare under `mudgal.xyz`, both pointing at `cname.vercel-dns.com`. | Done by Rajat. Awaits Vercel project to attach. |
| 3 | Tuhina's onboarding moment | Rajat walks her through; EM surfaces the milestone when read-only PWA is live. | Acknowledged. |
| 4 | Slow-loop cadence | Convention is Sunday around 11am IST; not enforced (manual trigger). | Locked. |
| 5 | Subagent worktree access | `.claude/settings.local.json` with additionalDirectories for stream-A through stream-F worktrees. | Done by EM. |
| 6 | Convex project creation | Team `rajatmudgaliitr`, project `plantry`, dev `lovely-curlew-631`, prod `disciplined-chameleon-263`. Schema deployed to both. | Done by EM. |
| 7 | Vercel project import + link | `mudgal1729s-projects/plantry`, linked from monorepo root, env vars set (prod and dev). | Done by EM. |
| 8 | Vercel domains added to project | `plantry.mudgal.xyz` and `plantry-dev.mudgal.xyz` registered in the project; verification pending CNAMEs. | Done by EM. |
| 9 | Cloudflare CNAMEs | Rajat to add in Cloudflare dashboard: `plantry` -> `cname.vercel-dns.com` (proxied off), `plantry-dev` -> `cname.vercel-dns.com` (proxied off). Or drop a CF API token for EM to set via API. | **Pending Rajat.** |
| 10 | Vercel token | Generated at vercel.com/account/tokens (no CLI). `gh secret set VERCEL_TOKEN` after. | **Pending Rajat.** |
| 11 | GH Actions deploy step | After items 9 and 10 land, EM wires `convex deploy --yes` + `vercel deploy --prod` into the CI workflow on push-to-main. | Blocked on 9 and 10. |

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Round-trip parser drift on `data/dishes.md` or `data/ingredients.md` | Round-trip tests in CI on every PR + daily scheduled run against the live data folder. |
| Engine drifts from `docs/engine.md` | CI gate fails any PR editing one without the other. Per-section module + paired test in `engine/test/`. |
| Slow loop becomes sycophantic | Diagnosis card mandatory. EM reviews slow-loop PRs the same as engineer PRs. "No change warranted" is a valid output, not silence. |
| Convex outage hides the menu on a phone | Service worker caches the app shell and last-good week; the PWA shows what to cook with a clear stale-data banner. |
| Concurrent edits to the same week | Optimistic concurrency via `version`; rejected save reloads, never overwrites. |
| Cart creation in the future breaks because ingredient names drifted | Schema validation on `data/ingredients.md` enforces canonical names. `docs/engineering.md` §13 documents the invariants. |

## 7. Ship checklist

Phase 2 ships when:

- [ ] `plantry.mudgal.xyz` serves the PWA over HTTPS.
- [ ] Rajat and Tuhina both have it installed; identity picker is stored per device.
- [ ] Current week renders end to end (engine generates, Convex persists, frontend displays).
- [ ] Either user can swap a dish; the other sees the swap within a few seconds.
- [ ] Either user can drop in a custom one-off; one-offs surface clearly.
- [ ] Either user can comment; comments appear queued in Convex.
- [ ] At least one slow-loop PR has been merged end to end (even if it's the test-fixture run).
- [ ] CHANGELOG entry written.
- [ ] This file moves to `archive/features/phase2.md`.
- [ ] `CLAUDE.md`'s "Currently building" line updates to `_none_`.
