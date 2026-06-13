// Explore dish sheet. Opened by tapping a card in the Explore feed. Shows the
// same dish detail surface as the Menu-tab DishDetailSheet (photo, description,
// stats, ingredients, cooking notes, recipe) but in the EXPLORE context: the
// recipe is visible by default, a plain "why it fits" line sits under the name,
// and the actions are "Use this week" / "Next week" instead of Replace / Remove.
// It also carries the records-only dislike affordance: a tap calls `dislikeDish`
// and does nothing else in-session (no re-rank, no hide; Principle 5,
// Decision #12, features/design-revamp.md §1.5/§1.6).
//
// This is a separate component from DishDetailSheet on purpose: that sheet is
// owned by the Menu/Day editing family (5.2) and the two slices editing app/web
// alongside this one must not collide on it. Both render the same primitives, so
// the visual surface stays consistent without sharing a mutable component.

import { useState } from "react";
import type { ExploreAffinityKey } from "@plantry/engine";
import {
  dishById,
  dishIngredients,
  dishPhotoUrl,
  complexityLabel,
  mealLabelForDish,
} from "../lib/library.js";
import { Sheet, StatChip, PrimaryButton, QuietButton, SectionLabel } from "./primitives.js";
import { affinityLine } from "../lib/explore.js";

interface ExploreDishSheetProps {
  dishId: number;
  dominantAffinity: ExploreAffinityKey;
  onUseThisWeek: () => void;
  onNextWeek: () => void;
  onDislike: () => void;
  onClose: () => void;
}

export function ExploreDishSheet({
  dishId,
  dominantAffinity,
  onUseThisWeek,
  onNextWeek,
  onDislike,
  onClose,
}: ExploreDishSheetProps) {
  const dish = dishById(dishId);
  // The recipe opens by default in the Explore context (the handoff's
  // `context === 'explore'` default-open behaviour): exploring is about reading
  // the dish, so the cooking notes and steps start expanded.
  const [showInfo, setShowInfo] = useState<boolean>(true);

  if (!dish) {
    return (
      <Sheet onClose={onClose}>
        <div className="reason__title">Dish details</div>
        <div className="reason__hint">This dish is no longer in the library.</div>
      </Sheet>
    );
  }

  const photo = dishPhotoUrl(dish);
  const label = complexityLabel(dish.complexity);
  const ings = dishIngredients(dish.id);
  const hasCookFields = Boolean(
    dish.skill || dish.equipment || dish.buySpecially || dish.prePrep || dish.prepMinutes,
  );

  return (
    <Sheet onClose={onClose} tall>
      {photo ? (
        <img className="detail__photo" src={photo} alt="" />
      ) : (
        <div className="detail__photo detail__photo--placeholder" aria-hidden="true" />
      )}
      <div className="detail__head">
        <div className="detail__name">{dish.name}</div>
        {dish.description && <div className="detail__desc">{dish.description}</div>}
        <div className="detail__meta">{mealLabelForDish(dish)} · Not cooked yet</div>
        <div className="explore-sheet__why">{affinityLine(dominantAffinity)}</div>
      </div>

      <div className="detail__stats">
        <StatChip label="Prep" value={`${dish.prepMinutes} min`} />
        <StatChip label="Satiety" value={dish.satiety} />
        <StatChip label="Meal" value={mealLabelForDish(dish)} />
      </div>

      {ings.length > 0 && (
        <div className="detail__section">
          <SectionLabel>Ingredients</SectionLabel>
          <div className="detail__ingredients">
            {ings.map((ing, i) => (
              <span key={`${ing.ingredient}-${i}`} className="detail__ingredient">
                {ing.ingredient}
                <span className="detail__ingredient-qty">
                  {" "}
                  {ing.quantity}
                  {ing.unit}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {(label || hasCookFields || dish.recipe) && (
        <div className="detail__cook">
          <button
            type="button"
            className="detail__cook-toggle"
            onClick={() => setShowInfo((v) => !v)}
          >
            <span className="detail__cook-label">{label ?? "Cooking notes"}</span>
            <span className="detail__cook-hint">{showInfo ? "Hide details" : "Show details"}</span>
          </button>
          {showInfo && (
            <div className="detail__cook-body">
              {dish.skill && (
                <div>
                  <span className="detail__field-key">Skill:</span> {dish.skill}
                </div>
              )}
              {dish.equipment && (
                <div>
                  <span className="detail__field-key">Equipment:</span> {dish.equipment}
                </div>
              )}
              {dish.buySpecially && (
                <div>
                  <span className="detail__field-key">Buy specially:</span> {dish.buySpecially}
                </div>
              )}
              {dish.prePrep && (
                <div>
                  <span className="detail__field-key">Pre prep:</span>{" "}
                  <span className="detail__prep">{dish.prePrep}</span>
                </div>
              )}
              <div>
                <span className="detail__field-key">Time:</span> About {dish.prepMinutes} minutes
              </div>
              {dish.recipe && dish.recipe.length > 0 && (
                <div className="detail__recipe">
                  <SectionLabel>Recipe</SectionLabel>
                  {dish.recipe.map((step, i) => (
                    <div key={i} className="detail__recipe-step">
                      <span className="detail__recipe-num">{i + 1}</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="detail__actions">
        <PrimaryButton className="explore-sheet__action-use" onClick={onUseThisWeek}>
          Use this week
        </PrimaryButton>
        <QuietButton className="explore-sheet__action-next" onClick={onNextWeek}>
          Next week
        </QuietButton>
      </div>
      <button type="button" className="explore-sheet__dislike" onClick={onDislike}>
        Not for me
      </button>
    </Sheet>
  );
}
