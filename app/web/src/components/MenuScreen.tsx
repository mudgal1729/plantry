// Menu screen: the shared current week. Ported from the MenuScreen layout in
// design_handoff/hifi-screens.jsx. Reads the live week from Convex
// (getCurrentWeek) with the slice-1 offline cache, renders one DayCard per day,
// a week header with the identity avatar, a change-summary placeholder (the real
// summary wires in slice 6.1), and a Share button (share family is slice 8.1, so
// it is inert here). Editing routes through onEditDay into the legacy editor.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { CurrentWeek, Identity, ShortDay } from "../lib/types.js";
import { dayOrderIndex, weekRangeLabel } from "../lib/days.js";
import { getCachedWeek, setCachedWeek } from "../lib/storage.js";
import { Avatar, PrimaryButton } from "./primitives.js";
import { DayCard, type DayCardModel } from "./DayCard.js";
import { deriveSummaryLine } from "./ChangesScreen.js";
import { SharePreviewSheet } from "./SharePreviewSheet.js";
import type { ShareGroceryGroup } from "./ShareImages.js";

interface MenuScreenProps {
  identity: Identity;
  onSwitchIdentity: () => void;
  // The chosen day routes into editing. The legacy editor (this slice) renders
  // the whole week and ignores the argument; slice 5.2's Day screen uses it.
  onEditDay: (day: ShortDay) => void;
}

function buildDayModels(week: CurrentWeek): DayCardModel[] {
  const skipReasonByDay = new Map<ShortDay, string>();
  for (const skip of week.skippedDays ?? []) {
    skipReasonByDay.set(skip.day, skip.reason);
  }
  const slotsByDay = new Map<ShortDay, CurrentWeek["slots"]>();
  for (const slot of week.slots) {
    const list = slotsByDay.get(slot.day) ?? [];
    list.push(slot);
    slotsByDay.set(slot.day, list);
  }
  const days = new Set<ShortDay>([...slotsByDay.keys(), ...skipReasonByDay.keys()]);
  return [...days]
    .sort((a, b) => dayOrderIndex(a) - dayOrderIndex(b))
    .map((day) => ({
      day,
      slots: slotsByDay.get(day) ?? [],
      skipReason: skipReasonByDay.get(day) ?? null,
    }));
}

function MenuBody({
  week,
  identity,
  offline,
  onSwitchIdentity,
  onEditDay,
}: {
  week: CurrentWeek;
  identity: Identity;
  offline: boolean;
  onSwitchIdentity: () => void;
  onEditDay: (day: ShortDay) => void;
}) {
  const models = useMemo(() => buildDayModels(week), [week]);
  // The change-summary line reads the same manualChanges feed the Changes tab
  // does. Offline (no Convex), this stays undefined and the summary degrades to
  // the no-changes line, which is the honest fallback for a cached menu.
  const changes = useQuery(anyApi.queries.activity.listManualChangesForWeek, {
    weekStart: week.weekStart,
  }) as Parameters<typeof deriveSummaryLine>[0] | undefined;
  const summaryLine = deriveSummaryLine(changes ?? []);

  const [shareOpen, setShareOpen] = useState(false);

  // The grocery list backing the share family's grocery image. Same skip-aware
  // query the Grocery tab uses, so the shared image matches the Grocery screen.
  // Only requested when online (offline shows the cached week without a live
  // grocery query) and only when the share sheet is open, to avoid a query on
  // every Menu visit. Falls back to an empty list until it resolves.
  const grocery = useQuery(
    anyApi.groceryList.getGroceryList,
    !offline && shareOpen ? { weekStart: week.weekStart } : "skip",
  ) as { groups: ShareGroceryGroup[] } | undefined;
  return (
    <>
      <div className="screen__scroll">
        <div className="screen__header">
          <div className="menu__head-row">
            <h1 className="menu__title">This week</h1>
            <div className="menu__head-right">
              <span className="menu__range">{weekRangeLabel(week.weekStart)}</span>
              <button
                type="button"
                className="menu__switch"
                aria-label="Switch person"
                onClick={onSwitchIdentity}
              >
                <Avatar who={identity} />
              </button>
            </div>
          </div>
          {/* Short, plain summary of the week's menu changes, derived from the
              same manualChanges feed the Changes tab renders (slice 6.1). */}
          <div className="change-summary">{summaryLine}</div>
        </div>
        {offline && (
          <div className="offline-banner">Showing the last menu saved on this phone.</div>
        )}
        <div className="screen__list">
          {models.map((model) => (
            <DayCard
              key={model.day}
              model={model}
              weekStart={week.weekStart}
              onEdit={offline ? undefined : () => onEditDay(model.day)}
            />
          ))}
        </div>
      </div>
      <div className="screen__footer">
        {/* Share opens the swipe-rail preview, which renders the image family
            (menu, grocery, one recipe sheet per included dish) and sends them
            via the OS share sheet. Offline shows the cached week, so the live
            grocery query the share image needs is not available; keep Share off
            until the real week is back. */}
        <PrimaryButton disabled={offline} onClick={() => setShareOpen(true)}>
          Share this week
        </PrimaryButton>
      </div>
      {shareOpen && (
        <SharePreviewSheet
          week={week}
          grocery={grocery?.groups ?? []}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}

export function MenuScreen({ identity, onSwitchIdentity, onEditDay }: MenuScreenProps) {
  const result = useQuery(anyApi.queries.week.getCurrentWeek, {}) as CurrentWeek | null | undefined;

  const cached = useMemo(() => getCachedWeek(), []);

  useEffect(() => {
    if (result) {
      setCachedWeek({ cachedAt: Date.now(), week: result });
    }
  }, [result]);

  if (result === undefined) {
    if (cached) {
      return (
        <MenuBody
          week={cached.week}
          identity={identity}
          offline
          onSwitchIdentity={onSwitchIdentity}
          onEditDay={onEditDay}
        />
      );
    }
    return (
      <div className="screen__scroll">
        <div className="screen__header">
          <h1 className="screen__title">This week</h1>
        </div>
        <div className="empty-state">Loading menu...</div>
      </div>
    );
  }

  if (result === null) {
    return (
      <div className="screen__scroll">
        <div className="screen__header">
          <h1 className="screen__title">This week</h1>
        </div>
        <div className="empty-state">
          <div className="empty-state__title">No menu yet</div>
          The first weekly menu will appear here.
        </div>
      </div>
    );
  }

  return (
    <MenuBody
      week={result}
      identity={identity}
      offline={false}
      onSwitchIdentity={onSwitchIdentity}
      onEditDay={onEditDay}
    />
  );
}
