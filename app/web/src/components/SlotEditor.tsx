import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { Identity, Meal, ShortDay } from "../lib/types.js";

interface SlotEditorProps {
  weekStart: string;
  day: ShortDay;
  meal: Meal;
  position: number;
  currentLabel: string;
  version: number;
  identity: Identity;
  onClose: () => void;
}

type Mode = "swap" | "custom";

// Quick-fill chip strings for the "Why are you changing this?" field. Tapping
// a chip prefills the input; the user can edit or replace it. The chips are
// UI prefills only; reasons land as freeform text in the `manualChanges` log
// per `features/manual-changes.md` (no enum). No em dashes per the project
// style rule in CLAUDE.md.
const REASON_CHIPS = [
  "Bored of it",
  "Not in mood",
  "Missing ingredient",
  "Tuhina wants this",
  "Want a change",
] as const;

interface ReasonFieldProps {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  inputId: string;
}

/**
 * Shared "Why are you changing this?" affordance. Renders 5 quick-fill chips
 * above a required text input. Tapping a chip overwrites the input with the
 * chip's label; the user can then edit. Used by both SwapPane and CustomPane.
 * The parent owns the trimmed-non-empty gate that enables Swap / Save.
 */
function ReasonField({ value, onChange, disabled, inputId }: ReasonFieldProps) {
  return (
    <div className="slot-editor__reason">
      <label className="slot-editor__label slot-editor__label--block" htmlFor={inputId}>
        Why are you changing this?
      </label>
      <div className="slot-editor__chips" role="group" aria-label="Quick reasons">
        {REASON_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="slot-editor__chip"
            onClick={() => onChange(chip)}
            disabled={disabled}
          >
            {chip}
          </button>
        ))}
      </div>
      <input
        id={inputId}
        type="text"
        className="slot-editor__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="A short reason, or tap a chip above"
        disabled={disabled}
      />
    </div>
  );
}

type ErrorState =
  | null
  | { kind: "version-mismatch" }
  | { kind: "dish-not-meal-time" }
  | { kind: "dish-not-active-or-in-season" }
  | { kind: "fatal"; message: string };

interface AlternativeDish {
  id: number;
  name: string;
  tags: string[];
}

