// One dish inside a day or meal card. Ported from the DishRow primitive in
// design_handoff/hifi-primitives.jsx. Resolves the dish (and its photo, meta,
// pre-prep marker) through lib/library so display stays decoupled from the
// library structure (Principle 7).

import type { ReactNode } from "react";
import type { DishPick } from "../lib/types.js";
import { dishById, dishMetaLine, dishPhotoUrl, dishHasPrePrep } from "../lib/library.js";
import { Thumb } from "./primitives.js";

interface DishRowProps {
  pick: DishPick;
  compact?: boolean;
  onClick?: () => void;
  trailing?: ReactNode;
}

function pickName(pick: DishPick): string {
  if (pick.customLabel) return pick.customLabel;
  if (pick.dishId !== null) {
    return dishById(pick.dishId)?.name ?? "From the library";
  }
  return "One off this week";
}

export function DishRow({ pick, compact, onClick, trailing }: DishRowProps) {
  const dish = pick.dishId !== null ? dishById(pick.dishId) : undefined;
  const name = pickName(pick);
  const meta = pick.customLabel ? "One off this week" : dishMetaLine(dish);
  const photo = dishPhotoUrl(dish);
  const showPrep = dishHasPrePrep(dish);

  const className = [
    "dish-row",
    compact ? "dish-row--compact" : "",
    onClick ? "dish-row--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <Thumb src={photo} size={compact ? 40 : 48} alt="" />
      <div className="dish-row__body">
        <div className="dish-row__name">{name}</div>
        <div className="dish-row__meta">
          {meta}
          {showPrep && <span className="dish-row__prep"> · Pre prep</span>}
        </div>
      </div>
      {trailing}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}
