# Engineering

How Plantry is built. Stack, data layer split, runtime topology, hosting, deploy model, env vars, integration shapes. The rules of the meal-planning engine itself live in `docs/engine.md`; this doc owns everything else technical.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Engine (rules in code) | TypeScript module under `engine/` | Pure functions, no I/O. Imported by Convex functions and by tests. |
| YAML parsing | `yaml` | Reads per-dish file frontmatter (`data/dishes/<slug>.md`) at bake time. |
| Backend / API | Convex | Managed backend platform: typed schema, server functions, live sync to clients. No self-hosted server. |
| Frontend | Vite + React + TypeScript | PWA, installable on phones. |
| Service worker | Workbox | Caches the app shell + last-good week so the app opens on bad network. |
| Hosting (frontend) | Vercel (or Cloudflare Pages) | Static deploy + per-PR preview environments. |
| Hosting (backend) | Convex (managed) | Free tier covers this scale indefinitely. |
| DNS | Cloudflare (under mudgal.xyz) | `plantry.mudgal.xyz` for prod, `plantry-dev.mudgal.xyz` for preview. |
| CI | GitHub Actions | Round-trip parser, engine spec/code parity, simulation harness, type-check, lint. |
| Source control | GitHub (public repo `plantry`) | |

TypeScript is the single language across engine, backend, and frontend. Schema validation and typed data are first-class everywhere via Convex's typed schema and the engine's own types.

## 2. Data layer split

Plantry has two stores by design. The split is the load-bearing engineering decision; if a piece of data sits in the wrong place, fix the placement rather than working around it.