export function SlotEditor({
  weekStart,
  day,
  meal,
  position,
  currentLabel,
  version,
  identity,
  onClose,
}: SlotEditorProps) {
  const [mode, setMode] = useState<Mode>("swap");
  const [error, setError] = useState<ErrorState>(null);
  const [inFlight, setInFlight] = useState<boolean>(false);

  // Clearing the error on mode switch keeps the UI honest: a swap-mode error
  // does not apply to custom mode and vice versa.
  function handleModeChange(next: Mode) {
    if (next === mode) return;
    setError(null);
    setMode(next);
  }

  return (
    <div className="slot-editor">
      <div className="slot-editor__tabs" role="tablist" aria-label="Edit mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "swap"}
          className={`slot-editor__tab ${mode === "swap" ? "slot-editor__tab--active" : ""}`}
          onClick={() => handleModeChange("swap")}
          disabled={inFlight}
        >
          Swap
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "custom"}
          className={`slot-editor__tab ${mode === "custom" ? "slot-editor__tab--active" : ""}`}
          onClick={() => handleModeChange("custom")}
          disabled={inFlight}
        >
          Custom
        </button>
      </div>

      {mode === "swap" && (
        <SwapPane
          weekStart={weekStart}
          day={day}
          meal={meal}
          position={position}
          version={version}
          identity={identity}
          error={error}
          setError={setError}
          inFlight={inFlight}
          setInFlight={setInFlight}
          onSwitchToCustom={() => handleModeChange("custom")}
          onClose={onClose}
        />
      )}

      {mode === "custom" && (
        <CustomPane
          weekStart={weekStart}
          day={day}
          meal={meal}
          position={position}
          currentLabel={currentLabel}
          version={version}
          identity={identity}
          error={error}
          setError={setError}
          inFlight={inFlight}
          setInFlight={setInFlight}
          onClose={onClose}
        />
      )}

      <ErrorDisplay error={error} onReload={onClose} />

      <div className="slot-editor__chrome">
        <button type="button" className="slot-editor__cancel" onClick={onClose} disabled={inFlight}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface SharedPaneProps {
  weekStart: string;
  day: ShortDay;
  meal: Meal;
  position: number;
  version: number;
  identity: Identity;
  error: ErrorState;
  setError: (e: ErrorState) => void;
  inFlight: boolean;
  setInFlight: (b: boolean) => void;
  onClose: () => void;
}

function SwapPane({
  weekStart,
  day,
  meal,
  position,
  version,
  identity,
  setError,
  inFlight,
  setInFlight,
  onSwitchToCustom,
  onClose,
}: SharedPaneProps & { onSwitchToCustom: () => void }) {
  const alternatives = useQuery(anyApi.swap.getSlotAlternatives, {
    weekStart,
    day,
    meal,
    position,
  }) as AlternativeDish[] | undefined;

  const swapDish = useMutation(anyApi.swap.swapDish);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Required per `features/manual-changes.md`. The slow loop reads `reason`
  // alongside `before` / `after` as fuel for rule redesign. Trim-empty gates
  // the Swap button below.
  const [reason, setReason] = useState<string>("");
  const trimmedReason = reason.trim();

  // If the alternatives list refreshes (other tab swapped, query revalidated)
  // and the selected dish is no longer in the list, clear the selection so the
  // Swap button does not fire on a stale id.
  useEffect(() => {
    if (!alternatives || selectedId === null) return;
    if (!alternatives.some((d) => d.id === selectedId)) {
      setSelectedId(null);
    }
  }, [alternatives, selectedId]);

  async function handleSwap() {
    if (selectedId === null || inFlight || trimmedReason.length === 0) return;
    setInFlight(true);
    setError(null);
    try {
      const result = (await swapDish({
        author: identity,
        weekStart,
        day,
        meal,
        position,
        newDishId: selectedId,
        version,
        reason: trimmedReason,
      })) as
        | { ok: true; version: number }
        | {
            ok: false;
            reason:
              | "version-mismatch"
              | "no-current-week"
              | "no-such-slot"
              | "no-such-position"
              | "dish-not-in-library"
              | "dish-not-meal-time"
              | "dish-not-active-or-in-season";
          };

      if (result.ok) {
        onClose();
        return;
      }
      if (result.reason === "version-mismatch") {
        // Race: another tab or phone wrote between this editor opening and
        // this Swap tap. Convex subscription will stream the new version; the
        // user reloads to see fresh alternatives.
        setError({ kind: "version-mismatch" });
        return;
      }
      if (result.reason === "dish-not-meal-time") {
        setError({ kind: "dish-not-meal-time" });
        return;
      }
      if (result.reason === "dish-not-active-or-in-season") {
        setError({ kind: "dish-not-active-or-in-season" });
        return;
      }
      setError({ kind: "fatal", message: "Something is off, please reload." });
    } catch (err) {
      console.error("swapDish threw", err);
      setError({ kind: "fatal", message: "Something is off, please reload." });
    } finally {
      setInFlight(false);
    }
  }

  if (alternatives === undefined) {
    return (
      <div className="slot-editor__pane">
        <p className="slot-editor__hint">Loading alternatives...</p>
      </div>
    );
  }

  if (alternatives.length === 0) {
    return (
      <div className="slot-editor__pane">
        <p className="slot-editor__hint">
          No alternatives in the library for this meal. Try a Custom one-off.
        </p>
        <div className="slot-editor__actions">
          <button
            type="button"
            className="slot-editor__save"
            onClick={onSwitchToCustom}
            disabled={inFlight}
          >
            Switch to Custom
          </button>
        </div>
      </div>
    );
  }

  const canSwap = selectedId !== null && !inFlight && trimmedReason.length > 0;

  return (
    <div className="slot-editor__pane">
      <p className="slot-editor__label slot-editor__label--block">Pick a replacement</p>
      <ul className="alt-list">
        {alternatives.map((d) => {
          const isSelected = selectedId === d.id;
          const hp = d.tags.includes("HP");
          return (
            <li key={d.id} className="alt-list__item">
              <button
                type="button"
                className={`alt-row ${isSelected ? "alt-row--selected" : ""}`}
                onClick={() => setSelectedId(d.id)}
                disabled={inFlight}
                aria-pressed={isSelected}
              >
                <span className="alt-row__name">{d.name}</span>
                {hp && <span className="alt-row__chip">HP</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <ReasonField
        value={reason}
        onChange={setReason}
        disabled={inFlight}
        inputId={`slot-editor-swap-reason-${day}-${meal}-${position}`}
      />
      <div className="slot-editor__actions">
        <button
          type="button"
          className="slot-editor__save"
          onClick={handleSwap}
          disabled={!canSwap}
        >
          {inFlight ? "Swapping..." : "Swap"}
        </button>
      </div>
    </div>
  );
}

function CustomPane({
  weekStart,
  day,
  meal,
  position,
  currentLabel,
  version,
  identity,
  setError,
  inFlight,
  setInFlight,
  onClose,
}: SharedPaneProps & { currentLabel: string }) {
  const [value, setValue] = useState<string>(currentLabel);
  // Required per `features/manual-changes.md`. Trim-empty gates Save below.
  const [reason, setReason] = useState<string>("");
  const addCustomOneOff = useMutation(anyApi.weekMutations.addCustomOneOff);

  const trimmed = value.trim();
  const trimmedReason = reason.trim();
  const canSave = trimmed.length > 0 && trimmedReason.length > 0 && !inFlight;

  async function handleSave() {
    if (!canSave) return;
    setInFlight(true);
    setError(null);
    try {
      const result = (await addCustomOneOff({
        author: identity,
        weekStart,
        day,
        meal,
        position,
        customLabel: trimmed,
        version,
        reason: trimmedReason,
      })) as
        | { ok: true; version: number }
        | {
            ok: false;
            reason: "version-mismatch" | "no-current-week" | "no-such-slot" | "no-such-position";
          };
      if (result.ok) {
        onClose();
        return;
      }
      if (result.reason === "version-mismatch") {
        setError({ kind: "version-mismatch" });
        return;
      }
      setError({ kind: "fatal", message: "Something is off, please reload." });
    } catch (err) {
      console.error("addCustomOneOff threw", err);
      setError({ kind: "fatal", message: "Something is off, please reload." });
    } finally {
      setInFlight(false);
    }
  }

  return (
    <div className="slot-editor__pane">
      <label
        className="slot-editor__label slot-editor__label--block"
        htmlFor={`slot-editor-${day}-${meal}-${position}`}
      >
        Replace with
      </label>
      <input
        id={`slot-editor-${day}-${meal}-${position}`}
        type="text"
        className="slot-editor__input"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. leftover khichdi"
        disabled={inFlight}
      />
      <ReasonField
        value={reason}
        onChange={setReason}
        disabled={inFlight}
        inputId={`slot-editor-custom-reason-${day}-${meal}-${position}`}
      />
      <div className="slot-editor__actions">
        <button
          type="button"
          className="slot-editor__save"
          onClick={handleSave}
          disabled={!canSave}
        >
          {inFlight ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function ErrorDisplay({ error, onReload }: { error: ErrorState; onReload: () => void }) {
  if (!error) return null;
  if (error.kind === "version-mismatch") {
    return (
      <div className="slot-editor__error" role="alert">
        <p>Someone else just updated this week. Refresh and try again.</p>
        <button type="button" className="slot-editor__reload" onClick={onReload}>
          Reload
        </button>
      </div>
    );
  }
  if (error.kind === "dish-not-meal-time") {
    return (
      <div className="slot-editor__error" role="alert">
        <p>That dish belongs to a different meal-time. Reload and try again.</p>
        <button type="button" className="slot-editor__reload" onClick={onReload}>
          Reload
        </button>
      </div>
    );
  }
  if (error.kind === "dish-not-active-or-in-season") {
    return (
      <div className="slot-editor__error" role="alert">
        <p>That dish is no longer active or in season. Reload to see the latest options.</p>
        <button type="button" className="slot-editor__reload" onClick={onReload}>
          Reload
        </button>
      </div>
    );
  }
  return (
    <p className="slot-editor__error" role="alert">
      {error.message}
    </p>
  );
}
