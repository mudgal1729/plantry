// Read-only-shell bridge to editing. This slice (5.1) rebuilds the Menu and
// Grocery screens read-only; the full editing family is slice 5.2. Until then,
// editing still routes through the slice-1 CurrentWeekView (per-slot SlotEditor +
// comments sidebar), reached from a day card's Edit button. It is intentionally
// unstyled-rough for this one slice. CurrentWeekView, SlotEditor, and the
// comments sidebar are NOT deleted here; 5.2 retires them.

import { CurrentWeekView } from "./CurrentWeekView.js";
import type { Identity } from "../lib/types.js";

interface LegacyEditScreenProps {
  identity: Identity;
  onBack: () => void;
}

export function LegacyEditScreen({ identity, onBack }: LegacyEditScreenProps) {
  return (
    <div className="screen__scroll">
      <div className="legacy-edit">
        <button type="button" className="legacy-edit__back" onClick={onBack}>
          ‹ Back to menu
        </button>
        <p className="legacy-edit__note">
          Editing keeps the current interface for now. The redesigned editing screens arrive next.
        </p>
        <CurrentWeekView identity={identity} />
      </div>
    </div>
  );
}
