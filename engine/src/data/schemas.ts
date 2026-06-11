import { z } from "zod";

export const DishCategorySchema = z.enum([
  "Gravy dish",
  "Dry dish",
  "Complete meal",
  "Rice",
  "Chilla",
  "Paratha",
  "Chapati",
  "Bread",
  "Keto",
  "Accompaniment",
  "Dessert",
  "Fruit",
]);
export type DishCategory = z.infer<typeof DishCategorySchema>;

export const MealTimeSchema = z.enum(["Breakfast", "Lunch"]);
export type MealTime = z.infer<typeof MealTimeSchema>;

export const SatietySchema = z.enum(["Low", "Medium", "High"]);
export type Satiety = z.infer<typeof SatietySchema>;

export const SeasonSchema = z.enum(["Summer", "Monsoon", "Winter"]);
export type Season = z.infer<typeof SeasonSchema>;

export const YesNoSchema = z.enum(["Yes", "No"]);
export type YesNo = z.infer<typeof YesNoSchema>;

export const SeasonsFieldSchema = z.union([z.literal("All"), z.array(SeasonSchema).min(1)]);
export type SeasonsField = z.infer<typeof SeasonsFieldSchema>;

/**
 * Cooking complexity, an enum the UI maps to plain-language labels ("Easy to
 * cook", "Cook will need some help", "Takes time and effort"). The data stores
 * only the enum (Principle 7: display decoupled from structure); the labels
 * live in the PWA, never here.
 */
export const ComplexitySchema = z.enum(["Easy", "Medium", "Hard"]);
export type Complexity = z.infer<typeof ComplexitySchema>;

export const DishSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  category: DishCategorySchema,
  time: MealTimeSchema,
  tags: z.array(z.string().min(1)),
  primaryIngredient: z.string().min(1),
  preferred: YesNoSchema,
  active: YesNoSchema,
  satiety: SatietySchema,
  prepMinutes: z.number().int().nonnegative(),
  seasons: SeasonsFieldSchema,
  // Enrichment fields (design-revamp §1.1, slice 2.1). All optional during the
  // transition: every current dish file omits them and parses unchanged; the UI
  // degrades gracefully when they are absent (§1.5 coverage ratchet). Population
  // is slice 2.2.
  /** Cooking complexity enum; the UI renders the plain-language label. */
  complexity: ComplexitySchema.optional(),
  /** Free-text skill note (e.g. "Comfortable, browning matters"). */
  skill: z.string().min(1).optional(),
  /** Free-text special equipment note (e.g. "Heavy kadhai"). */
  equipment: z.string().min(1).optional(),
  /** Free-text note for an ingredient that must be bought specially. */
  buySpecially: z.string().min(1).optional(),
  /** Free-text day-before prep; present only when day-before work exists. */
  prePrep: z.string().min(1).optional(),
  /** Photo filename under data/dish-photos/; CI validates existence in 2.x. */
  photo: z.string().min(1).optional(),
  // Body-prose conventions (parsed from the markdown body, not frontmatter).
  /** One-line description: the first body paragraph before `## Ingredients`. */
  description: z.string().min(1).optional(),
  /** Numbered steps from a `## Recipe` section, one string per step. */
  recipe: z.array(z.string().min(1)).min(1).optional(),
});
export type Dish = z.infer<typeof DishSchema>;

export const IngredientUnitSchema = z.enum(["g", "ml", "pcs"]);
export type IngredientUnit = z.infer<typeof IngredientUnitSchema>;

export const IngredientSchema = z.object({
  dishId: z.number().int().positive(),
  dishName: z.string().min(1),
  ingredient: z.string().min(1),
  quantity: z.number().nonnegative(),
  unit: IngredientUnitSchema,
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const PackSizeHeaderSchema = z.object({
  ingredient: z.string().min(1),
  packSize: z.string().min(1),
});
export type PackSizeHeader = z.infer<typeof PackSizeHeaderSchema>;

/**
 * Grocery groups, in the fixed §3 buy-list order. Single-homed here and in the
 * ingredient catalog's Group column; the runtime aggregator
 * (engine/src/groceryList.ts) reads the catalog rather than a code map.
 */
export const GroceryGroupSchema = z.enum([
  "Proteins and Dairy",
  "Pantry",
  "Vegetables",
  "Aromatics and Herbs",
  "Other",
]);
export type GroceryGroup = z.infer<typeof GroceryGroupSchema>;

/**
 * One row of the ingredient catalog (data/ingredients.md). One row per
 * canonical ingredient. `packSize` present marks a tracked ingredient (the
 * pack-rounded buy unit used by §6 consolidation); absent marks an untracked
 * staple bought by weight. `group` is the user-facing grocery-list bucket.
 */
export const CatalogIngredientSchema = z.object({
  ingredient: z.string().min(1),
  group: GroceryGroupSchema,
  unit: IngredientUnitSchema,
  packSize: z.string().min(1).optional(),
  // Macro columns (design-revamp §1.1, slice 2.1). Schema only this slice;
  // every cell ships blank and population is slice 2.2. A blank cell reads as
  // absent here and as zero in nutrition derivation (engine/src/nutrition.ts).
  /**
   * Grams per piece, for `pcs`-unit ingredients only (an egg is about 50 g), so
   * macro math can convert pieces to grams. Blank/absent for non-pcs rows.
   */
  gramsPerPiece: z.number().positive().optional(),
  /** Protein grams per 100 g of the ingredient. Blank reads as zero. */
  proteinPer100g: z.number().nonnegative().optional(),
  /** Carbohydrate grams per 100 g of the ingredient. Blank reads as zero. */
  carbsPer100g: z.number().nonnegative().optional(),
});
export type CatalogIngredient = z.infer<typeof CatalogIngredientSchema>;

/** Frontmatter-only view of a dish (per-dish file, no ingredient rows). */
export const DishFrontmatterSchema = DishSchema;
export type DishFrontmatter = z.infer<typeof DishFrontmatterSchema>;

/** A single ingredient row inside a per-dish file (dish identity implied). */
export const DishIngredientRowSchema = z.object({
  ingredient: z.string().min(1),
  quantity: z.number().nonnegative(),
  unit: IngredientUnitSchema,
});
export type DishIngredientRow = z.infer<typeof DishIngredientRowSchema>;

/**
 * A parsed per-dish file: the frontmatter dish plus its ingredient rows and the
 * slug derived from (and matching) the filename.
 */
export const DishFileSchema = z.object({
  slug: z.string().min(1),
  dish: DishSchema,
  ingredients: z.array(DishIngredientRowSchema),
});
export type DishFile = z.infer<typeof DishFileSchema>;

export const DayNameSchema = z.enum([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);
export type DayName = z.infer<typeof DayNameSchema>;

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MenuHistoryRowSchema = z.object({
  weekStart: IsoDateSchema,
  day: DayNameSchema,
  meal: MealTimeSchema,
  dishName: z.string().min(1),
  dishId: z.number().int().positive(),
});
export type MenuHistoryRow = z.infer<typeof MenuHistoryRowSchema>;
