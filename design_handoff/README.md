# Plantry design handoff

Complete design for the Plantry PWA and its shareable output family. There was no prior `app/web/src/` or handoff to anchor on, so this folder also establishes the visual language; the tokens in `hifi-tokens.jsx` are the proposed initial values for `app/web/src/index.css`.

## What changed since the last handoff

First handoff; there is no prior folder. Everything here is new, reviewed with the operator screen by screen before packaging.

## What is in this handoff

- `Plantry Hi-Fi.html` is the interactive prototype. Full flows: passcode gate, identity picker, Menu (week, per-day editing, day skipping, dish actions, ranked swap picker with search, required reasons, add a dish with library search or one off, dish comments, swipeable share preview), Grocery, Changes, Explore (filters, ranked familiar-but-new, use this week or next).
- `Plantry Screens Canvas.html` shows every screen and overlay side by side, including the Menu summary line states and the shareable image family.
- `hifi-tokens.jsx` design tokens. `hifi-primitives.jsx` shared components. `hifi-screens.jsx` composed screens. `hifi-overlays.jsx` sheets and dialogs. `hifi-share-image.jsx` the shareable images. `hifi-data.js` the sample dish library and week used by both pages. `hifi-app.jsx` prototype state and navigation.
- `assets/dishes/` photographs for every library dish.

## Design decisions in this handoff

- Direction: warm cream surfaces, terracotta accent, serif dish names ("Morning Paper").
- Tabs: Menu, Grocery, Explore, Changes. Menu is the shared week; every change starts from a day card's Edit button. Changes records every fast loop action with author, time, and reason; a summary line under the Menu title covers no changes, one change, and several changes by one or both people.
- Editing operates at day level or dish level only. A meal block (breakfast, lunch) is never edited as a unit. A whole day can be skipped with a required reason, shows as skipped on the Menu page and in the menu image, and can be restored.
- Tapping a dish row opens details and recipe; the ⋯ button opens the action sheet (Details, Replace, Delete). Commenting lives inside the details sheet.
- Every dish carries a photo, description, protein, protein to carb ratio, time, complexity in plain words, last cooked, and a pre prep marker where day-before work is needed (visible on day cards, in pickers, and in details).
- "Add a dish" is one flow: a ranked, searchable picker over the library; typing an unknown name offers "Add as a one off".
- Swap picker ranks dishes that fit the day first (meal time match, not already in the day, not recent, similar protein), then the rest of the matching library. Search covers everything.
- Explore lists never-cooked dishes ranked familiar-but-new, with complexity, healthy, and meal time filters. Its dish sheet opens with the recipe visible and offers "Use this week" or "Next week".
- Share output is an image family sent together: menu, grocery list, then one recipe sheet per dish marked "include recipe when sharing". The preview is a horizontal swipe rail, the way the images arrive on WhatsApp.

## Flags for the operator

- **Day skipping is a day-level override**, which `docs/product.md` §7 lists as out of scope for v1 and §8 as fast-follow. It is included here at the operator's direction; shipping it pulls future scope forward and routes through the slow loop. Skipped days should drop their dishes from the grocery list; the prototype states this but uses a static list.
- **New library data implied.** Per dish: photo, description line, pre prep note, protein grams, protein to carb ratio, cook time, complexity level, skill note, equipment, special ingredients, recipe steps, healthy tag. Last cooked derives from history. Structural; routes through the slow loop.
- **"Save for next week" implies a new data home**: a queue the next generation run reads. The engine and spec do not have this yet; it routes through the slow loop. The prototype stores it and logs it to Changes.
- **Dish-level comments only**, entered from the details sheet. `docs/product.md` §6 says comments attach to a dish or a day; day-level comments now have no entry point. Confirm the spec should narrow to dish-level, or give day comments a home.
- **Share image change.** `docs/product.md` §3 describes one PNG with the grocery list underneath. This handoff splits menu, grocery, and recipes into separate images. The spec should be updated to match.
- **"Include recipe when sharing" lives on the week**, not the library. It resets each week. Confirm that is the intent.
- **Ranking heuristics here are design intent**, not engine spec.
- **Photos are Wikimedia Commons images** (CC licensed, several require attribution). Replace before shipping.
- **New file categories**: `hifi-data.js`, `hifi-overlays.jsx`, `hifi-app.jsx` (prototype support), `Plantry Screens Canvas.html` plus `design-canvas.jsx` (presentation aid for review, not a port target).

## Open questions

- "Changes" is the working name for the record tab; alternatives considered were Logs, Activity, Journal. Pick one and it propagates.
- Saving a dish for next week currently asks for a reason like any other action. Confirm a reason is wanted there.
- Explore hides dishes already placed in the current week or saved for next week. Confirm.
- The passcode is not validated in the prototype (any four digits pass). The real passcode lives in configuration.
