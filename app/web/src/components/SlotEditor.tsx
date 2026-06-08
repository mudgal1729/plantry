import { useState } from "react";
import { useMutation } from "convex/react";
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

type ErrorState =
  | null
  | { kind: "version-mismatch" }
  | { kind: "fatal"; message: string };

export function SlotEditor({
  weekStart,
  day,
  meal,
  currentLabel,
  version,
  identity,
  onClose,
}: SlotEditorProps) {
  const [value, setValue] = useState<string>(currentLabel);
  const [inFlight, setInFlight] = useState<boolean>(false);
  const [error, setError] = useState<ErrorState>(null);
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

  function handleReload() {
    // The Convex subscription on getCurrentWeek streams the latest version in
    // automatically; closing the editor lets the parent re-open with the
    // fresh version. The race we are handling: another tab (or Tuhina's
    // phone) saved a swap or custom one-off between this editor opening and
    // this Save tap.
    onClose();
  }

  return (
    <div className="slot-editor">
      <label className="slot-editor__label" htmlFor={`slot-editor-${day}-${meal}`}>
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
        <button
          type="button"
          className="slot-editor__cancel"
          onClick={onClose}
          disabled={inFlight}
        >
          Cancel
        </button>
      </div>
      {error?.kind === "version-mismatch" && (
        <div className="slot-editor__error" role="alert">
          <p>Someone else just updated this week. Refresh and try again.</p>
          <button type="button" className="slot-editor__reload" onClick={handleReload}>
            Reload
          </button>
        </div>
      )}
      {error?.kind === "fatal" && (
        <p className="slot-editor__error" role="alert">
          {error.message}
        </p>
      )}
    </div>
  );
}
