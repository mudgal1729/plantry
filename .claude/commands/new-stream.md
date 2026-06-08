---
description: Spawn a new engineer in a fresh git worktree on a scoped branch with a generated brief. EM-only.
---

You are spawning a new engineer for a Plantry stream. Read `CLAUDE.md`, `docs/development.md` §1-2, and `features/phase2.md` §3 first to know which stream and which slice within it.

## Arguments

- `<branch>` — short branch name suffix. The full branch will be `feat/<stream-letter>-<branch>`.
- `<stream-letter>` — one of 0, A, B, C, D, E, F, G as defined in `features/phase2.md` §2.

## What to do

1. **Verify clean state.** Confirm the main repo working tree is clean (`git status`). If not, abort and ask Rajat what to commit or stash.
2. **Create the worktree.** Run:
   ```
   git worktree add ../plantry-<branch> -b feat/<stream-letter>-<branch>
   ```
3. **Drop in the engineer brief.** Write `../plantry-<branch>/.engineer-brief.md` with:
   - The slice's scope (one paragraph from `features/phase2.md` §3 for this stream).
   - The definition of done (`docs/development.md` §4).
   - The diagnosis card format (`docs/development.md` §5).
   - The CI gates (`docs/engineering.md` §15).
   - The principles (`docs/product.md` §4) as a quick load.
   - A pointer to `CLAUDE.md`.
4. **Open a session in the worktree.** Output the command Rajat (or EM) runs to enter:
   ```
   cd ../plantry-<branch> && claude
   ```
5. **Update stream state.** Edit `features/phase2.md` §4: set the stream to "in progress", add the worktree path under "Owner".
6. **Log to DECISIONS.md** if any slice choice was made (which sub-slice, why).

## Engineer contract (what the brief encodes)

The engineer:
- Stays in this worktree. Does not touch the main directory.
- Stays in this stream. Does not silently expand scope.
- Carries a diagnosis card in the PR description.
- Self-runs the CI gates locally before opening the PR.
- Asks the EM (via PR comment with the "EM check needed" template in `docs/development.md` §10) instead of pinging Rajat.
- Opens one PR per slice. Squash-merges on approval.

## Cleanup on merge

After the engineer's PR merges to `main`, the EM runs:
```
git worktree remove ../plantry-<branch>
git branch -D feat/<stream-letter>-<branch>  # local
```
and updates `features/phase2.md` §4 (stream state).