| Stays in git markdown | Stays in Convex tables |
|---|---|
| `data/dishes/<slug>.md`, one file per dish (frontmatter + ingredient rows) | `currentWeek`, the live Mon-Sat plan with overrides |
| `data/ingredients.md`, the ingredient catalog (one row per ingredient: group, unit, pack size) | `weekArchive`, finalized past weeks (queryable for the engine's recency rule) |
| `data/menu_history.md`, seed for first deploy (later, a periodic snapshot) | `comments`, queued slow-loop input |
| `data/changelog.md`, structural changes audit | `incidents`, runtime errors written by the auto-recovery middleware |
| `docs/engine.md`, the rules spec | `userProfiles`, device identity ("I am Rajat" or "I am Tuhina") |
| `engine/` source code | `swiggyCarts`, future Swiggy MCP integration state |

Principle for the split: anything a human edits by hand stays in git, because git's pull-request/diff/review workflow is what we want. Anything the running app writes stays in Convex, because committing on every swap would be slow, noisy, and turn git history into a transactional log. The audit-trail argument for git is preserved where it matters (library and rules); operational state has author + timestamp inside Convex.

## 3. Convex schema

`app/convex/schema.ts` is the authoritative schema. The sketch below mirrors it.

```
currentWeek
  weekStart: string (ISO date, Monday)
  status: "draft" | "final"
  slots: array of {
    day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"
    meal: "breakfast" | "lunch"
    dishes: array of {                 # one entry per dish in the meal
      dishId: number | null            # null if custom one-off
      customLabel: string | null       # populated if dishId is null
      source: "generated" | "swapped" | "custom"
      author: "rajat" | "tuhina" | "system"
      updatedAt: number
      includeRecipe?: boolean          # share preference: include this dish's recipe sheet
    }
  }
  skippedDays?: array of {             # days marked skipped this week
    day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"
    reason: string
    author: "rajat" | "tuhina"
    skippedAt: number
  }
  version: number                      # for optimistic concurrency
```

Each (day, meal) slot holds the engine's full pick list for that meal. Mon/Wed/Fri breakfast carries 2 dishes; Tue/Thu breakfast carries 1; Mon/Wed/Fri lunch carries 3; Tue/Thu lunch carries 4; Saturday lunch carries 3. Per-dish author and updatedAt let the slow loop attribute who changed which dish in a multi-dish meal. `includeRecipe` marks a dish whose recipe sheet rides along in the shared image family; it lives on the week so it resets when a new week document is generated. `skippedDays` records days the user is eating out or away; the day's dishes stay in `slots` (restore is lossless), and skipped days are excluded from the grocery list and the finalized archive.

```
weekArchive
  weekStart: string
  finalizedAt: number
  rows: array of {
    day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday"
    meal: "Breakfast" | "Lunch"
    dishName: string
    dishId: number
  }                                    # mirrors menu_history.md row format exactly

comments
  id: string
  createdAt: number
  author: "rajat" | "tuhina"
  attachedTo: { kind: "dish" | "day", weekStart: string, day?: string, dishId?: number }
  text: string
  status: "queued" | "in_review" | "applied" | "dismissed" | "reviewed_no_change"
  resolvedAt: number | null
  resolvedPr: string | null            # PR URL when applied

manualChanges                          # append-only log of user edits
  createdAt: number
  author: "rajat" | "tuhina"
  weekStart: string                    # ISO Monday, mirrors currentWeek
  day?: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"  # absent for day-less kinds (save_next_week)
  meal?: "breakfast" | "lunch"         # absent for day-level kinds
  position?: number                    # index into slots[].dishes; absent for day-level kinds
  changeKind: "swap" | "custom" | "delete" | "add" | "skip_day" | "restore_day" | "save_next_week"
  before: { dishId: number | null, customLabel: string | null }
  after:  { dishId: number | null, customLabel: string | null }
  reason: string                       # user-provided, non-empty after trim
  status: "queued" | "in_review" | "applied" | "dismissed" | "reviewed_no_change"
  resolvedAt: number | null
  resolvedPr: string | null

# One row per user edit to the live week. Dish-level kinds (swap, custom, delete,
# add) carry meal + position and the before/after pick state; `add` uses a null
# `before`, `delete` a null `after`. Day-level kinds (skip_day, restore_day) carry
# the day and null before/after. `save_next_week` records the saved dish in
# `after.dishId` and omits `day` entirely (it targets next week, not a day of
# this one). This table plus
# `comments` is the data behind the Changes tab.

nextWeekQueue                          # dishes saved for next week from Explore
  createdAt: number
  author: "rajat" | "tuhina"
  dishId: number                       # library dish id
  reason: string                       # user-provided, non-empty after trim
  status: "queued" | "placed" | "dropped"
  consumedWeekStart: string | null     # ISO Monday once placed; null while queued

# The next generation run reads `queued` rows as engine `requests`, marks placed
# ones `placed` with the consuming week, and leaves unplaceable ones `queued` (an
# incident is logged). The slow loop may mark stale queued rows `dropped`.

incidents
  createdAt: number
  source: "engine" | "backend" | "frontend"
  severity: "warn" | "error"
  context: object                      # structured fields
  message: string
  resolvedAt: number | null

userProfiles
  deviceId: string
  identity: "rajat" | "tuhina"
  installedAt: number
```

`comments`, `manualChanges`, `incidents`, and `nextWeekQueue` are the signal channels the slow loop consumes. Comments are explicit user feedback. Manual changes are observed behavior, one row per swap, custom one-off, delete, add, day skip, day restore, or save-for-next-week with the user's stated reason. Incidents are runtime violations from the engine or backend. The next-week queue records dishes the user wants the engine to favor. The `status` lifecycle on `comments`, `manualChanges`, and `incidents` is identical so the slow-loop mark-applied action can mark every consumed row uniformly (see `MAINTENANCE.md` §3); `nextWeekQueue` has its own `queued`/`placed`/`dropped` lifecycle driven by generation and the slow loop.

The library + rules are not in Convex. Convex functions load them by importing typed JSON or TS modules emitted at build time from the markdown files (see §4).

## 4. Build-time bake of library + rules

Convex functions cannot read the markdown files at runtime. The build pipeline reads every `data/dishes/<slug>.md` file plus the `data/ingredients.md` catalog and emits `engine/src/data/library.ts` (typed export of dishes, the flattened per-dish ingredient rows, the catalog, and the catalog-derived pack-size list) and `engine/src/data/history.ts` (typed export of `menu_history.md` for first-deploy seeding) at build time. Convex functions import these. The engine module reads the typed objects, never markdown directly.

Round-trip discipline: the build's parser is the same parser used by the round-trip tests, so any drift between markdown source and bundled output is caught in CI. The bake also runs the blocking data validators before emitting (every dish ingredient row resolves to a catalog row, every catalog row has a group, dish ids and slugs are unique, slugs match filenames), so bad data fails the build rather than reaching the bundle.

## 5. Read paths and write paths

**Read (frontend opens):**
1. PWA loads from Vercel cache; service worker may serve from cache offline.
2. App connects to Convex over WebSocket.
3. Library and rules are already bundled into the JS, so the engine can simulate immediately.
4. `currentWeek` and `comments` come from Convex subscriptions and stream live updates as either user edits.

**Read (swap picker alternatives):**
1. Frontend calls `getSlotAlternatives({ weekStart, day, meal, position, limit? })`.
2. The query builds a non-restrictive candidate pool: every dish in the library that is Active, in-season for the current Bangalore season, and matches the meal-time (Breakfast-time dishes for breakfast positions, Lunch-time dishes for lunch positions). No per-position eligibility filter; §3 composition (HP/partner/Option A-B-C/carb-position) is not enforced.
3. The engine ranks the pool by `docs/engine.md` §4 priority (longest-unused first, with the ingredient ledger and same-day-breakfast tilts seeded from the live week's other picks, excluding the slot/position being ranked).
4. The currently-picked dish at this position is filtered out; the frontend renders the ranked list and the user picks any dish.

**Write (swap a dish):**
1. Frontend optimistically updates the UI.
2. Convex mutation `swapDish({ author, weekStart, day, meal, position, newDishId, reason, version })` validates: `version` matches the loaded version (optimistic concurrency); the (day, meal) slot exists and `position` is within `slot.dishes`; the new dish is in the library, matches the meal-time, is Active, and is in season; `reason` is non-empty after trim. Per `docs/product.md` §4 Principle 4 the fast loop stays permissive; §3 composition eligibility is not validated at swap time.
3. On success the slot's `dishes[position]` updates to `{ dishId: newDishId, customLabel: null, source: "swapped", author, updatedAt: now }`, `version` increments, and a `manualChanges` row inserts in the same Convex transaction carrying the slot's pre-change `before`, the new `after`, the user's `reason`, `changeKind: "swap"`, and `status: "queued"`. The grocery list is re-derived by the engine on read.
4. On failure the frontend rolls back. The tagged-union return distinguishes recoverable reasons (`version-mismatch`, `no-current-week`, `no-such-slot`, `no-such-position`, `dish-not-in-library`, `dish-not-meal-time`, `dish-not-active-or-in-season`) the UI handles inline; missing or empty `author` or `reason` throws.

**Write (custom one-off):**
1. Frontend calls `addCustomOneOff({ author, weekStart, day, meal, position, customLabel, reason, version })`.
2. Patches `slot.dishes[position]` to `{ dishId: null, customLabel, source: "custom", author, updatedAt: now }` and inserts a `manualChanges` row with `changeKind: "custom"` in the same transaction.

**Write (delete a dish):**
1. Frontend calls `deleteDish({ author, weekStart, day, meal, position, reason, version })`.
2. Validates author, non-empty trimmed `reason`, version, slot, and position. Removes `slot.dishes[position]`, increments `version`, and inserts a `manualChanges` row with `changeKind: "delete"`, `before` = the removed pick, `after` = a null entry. Delete is permissive: it may leave the day below its composition shape (the share image simply shows fewer items). Recoverable reasons: `version-mismatch`, `no-current-week`, `no-such-slot`, `no-such-position`.

**Write (add a library dish to a day):**
1. Frontend calls `addDish({ author, weekStart, day, meal, newDishId, reason, version })`.
2. Validates author, non-empty trimmed `reason`, version, slot, and the dish (in library, meal-time, Active, in season; same hard filters as swap, no §3 composition check). Appends `{ dishId: newDishId, customLabel: null, source: "swapped", author, updatedAt: now }` to `slot.dishes`, increments `version`, and inserts a `manualChanges` row with `changeKind: "add"`, `before` = a null entry, `after` = the added dish. Returns the new `position`. Recoverable reasons: `version-mismatch`, `no-current-week`, `no-such-slot`, `dish-not-in-library`, `dish-not-meal-time`, `dish-not-active-or-in-season`.

**Write (skip / restore a day):**
1. Frontend calls `skipDay({ author, weekStart, day, reason, version })` or `restoreDay({ author, weekStart, day, reason, version })`.
2. `skipDay` appends `{ day, reason, author, skippedAt: now }` to `currentWeek.skippedDays` (rejecting `already-skipped`); `restoreDay` removes the day's entry (rejecting `not-skipped`). The day's `slots` are never touched, so restore is lossless. Each increments `version` and inserts a `manualChanges` row (`changeKind: "skip_day"` / `"restore_day"`, day-level: no meal/position, null before/after). Recoverable reasons: `version-mismatch`, `no-current-week`, and the kind-specific `already-skipped` / `not-skipped`.

**Write (save a dish for next week):**
1. Frontend calls `saveForNextWeek({ author, weekStart, dishId, reason })`.
2. Validates author, non-empty trimmed `reason`, and that the dish is in the library and not already queued. Inserts a `nextWeekQueue` row (`status: "queued"`, `consumedWeekStart: null`) and a `manualChanges` row with `changeKind: "save_next_week"` (the saved dish lives in `after.dishId`) in the same transaction. The next generation run consumes queued rows as engine `requests`. Recoverable reasons: `dish-not-in-library`, `already-queued`.

**Write (include a recipe in the share):**
1. Frontend calls `setIncludeRecipe({ author, weekStart, day, meal, position, include, version })`.
2. Sets `includeRecipe` on `slot.dishes[position]` and increments `version`. This is a share preference, not a menu change, so it does NOT write a `manualChanges` row. Recoverable reasons: `version-mismatch`, `no-current-week`, `no-such-slot`, `no-such-position`.

**Write (comment):**
1. Frontend posts to `addComment({ author, attachedTo, text })`.
2. Convex inserts a `queued` row in `comments`. The slow loop consumes it later (see `MAINTENANCE.md` §1).

## 6. Auto-recovery middleware

The backend treats the engine as untrusted by default.

- Every engine output is validated against the rules (item cap, schedule shape, eligibility) before it is committed to `currentWeek`. Invalid output writes an `incident` row and falls back to the last-good week.
- Convex functions that throw write an `incident` row before propagating to the client.
- The frontend's service worker caches the last successfully rendered week so a Convex outage still shows what to cook.
- All write mutations require an `author` argument; the mutation rejects writes without it.

## 7. Optimistic concurrency

Each `currentWeek` document carries a `version` field. The frontend includes the loaded version on every mutation. The mutation refuses if the version on disk has changed since load, prompts the user with "reload to see the other person's edit", and reloads on confirm. No locking, no automatic three-way merge.

## 8. Identity and auth

- **URL gate:** a shared passcode on the frontend. Until the passcode is entered, the app stays on a splash. The passcode is stored in the service worker so repeat visits skip the splash. The passcode value lives in the Convex deployment as an env var.
- **Device profile:** after passcode, the user picks "I am Rajat" or "I am Tuhina" once per device. The choice is stored in `userProfiles` and in localStorage. Every mutation reads the local choice and attaches it as `author`. No per-user accounts in v1.

## 9. Deploy model

- **Prod:** `main` branch. Convex deploys to the production project. Frontend deploys to Vercel production. Domain: `plantry.mudgal.xyz`.
- **Preview:** every PR. Convex preview deployment with an isolated database. Frontend preview deployment on Vercel. Domain: `plantry-dev.mudgal.xyz` (CNAME points to whichever preview URL the current PR produced; deployed via a Vercel domain alias on PR open).
- **Branch convention:** `main` (production), `feat/<stream>-<short>` for engineer streams, `slow-loop/<date>` for slow-loop PRs, `docs/maintenance-<date>` for canonical-doc reconciliation PRs.

## 10. DNS records (Rajat to add)

Under `mudgal.xyz` on Cloudflare:

| Type | Name | Value | Notes |
|---|---|---|---|
| CNAME | `plantry` | `cname.vercel-dns.com` | Production frontend. Vercel issues the cert. |
| CNAME | `plantry-dev` | `cname.vercel-dns.com` | Preview frontend. Vercel alias updates to point at the current PR's preview. |

Convex prod and preview each have their own `<deployment>.convex.cloud` URLs; the frontend reads them from `VITE_CONVEX_URL` at build time. No DNS records needed for Convex.

## 11. Environment variables

**Frontend build (`app/web/.env.production`, `.env.preview`):**
- `VITE_CONVEX_URL` — the Convex deployment URL.
- `VITE_APP_PASSCODE_REQUIRED` — boolean; gates the splash.

**Convex deployment (set via `npx convex env set`):**
- `APP_PASSCODE` — shared passcode for the splash gate.
- `SLOW_LOOP_TOKEN` — token the slow-loop session uses to read queued comments without exposing the dashboard.
- `SWIGGY_MCP_URL` (future) — endpoint of the Swiggy MCP server.

## 12. Menu image format

On finalize, the system renders one PNG per week showing all six day cards plus the grocery list. Render rules:

- One card per day. Day name and date badge on the left, meals on the right.
- No tags, no day-type labels, no internal menu numbers, no ingredient-reuse callouts.
- Grocery list below the day cards, grouped by category in fixed order: Proteins and Dairy, Pantry, Vegetables, Aromatics and Herbs, Other.
- Mobile-card aspect, WhatsApp-shareable.

The PNG is generated by a Convex action that calls a headless render of the same React component used in the frontend; the resulting bytes are stored as a Convex file and a CDN URL is returned. The PNG is cached in `data/menu_images/<weekStart>.png` only as a historical archive on slow-loop runs; runtime serving uses Convex's file storage.

## 13. Swiggy MCP integration shape (future)

When the integration lands:

- Convex action `buildSwiggyCart(weekStart)` reads `currentWeek`, asks the engine for the structured grocery list, and calls the Swiggy MCP per line item.
- The MCP returns Swiggy SKUs and prices. The action stores the resolved cart in `swiggyCarts(weekStart)` and returns a deep link.
- Three v1 invariants that keep this path open without rework:
  1. Ingredient names are canonical (one name per ingredient, no qualifiers like "(200g)", no spelling drift). The ingredient catalog (`data/ingredients.md`) is the single home for each ingredient, and the name-resolution validator blocks any dish ingredient row that does not resolve to a catalog row by exact name, so drift cannot reach the bundle.
  2. The grocery list is a structured Convex query, not a markdown parse. `getGroceryList(weekStart)` returns `{ ingredient, quantity, unit, packSize, packsNeeded }[]`. The markdown render is a view on top.
  3. Pack sizes live in the ingredient catalog's machine-readable `Pack Size` column; the bake carries them through as the catalog-derived pack-size list.
- Brand preference and substitution policy are future additive fields on the ingredient row. Designed to slot in without restructuring; not built in v1.

## 14. Repository structure

Authoritative root layout. The maintenance job (`MAINTENANCE.md`) verifies it on every run.

```
plantry/
  CLAUDE.md            # orientation
  MAINTENANCE.md       # slow loop spec
  DECISIONS.md         # EM autonomy log
  claude-design.md     # design contract (lowercase by convention from the file itself)
  .gitignore
  .githooks/           # pre-commit hook (blocks commits from the main directory)
  .maintenance-state   # last-reconcile marker for the maintenance job
  .prettierrc          # formatter config
  .prettierignore      # formatter ignore list
  eslint.config.js     # lint config
  tsconfig.json        # root TS project config
  tsconfig.base.json   # shared TS compiler options
  package.json         # workspace root manifest
  package-lock.json    # locked dependency tree
  vercel.json          # hosting config
  .github/workflows/
  .claude/commands/    # /slow-loop, /new-stream
  scripts/             # build and bake scripts
  docs/                # canonical specs + CHANGELOG
  data/                # human-edited library, history, structural changelog, menu images
    dishes/            # one file per dish: data/dishes/<slug>.md (frontmatter + ingredient rows)
    dish-photos/       # web-ready dish photos (data/dish-photos/<slug>.jpg) + STYLE.md photo spec
    ingredients.md     # ingredient catalog: one row per ingredient (group, unit, pack size)
  design_handoff/      # the design handoff (contract, screens, primitives, tokens)
  features/            # active feature spec (one at a time)
  engine/              # TS engine module
  app/convex/          # Convex schema + functions
  app/web/             # Vite + React + TS PWA
  archive/             # history (handoffs, retired docs, shipped feature specs)
```

Gitignored entries the structure check tolerates but the tree omits: `.git`, `.vercel`, `node_modules`.

Naming:
- Folder names under `archive/`, `docs/`, `features/`, `app/web/src/components/`: kebab-case.
- TypeScript component files: PascalCase.
- TypeScript non-component files: camelCase.
- Markdown files in `docs/`: lowercase single-word names.
- Markdown files at root: UPPERCASE, with one named exception: `claude-design.md` is lowercase by convention from the design contract itself.

## 15. CI gates

Every PR runs these checks; any failure blocks merge.

1. **Round-trip parsers.** Each `data/dishes/<slug>.md` file and the `data/ingredients.md` catalog parse and re-serialize byte-identical (modulo declared whitespace policy). `data/menu_history.md` parses cleanly. The data validators (name resolution, group presence, id/slug uniqueness, slug-filename match) also run.
2. **Engine spec/code parity.** If `docs/engine.md` is modified, the PR must also modify `engine/src/` and `engine/test/`. The check fails with a message naming the missing pair.
3. **Engine type-check + unit tests.** Standard TS compile + Vitest run.
4. **Simulation harness.** The 5-week forward simulation runs against the current engine + library. Any newly-invalid menu fails the build.
5. **Property tests.** Item cap never exceeded, no dish in no-repeat window appears in output, Saturday alternates Menu 3/4 across consecutive weeks.
6. **Convex schema typecheck.** `npx convex codegen` succeeds; no orphan tables or fields.
7. **Frontend build.** Vite build succeeds; type-check passes; service worker bundles.
8. **Lint and format.** ESLint + Prettier, no warnings.

## 16. Anti-patterns

- Reading markdown files inside Convex functions at runtime. Markdown is read at build time; runtime reads typed JS modules.
- Adding a new frontmatter key to the per-dish files or a new column to the `ingredients.md` catalog for a one-off case (violates Principle 8 in `docs/product.md`).
- Encoding Swiggy SKUs or any store-specific identifier in canonical data. Integration layer resolves at runtime.
- Auto-applying any slow-loop suggestion. The PR-merge gate is the only path.
- Skipping author attribution on any mutation. The middleware rejects unattributed writes; do not patch around it.
