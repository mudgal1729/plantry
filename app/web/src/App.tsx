import { useState } from "react";
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { PasscodeGate } from "./components/PasscodeGate.js";
import { IdentityPicker } from "./components/IdentityPicker.js";
import { MenuScreen } from "./components/MenuScreen.js";
import { GroceryScreen } from "./components/GroceryScreen.js";
import { ChangesScreen } from "./components/ChangesScreen.js";
import { ExploreScreen } from "./components/ExploreScreen.js";
import { DayScreen } from "./components/DayScreen.js";
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
  // The day currently open in the editing family (the Day screen and its sheets),
  // shown over the Menu tab. Null when the Menu list is showing. Set from a day
  // card's Edit; cleared by the Day screen's back affordance or a tab switch.
  const [editingDay, setEditingDay] = useState<ShortDay | null>(null);
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
    setEditingDay(null);
    setTab("Menu");
  }

  function handleEditDay(day: ShortDay) {
    setEditingDay(day);
  }

  if (!authed) {
    return <PasscodeGate expected={PASSCODE} onPass={handlePass} />;
  }

  if (!identity) {
    return <IdentityPicker onPick={handlePickIdentity} />;
  }

  function renderActive() {
    if (tab === "Menu") {
      if (editingDay) {
        return (
          <DayScreen day={editingDay} identity={identity!} onBack={() => setEditingDay(null)} />
        );
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
    if (tab === "Explore") return <ExploreScreen identity={identity!} />;
    return <ChangesScreen />;
  }

  function handleTab(next: TabKey) {
    setEditingDay(null);
    setTab(next);
  }

  return (
    <div className="screen">
      {renderActive()}
      <TabBar active={tab} onTab={handleTab} />
    </div>
  );
}
