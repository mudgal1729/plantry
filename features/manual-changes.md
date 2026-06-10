# Manual changes log

Persist every manual change a user makes to the current week, with a reason. Feed the log into the slow loop so rule redesign is grounded in observed behavior, not assumed rules.

## Why

Today the engine generates a week and stores per-position `source: "generated" | "swapped" | "custom"` plus `author` and `updatedAt`. That captures the CURRENT state of the week but not the trajectory: if Rajat swaps Rajma to Chole to Paneer, only Paneer is recorded; the intermediate Chole is lost. There is also no record of WHY. The slow loop reads queued comments plus incidents today; comments are explicit feedback, but most of the user's real signal is in their swap behavior, which is currently invisible to the slow loop.

Stream H (PR #26) made the swap picker non-restrictive per `docs/product.md` §4 Principle 4. The natural complement is a complete log of those swaps with reasons attached. The slow loop reads the log and proposes rule edits that move the engine closer to what users actually pick, instead of what we assumed they would want.

## Scope (in)

1. **New `manualChanges` table** in `app/convex/schema.ts`, append-only:

   ```
   manualChanges: {
     createdAt: number,
     author: "rajat" | "tuhina",
     weekStart: string,
     day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat",
     meal: "breakfast" | "lunch",
     position: number,
     changeKind: "swap" | "custom",
     before: { dishId: number | null, customLabel: string | null },
     after:  { dishId: number | null, customLabel: string | null },
     reason: string,
     status: "queued" | "in_review" | "applied" | "dismissed" | "reviewed_no_change",
     resolvedAt: number | null,
     resolvedPr: string | null,
   }
   indexes: by_status, by_weekStart
   ```

   Mirrors the `comments` table's status lifecycle so the slow loop's consume-and-mark flow stays uniform across signal types.

2. **Mutation contract changes** in `app/convex/swap.ts` and `app/convex/weekMutations.ts`:
   - `swapDish` gains a required `reason: string` argument. Trim; throw `ConvexError("reason must not be empty after trimming")` if empty.
   - `addCustomOneOff` same.
   - On success, both insert a `manualChanges` row in the same transaction (Convex mutations are atomic; both writes land or neither does). The row's `before` reflects the slot's pre-change `dishId` + `customLabel`; the row's `after` reflects the new state.

3. **Queries** in `app/convex/queries/manualChanges.ts`:
   - `listQueuedManualChanges`: mirrors `listQueuedComments`. Returns queued rows sorted by `createdAt` ascending.

4. **Status-update mutations** in `app/convex/manualChangesMutations.ts`:
   - `markManualChangesReviewedNoChange({ ids, pr })`: mirrors the comments-side mutation. Sets status, `resolvedAt`, `resolvedPr`.
   - `markManualChangesApplied({ ids, pr })`: same shape, sets status to `"applied"`.
   - Both never-throw on a missing id (mirror the comments mutations' design; the slow-loop GitHub action depends on this).

5. **UI** in `app/web/src/components/SlotEditor.tsx`:
   - Both `SwapPane` and `CustomPane` gain a "Why are you changing this?" required text input.
   - Above the input, 5 quick-chip prefills: "Bored of it", "Not in mood", "Missing ingredient", "Tuhina wants this", "Want a change". Tapping a chip fills the input; user can edit or replace.
   - Swap / Save button stays disabled until reason has text after trim. Failure path on empty reason mirrors the existing fatal error UX.

6. **Slow-loop skill** at `.claude/commands/slow-loop.md`:
   - "Read inputs" step adds `listQueuedManualChanges` alongside queued comments and incidents.
   - "Cluster" step accepts manual-change rows as cluster fuel. A cluster may now mix comment + manual-change rows around the same dish or property.
   - "Mark consumed" step also calls the new `markManualChangesReviewedNoChange` / `markManualChangesApplied` mutations for the IDs the PR consumed.
   - Fixture-mode loads `manual-changes.example.json` alongside `queued-comments.example.json` and `incidents.example.json`.

7. **GitHub Action** `.github/workflows/slow-loop-applied.yml`:
   - Extend to call the new mark-consumed mutations for manual-change IDs listed in the PR's fenced markers (mirror the existing comment-IDs fenced section).

8. **Fixtures** `data/test-fixtures/slow-loop/manual-changes.example.json`:
   - Two example rows: one swap, one custom one-off. Reasons populated. So the dry-run has real signal to cluster.

## Scope (out)

- **Reason categorization or enums.** Reason is freeform text. Chips are UI prefills, not enum values. The slow loop reads freeform text and clusters by topic, not by an enum.
- **Backfill.** No retroactive log of past swaps. Log starts at deploy time.
- **Comment / manual-change table merge.** Stay separate. The slow loop reads both.
- **Required reason on day-level comments.** Comments stay as-is; this PR is about manual edits to the menu.
- **Reason on generated picks.** System picks are not manual changes; no reason field on `currentWeek.slots[].dishes[]`.
- **Undo / time-travel.** The log is append-only signal for the slow loop, not a feature surface for the user to roll back.

## Migration

Pure additive change. New table, no existing data, no shape change to existing tables. Convex deploy will succeed without wiping. Diagnosis card should explicitly note: "additive only — no wipe-and-regenerate or transitional-schema path needed per [[convex-schema-breaking-change]]."

## Acceptance

- Tap Edit on any dish in the live week. Switch to Swap mode. The reason field is visible with 5 chips above it. Swap button is disabled until reason has non-whitespace text. Tap a chip, then Swap. The slot updates AND a `manualChanges` row exists with the right `before`, `after`, `reason`, `author`.
- Custom mode same: required reason field, chips, save lands the change AND writes the log row.
- Dry-run the slow loop with `npx convex run` against the fixture: it reports clusters that include queued manual changes alongside comments. Right-size discipline applies; "no change warranted" is still a valid output.
- The slow-loop-applied GitHub action consumes manual-change IDs from the PR's fenced section without error (even on fake IDs, per the never-throw design).

## Streams

One stream. Letter `I`. Branch: `feat/I-manual-changes`. Worktree: `../plantry-manual-changes`.

## Stream state

| Stream | State | Owner | Notes |
|--------|-------|-------|-------|
| I manual changes | in progress | `../plantry-manual-changes` | Spawned 2026-06-10. Brief at `.engineer-brief.md`. |

## Risks

- **UX friction from required reason.** Adds typing per swap. Mitigated by chips. If post-launch usage shows users abandoning swaps because of the field, revisit (drop to optional, or shorten the field). Track via the manual-changes log itself: ratio of swaps to reasons-with-only-chip-text would tell us if users are bypassing thought.
- **Two callers, one shape.** Both `swapDish` and `addCustomOneOff` log to the same table. Engineer keeps the row shape uniform; the `changeKind` field discriminates.
- **Slow-loop fixture compat.** The skill's existing fixture-driven dry-run must still work for sessions that have not yet added manual-changes fixtures; the slow-loop code should tolerate the `manual-changes.example.json` being absent.
