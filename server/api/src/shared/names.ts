/** Trims and collapses repeated spaces, so "Tea    Coffee" and "Tea Coffee" are one name. */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Postgres counts characters, but String.length counts UTF-16 units, so an emoji
 * would count as 2. Spreading the string counts it the way the column does.
 */
function characterCount(text: string): number {
  return [...text].length;
}

/** Throws a plain sentence when `text` is longer than its column allows, e.g. "The category name can be at most 100 characters." */
export function assertFits(text: string, max: number, what: string): void {
  if (characterCount(text) > max) {
    throw new Error(`${what} can be at most ${max} characters.`);
  }
}

const collators = {
  latin: new Intl.Collator("en", { sensitivity: "base", numeric: true }),
  tamil: new Intl.Collator("ta", { sensitivity: "base", numeric: true }),
  other: new Intl.Collator(undefined, { sensitivity: "base", numeric: true }),
};

/** English-script names first, Tamil next, everything else (other languages, digits, symbols, emoji) last - by the first character. */
function scriptGroup(name: string): "latin" | "tamil" | "other" {
  const first = [...name.trimStart()][0] ?? "";
  if (/\p{Script=Latin}/u.test(first) && /\p{L}/u.test(first)) return "latin";
  if (/\p{Script=Tamil}/u.test(first) && /\p{L}/u.test(first)) return "tamil";
  return "other";
}

const GROUP_RANK = { latin: 0, tamil: 1, other: 2 } as const;

/** A-Z for names in any language: English first, then Tamil, then the rest, each in its own alphabet, ignoring case. */
export function compareNames(a: string, b: string): number {
  const groupA = scriptGroup(a);
  const groupB = scriptGroup(b);
  if (groupA !== groupB) return GROUP_RANK[groupA] - GROUP_RANK[groupB];
  return collators[groupA].compare(a, b);
}

/**
 * The first free code starting from `base`: base, base_2, base_3 ... (with the given
 * separator), cut so it never passes `maxLength`. Used for the internal codes of
 * accounts and payment methods, which people never see - so a name with no English
 * letters, or two names that boil down to the same code, still get saved.
 */
export async function firstFreeCode(
  base: string,
  separator: string,
  maxLength: number,
  isTaken: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 1; attempt < 1000; attempt++) {
    const suffix = attempt === 1 ? "" : `${separator}${attempt}`;
    const trimmed = base.slice(0, maxLength - suffix.length).replace(/[_-]+$/, "");
    const candidate = trimmed + suffix;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error("Couldn't make a code for that name. Try a different name.");
}
