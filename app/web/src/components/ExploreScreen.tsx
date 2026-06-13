// Explore screen (slice 7.1). A ranked, familiar-but-new feed of library dishes
// the household has not cooked yet, from the 4.2 `getExploreFeed` query (the
// engine does the ranking and hands each dish its dominant-affinity key; this
// screen only displays). Filters narrow the grid (Easy to cook, Healthy,
// Breakfast, Lunch). Tapping a card opens the Explore dish sheet (recipe
// visible, a plain "why it fits" line, and the Use-this-week / Next-week / Not-
// for-me actions). Dishes already placed this week or queued for next are hidden
// server-side by the feed query (Decision 9). Ported from the ExploreScreen in
// design_handoff/hifi-screens.jsx.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { ExploreAffinityKey } from "@plantry/engine";
import type { CurrentWeek, Identity, Meal, ShortDay } from "../lib/types.js";
import { dishById, dishPhotoUrl, complexityVariant, complexityLabel } from "../lib/library.js";
import { dayLabel } from "../lib/days.js";
import { Chip, ComplexityTag, Thumb } from "./primitives.js";
import { ExploreDishSheet } from "./ExploreDishSheet.js";
import { ReasonDialog } from "./ReasonDialog.js";
import { ExploreDayPicker } from "./ExploreDayPicker.js";
import { DislikeDialog } from "./DislikeDialog.js";

interface ExploreScreenProps {
  identity: Identity;
}

interface ExploreFeedDish {
  dishId: number;
  name: string;
  dominantAffinity: ExploreAffinityKey;
}

// The four filter chips from the handoff. "Easy to cook" reads the dish
// complexity; "Healthy" reads the (forward-looking) `healthy` tag (Decision: a
// filter-only tag, no rule semantics) so the chip is inert until that tag is
// populated rather than guessing health from other fields; "Breakfast"/"Lunch"
// read the meal-time.
const FILTERS = ["Easy to cook", "Healthy", "Breakfast", "Lunch"] as const;
type Filter = (typeof FILTERS)[number];

// Which overlay (if any) is open over the feed. One value keeps the sheet stack
// to at most one sheet at a time, matching the Day screen.
type Overlay =
  | { kind: "none" }
  | { kind: "sheet"; dish: ExploreFeedDish }
  | { kind: "use-day"; dish: ExploreFeedDish }
  | { kind: "use-reason"; dish: ExploreFeedDish; day: ShortDay; meal: Meal }
  | { kind: "next-reason"; dish: ExploreFeedDish }
  | { kind: "dislike"; dish: ExploreFeedDish };

function matchesFilters(dishId: number, filters: Filter[]): boolean {
  const dish = dishById(dishId);
  if (!dish) return false;
  if (filters.includes("Easy to cook") && dish.complexity !== "Easy") return false;
  if (filters.includes("Healthy") && !dish.tags.some((t) => t.toLowerCase() === "healthy"))
    return false;
  if (filters.includes("Breakfast") && dish.time !== "Breakfast") return false;
  if (filters.includes("Lunch") && dish.time !== "Lunch") return false;
  return true;
}

