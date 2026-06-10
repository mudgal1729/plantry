# Stream H: multi-dish slots — tracked follow-ups

This file holds tracked follow-ups from the Stream H PR (the schema reshape,
per-position swap, custom one-off, and grocery list verification). The main PR
description carries the diagnosis card and shipped scope.

## Deferred from the Stream H PR

### §6a learning signal: incident on rule-violating swap

**Deferred.** When a swap lands on a dish that does not satisfy the slot's
formal eligibility under `docs/engine.md` §3 (e.g., a non-HP dish at the
Menu 1 HP position; an Option B item paired with an Option A item; a second
Rice carb in the week), the backend should write an `incidents` row with:

- `source: "backend"`
- `severity: "warn"`
- `context: { weekStart, day, meal, position, oldDishId, newDishId, violatedRule: "<short name>" }`

The slow loop consumes incidents and this is the signal the EM wants for the
slow-loop redesign.

**Why deferred:** detecting a §3 violation requires re-implementing the slot
composition rules client-side at the swap mutation (HP positions, Option
A/B/C pairing, lunch carb uniqueness, Menu 3/4 form). That is non-trivial
and would balloon the PR. Shipping the non-restrictive picker now unblocks
the user-facing affordance; the violation detector can land in a follow-up
once the EM and the slow loop have a clearer schema for what a "violation"
means in the new fast-loop model.

**Next step:** open a Stream H.1 brief to add a `detectSlotEligibilityViolation`
engine function (one boolean per (slot, candidate, currentWeekPicks) tuple)
and wire it into `swapDish` as a side-effect incident write. Reuse the
existing composition pools (`composeSlot`) to decide whether `newDishId`
would have been a member of any of the slot's natural pools; if not, that's
a violation.
