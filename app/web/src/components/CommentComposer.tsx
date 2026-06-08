import { useState } from "react";
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import type { Identity, ShortDay } from "../lib/types.js";

interface DishTarget {
  kind: "dish";
  weekStart: string;
  day: ShortDay;
  dishId: number | null;
}

interface DayTarget {
  kind: "day";
  weekStart: string;
  day: ShortDay;
}

export type CommentTarget = DishTarget | DayTarget;

interface CommentComposerProps {
  target: CommentTarget;
  identity: Identity;
  onClose: () => void;
  // Called the moment Save is pressed, before the server round-trip.
  // The parent uses this to render the comment locally so the user gets
  // immediate feedback. The eventual server row replaces the optimistic
  // entry once the listQueuedComments subscription updates.
  onOptimisticSend?: (text: string) => void;
}

export function CommentComposer({
  target,
  identity,
  onClose,
  onOptimisticSend,
}: CommentComposerProps) {
  const [text, setText] = useState<string>("");
  const [inFlight, setInFlight] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const addComment = useMutation(anyApi.commentsMutations.addComment);

  const trimmed = text.trim();
  const canSave = trimmed.length > 0 && !inFlight;

  async function handleSave() {
    if (!canSave) return;
    setInFlight(true);
    setError(null);
    if (onOptimisticSend) onOptimisticSend(trimmed);
    try {
      const attachedTo =
        target.kind === "dish"
          ? {
              kind: "dish" as const,
              weekStart: target.weekStart,
              day: target.day as string,
              dishId: target.dishId,
            }
          : {
              kind: "day" as const,
              weekStart: target.weekStart,
              day: target.day as string,
              dishId: null,
            };
      await addComment({ author: identity, attachedTo, text: trimmed });
      onClose();
    } catch (err) {
      console.error("addComment threw", err);
      setError("Could not save the comment. Try again.");
    } finally {
      setInFlight(false);
    }
  }

  return (
    <div className="comment-composer">
      <textarea
        className="comment-composer__input"
        rows={2}
        value={text}
        autoFocus
        placeholder="Add a note for the next slow loop..."
        onChange={(e) => setText(e.target.value)}
      />
      <div className="comment-composer__actions">
        <button
          type="button"
          className="comment-composer__save"
          onClick={handleSave}
          disabled={!canSave}
        >
          {inFlight ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className="comment-composer__cancel"
          onClick={onClose}
          disabled={inFlight}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="comment-composer__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