export function ExploreScreen({ identity }: ExploreScreenProps) {
  const week = useQuery(anyApi.queries.week.getCurrentWeek, {}) as CurrentWeek | null | undefined;
  const weekStart = week?.weekStart ?? null;
  const feed = useQuery(anyApi.explore.getExploreFeed, weekStart ? { weekStart } : "skip") as
    | ExploreFeedDish[]
    | undefined;

  const addDish = useMutation(anyApi.dayMutations.addDish);
  const saveForNextWeek = useMutation(anyApi.dayMutations.saveForNextWeek);
  const dislikeDish = useMutation(anyApi.dishDislikes.dislikeDish);

  const [filters, setFilters] = useState<Filter[]>([]);
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  function toggleFilter(f: Filter) {
    setFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  const visible = useMemo(() => {
    if (!feed) return [];
    return feed.filter((entry) => matchesFilters(entry.dishId, filters));
  }, [feed, filters]);

  function closeOverlay() {
    setOverlay({ kind: "none" });
    setActionError(null);
    setInFlight(false);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((cur) => (cur === message ? null : cur)), 2600);
  }

  async function handleUse(reason: string, dish: ExploreFeedDish, day: ShortDay, meal: Meal) {
    if (inFlight || !weekStart || !week) return;
    setInFlight(true);
    setActionError(null);
    try {
      const result = (await addDish({
        author: identity,
        weekStart,
        day,
        meal,
        newDishId: dish.dishId,
        version: week.version,
        reason,
      })) as { ok: true; version: number; position: number } | { ok: false; reason: string };
      if (result.ok) {
        closeOverlay();
        showToast(`Added ${dish.name} to ${dayLabel(day)}`);
        return;
      }
      if (result.reason === "version-mismatch") {
        setActionError("Someone just changed this week. Close and try again.");
      } else if (result.reason === "dish-not-active-or-in-season") {
        setActionError("That dish is not in season right now.");
      } else {
        setActionError("Something is off. Close and try again.");
      }
    } catch (err) {
      console.error("addDish threw", err);
      setActionError("Something is off. Close and try again.");
    } finally {
      setInFlight(false);
    }
  }

  async function handleNextWeek(reason: string, dish: ExploreFeedDish) {
    if (inFlight || !weekStart) return;
    setInFlight(true);
    setActionError(null);
    try {
      const result = (await saveForNextWeek({
        author: identity,
        weekStart,
        dishId: dish.dishId,
        reason,
      })) as { ok: true; queueId: string } | { ok: false; reason: string };
      if (result.ok) {
        closeOverlay();
        showToast(`Saved ${dish.name} for next week`);
        return;
      }
      if (result.reason === "already-queued") {
        setActionError("That dish is already saved for next week.");
      } else {
        setActionError("Something is off. Close and try again.");
      }
    } catch (err) {
      console.error("saveForNextWeek threw", err);
      setActionError("Something is off. Close and try again.");
    } finally {
      setInFlight(false);
    }
  }

  // Records-only dislike: write the signal and do nothing else in-session (no
  // re-rank, no hide; Principle 5, Decision #12). The feed is untouched, so the
  // disliked dish stays exactly where it was; only a confirmation toast shows.
  async function handleDislike(reason: string | null, dish: ExploreFeedDish) {
    if (inFlight) return;
    setInFlight(true);
    setActionError(null);
    try {
      const result = (await dislikeDish({
        author: identity,
        dishId: dish.dishId,
        reason,
      })) as { ok: true; dislikeId: string } | { ok: false; reason: string };
      if (result.ok) {
        closeOverlay();
        showToast("Noted for the weekly review");
        return;
      }
      setActionError("Something is off. Close and try again.");
    } catch (err) {
      console.error("dislikeDish threw", err);
      setActionError("Something is off. Close and try again.");
    } finally {
      setInFlight(false);
    }
  }

  return (
    <div className="screen__scroll">
      <div className="screen__header">
        <h1 className="screen__title">Explore</h1>
        <div className="screen__subtitle">
          {feed === undefined
            ? "Dishes you have not cooked yet"
            : `${feed.length} dishes you have not cooked yet`}
        </div>
      </div>

      <div className="explore__filters" role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <Chip key={f} active={filters.includes(f)} onClick={() => toggleFilter(f)}>
            {f}
          </Chip>
        ))}
      </div>

      <div className="explore__rubric">Close to your usual, new on the plate</div>

      {week === undefined || feed === undefined ? (
        <div className="empty-state">Loading dishes...</div>
      ) : week === null ? (
        <div className="empty-state">
          <div className="empty-state__title">No menu yet</div>
          The explore feed appears once the first weekly menu is generated.
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          {feed.length === 0
            ? "You have cooked everything in season. Nothing new to explore right now."
            : "Nothing matches these filters this season."}
        </div>
      ) : (
        <div className="explore__grid">
          {visible.map((entry) => (
            <ExploreCard
              key={entry.dishId}
              entry={entry}
              onOpen={() => setOverlay({ kind: "sheet", dish: entry })}
            />
          ))}
        </div>
      )}

      {overlay.kind === "sheet" && (
        <ExploreDishSheet
          dishId={overlay.dish.dishId}
          dominantAffinity={overlay.dish.dominantAffinity}
          onUseThisWeek={() => setOverlay({ kind: "use-day", dish: overlay.dish })}
          onNextWeek={() => setOverlay({ kind: "next-reason", dish: overlay.dish })}
          onDislike={() => setOverlay({ kind: "dislike", dish: overlay.dish })}
          onClose={closeOverlay}
        />
      )}

      {overlay.kind === "use-day" &&
        week &&
        (() => {
          const dishMeal: Meal =
            dishById(overlay.dish.dishId)?.time === "Breakfast" ? "breakfast" : "lunch";
          return (
            <ExploreDayPicker
              dishName={overlay.dish.name}
              meal={dishMeal}
              week={week}
              onPick={(day) =>
                setOverlay({ kind: "use-reason", dish: overlay.dish, day, meal: dishMeal })
              }
              onClose={closeOverlay}
            />
          );
        })()}

      {overlay.kind === "use-reason" && (
        <ReasonDialog
          title={`Add ${overlay.dish.name}`}
          hint={`To ${dayLabel(overlay.day)}. A short reason helps the weekly review.`}
          submitLabel="Add to this week"
          inFlight={inFlight}
          error={actionError}
          onSubmit={(reason) => handleUse(reason, overlay.dish, overlay.day, overlay.meal)}
          onClose={inFlight ? () => undefined : closeOverlay}
        />
      )}

      {overlay.kind === "next-reason" && (
        <ReasonDialog
          title={`Save ${overlay.dish.name} for next week`}
          hint="It joins next week's generation as a request. A short reason helps the review."
          submitLabel="Save for next week"
          inFlight={inFlight}
          error={actionError}
          onSubmit={(reason) => handleNextWeek(reason, overlay.dish)}
          onClose={inFlight ? () => undefined : closeOverlay}
        />
      )}

      {overlay.kind === "dislike" && (
        <DislikeDialog
          dishName={overlay.dish.name}
          inFlight={inFlight}
          error={actionError}
          onSubmit={(reason) => handleDislike(reason, overlay.dish)}
          onClose={inFlight ? () => undefined : closeOverlay}
        />
      )}

      {toast && (
        <div className="explore__toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function ExploreCard({ entry, onOpen }: { entry: ExploreFeedDish; onOpen: () => void }) {
  const dish = dishById(entry.dishId);
  const photo = dishPhotoUrl(dish);
  return (
    <button type="button" className="explore-card" onClick={onOpen}>
      {photo ? (
        <img className="explore-card__photo" src={photo} alt="" />
      ) : (
        <div className="explore-card__photo explore-card__photo--placeholder" aria-hidden="true">
          <Thumb src={null} size={28} />
        </div>
      )}
      <div className="explore-card__body">
        <div className="explore-card__name">{entry.name}</div>
        {dish && (
          <div className="explore-card__tag">
            <ComplexityTag
              variant={complexityVariant(dish.complexity)}
              label={complexityLabel(dish.complexity) ?? "Easy to cook"}
            />
          </div>
        )}
      </div>
    </button>
  );
}
