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
| Bhindi | Vegetables | g | | | | |
| Bitter Gourd | Vegetables | g | | | | |
| Black Urad Dal | Pantry | g | | | | |
| Bottle Gourd | Vegetables | g | | | | |
| Bread | Pantry | pcs | | | | |
| Broccoli | Vegetables | g | | | | |
| Cabbage | Vegetables | g | | | | |
| Capsicum | Vegetables | g | | | | |
| Carrot | Vegetables | g | | | | |
| Cashew | Pantry | g | | | | |
| Cauliflower | Vegetables | g | | | | |
| Chana Dal | Pantry | g | | | | |
| Cheese | Proteins and Dairy | g | | | | |
| Chicken | Proteins and Dairy | g | | | | |
| Chicken Breast | Proteins and Dairy | g | 250 g | | | |
| Chicken Keema | Proteins and Dairy | g | 500 g | | | |
| Chickpea | Pantry | g | | | | |
| Coconut Milk | Pantry | ml | | | | |
| Coriander Leaf | Aromatics and Herbs | g | | | | |
| Cucumber | Vegetables | g | | | | |
| Curd | Proteins and Dairy | g | 500 g | | | |
| Curry Leaf | Aromatics and Herbs | g | | | | |
| Egg | Proteins and Dairy | pcs | | | | |
| Fenugreek Leaf | Vegetables | g | | | | |
| Fish | Proteins and Dairy | g | 500 g | | | |
| Flattened Rice | Pantry | g | | | | |
| French Bean | Vegetables | g | | | | |
| Fruit | Other | pcs | | | | |
| Garlic | Aromatics and Herbs | g | | | | |
| Ginger | Aromatics and Herbs | g | | | | |
| Green Chilli | Aromatics and Herbs | pcs | | | | |
| Green Pea | Pantry | g | | | | |
| Kidney Bean | Pantry | g | | | | |
| Lemon | Aromatics and Herbs | pcs | | | | |
| Lettuce | Vegetables | g | 100 g | | | |
| Masoor Dal | Pantry | g | | | | |
| Milk | Proteins and Dairy | ml | | | | |
| Mint Leaf | Aromatics and Herbs | g | | | | |
| Moong Dal | Pantry | g | | | | |
| Mushroom | Vegetables | g | 200 g | | | |
| Oats | Pantry | g | | | | |
| Onion | Aromatics and Herbs | g | | | | |
| Paneer | Proteins and Dairy | g | 200 g | | | |
| Pav Bread | Pantry | pcs | | | | |
| Peanut | Pantry | g | | | | |
| Potato | Vegetables | g | | | | |
| Prawn | Proteins and Dairy | g | 500 g | | | |
| Raisin | Pantry | g | | | | |
| Rice Vermicelli | Pantry | g | | | | |
| Ridge Gourd | Vegetables | g | | | | |
| Sabudana | Pantry | g | | | | |
| Semolina | Pantry | g | | | | |
| Soyabean Chunk | Pantry | g | | | | |
| Spinach | Vegetables | g | | | | |
| Sprout | Pantry | g | | | | |
| Sweet Corn | Pantry | g | | | | |
| Tinda | Vegetables | g | | | | |
| Tomato | Aromatics and Herbs | g | | | | |
| Toor Dal | Pantry | g | | | | |
