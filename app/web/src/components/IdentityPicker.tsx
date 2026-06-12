import type { Identity } from "../lib/types.js";
import { Avatar } from "./primitives.js";

interface IdentityPickerProps {
  onPick: (identity: Identity) => void;
}

const PEOPLE: { id: Identity; name: string }[] = [
  { id: "rajat", name: "Rajat" },
  { id: "tuhina", name: "Tuhina" },
];

// Restyled to the handoff IdentityScreen. Behaviour is unchanged: picking writes
// the identity to localStorage (and mirrors it to Convex) in App.tsx; this
// component only reports the choice.
export function IdentityPicker({ onPick }: IdentityPickerProps) {
  return (
    <div className="screen">
      <div className="identity">
        <div className="identity__head">
          <div className="identity__title">Who is this phone?</div>
          <div className="identity__hint">Edits and comments carry your name</div>
        </div>
        {PEOPLE.map((person) => (
          <button
            key={person.id}
            type="button"
            className="identity__option"
            onClick={() => onPick(person.id)}
          >
            <Avatar who={person.id} size={44} />
            <div className="identity__option-text">
              <div className="identity__option-name">I am {person.name}</div>
              <div className="identity__option-sub">Stored on this phone only</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
