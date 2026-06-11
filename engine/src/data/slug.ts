/**
 * Slug derivation for per-dish files (data/dishes/<slug>.md).
 *
 * A slug is a stable, filename-safe identifier derived from the dish name:
 * lowercase, spaces collapsed to single hyphens, punctuation stripped. Slugs
 * are permanent once a file exists; the validators enforce that a file's name
 * matches its frontmatter and that slugs are unique. When two dishes share a
 * name (today: "Paneer bhurji", ids 13 and 106) the base slug goes to the
 * lowest id and every later collision is disambiguated with an `-<id>` suffix,
 * which is deterministic and does not bake mutable facts (like meal time) into
 * the filename. `slugForDishes` resolves a whole library at once so collisions
 * are handled consistently.
 */

export function baseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['`"().,/]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface Sluggable {
  id: number;
  name: string;
}

/**
 * Resolve slugs for a whole set of dishes. Returns a map from dish id to its
 * final, collision-free slug. The lowest id keeps the base slug; later ids that
 * would collide get an `-<id>` suffix.
 */
export function slugForDishes(dishes: Sluggable[]): Map<number, string> {
  const byBase = new Map<string, Sluggable[]>();
  for (const d of dishes) {
    const base = baseSlug(d.name);
    const list = byBase.get(base);
    if (list) list.push(d);
    else byBase.set(base, [d]);
  }
  const out = new Map<number, string>();
  for (const [base, group] of byBase) {
    const sorted = [...group].sort((a, b) => a.id - b.id);
    sorted.forEach((d, i) => {
      out.set(d.id, i === 0 ? base : `${base}-${d.id}`);
    });
  }
  return out;
}
