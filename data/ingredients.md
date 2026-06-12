# Ingredient Catalog

One row per canonical ingredient. `Group` is the user-facing grocery-list
bucket (fixed order: Proteins and Dairy, Pantry, Vegetables, Aromatics and
Herbs, Other). `Unit` is the canonical measure (g/ml/pcs). `Pack Size`
present marks a tracked ingredient (used by §6 Ingredient Consolidation and
rounded up to whole packs on the buy list); blank marks an untracked staple
bought by weight.

`Grams per piece` applies only to `pcs`-unit ingredients (an egg is about
50 g) so macro derivation can convert pieces to grams; blank on every other
row. `Protein /100g` and `Carbs /100g` power derived dish macros (engine.md
Nutrition section); a blank cell reads as zero. These three columns are
schema-present from slice 2.1 and populated in slice 2.2; until then every
macro cell is blank, which the coverage report expects.

Grouping judgment calls (institutional memory; do not silently re-bucket):

- Onion and Tomato: Aromatics and Herbs. Both are the base of nearly every
  curry; grouping them with herbs matches how the buy list is shopped at the
  aromatics counter.
- Lemon: Aromatics and Herbs. Used as a flavoring agent, never as the body of
  a dish.
- Capsicum: Vegetables, not Aromatics. Bought as a veg by weight; the engine's
  soft-consolidation list (engine/src/consolidation.ts FRESH_PRODUCE_ITEMS) is
  a separate concept and lives in code, not here.
- Cucumber: Vegetables. Eaten as a vegetable in salads.
- Coconut Milk: Pantry. A shelf-stable tin/carton, bought rarely, not dairy.
- Sprout: Pantry. Dry pulse pre-sprouted, slots with the other dry pulses.
- Fruit: Other. A placeholder ingredient name for the "Seasonal fruit" dish
  (id 123); it is not a specific item to put on a buy list, so Other keeps it
  visible without forcing a wrong category.
| Ingredient | Group | Unit | Pack Size | Grams per piece | Protein /100g | Carbs /100g |
|------------|-------|------|-----------|-----------------|---------------|-------------|
| Banana | Other | pcs | | 120 | 1.1 | 23 |
| Bhindi | Vegetables | g | | | 1.9 | 7 |
| Bitter Gourd | Vegetables | g | | | 1 | 4 |
| Black Urad Dal | Pantry | g | | | 25 | 59 |
| Bottle Gourd | Vegetables | g | | | 0.6 | 4 |
| Bread | Pantry | pcs | | 30 | 9 | 49 |
| Broccoli | Vegetables | g | | | 2.8 | 7 |
| Cabbage | Vegetables | g | | | 1.3 | 6 |
| Capsicum | Vegetables | g | | | 1 | 6 |
| Carrot | Vegetables | g | | | 0.9 | 10 |
| Cashew | Pantry | g | | | 18 | 30 |
| Cauliflower | Vegetables | g | | | 1.9 | 5 |
| Chana Dal | Pantry | g | | | 20 | 60 |
| Cheese | Proteins and Dairy | g | | | 25 | 1.3 |
| Chicken | Proteins and Dairy | g | | | 27 | 0 |
| Chicken Breast | Proteins and Dairy | g | 250 g | | 31 | 0 |
| Chicken Keema | Proteins and Dairy | g | 500 g | | 17 | 0 |
| Chickpea | Pantry | g | | | 19 | 61 |
| Coconut Milk | Pantry | ml | | | 2.3 | 6 |
| Coriander Leaf | Aromatics and Herbs | g | | | | |
| Cucumber | Vegetables | g | | | 0.7 | 4 |
| Curd | Proteins and Dairy | g | 500 g | | 3.5 | 5 |
| Curry Leaf | Aromatics and Herbs | g | | | | |
| Egg | Proteins and Dairy | pcs | | 50 | 13 | 1.1 |
| Fenugreek Leaf | Vegetables | g | | | 4.4 | 6 |
| Fish | Proteins and Dairy | g | 500 g | | 20 | 0 |
| Flattened Rice | Pantry | g | | | 7 | 77 |
| French Bean | Vegetables | g | | | 1.8 | 7 |
| Fruit | Other | pcs | | | | |
| Garlic | Aromatics and Herbs | g | | | | |
| Ginger | Aromatics and Herbs | g | | | | |
| Green Chilli | Aromatics and Herbs | pcs | | 5 | | |
| Green Pea | Pantry | g | | | 5 | 14 |
| Kidney Bean | Pantry | g | | | 24 | 60 |
| Lemon | Aromatics and Herbs | pcs | | 60 | | |
| Lettuce | Vegetables | g | 100 g | | 1.4 | 3 |
| Mango | Other | g | | | 0.8 | 15 |
| Masoor Dal | Pantry | g | | | 25 | 60 |
| Milk | Proteins and Dairy | ml | | | 3.4 | 5 |
| Mint Leaf | Aromatics and Herbs | g | | | | |
| Moong Dal | Pantry | g | | | 24 | 59 |
| Mushroom | Vegetables | g | 200 g | | 3.1 | 3.3 |
| Oats | Pantry | g | | | 13 | 67 |
| Onion | Aromatics and Herbs | g | | | | |
| Papaya | Other | g | | | 0.5 | 11 |
| Paneer | Proteins and Dairy | g | 200 g | | 18 | 4 |
| Pav Bread | Pantry | pcs | | 40 | 8 | 52 |
| Peanut | Pantry | g | | | 26 | 16 |
| Potato | Vegetables | g | | | 2 | 17 |
| Prawn | Proteins and Dairy | g | 500 g | | 20 | 0 |
| Raisin | Pantry | g | | | 3.1 | 79 |
| Rice Vermicelli | Pantry | g | | | 6 | 83 |
| Ridge Gourd | Vegetables | g | | | 0.5 | 4 |
| Sabudana | Pantry | g | | | 0.2 | 88 |
| Semolina | Pantry | g | | | 13 | 73 |
| Soyabean Chunk | Pantry | g | | | 52 | 33 |
| Spinach | Vegetables | g | | | 2.9 | 4 |
| Sprout | Pantry | g | | | 9 | 22 |
| Sweet Corn | Pantry | g | | | 3.4 | 19 |
| Tinda | Vegetables | g | | | 1 | 5 |
| Tomato | Aromatics and Herbs | g | | | | |
| Toor Dal | Pantry | g | | | 22 | 63 |
