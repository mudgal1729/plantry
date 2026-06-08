import { ConvexError } from "convex/values";

/**
 * The set of valid `author` values for browser-callable, author-stamped mutations.
 * See `docs/engineering.md` §6: "All write mutations require an `author` argument;
 * the mutation rejects writes without it." Identity is selected client-side via the
 * device profile (`setUserProfile`) and attached to every subsequent write.
 */
export type Author = "rajat" | "tuhina";

/**
 * Throws a `ConvexError` if `author` is not exactly `"rajat"` or `"tuhina"`.
 * Narrows the parameter type to `Author` on the success path so callers can use it
 * directly. Used by every author-stamped mutation (`addComment`, `addCustomOneOff`,
 * and any future fast-loop write).
 */
export function assertAuthor(author: string): asserts author is Author {
  if (author !== "rajat" && author !== "tuhina") {
    throw new ConvexError(`author must be "rajat" or "tuhina"; received ${JSON.stringify(author)}`);
  }
}
