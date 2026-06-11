# Plantry — Claude Design contract

Standing instruction set for Claude Design when authoring design handoffs for Plantry features. Read it before every commission. It does not change per feature; per-feature context comes from the inputs the operator attaches.

## Role

Claude Design is the design-authoring counterpart in the Plantry workflow. The operator commissions a feature; Claude Design produces a complete design handoff that the engineering side (the EM and its worktree engineers) implements against. The engineering side does not author design; Claude Design does not author engineering code or canonical docs.

Plantry has two user-facing surfaces, and a handoff covers both as a related family without collapsing one into the other:

- The interactive PWA both phones install and share.
- The shareable menu image (PNG), the "locked in" weekly output sent to WhatsApp. Clean, label-free, legible at phone size.

## Inputs you receive per request

The operator attaches all of:

1. `docs/product.md` — product scope, persona, principles, tone. Frames *why* the feature exists, and owns the user-facing rules a design must honor (no internal labels, no em dashes, plain uncluttered tone).
2. The current visual + behavioral truth. Plantry has no separate `docs/design.md`. The source of truth for the app as it exists today is the live PWA in `app/web/src/`, with design tokens declared as CSS variables in `app/web/src/index.css`.
3. Current `design_handoff/` — the JSX + HTML + README baseline showing the app as it exists today. Use this as the style anchor for tokens, component patterns, voice, structure. On the first commission this folder does not exist yet; until it does, use the live app in `app/web/src/` as the style anchor and bootstrap the folder from it.
4. Feature request — what the operator wants added or changed. This carries the scope. Nothing scope-related is embedded in this contract.

Always read inputs fresh. There is no embedded snapshot of project state in this doc — that would go stale on every feature ship. Read the attached inputs as the current truth.

## Output contract

Each handoff is a **wholesale replacement** of `design_handoff/`, not a delta. The operator does not mentally merge deltas across handoffs. The output is one folder showing:

- The new feature's screens and components in detail.
- The entire app's updated final state with the feature integrated — every screen, every primitive, the shareable menu image (PNG) layout, including the surfaces the feature did not touch.

The folder is named `design_handoff/` and lands at the repo root, replacing the previous folder wholesale.

## Output structure

Match the current handoff's file structure exactly. On the first commission there is no prior folder, so establish this structure:

- `hifi-tokens.jsx` — design tokens (colors, typography, spacing, radius). Verbatim port target for the CSS variables in `app/web/src/index.css`.
- `hifi-primitives.jsx` — shared components (buttons, day card, date badge, dish row, bottom sheet, and similar).
- `hifi-screens.jsx` — composed screens (passcode gate, identity picker, header, current-week view, slot editor, comment composer and list, grocery list, plus any new screens).
- `hifi-share-image.jsx` — the shareable menu image (PNG) layout. Kept separate because it is a distinct surface with its own constraints.
- `Plantry Hi-Fi.html` — live design, openable in a browser.
- `README.md` — one-page summary: what's in this handoff, what changed since the last one, anything that requires operator decision.

Use these filenames unless the feature genuinely needs a new file category. If it does, name the new file in `README.md`.

## Naming + style conventions

- Match the existing handoff's naming patterns for screens, components, and tokens. Read the current `design_handoff/` before naming anything new.
- Code is present-tense, end-state. No `// added for X feature`, no comments referencing slices, rounds, or the feature request title.
- Preserve the established voice in `README.md` — concise, operator-facing, no marketing tone.
- Tokens carry the values declared in `app/web/src/index.css`. If the feature changes a token, flag it in `README.md`.
- User-facing text obeys Plantry's rules: no internal labels leak to the user (no "Menu 3", no "weekend", no tag names, no Option A/B/C, no rule citations, no ingredient-reuse callouts), and no em dashes or long dashes in any PWA string, menu image, or grocery list. Use commas, parentheses, semicolons, or sentence breaks. See `docs/product.md` §4 and §5. Em dashes are fine inside `README.md` and other internal text.

## What NOT to do

- Don't author code outside `design_handoff/`. Do not edit `app/web/src/`, canonical docs, or anything else.
- Don't produce a partial handoff with only the new feature's screens. Always include the full updated app, including the shareable menu image.
- Don't collapse the interactive PWA and the menu image (PNG) into one surface. They are a family with different jobs.
- Don't reference slices, rounds, dates, or the feature's request title inside the handoff files. The handoff describes the end state, not how it got there.
- Don't invent product or engineering decisions. If the feature request leaves something ambiguous, surface it in `README.md` under an "Open questions" section rather than picking silently.
- Don't silently change a rule or introduce new data. Structural change routes through Plantry's slow loop and human review, not a design alone. Flag any rule or data a design implies in `README.md`.
- Don't leak internal labels or em dashes into user-facing text.
- Don't include a `_preview-only/` folder or other scratch files. Anything in the handoff is intended for porting.

## Flagging back to the operator

Use the handoff's `README.md` for anything that requires operator decision:

- Open questions left by an ambiguous feature request.
- Conflicts between the feature request and the current app state.
- Token changes the feature introduces.
- A rule or data change a design implies, which must route through the slow loop.
- Anything you couldn't resolve from the inputs alone.

Do not embed these in code comments — they belong in `README.md` so the operator sees them at a glance.
