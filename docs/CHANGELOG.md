# CHANGELOG

Append-only chronology of shipped changes. One entry per change. Newest first.

Format:

```
## YYYY-MM-DD  short title

Brief description in present tense, one to three sentences. Reference the PR.
```

---

## 2026-06-08  Bootstrap: monorepo, PWA shell, Convex schema, hooks, CI

Stream 0 ships. npm workspaces across `engine/`, `app/web/`, `app/convex/` with shared TypeScript config (strict). The frontend is a minimal Vite + React + Workbox PWA loading a Hello Plantry page. `app/convex/schema.ts` declares the five runtime tables (`currentWeek`, `weekArchive`, `comments`, `incidents`, `userProfiles`) from `docs/engineering.md` §3. A pre-commit hook installed by `scripts/install-hooks.sh` refuses code-path commits from the main coordination directory while allowing them from worktrees, detecting which by whether `.git` is a directory or a file at the toplevel. CI runs lint, typecheck, frontend build, and the engine smoke test on Node 20. ESLint 9 flat config and Prettier with sensible defaults. (#1)
