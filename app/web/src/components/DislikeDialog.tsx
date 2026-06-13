// Dislike dialog for the Explore tab ("Not for me"). Unlike the shared
// ReasonDialog (which gates submit on a required reason, Decision #8), a dislike
// is a lightweight tap and its reason is OPTIONAL (Decision #12): the user can
// submit with an empty field, in which case the dislike records with no reason.
// An optional reason, when given, sharpens the slow loop's later read. This
// dialog records the signal and does nothing in-session (no re-rank, no hide;
// Principle 5); the only consequence is downstream, via the slow loop.

import { useState } from "react";
import { Sheet, Chip, PrimaryButton } from "./primitives.js";

// Optional quick-fill reasons tuned to a dislike (not the change reasons of the
// shared ReasonDialog). Tapping one fills the field; the user can edit or clear
// it. No em dashes per the project style rule.
const QUICK_REASONS = [
  "Too heavy",
  "Not our taste",
  "Too much effort",
  "Had it elsewhere",
] as const;

interface DislikeDialogProps {
  dishName: string;
  inFlight?: boolean;
  error?: string | null;
  onSubmit: (reason: string | null) => void;
  onClose: () => void;
}

export function DislikeDialog({
  dishName,
  inFlight,
  error,
  onSubmit,
  onClose,
}: DislikeDialogProps) {
  const [text, setText] = useState<string>("");
  const trimmed = text.trim();

  function submit() {
    if (inFlight) return;
    onSubmit(trimmed.length > 0 ? trimmed : null);
  }

  return (
    <Sheet onClose={onClose}>
      <div className="reason__title">Not for me: {dishName}</div>
      <div className="reason__hint">
        This is a note for the weekly review, nothing changes here now. A reason is optional.
      </div>
      <div className="reason__chips" role="group" aria-label="Quick reasons">
        {QUICK_REASONS.map((r) => (
          <Chip key={r} active={text === r} onClick={() => setText(r)}>
            {r}
          </Chip>
        ))}
      </div>
      <textarea
        className="reason__text"
        rows={3}
        value={text}
        placeholder="Why not? (optional)"
        onChange={(e) => setText(e.target.value)}
        disabled={inFlight}
      />
      {error && (
        <p className="reason__error" role="alert">
          {error}
        </p>
      )}
      <PrimaryButton onClick={submit} disabled={inFlight}>
        {inFlight ? "Saving..." : "Record dislike"}
      </PrimaryButton>
    </Sheet>
  );
}
