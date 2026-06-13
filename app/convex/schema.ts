import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Schema for Plantry's runtime state. See docs/engineering.md §3.
// The library + rules live in git markdown and are baked into the engine at build time;
// they are NOT in Convex. Everything below is what the running app writes or reads
// in real time.

export default defineSchema({
  // The live Mon-Sat plan for the current week. Mutated by swaps, custom one-offs,
  // and finalize. Version increments on every mutation for optimistic concurrency.
  //
  // Schema shape (a): one row per (day, meal). Each row carries `dishes[]`, a
  // position-ordered list of dish picks. Position 0 is the lead (HP for Menu 1,
  // complete_meal for Menu 3, etc.) — the rest are partners/companions/carbs.
  // Per-dish source/author/updatedAt let the slow loop attribute who changed
  // which dish in a multi-dish meal. See `features/multi-dish-slots.md`.
  currentWeek: defineTable({
    weekStart: v.string(), // ISO date of the Monday, e.g. "2026-06-15"
    status: v.union(v.literal("draft"), v.literal("final")),
    slots: v.array(
      v.object({
        day: v.union(
          v.literal("Mon"),
          v.literal("Tue"),
          v.literal("Wed"),
          v.literal("Thu"),
          v.literal("Fri"),
          v.literal("Sat"),
        ),
        meal: v.union(v.literal("breakfast"), v.literal("lunch")),
        dishes: v.array(
          v.object({
            dishId: v.union(v.number(), v.null()), // null when custom one-off
            customLabel: v.union(v.string(), v.null()),
            source: v.union(v.literal("generated"), v.literal("swapped"), v.literal("custom")),
            author: v.union(v.literal("rajat"), v.literal("tuhina"), v.literal("system")),
            updatedAt: v.number(),
            // Share preference: when true the dish's recipe sheet is included in the
            // shared image family (`features/design-revamp.md` §1.7). Lives on the week
            // so it resets naturally when a new week document is generated (Decision #10).
            // Optional and additive: existing rows (no flag) read as "not included".
            includeRecipe: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
    // Days the user has marked as skipped this week (eating out, travel). The day's
    // dishes are never removed (restore is lossless); skips are observed-behavior
    // signal for the slow loop and exclude the day from grocery/archive in 4.2.
    // Optional and additive: existing rows (no field) read as "no days skipped".
    skippedDays: v.optional(
      v.array(
        v.object({
          day: v.union(
            v.literal("Mon"),
            v.literal("Tue"),
            v.literal("Wed"),
            v.literal("Thu"),
            v.literal("Fri"),
            v.literal("Sat"),
          ),
          reason: v.string(),
          author: v.union(v.literal("rajat"), v.literal("tuhina")),
          skippedAt: v.number(),
        }),
      ),
    ),
    version: v.number(),
  }).index("by_weekStart", ["weekStart"]),

  // Finalized past weeks. Append-only. Mirrors the menu_history.md row format
  // exactly, so the engine's recency rule can query against it without translation.
  weekArchive: defineTable({
    weekStart: v.string(),
    finalizedAt: v.number(),
    rows: v.array(
      v.object({
        day: v.union(
          v.literal("Monday"),
          v.literal("Tuesday"),
          v.literal("Wednesday"),
          v.literal("Thursday"),
          v.literal("Friday"),
          v.literal("Saturday"),
          v.literal("Sunday"),
        ),
        meal: v.union(v.literal("Breakfast"), v.literal("Lunch")),
        dishName: v.string(),
        dishId: v.number(),
      }),
    ),
  }).index("by_weekStart", ["weekStart"]),

  // Comments left on a dish or a day. Fuel for the slow loop.
  comments: defineTable({
    createdAt: v.number(),
    author: v.union(v.literal("rajat"), v.literal("tuhina")),
    attachedTo: v.object({
      kind: v.union(v.literal("dish"), v.literal("day")),
      weekStart: v.string(),
      day: v.union(v.string(), v.null()),
      dishId: v.union(v.number(), v.null()),
    }),
    text: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("in_review"),
      v.literal("applied"),
      v.literal("dismissed"),
      v.literal("reviewed_no_change"),
    ),
    resolvedAt: v.union(v.number(), v.null()),
    resolvedPr: v.union(v.string(), v.null()),
  })
    .index("by_status", ["status"])
    .index("by_weekStart", ["attachedTo.weekStart"]),

  // Append-only log of manual edits the user makes to the live week. Every
  // `swapDish` and `addCustomOneOff` mutation inserts a row here in the same
  // transaction, recording the slot's state immediately before the change
  // (`before`) and the state landed (`after`), the freeform `reason` the user
  // typed, and the standard slow-loop status lifecycle. Distinct from
  // `comments` because the signal is different: comments are explicit feedback,
  // manual changes are observed behavior. The slow loop reads both as fuel for
  // rule redesign (`features/manual-changes.md`).
  manualChanges: defineTable({
    createdAt: v.number(),
    author: v.union(v.literal("rajat"), v.literal("tuhina")),
    weekStart: v.string(), // ISO date of the Monday, mirrors currentWeek.weekStart
    // Optional because some change kinds have no natural day. A `save_next_week`
    // targets next week (not a day of this week), so it omits `day` entirely
    // rather than carrying a non-semantic placeholder. Day-scoped kinds (swap,
    // custom, delete, add, skip_day, restore_day) still set it. Loosening
    // required->optional is additive: existing rows all carry `day` and validate.
    day: v.optional(
      v.union(
        v.literal("Mon"),
        v.literal("Tue"),
        v.literal("Wed"),
        v.literal("Thu"),
        v.literal("Fri"),
        v.literal("Sat"),
      ),
    ),
    // Optional because day-level kinds (skip_day, restore_day, save_next_week)
    // are not scoped to a single (meal, position). Loosening required->optional
    // is additive: existing swap/custom rows still carry both and validate.
    meal: v.optional(v.union(v.literal("breakfast"), v.literal("lunch"))),
    position: v.optional(v.number()),
    changeKind: v.union(
      v.literal("swap"),
      v.literal("custom"),
      v.literal("delete"),
      v.literal("add"),
      v.literal("skip_day"),
      v.literal("restore_day"),
      v.literal("save_next_week"),
    ),
    // before/after carry the pick state on either side of the change. For `add`
    // the before is a null entry; for `delete` the after is a null entry. Day-level
    // kinds carry null entries on both sides (the day, not a dish, is the subject).
    before: v.object({
      dishId: v.union(v.number(), v.null()),
      customLabel: v.union(v.string(), v.null()),
    }),
    after: v.object({
      dishId: v.union(v.number(), v.null()),
      customLabel: v.union(v.string(), v.null()),
    }),
    reason: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("in_review"),
      v.literal("applied"),
      v.literal("dismissed"),
      v.literal("reviewed_no_change"),
    ),
    resolvedAt: v.union(v.number(), v.null()),
    resolvedPr: v.union(v.string(), v.null()),
  })
    .index("by_status", ["status"])
    .index("by_weekStart", ["weekStart"]),

  // Dishes the user saved for next week from the Explore tab. The generation run
  // reads `queued` rows as engine `requests`, marks placed ones `placed` with the
  // consuming week, and leaves unplaceable ones `queued` (incident logged). The
  // slow loop may mark stale rows `dropped` (`features/design-revamp.md` §1.4, §1.8).
  // `reason` is required (Decision #8: one uniform rule for every fast-loop write).
  nextWeekQueue: defineTable({
    createdAt: v.number(),
    author: v.union(v.literal("rajat"), v.literal("tuhina")),
    dishId: v.number(),
    reason: v.string(),
    status: v.union(v.literal("queued"), v.literal("placed"), v.literal("dropped")),
    consumedWeekStart: v.union(v.string(), v.null()), // ISO Monday once placed; null while queued
  }).index("by_status", ["status"]),

  // Dishes the user disliked from the Explore tab. A dislike is a slow-loop input
  // only, never a change to the current week, so it lives in its own table and is
  // NOT a `manualChanges` kind (Decision #12). Parallel in shape to
  // `nextWeekQueue`. Rows are written `queued` by `dislikeDish` and read by the
  // slow loop, which clusters them and may deactivate or down-rank a dish under
  // right-size discipline; the loop marks consumed rows `applied` or `dismissed`.
  // The fast loop never acts on a dislike: no re-rank, no auto-hide (Principle 5).
  // `reason` is OPTIONAL (a dislike is a lightweight tap, unlike Decision #8's
  // required save-reason); `consumedWeekStart` is null until the slow loop
  // consumes the row (`features/design-revamp.md` §1.5, §1.8).
  dishDislikes: defineTable({
    createdAt: v.number(),
    author: v.union(v.literal("rajat"), v.literal("tuhina")),
    dishId: v.number(),
    reason: v.union(v.string(), v.null()),
    status: v.union(v.literal("queued"), v.literal("applied"), v.literal("dismissed")),
    consumedWeekStart: v.union(v.string(), v.null()),
  }).index("by_status", ["status"]),

  // Structured runtime error log written by the auto-recovery middleware.
  // Also fuel for the slow loop.
  incidents: defineTable({
    createdAt: v.number(),
    source: v.union(v.literal("engine"), v.literal("backend"), v.literal("frontend")),
    severity: v.union(v.literal("warn"), v.literal("error")),
    context: v.any(),
    message: v.string(),
    resolvedAt: v.union(v.number(), v.null()),
  }).index("by_resolved", ["resolvedAt"]),

  // Device-stored identity choice. One row per device per identity pick.
  userProfiles: defineTable({
    deviceId: v.string(),
    identity: v.union(v.literal("rajat"), v.literal("tuhina")),
    installedAt: v.number(),
  }).index("by_deviceId", ["deviceId"]),
});
