# Plantry, Project Context

## What it is
A weekly meal planner for an Indian household (Rajat and Tuhina) in Bangalore. Each week it generates a Monday to Saturday menu (breakfast and lunch) from a fixed dish library, following a set of composition and selection rules, then produces a menu image and a grocery list.

## The household
Two adults. High-protein lean. Seasonal cooking based on Bangalore seasons (Summer: Mar to May, Monsoon: Jun to Sep, Winter: Oct to Feb).

## Weekly structure
| Day | Breakfast | Lunch | Total items |
|-----|-----------|-------|-------------|
| Mon, Wed, Fri | 2 items | 3 items | 5 |
| Tue, Thu | 1 item | 4 items | 5 |
| Sat | none | 3 items | 3 |
| Sun | none | none | 0 |

Lunch follows menu templates: weekday lunches build around a protein plus a side plus a carb; Saturday is a fixed complete-meal style spread with an accompaniment and a dessert.

## The dish library
About 130 dishes, each tagged with category (gravy, dry, complete meal, rice, chapati, paratha, accompaniment, dessert, keto, fruit), protein level, satiety, prep time, and season. Selection favours dishes not cooked recently and consolidates shared ingredients.

## Deliverables each week
1. **Menu image (PNG):** one card per day. Day and date badge on the left, meals on the right. No tags, no day-type labels, no ingredient-reuse callouts. Grocery list sits below the day cards.
2. **Grocery list:** grouped as Proteins and Dairy, Pantry, Vegetables, Aromatics and Herbs, Other. Quantities aggregated across dishes; common staples omitted.
3. **History update:** the finalised week is appended to the record.

## What the design needs to convey
A clean weekly menu card: six day cards (Mon to Sat), each showing breakfast and lunch dishes, with a date badge. A grocery list section underneath. Calm, readable, kitchen-friendly. No clutter, no menu jargon.
