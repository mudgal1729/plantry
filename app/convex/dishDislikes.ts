import { mutation } from "./_generated/server.js";
import { v } from "convex/values";
import { dishes } from "@plantry/engine/library";
import { assertAuthor } from "./lib/author.js";

/**
 * Records a dislike on a library dish from the Explore tab. A dislike is a
 * slow-loop signal, NOT a change to the current week, so it writes a single
 * `dishDislikes` row and NOTHING else: no `manualChanges` row, no `currentWeek`
 * mutation, no re-rank, no auto-hide (Decision #12; Principle 5,
 * `features/design-revamp.md` §1.5, §1.6). The only consequence is downstream,
 * via the slow loop (§1.8), which clusters dislikes and may deactivate or
 * down-rank a dish under right-size discipline.
 *
 * `reason` is OPTIONAL (a dislike is a lightweight tap, unlike Decision #8's
 * required save-reason). A blank or whitespace-only reason is stored as `null`
 * so the slow loop reads a clean "no reason given" rather than an empty string.
 *
 * Unlike `saveForNextWeek`, a dish may be disliked more than once (each tap is a
 * distinct signal; a repeated dislike is exactly the pattern the slow loop reads
 * as a stronger case, §1.8), so there is no already-disliked guard.
 *
 *   dislikeDish({ author, dishId, reason })
 *     => { ok: true; dislikeId: string }
 *      | { ok: false; reason: "dish-not-in-library" }
 */
export const dislikeDish = mutation({
  args: {
    author: v.string(),
    dishId: v.number(),
    reason: v.union(v.string(), v.null()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; dislikeId: string } | { ok: false; reason: "dish-not-in-library" }> => {
    assertAuthor(args.author);

    const dish = dishes.find((d) => d.id === args.dishId);
    if (!dish) {
      return { ok: false, reason: "dish-not-in-library" };
    }

    const trimmed = args.reason?.trim() ?? "";
    const reason = trimmed.length > 0 ? trimmed : null;

    const dislikeId = await ctx.db.insert("dishDislikes", {
      createdAt: Date.now(),
      author: args.author,
      dishId: args.dishId,
      reason,
      status: "queued",
      consumedWeekStart: null,
    });

    return { ok: true, dislikeId };
  },
});
