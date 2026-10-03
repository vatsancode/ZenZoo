export const radius = {
  /** Full-bleed media and dividers only. */
  none: 0,
  /** Small chips, thumbnails, inline tags. */
  sm: 4,
  /** Inputs, selects and other contained controls. */
  md: 8,
  /** Standard cards and list containers. */
  lg: 16,
  /** Modals, sheets and hero surfaces - anything meant to feel spacious. */
  xl: 24,
  /** Buttons, badges and avatars - every pill shape in the system. */
  full: 9999,
} as const;

export type Radius = typeof radius;
