import { useState } from "react";
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { Header } from "./components/Header.js";
import { PasscodeGate } from "./components/PasscodeGate.js";
import { IdentityPicker } from "./components/IdentityPicker.js";
import { CurrentWeekView } from "./components/CurrentWeekView.js";
import {
  clearIdentity,
  getIdentity,
  getOrCreateDeviceId,
  isAuthValid,
  markAuthPassed,
  setIdentity,
} from "./lib/storage.js";
import type { Identity } from "./lib/types.js";

const PASSCODE = import.meta.env.VITE_PLANTRY_PASSCODE ?? "";

export function App() {
  const [authed, setAuthed] = useState<boolean>(() => isAuthValid());
  const [identity, setIdentityState] = useState<Identity | null>(() => getIdentity());
  const setUserProfile = useMutation(anyApi.users.setUserProfile);

  function handlePass() {
    markAuthPassed();
    setAuthed(true);
  }

  function handlePickIdentity(next: Identity) {
    setIdentity(next);
    setIdentityState(next);
    // Fire-and-forget: a more rigorous retry / sync is Stream F's concern.
    // The localStorage write above keeps the UI source of truth correct
    // regardless of whether this round-trips.
    const deviceId = getOrCreateDeviceId();
    setUserProfile({ deviceId, identity: next }).catch((err) => {
      console.error("setUserProfile failed", err);
    });
  }

  function handleClearIdentity() {
    clearIdentity();
    setIdentityState(null);
  }

  if (!authed) {
    return <PasscodeGate expected={PASSCODE} onPass={handlePass} />;
  }

  if (!identity) {
    return <IdentityPicker onPick={handlePickIdentity} />;
  }

  return (
    <div className="app">
      <Header identity={identity} onClearIdentity={handleClearIdentity} />
      <main className="app__main">
        <CurrentWeekView identity={identity} />
      </main>
      <footer className="app__footer">
        <a href="https://github.com/mudgal1729/plantry" target="_blank" rel="noreferrer">
          plantry on github
        </a>
      </footer>
    </div>
  );
}
