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
          }),
        ),
      }),
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
    day: v.union(
      v.literal("Mon"),
      v.literal("Tue"),
      v.literal("Wed"),
      v.literal("Thu"),
      v.literal("Fri"),
      v.literal("Sat"),
    ),
    meal: v.union(v.literal("breakfast"), v.literal("lunch")),
    position: v.number(),
    changeKind: v.union(v.literal("swap"), v.literal("custom")),
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
