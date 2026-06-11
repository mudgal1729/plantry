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
