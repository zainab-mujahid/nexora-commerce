// Suggests a URL slug from a product/category name for the admin forms'
// SlugField. UX only: the server never runs this on submitted values — the
// slug the admin submits is validated as-is by slugField in schemas.ts (and
// the DB unique constraint), exactly as when slugs were typed by hand.
//
// Every non-empty result matches SLUG_REGEX there (lowercase letters,
// numbers, single hyphens between words, max 200 chars). A name with no
// usable characters (e.g. emoji only) yields "", left for that same
// validation to reject.
const MAX_SLUG_LENGTH = 200;

export function slugify(name: string): string {
  return (
    name
      // NFKD splits accented letters into base letter + combining mark
      // (é -> e + ◌́), and folds compatibility forms (ﬁ -> fi, ① -> 1).
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      // Dropped, not turned into a separator: "Men's" -> "mens".
      .replace(/['‘’ʼ`]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG_LENGTH)
      // The cut can land right after a separator.
      .replace(/-+$/, "")
  );
}
