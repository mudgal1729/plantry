import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { dishes } from "@plantry/engine/library";
import type { CurrentWeek, Identity, WeekSlot } from "../lib/types.js";
import { dayLabel, dayOrderIndex, mealLabel, mealOrderIndex } from "../lib/days.js";
import { getCachedWeek, setCachedWeek } from "../lib/storage.js";
import { SlotEditor } from "./SlotEditor.js";
import { CommentComposer, type CommentTarget } from "./CommentComposer.js";
import { CommentsList, type PendingLocalComment } from "./CommentsList.js";
import { GroceryList } from "./GroceryList.js";

const DISH_NAME_BY_ID = new Map<number, string>(dishes.map((d) => [d.id, d.name]));

interface CurrentWeekViewProps {
  identity: Identity;
}

interface QueuedCommentRow {
  _id: string;
  attachedTo: {
    kind: "dish" | "day";
    weekStart: string;
    day: string | null;
    dishId: number | null;
  };
}

function slotPrimaryLabel(slot: WeekSlot): string {
  if (slot.customLabel) return slot.customLabel;
  if (slot.dishId !== null) {
    return DISH_NAME_BY_ID.get(slot.dishId) ?? `Dish #${slot.dishId}`;
  }
  return "Unknown dish";
}

function slotSourceLabel(source: WeekSlot["source"]): string {
  if (source === "generated") return "generated";
  if (source === "swapped") return "swapped";
  return "custom";
}

function groupByDay(week: CurrentWeek): Array<{
  day: WeekSlot["day"];
  slots: WeekSlot[];
}> {
  const buckets = new Map<WeekSlot["day"], WeekSlot[]>();
  for (const slot of week.slots) {
    const list = buckets.get(slot.day) ?? [];
    list.push(slot);
    buckets.set(slot.day, list);
  }
  const grouped = Array.from(buckets.entries()).map(([day, slots]) => ({
    day,
    slots: [...slots].sort((a, b) => mealOrderIndex(a.meal) - mealOrderIndex(b.meal)),
  }));
  grouped.sort((a, b) => dayOrderIndex(a.day) - dayOrderIndex(b.day));
  return grouped;
}

function slotKey(day: string, meal: string): string {
  return `${day}-${meal}`;
}

export function CurrentWeekView({ identity }: CurrentWeekViewProps) {
  const result = useQuery(anyApi.queries.week.getCurrentWeek, {}) as CurrentWeek | null | undefined;

  const cached = useMemo(() => getCachedWeek(), []);

  useEffect(() => {
    if (result) {
      setCachedWeek({ cachedAt: Date.now(), week: result });
    }
  }, [result]);

  if (result === undefined) {
    if (cached) {
      return (
        <>
          <section className="week">
            <div className="offline-banner">Showing last known menu (offline).</div>
            <WeekBody week={cached.week} identity={identity} interactive={false} />
          </section>
          <GroceryList weekStart={cached.week.weekStart} />
        </>
      );
    }
    return (
      <section className="week week--loading">
        <p>Loading menu...</p>
      </section>
    );
  }

  if (result === null) {
    return (
      <section className="week week--empty">
        <p>No menu yet. The first menu will appear here.</p>
      </section>
    );
  }

  return (
    <>
      <section className="week">
        <WeekBody week={result} identity={identity} interactive />
      </section>
      <GroceryList weekStart={result.weekStart} />
    </>
  );
}

