/** Turns a display name into a URL-safe slug, e.g. "Kumaran Silks Pvt Ltd" -> "kumaran-silks-pvt-ltd". */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Suggests a short, human-readable store code from a store name, e.g.
 * "Kumaran Silks Main Store" -> "ksm-01". Falls back to the first three
 * letters of a single-word name. Lowercase because the `stores` table
 * requires it (stores_code_lowercase_check). Always editable afterwards.
 */
export function suggestStoreCode(storeName: string): string {
  const words = storeName.trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length > 1
      ? words
          .slice(0, 3)
          .map((word) => word[0])
          .join("")
      : (words[0] ?? "").slice(0, 3);

  return initials ? `${initials.toLowerCase()}-01` : "";
}
