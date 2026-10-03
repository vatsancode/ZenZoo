/**
 * A single 4px-based spacing scale, shared by web and native. Numeric keys,
 * not t-shirt sizes, so a future in-between value doesn't force a rename.
 */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export type Spacing = typeof spacing;
