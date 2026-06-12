// Frontend view over the baked dish library. The library reaches the PWA via
// the build-time bake (docs/engineering.md §2: the library is static, not in
// Convex), imported here from @plantry/engine/library. This module is the one
// place that turns library structure into display: dish lookup by id, photo URL
// resolution from the bundle, the plain-language complexity label, and the
// dish-row meta line. Keeping that mapping here honours Principle 7 (display
// decoupled from structure): internal enum values never reach a screen.

import { dishes } from "@plantry/engine/library";
import type { Dish } from "@plantry/engine";

const DISH_BY_ID = new Map<number, Dish>(dishes.map((d) => [d.id, d]));

export function dishById(dishId: number): Dish | undefined {
  return DISH_BY_ID.get(dishId);
}

// Photo resolution. Photos live at data/dish-photos/<slug>.jpg and are copied
// into the PWA bundle at build time (design-revamp §1.4, §1.6). Vite's
// import.meta.glob with eager + url bundles every matching file and gives us a
// slug -> URL map at build time. While photo coverage is incomplete (slice 2.2
// / B-track), most lookups miss and the Thumb primitive shows its no-photo
// fallback. The glob path is relative to this file: app/web/src/lib ->
// ../../../../data/dish-photos.
const PHOTO_URLS = import.meta.glob<string>("../../../../data/dish-photos/*.{jpg,jpeg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

// Map bare slug ("chicken-masala-gravy") to its bundled URL. The dish frontmatter
// stores the filename (e.g. "chicken-masala-gravy.jpg"); we key on the slug so a
// dish declaring any supported extension resolves.
const PHOTO_BY_SLUG = new Map<string, string>();
for (const [path, url] of Object.entries(PHOTO_URLS)) {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const slug = file.slice(0, file.lastIndexOf("."));
  PHOTO_BY_SLUG.set(slug, url);
}

/**
 * Resolve a dish's bundled photo URL, or null when it has no photo (or the
 * declared file is not in the bundle yet). Null drives the Thumb fallback.
 */
export function dishPhotoUrl(dish: Dish | undefined): string | null {
  if (!dish?.photo) return null;
  const slug = dish.photo.slice(0, dish.photo.lastIndexOf(".")) || dish.photo;
  return PHOTO_BY_SLUG.get(slug) ?? null;
}

const COMPLEXITY_LABEL: Record<NonNullable<Dish["complexity"]>, string> = {
  Easy: "Easy to cook",
  Medium: "Cook will need some help",
  Hard: "Takes time and effort",
};

export function complexityLabel(complexity: Dish["complexity"]): string | null {
  return complexity ? COMPLEXITY_LABEL[complexity] : null;
}

export type ComplexityVariant = "easy" | "medium" | "hard";

export function complexityVariant(complexity: Dish["complexity"]): ComplexityVariant {
  if (complexity === "Medium") return "medium";
  if (complexity === "Hard") return "hard";
  return "easy";
}

/**
 * The dish-row meta line. The handoff prototype showed "Ng protein · N min";
 * the live Dish type carries no per-serving protein yet (nutrition derivation is
 * a later slice), so we build from what exists: prep time and the plain-language
 * complexity. Degrades to whichever fields are present.
 */
export function dishMetaLine(dish: Dish | undefined): string {
  if (!dish) return "One off this week";
  const parts: string[] = [];
  if (typeof dish.prepMinutes === "number" && dish.prepMinutes > 0) {
    parts.push(`${dish.prepMinutes} min`);
  }
  const label = complexityLabel(dish.complexity);
  if (label) parts.push(label);
  return parts.length > 0 ? parts.join(" · ") : "From the library";
}

export function dishHasPrePrep(dish: Dish | undefined): boolean {
  return Boolean(dish?.prePrep);
}
