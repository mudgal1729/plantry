// Day screen. Opened from a Menu day card's Edit button. The single entry point
// to the editing family: it renders the day's dishes as tappable rows (tap a
// library dish for details, tap "..." for the action sheet), and the day-level
// actions (Add a dish, Skip / Restore, Comment on this day). All edits apply to
// the live week immediately through the 4.1 mutations; the Convex subscription
// streams the new version back so the next edit carries fresh optimistic-
// concurrency state. Day-level or dish-level only: a meal block is never edited
// as a unit. Ported from the DayScreen in design_handoff/hifi-screens.jsx.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { CurrentWeek, DishPick, Identity, Meal, ShortDay } from "../lib/types.js";
import { dayLabel, dayDate, mealLabel, mealOrderIndex } from "../lib/days.js";
import { dishById } from "../lib/library.js";
import { Card, SectionLabel, PrimaryButton } from "./primitives.js";
import { DishRow } from "./DishRow.js";
import { DishActionSheet } from "./DishActionSheet.js";
import { DishDetailSheet } from "./DishDetailSheet.js";
import { SwapPickerSheet } from "./SwapPickerSheet.js";
import { AddDishSheet } from "./AddDishSheet.js";
import { CommentSheet, type CommentTarget } from "./CommentSheet.js";
import { ReasonDialog } from "./ReasonDialog.js";

interface DayScreenProps {
  day: ShortDay;
  identity: Identity;
  onBack: () => void;
}

// Which (if any) overlay is open. A single value keeps the sheet stack sane on
// mobile (at most one sheet at a time).
type Overlay =
  | { kind: "none" }
  | { kind: "action"; meal: Meal; position: number }
  | { kind: "details"; meal: Meal; position: number }
  | { kind: "swap"; meal: Meal; position: number }
  | { kind: "add" }
  | { kind: "skip" }
  | { kind: "restore" }
  | { kind: "comment"; target: CommentTarget };

const MEALS: Meal[] = ["breakfast", "lunch"];

function pickLabel(pick: DishPick): string {
  if (pick.customLabel) return pick.customLabel;
  if (pick.dishId !== null) return dishById(pick.dishId)?.name ?? "From the library";
  return "One off this week";
}

