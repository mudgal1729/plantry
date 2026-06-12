import { useState } from "react";

interface PasscodeGateProps {
  expected: string;
  onPass: () => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

// Restyled to the handoff keypad (design_handoff/hifi-screens.jsx GateScreen).
// Behaviour is unchanged from slice 1: the entered code is checked against the
// configured passcode (`expected`, from VITE_PLANTRY_PASSCODE). The handoff
// prototype never validated; the real gate does. The code auto-submits once it
// reaches four digits; a wrong code clears the entry and shows the error.
export function PasscodeGate({ expected, onPass }: PasscodeGateProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  function submit(value: string) {
    if (value === expected) {
      setError(false);
      onPass();
    } else {
      setError(true);
      setCode("");
    }
  }

  function press(key: string) {
    if (key === "del") {
      setCode((prev) => prev.slice(0, -1));
      return;
    }
    setCode((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + key;
      if (error) setError(false);
      if (next.length === 4) {
        // Defer so the fourth dot paints before the check.
        setTimeout(() => submit(next), 120);
      }
      return next;
    });
  }

  return (
    <div className="screen">
      <div className="gate">
        <div className="gate__brand">
          <div className="gate__brand-name">Plantry</div>
          <div className="gate__brand-hint">Enter the kitchen passcode</div>
        </div>
        <div className="gate__dots">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`gate__dot${i < code.length ? " gate__dot--filled" : ""}`} />
          ))}
        </div>
        <div className="gate__pad">
          {KEYS.map((key, i) =>
            key === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                className={`gate__key${key === "del" ? " gate__key--del" : ""}`}
                aria-label={key === "del" ? "Delete" : key}
                onClick={() => press(key)}
              >
                {key === "del" ? "Delete" : key}
              </button>
            ),
          )}
        </div>
        <p className="gate__error" role="alert">
          {error ? "That passcode is not right. Try again." : ""}
        </p>
      </div>
    </div>
  );
}