function WeekBody({
  week,
  identity,
  interactive,
}: {
  week: CurrentWeek;
  identity: Identity;
  interactive: boolean;
}) {
  const grouped = groupByDay(week);

  // Local UI state: which slot's editor is open, and which target's comment
  // composer is open. At most one of each at a time keeps the layout sane on
  // mobile.
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [composingFor, setComposingFor] = useState<string | null>(null);

  // Optimistic comments: appended on send, removed when the server row with
  // matching fields appears in the queued list. The race we are handling:
  // the user posts a comment, then immediately posts another or navigates
  // away before the websocket round-trip lands.
  const [pendingComments, setPendingComments] = useState<PendingLocalComment[]>([]);

  // Comments query for badge counts. Filtered to this week. Both this view
  // and CommentsList read the same query (Convex de-dupes the subscription).
  const allComments = useQuery(anyApi.queries.comments.listQueuedComments, {}) as
    | QueuedCommentRow[]
    | undefined;

  const commentCounts = useMemo(() => {
    const slotCounts = new Map<string, number>();
    const dayCounts = new Map<string, number>();
    const rows = allComments ?? [];
    for (const c of rows) {
      if (c.attachedTo.weekStart !== week.weekStart) continue;
      if (c.attachedTo.kind === "day" && c.attachedTo.day) {
        dayCounts.set(c.attachedTo.day, (dayCounts.get(c.attachedTo.day) ?? 0) + 1);
      } else if (c.attachedTo.kind === "dish" && c.attachedTo.day !== null) {
        // The slot's identity is (day, dishId); a comment on a custom one-off
        // (dishId null) attaches to the day's custom slot. We bucket by
        // (day, dishId-or-"custom").
        const key = `${c.attachedTo.day}-${c.attachedTo.dishId ?? "custom"}`;
        slotCounts.set(key, (slotCounts.get(key) ?? 0) + 1);
      }
    }
    return { slotCounts, dayCounts };
  }, [allComments, week.weekStart]);

  function handleAddPending(target: CommentTarget, text: string) {
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setPendingComments((prev) => [
      ...prev,
      {
        localId,
        createdAt: Date.now(),
        author: identity,
        attachedTo:
          target.kind === "day"
            ? { kind: "day", weekStart: target.weekStart, day: target.day, dishId: null }
            : {
                kind: "dish",
                weekStart: target.weekStart,
                day: target.day,
                dishId: target.dishId,
              },
        text,
      },
    ]);
  }

  // Drop pending entries that have a matching server row, so we don't show a
  // duplicate. Runs on every change to the comments query result.
  useEffect(() => {
    if (!allComments) return;
    setPendingComments((prev) =>
      prev.filter(
        (p) =>
          !allComments.some((s) => {
            const sAt = s.attachedTo;
            const pAt = p.attachedTo;
            return (
              sAt.kind === pAt.kind &&
              sAt.weekStart === pAt.weekStart &&
              sAt.day === pAt.day &&
              sAt.dishId === pAt.dishId
            );
          }),
      ),
    );
  }, [allComments]);

  return (
    <>
      <div className="week__header">
        <h2 className="week__title">Week of {week.weekStart}</h2>
        <span className={`week__status week__status--${week.status}`}>{week.status}</span>
      </div>
      <ol className="week__days">
        {grouped.map((bucket) => {
          const dayCommentKey = `day-${bucket.day}`;
          const dayComposerOpen = composingFor === dayCommentKey;
          const dayCount = commentCounts.dayCounts.get(bucket.day) ?? 0;
          return (
            <li key={bucket.day} className="day-card">
              <div className="day-card__head">
                <h3 className="day-card__title">{dayLabel(bucket.day)}</h3>
                {interactive && (
                  <button
                    type="button"
                    className="day-card__comment-link"
                    onClick={() => setComposingFor(dayComposerOpen ? null : dayCommentKey)}
                  >
                    {dayComposerOpen ? "Cancel" : "Comment on this day"}
                    {dayCount > 0 && <span className="badge">{dayCount}</span>}
                  </button>
                )}
              </div>
              {interactive && dayComposerOpen && (
                <CommentComposer
                  target={{ kind: "day", weekStart: week.weekStart, day: bucket.day }}
                  identity={identity}
                  onClose={() => setComposingFor(null)}
                  onOptimisticSend={(text) =>
                    handleAddPending(
                      { kind: "day", weekStart: week.weekStart, day: bucket.day },
                      text,
                    )
                  }
                />
              )}
              <ul className="day-card__slots">
                {bucket.slots.map((slot) => {
                  const sKey = slotKey(slot.day, slot.meal);
                  const isEditing = editingSlot === sKey;
                  const commentTargetKey = `slot-${slot.day}-${slot.meal}`;
                  const isComposingComment = composingFor === commentTargetKey;
                  const sBucketKey = `${slot.day}-${slot.dishId ?? "custom"}`;
                  const slotCount = commentCounts.slotCounts.get(sBucketKey) ?? 0;
                  return (
                    <li key={sKey} className="slot">
                      <div className="slot__row">
                        <span className="slot__meal">{mealLabel(slot.meal)}</span>
                        <span className="slot__dish">{slotPrimaryLabel(slot)}</span>
                        <span className="slot__source">{slotSourceLabel(slot.source)}</span>
                        {interactive && (
                          <button
                            type="button"
                            className="slot__edit"
                            onClick={() => setEditingSlot(isEditing ? null : sKey)}
                            aria-label={`Edit ${mealLabel(slot.meal)} for ${dayLabel(slot.day)}`}
                          >
                            {isEditing ? "Close" : "Edit"}
                          </button>
                        )}
                      </div>
                      {interactive && isEditing && (
                        <SlotEditor
                          weekStart={week.weekStart}
                          day={slot.day}
                          meal={slot.meal}
                          currentLabel={slotPrimaryLabel(slot)}
                          version={week.version}
                          identity={identity}
                          onClose={() => setEditingSlot(null)}
                        />
                      )}
                      {interactive && (
                        <button
                          type="button"
                          className="slot__comment-link"
                          onClick={() =>
                            setComposingFor(isComposingComment ? null : commentTargetKey)
                          }
                        >
                          {isComposingComment ? "Cancel" : "Add comment"}
                          {slotCount > 0 && <span className="badge">{slotCount}</span>}
                        </button>
                      )}
                      {interactive && isComposingComment && (
                        <CommentComposer
                          target={{
                            kind: "dish",
                            weekStart: week.weekStart,
                            day: slot.day,
                            dishId: slot.dishId,
                          }}
                          identity={identity}
                          onClose={() => setComposingFor(null)}
                          onOptimisticSend={(text) =>
                            handleAddPending(
                              {
                                kind: "dish",
                                weekStart: week.weekStart,
                                day: slot.day,
                                dishId: slot.dishId,
                              },
                              text,
                            )
                          }
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      {interactive && <CommentsList weekStart={week.weekStart} pendingLocal={pendingComments} />}
    </>
  );
}