export function DayScreen({ day, identity, onBack }: DayScreenProps) {
  const week = useQuery(anyApi.queries.week.getCurrentWeek, {}) as CurrentWeek | null | undefined;

  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [actionError, setActionError] = useState<string | null>(null);

  const skipDay = useMutation(anyApi.dayMutations.skipDay);
  const restoreDay = useMutation(anyApi.dayMutations.restoreDay);

  const dayState = useMemo(() => {
    if (!week) return null;
    const slotsByMeal = new Map<Meal, DishPick[]>();
    for (const slot of week.slots) {
      if (slot.day !== day) continue;
      slotsByMeal.set(slot.meal, slot.dishes);
    }
    const skip = (week.skippedDays ?? []).find((s) => s.day === day) ?? null;
    return { slotsByMeal, skip };
  }, [week, day]);

  if (week === undefined) {
    return (
      <div className="screen__scroll">
        <DayHeader day={day} weekStart={null} onBack={onBack} />
        <div className="empty-state">Loading day...</div>
      </div>
    );
  }
  if (week === null || !dayState) {
    return (
      <div className="screen__scroll">
        <DayHeader day={day} weekStart={null} onBack={onBack} />
        <div className="empty-state">No menu for this day.</div>
      </div>
    );
  }

  const { slotsByMeal, skip } = dayState;
  const version = week.version;
  const weekStart = week.weekStart;
  const availableMeals = MEALS.filter((m) => (slotsByMeal.get(m)?.length ?? 0) > 0);
  // Meals the day can hold a dish in: Saturday has no breakfast slot at all, so
  // even after a delete leaves a meal empty, the add picker must respect the
  // day's shape. A slot present in the week (even if now empty) is addable.
  const addableMeals = MEALS.filter((m) => slotsByMeal.has(m));

  function closeOverlay() {
    setOverlay({ kind: "none" });
    setActionError(null);
  }

  async function handleSkip(reason: string) {
    setActionError(null);
    try {
      const result = (await skipDay({ author: identity, weekStart, day, version, reason })) as
        | { ok: true; version: number }
        | { ok: false; reason: string };
      if (result.ok) {
        closeOverlay();
        return;
      }
      setActionError(
        result.reason === "version-mismatch"
          ? "Someone just changed this week. Close and try again."
          : "Something is off. Close and try again.",
      );
    } catch (err) {
      console.error("skipDay threw", err);
      setActionError("Something is off. Close and try again.");
    }
  }

  async function handleRestore(reason: string) {
    setActionError(null);
    try {
      const result = (await restoreDay({ author: identity, weekStart, day, version, reason })) as
        | { ok: true; version: number }
        | { ok: false; reason: string };
      if (result.ok) {
        closeOverlay();
        return;
      }
      setActionError(
        result.reason === "version-mismatch"
          ? "Someone just changed this week. Close and try again."
          : "Something is off. Close and try again.",
      );
    } catch (err) {
      console.error("restoreDay threw", err);
      setActionError("Something is off. Close and try again.");
    }
  }

  function pickAt(meal: Meal, position: number): DishPick | undefined {
    return slotsByMeal.get(meal)?.[position];
  }

  return (
    <div className="screen__scroll">
      <DayHeader day={day} weekStart={weekStart} onBack={onBack} />

      {skip ? (
        <div className="day-screen__body">
          <Card className="day-screen__skipped">
            <div className="day-screen__skipped-title">This day is skipped</div>
            <div className="day-screen__skipped-reason">&ldquo;{skip.reason}&rdquo;</div>
            <div className="day-screen__skipped-note">No dishes, no groceries counted for it.</div>
            <PrimaryButton onClick={() => setOverlay({ kind: "restore" })}>
              Restore this day
            </PrimaryButton>
          </Card>
        </div>
      ) : (
        <div className="day-screen__body">
          {availableMeals
            .sort((a, b) => mealOrderIndex(a) - mealOrderIndex(b))
            .map((meal) => (
              <Card key={meal} className="day-screen__meal">
                <SectionLabel>{mealLabel(meal)}</SectionLabel>
                {(slotsByMeal.get(meal) ?? []).map((pick, position) => (
                  <DishRow
                    key={position}
                    pick={pick}
                    onClick={() =>
                      pick.dishId !== null
                        ? setOverlay({ kind: "details", meal, position })
                        : setOverlay({ kind: "action", meal, position })
                    }
                    trailing={
                      <button
                        type="button"
                        className="dish-row__actions"
                        aria-label="Dish actions"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setOverlay({ kind: "action", meal, position });
                        }}
                      >
                        &middot;&middot;&middot;
                      </button>
                    }
                  />
                ))}
              </Card>
            ))}

          {addableMeals.length > 0 && (
            <button
              type="button"
              className="day-screen__add"
              onClick={() => setOverlay({ kind: "add" })}
            >
              Add a dish
            </button>
          )}
          <button
            type="button"
            className="day-screen__comment"
            onClick={() => setOverlay({ kind: "comment", target: { kind: "day", weekStart, day } })}
          >
            Comment on this day
          </button>
          <button
            type="button"
            className="day-screen__skip"
            onClick={() => setOverlay({ kind: "skip" })}
          >
            Skip this day
          </button>
        </div>
      )}

      {/* Overlays */}
      {overlay.kind === "action" &&
        (() => {
          const pick = pickAt(overlay.meal, overlay.position);
          if (!pick) return null;
          return (
            <DishActionSheet
              weekStart={weekStart}
              day={day}
              meal={overlay.meal}
              position={overlay.position}
              version={version}
              dishLabel={pickLabel(pick)}
              isLibraryDish={pick.dishId !== null}
              identity={identity}
              onDetails={() =>
                setOverlay({ kind: "details", meal: overlay.meal, position: overlay.position })
              }
              onReplace={() =>
                setOverlay({ kind: "swap", meal: overlay.meal, position: overlay.position })
              }
              onDeleted={closeOverlay}
              onClose={closeOverlay}
            />
          );
        })()}

      {overlay.kind === "details" &&
        (() => {
          const pick = pickAt(overlay.meal, overlay.position);
          if (!pick || pick.dishId === null) return null;
          const dishId = pick.dishId;
          return (
            <DishDetailSheet
              weekStart={weekStart}
              day={day}
              meal={overlay.meal}
              position={overlay.position}
              version={version}
              dishId={dishId}
              includeRecipe={pick.includeRecipe ?? false}
              identity={identity}
              onReplace={() =>
                setOverlay({ kind: "swap", meal: overlay.meal, position: overlay.position })
              }
              onDelete={() =>
                setOverlay({ kind: "action", meal: overlay.meal, position: overlay.position })
              }
              onComment={() =>
                setOverlay({
                  kind: "comment",
                  target: {
                    kind: "dish",
                    weekStart,
                    day,
                    dishId,
                    dishLabel: pickLabel(pick),
                  },
                })
              }
              onClose={closeOverlay}
            />
          );
        })()}

      {overlay.kind === "swap" &&
        (() => {
          const pick = pickAt(overlay.meal, overlay.position);
          if (!pick) return null;
          return (
            <SwapPickerSheet
              weekStart={weekStart}
              day={day}
              meal={overlay.meal}
              position={overlay.position}
              version={version}
              outgoingLabel={pickLabel(pick)}
              identity={identity}
              onDone={closeOverlay}
              onClose={closeOverlay}
            />
          );
        })()}

      {overlay.kind === "add" && (
        <AddDishSheet
          weekStart={weekStart}
          day={day}
          version={version}
          availableMeals={addableMeals}
          identity={identity}
          onDone={closeOverlay}
          onClose={closeOverlay}
        />
      )}

      {overlay.kind === "skip" && (
        <ReasonDialog
          title={`Skip ${dayLabel(day)}`}
          hint="The day's dishes stay, so you can restore it later. A short reason helps the review."
          submitLabel="Skip this day"
          error={actionError}
          onSubmit={handleSkip}
          onClose={closeOverlay}
        />
      )}

      {overlay.kind === "restore" && (
        <ReasonDialog
          title={`Restore ${dayLabel(day)}`}
          hint="This brings back the day's dishes and groceries."
          submitLabel="Restore this day"
          error={actionError}
          onSubmit={handleRestore}
          onClose={closeOverlay}
        />
      )}

      {overlay.kind === "comment" && (
        <CommentSheet target={overlay.target} identity={identity} onClose={closeOverlay} />
      )}
    </div>
  );
}

function DayHeader({
  day,
  weekStart,
  onBack,
}: {
  day: ShortDay;
  weekStart: string | null;
  onBack: () => void;
}) {
  const date = weekStart ? dayDate(weekStart, day) : null;
  return (
    <div className="day-screen__header">
      <button type="button" className="day-screen__back" aria-label="Back to menu" onClick={onBack}>
        &lsaquo;
      </button>
      <div>
        <div className="day-screen__title">
          {dayLabel(day)}
          {date ? `, ${date.month} ${date.num}` : ""}
        </div>
        <div className="day-screen__sub">Changes apply to this week right away</div>
      </div>
    </div>
  );
}
