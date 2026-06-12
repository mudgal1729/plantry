import { useState } from "react";
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { PasscodeGate } from "./components/PasscodeGate.js";
import { IdentityPicker } from "./components/IdentityPicker.js";
import { MenuScreen } from "./components/MenuScreen.js";
import { GroceryScreen } from "./components/GroceryScreen.js";
import { ExploreScreen, ChangesScreen } from "./components/StubScreens.js";
import { LegacyEditScreen } from "./components/LegacyEditScreen.js";
import { TabBar, type TabKey } from "./components/primitives.js";
import {
  clearIdentity,
  getIdentity,
  getOrCreateDeviceId,
  isAuthValid,
  markAuthPassed,
  setIdentity,
} from "./lib/storage.js";
import type { Identity, ShortDay } from "./lib/types.js";

const PASSCODE = import.meta.env.VITE_PLANTRY_PASSCODE ?? "";

export function App() {
  const [authed, setAuthed] = useState<boolean>(() => isAuthValid());
  const [identity, setIdentityState] = useState<Identity | null>(() => getIdentity());
  const [tab, setTab] = useState<TabKey>("Menu");
  // When set, the legacy editor is shown over the Menu tab (read-only shell this
  // slice; the redesigned editing family is 5.2). The day is informational only:
  // the legacy view renders the whole week, so any day's Edit lands here.
  const [editing, setEditing] = useState<boolean>(false);
  const setUserProfile = useMutation(anyApi.users.setUserProfile);

  function handlePass() {
    markAuthPassed();
    setAuthed(true);
  }

  function handlePickIdentity(next: Identity) {
    setIdentity(next);
    setIdentityState(next);
    // Fire-and-forget mirror to Convex; the localStorage write above is the UI
    // source of truth regardless of whether this round-trips.
    const deviceId = getOrCreateDeviceId();
    setUserProfile({ deviceId, identity: next }).catch((err) => {
      console.error("setUserProfile failed", err);
    });
  }

  function handleSwitchIdentity() {
    clearIdentity();
    setIdentityState(null);
    setEditing(false);
    setTab("Menu");
  }

  function handleEditDay(day: ShortDay) {
    // The legacy editor renders the whole week, so the chosen day is not needed
    // to route there yet. Slice 5.2 introduces the per-day Day screen that uses
    // it; accepting the argument now keeps the Menu callback stable.
    void day;
    setEditing(true);
  }

  if (!authed) {
    return <PasscodeGate expected={PASSCODE} onPass={handlePass} />;
  }

  if (!identity) {
    return <IdentityPicker onPick={handlePickIdentity} />;
  }

  function renderActive() {
    if (tab === "Menu") {
      if (editing) {
        return <LegacyEditScreen identity={identity!} onBack={() => setEditing(false)} />;
      }
      return (
        <MenuScreen
          identity={identity!}
          onSwitchIdentity={handleSwitchIdentity}
          onEditDay={handleEditDay}
        />
      );
    }
    if (tab === "Grocery") return <GroceryScreen />;
    if (tab === "Explore") return <ExploreScreen />;
    return <ChangesScreen />;
  }

  function handleTab(next: TabKey) {
    setEditing(false);
    setTab(next);
  }

  return (
    <div className="screen">
      {renderActive()}
      <TabBar active={tab} onTab={handleTab} />
    </div>
  );
}
