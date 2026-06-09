import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { Identity, Meal, ShortDay } from "../lib/types.js";

interface SlotEditorProps {
  weekStart: string;
  day: ShortDay;
  meal: Meal;
  currentLabel: string;
  version: number;
  identity: Identity;
  onClose: () => void;
}

type Mode = "swap" | "custom";

type ErrorState =
  | null
  | { kind: "version-mismatch" }
  | { kind: "dish-not-eligible" }
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
          className={`slot-editor__tab ${
            mode === "swap" ? "slot-editor__tab--active" : ""
          }`}
          onClick={() => handleModeChange("swap")}
          disabled={inFlight}
        >
          Swap
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "custom"}
          className={`slot-editor__tab ${
            mode === "custom" ? "slot-editor__tab--active" : ""
          }`}
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
        <button
          type="button"
          className="slot-editor__cancel"
          onClick={onClose}
          disabled={inFlight}
        >
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
  }) as AlternativeDish[] | undefined;

  const swapDish = useMutation(anyApi.swap.swapDish);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
    if (selectedId === null || inFlight) return;
    setInFlight(true);
    setError(null);
    try {
      const result = (await swapDish({
        author: identity,
        weekStart,
        day,
        meal,
        newDishId: selectedId,
        version,
      })) as
        | { ok: true; version: number }
        | {
            ok: false;
            reason:
              | "version-mismatch"
              | "no-current-week"
              | "no-such-slot"
              | "dish-not-eligible"
              | "dish-not-in-library";
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
      if (result.reason === "dish-not-eligible") {
        // Race: the alternatives list was right at fetch time but the chosen
        // dish drifted out of eligibility (e.g. a parallel swap consumed its
        // primary ingredient slot under §3 no-repeat).
        setError({ kind: "dish-not-eligible" });
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
          No alternatives match this slot under the current rules. Try a Custom one-off.
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

  const canSwap = selectedId !== null && !inFlight;

  return (
    <div className="slot-editor__pane">
      <p className="slot-editor__label slot-editor__label--block">
        Pick a replacement
      </p>
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
  currentLabel,
  version,
  identity,
  setError,
  inFlight,
  setInFlight,
  onClose,
}: SharedPaneProps & { currentLabel: string }) {
  const [value, setValue] = useState<string>(currentLabel);
  const addCustomOneOff = useMutation(anyApi.weekMutations.addCustomOneOff);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !inFlight;

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
        customLabel: trimmed,
        version,
      })) as
        | { ok: true; version: number }
        | { ok: false; reason: "version-mismatch" | "no-current-week" | "no-such-slot" };
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
        htmlFor={`slot-editor-${day}-${meal}`}
      >
        Replace with
      </label>
      <input
        id={`slot-editor-${day}-${meal}`}
        type="text"
        className="slot-editor__input"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. leftover khichdi"
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

function ErrorDisplay({
  error,
  onReload,
}: {
  error: ErrorState;
  onReload: () => void;
}) {
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
  if (error.kind === "dish-not-eligible") {
    return (
      <div className="slot-editor__error" role="alert">
        <p>That dish is no longer available for this slot. Reload to see the latest options.</p>
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
