# Design System — Components

The source of truth is the code itself: `packages/ui-web/src/*` (web
components) and `packages/design-tokens/src/*` (the tokens they're built
from). This file is a full snapshot of both, for reference and sharing — if
this ever disagrees with the code, the code is right and this file is stale
and should be regenerated. For the token *values* alone (no component code),
see `docs/style-guide.md`.

Every component reads color, spacing, radius, elevation and type through
`useTheme()`/`textStyle()` — nothing is hardcoded, so light/dark both work
automatically. `packages/ui-native` mirrors this same component set for
Expo/React Native with the same tokens, a native API, and is not included
here.

## Contents

- [Tokens](#tokens) — colors, spacing, radius, elevation, typography
- Components: [Button](#button) · [Input](#input) · [Select](#select) ·
  [DatePicker](#datepicker) · [Modal](#modal) · [Sheet](#sheet) ·
  [Switch](#switch) · [Tabs](#tabs) · [Chips / MultiChips](#chips--multichips) ·
  [Pagination](#pagination) · [Icon](#icon) · [IconButton](#iconbutton) ·
  [Notice](#notice) · [Card](#card) · [Table](#table) · [Badge](#badge) ·
  [ThemeProvider](#themeprovider)

---

## Tokens

### Colors (`packages/design-tokens/src/colors/index.ts`)

```ts
export type ThemeName = "light" | "dark";

export interface ColorTokens {
  /** App background, behind every screen. */
  surfaceCanvas: string;
  /** Cards, sheets, modals, menus - anything sitting above the canvas. */
  surfaceRaised: string;
  /** Inputs, selects, chips - controls recessed into a surface. */
  surfaceSunken: string;
  /** Soft wash behind empty states, onboarding and callouts. Used sparingly. */
  surfacePlayful: string;
  /** Hairline dividers and resting input outlines. Pair with elevation, not both. */
  border: string;
  /** Primary text and icons. */
  ink: string;
  /** Secondary text and metadata. */
  inkMuted: string;
  /** Placeholder text and disabled labels only - never body copy. */
  inkFaint: string;
  /** Primary action: filled buttons, links, the active state of a control. */
  accent: string;
  /** `accent` while pressed or active. */
  accentPressed: string;
  /** Text and icons on an `accent` or `accentPressed` fill. */
  onAccent: string;
  /** The one warm accent: celebrations, highlighted tips, illustration fills. */
  playful: string;
  /** Text and icons on a `playful` fill. */
  onPlayful: string;
  /** Status: stock levels, confirmations. */
  success: string;
  /** Status: form errors, caution states. */
  warning: string;
  /** Status: destructive actions, failures. */
  danger: string;
}

export const lightColors: ColorTokens = {
  surfaceCanvas: "#fafafc",
  surfaceRaised: "#ffffff",
  surfaceSunken: "#f2f2f6",
  surfacePlayful: "#f1eeff",
  border: "#e3e3e8",
  ink: "#1c1c1e",
  inkMuted: "#6e6e73",
  inkFaint: "#aeaeb2",
  accent: "#0f66e0",
  accentPressed: "#0b4fb0",
  onAccent: "#ffffff",
  playful: "#ff7a47",
  onPlayful: "#1c1c1e",
  success: "#198754",
  warning: "#9c5700",
  danger: "#c62828",
};

export const darkColors: ColorTokens = {
  surfaceCanvas: "#000000",
  surfaceRaised: "#1c1c1e",
  surfaceSunken: "#2c2c2e",
  surfacePlayful: "#241f33",
  border: "#3a3a3c",
  ink: "#f5f5f7",
  inkMuted: "#98989d",
  inkFaint: "#68686d",
  // Brighter than the light-theme accent for the same visual weight against
  // black; pairs with onAccent flipping to dark text below.
  accent: "#3d9bff",
  accentPressed: "#2b86ff",
  onAccent: "#1c1c1e",
  playful: "#ff8f66",
  onPlayful: "#1c1c1e",
  success: "#3ddc84",
  warning: "#ffc35c",
  danger: "#ff6b6b",
};

export const colorThemes: Record<ThemeName, ColorTokens> = {
  light: lightColors,
  dark: darkColors,
};
```

### Chart colors (`packages/design-tokens/src/chart/index.ts`)

```ts
import type { ThemeName } from "../colors";

/**
 * Colours for telling categories apart in a chart. These are separate from the UI colour
 * roles because they have a different job: identity, not meaning. Status colours (success,
 * warning, danger) stay out of here so a category never looks like a warning.
 *
 * The slots come in a fixed order (blue, orange, aqua, yellow, magenta) and are stepped
 * separately for each surface. The order is what keeps neighbouring slices apart for
 * colour-blind readers, so assign slots in order and never cycle them. Anything past the
 * last slot is drawn in a neutral and listed in a legend or table instead.
 */
export const chartCategorical: Record<ThemeName, readonly string[]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"],
};
```

### Spacing (`packages/design-tokens/src/spacing/index.ts`)

```ts
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
```

### Radius (`packages/design-tokens/src/radius/index.ts`)

```ts
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
```

### Elevation (`packages/design-tokens/src/shadows/index.ts`)

Each level carries both a web `box-shadow` string and a React Native shadow
object, and is theme-aware (dark needs a stronger shadow to read as the same
lift). Soft and shallow by design — reach for the next step up rather than
increasing an existing shadow's opacity, and never pair a shadow with a
border on the same edge.

```ts
export interface NativeShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface ElevationLevel {
  web: string;
  native: NativeShadow;
}

export type ElevationName = "xs" | "sm" | "md" | "lg";

const lightElevation: Record<ElevationName, ElevationLevel> = {
  xs: {
    web: "0 1px 2px rgba(28, 28, 30, 0.04)",
    native: { shadowColor: "#1c1c1e", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  },
  sm: {
    web: "0 2px 8px rgba(28, 28, 30, 0.06)",
    native: { shadowColor: "#1c1c1e", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  },
  md: {
    web: "0 8px 24px rgba(28, 28, 30, 0.10)",
    native: { shadowColor: "#1c1c1e", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 6 },
  },
  lg: {
    web: "0 24px 48px rgba(28, 28, 30, 0.16)",
    native: { shadowColor: "#1c1c1e", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 32, elevation: 12 },
  },
};

const darkElevation: Record<ElevationName, ElevationLevel> = {
  xs: {
    web: "0 1px 2px rgba(0, 0, 0, 0.5)",
    native: { shadowColor: "#000000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.5, shadowRadius: 2, elevation: 1 },
  },
  sm: {
    web: "0 2px 8px rgba(0, 0, 0, 0.55)",
    native: { shadowColor: "#000000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.55, shadowRadius: 8, elevation: 2 },
  },
  md: {
    web: "0 8px 24px rgba(0, 0, 0, 0.6)",
    native: { shadowColor: "#000000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 6 },
  },
  lg: {
    web: "0 24px 48px rgba(0, 0, 0, 0.7)",
    native: { shadowColor: "#000000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.7, shadowRadius: 32, elevation: 12 },
  },
};

export const elevationThemes: Record<ThemeName, Record<ElevationName, ElevationLevel>> = {
  light: lightElevation,
  dark: darkElevation,
};
```

### Typography (`packages/design-tokens/src/typography/index.ts`)

One typeface (Manrope on web, loaded via `next/font/google` as CSS variables
`--font-sans`/`--font-mono`) at every weight. Ten `sans` steps, two `mono`
steps for anywhere digits need to line up (prices, totals, SKUs).

```ts
export const fontFamily = {
  sans: "var(--font-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "var(--font-mono), 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export interface TextStyle {
  fontFamily: "sans" | "mono";
  fontSize: number;
  lineHeight: number;
  fontWeight: keyof typeof fontWeight;
  /** 0 means "no tracking adjustment", kept explicit rather than optional so every style has the same shape. */
  letterSpacing: number;
}

export const textStyles = {
  /** Hero numbers and empty-state headlines. One per screen, at most. */
  display: { fontFamily: "sans", fontSize: 34, lineHeight: 41, fontWeight: "bold", letterSpacing: -0.34 },
  /** Screen titles. */
  title1: { fontFamily: "sans", fontSize: 28, lineHeight: 34, fontWeight: "bold", letterSpacing: -0.28 },
  /** Section headers within a screen. */
  title2: { fontFamily: "sans", fontSize: 22, lineHeight: 28, fontWeight: "semibold", letterSpacing: 0 },
  /** Card and list-section headers. */
  title3: { fontFamily: "sans", fontSize: 20, lineHeight: 25, fontWeight: "semibold", letterSpacing: 0 },
  /** Emphasized single lines - list titles, button labels, dialog headings. */
  headline: { fontFamily: "sans", fontSize: 17, lineHeight: 22, fontWeight: "semibold", letterSpacing: 0 },
  /** Default reading text. */
  body: { fontFamily: "sans", fontSize: 16, lineHeight: 24, fontWeight: "regular", letterSpacing: 0 },
  /** Body text that needs a touch more weight without stepping up a size. */
  bodyMedium: { fontFamily: "sans", fontSize: 16, lineHeight: 24, fontWeight: "medium", letterSpacing: 0 },
  /** Secondary paragraphs, helper text, card descriptions. */
  callout: { fontFamily: "sans", fontSize: 15, lineHeight: 20, fontWeight: "regular", letterSpacing: 0 },
  /** Fine print, timestamps, field hints. */
  footnote: { fontFamily: "sans", fontSize: 13, lineHeight: 18, fontWeight: "regular", letterSpacing: 0 },
  /** Short, uppercase labels above a section or field - never a sentence. */
  caption: { fontFamily: "sans", fontSize: 12, lineHeight: 16, fontWeight: "semibold", letterSpacing: 0.48 },
  /** Prices, totals and quantities in line items and receipts. */
  data: { fontFamily: "mono", fontSize: 16, lineHeight: 22, fontWeight: "medium", letterSpacing: 0 },
  /** SKUs, barcodes and secondary numeric metadata. */
  dataSmall: { fontFamily: "mono", fontSize: 13, lineHeight: 18, fontWeight: "medium", letterSpacing: 0 },
} satisfies Record<string, TextStyle>;

export type TextStyleName = keyof typeof textStyles;
```

### Theme (`packages/design-tokens/src/theme.ts`)

Bundles one color palette with everything else (spacing/radius/typography
are theme-independent; elevation isn't). Deliberately dumb — takes an
already-resolved `ThemeName` and provides the matching bundle; each app's own
`ThemeProvider` (see [below](#themeprovider)) resolves the system/stored
preference and passes it in.

```ts
import { createContext, createElement, useContext, type ReactNode } from "react";
import { colorThemes, type ColorTokens, type ThemeName } from "./colors";
import { elevationThemes, type ElevationLevel, type ElevationName } from "./shadows";
import { radius } from "./radius";
import { spacing } from "./spacing";
import { typography } from "./typography";

export interface Theme {
  name: ThemeName;
  colors: ColorTokens;
  elevation: Record<ElevationName, ElevationLevel>;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

function buildTheme(name: ThemeName): Theme {
  return { name, colors: colorThemes[name], elevation: elevationThemes[name], spacing, radius, typography };
}

export const lightTheme: Theme = buildTheme("light");
export const darkTheme: Theme = buildTheme("dark");
export const themes: Record<ThemeName, Theme> = { light: lightTheme, dark: darkTheme };

export const ThemeContext = createContext<Theme>(lightTheme);

export interface ThemeProviderProps {
  theme: ThemeName;
  children: ReactNode;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  return createElement(ThemeContext.Provider, { value: themes[theme] }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
```

### `textStyle()` helper (`packages/ui-web/src/internal/textStyle.ts`)

Every component uses this to turn a named style into real CSS, rather than
inlining font properties itself:

```ts
import { typography, type TextStyleName } from "@app/design-tokens";
import type { CSSProperties } from "react";

/** Turns a named text style into the CSS properties that render it. */
export function textStyle(name: TextStyleName): CSSProperties {
  const style = typography.textStyles[name];
  return {
    fontFamily: typography.fontFamily[style.fontFamily],
    fontSize: style.fontSize,
    lineHeight: `${style.lineHeight}px`,
    fontWeight: Number(typography.fontWeight[style.fontWeight]),
    letterSpacing: style.letterSpacing,
  };
}
```

---

## Button

`packages/ui-web/src/Button/Button.tsx` — three variants (`primary` /
`secondary` / `danger`), full-pill, with a small press-scale micro-interaction.

```tsx
import { useTheme, type ColorTokens } from "@app/design-tokens";
import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { textStyle } from "../internal/textStyle";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

function variantStyle(variant: ButtonVariant, colors: ColorTokens): CSSProperties {
  switch (variant) {
    case "primary":
      return { backgroundColor: colors.accent, color: colors.onAccent };
    case "secondary":
      return { backgroundColor: colors.surfaceSunken, color: colors.ink };
    case "danger":
      return { backgroundColor: colors.danger, color: colors.onAccent };
  }
}

export function Button({ variant = "primary", style, disabled, ...props }: ButtonProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        ...textStyle("headline"),
        height: 44,
        paddingInline: spacing[6],
        borderRadius: radius.full,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.08s ease, opacity 0.12s ease",
        ...variantStyle(variant, colors),
        ...style,
      }}
      onMouseDown={(event) => {
        if (!disabled) event.currentTarget.style.transform = "scale(0.97)";
        props.onMouseDown?.(event);
      }}
      onMouseUp={(event) => {
        event.currentTarget.style.transform = "scale(1)";
        props.onMouseUp?.(event);
      }}
    />
  );
}
```

---

## Input

`packages/ui-web/src/Input/Input.tsx` — a themed text input; accepts
`aria-invalid` to switch to the danger border.

```tsx
import { useTheme } from "@app/design-tokens";
import type { InputHTMLAttributes } from "react";
import { textStyle } from "../internal/textStyle";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ style, disabled, ...props }: InputProps) {
  const { colors, radius, spacing } = useTheme();
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";

  return (
    <input
      {...props}
      disabled={disabled}
      style={{
        ...textStyle("body"),
        height: 44,
        paddingInline: spacing[4],
        borderRadius: radius.md,
        border: `1px solid ${invalid ? colors.danger : "transparent"}`,
        color: disabled ? colors.inkFaint : colors.ink,
        backgroundColor: colors.surfaceSunken,
        boxSizing: "border-box",
        width: "100%",
        cursor: disabled ? "not-allowed" : "text",
        ...style,
      }}
    />
  );
}
```

---

## Select

`packages/ui-web/src/Select/Select.tsx` — a combobox with a searchable
dropdown, full keyboard support (arrows/home/end/enter/escape/tab), and an
optional `creatable` mode that lets the user type a brand-new value.

```tsx
"use client";

import { useTheme } from "@app/design-tokens";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Input } from "../Input";
import { textStyle } from "../internal/textStyle";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** Shows a search box at the top of the open list. On by default. */
  searchable?: boolean;
  /**
   * Adds a last "+ <createLabel>" choice that lets the user type a value that
   * isn't in `options`. The typed value is reported through `onChange`.
   */
  creatable?: boolean;
  createLabel?: string;
  /**
   * Called for keys pressed while the list is closed. Call preventDefault to
   * stop Select from also acting on the key (e.g. to move to the next field).
   */
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  style?: CSSProperties;
}

const CREATE = "__create__";
const LIST_MAX_HEIGHT = 200;
const PANEL_ESTIMATED_HEIGHT = 300;

export function Select({
  options,
  value,
  onChange,
  id,
  placeholder = "Select",
  disabled,
  searchable = true,
  creatable,
  createLabel = "Add new",
  onKeyDown,
  style,
  ...aria
}: SelectProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const listId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  const items = useMemo<SelectOption[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? options.filter((option) => option.label.toLowerCase().includes(q))
      : options;
    return creatable ? [...matches, { value: CREATE, label: `+ ${createLabel}` }] : matches;
  }, [options, query, creatable, createLabel]);
  const hasMatches = items.some((item) => item.value !== CREATE);

  const selected = options.find((option) => option.value === value);
  const invalid = aria["aria-invalid"] === true;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      document.getElementById(`${listId}-${highlight}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, highlight, listId]);

  function openList() {
    if (disabled) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setOpenUp(below < PANEL_ESTIMATED_HEIGHT && rect.top > below);
    }
    const current = options.findIndex((option) => option.value === value);
    setQuery("");
    setHighlight(current >= 0 ? current : 0);
    setOpen(true);
  }

  function closeList(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  function choose(item: SelectOption) {
    setOpen(false);
    if (item.value === CREATE) {
      setDraft(query.trim());
      setCreating(true);
      return;
    }
    onChange(item.value);
    triggerRef.current?.focus();
  }

  function finishCreating(commit: boolean, refocus: boolean) {
    const text = draft.trim();
    if (commit && text) onChange(text);
    setCreating(false);
    if (refocus && id) setTimeout(() => document.getElementById(id)?.focus(), 0);
  }

  // Keys while the list is open. They arrive from the search box, or from the
  // trigger itself when search is turned off.
  function handleOpenKeyDown(event: KeyboardEvent<HTMLElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlight((index) => Math.min(index + 1, items.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlight((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        if (searchable) break;
        event.preventDefault();
        setHighlight(0);
        break;
      case "End":
        if (searchable) break;
        event.preventDefault();
        setHighlight(items.length - 1);
        break;
      case "Enter":
      case " ": {
        // Space has to stay a typeable character in the search box.
        if (event.key === " " && searchable) break;
        event.preventDefault();
        const item = items[highlight];
        if (item) choose(item);
        break;
      }
      case "Escape":
        // Close the list only; a second Escape reaches whatever is behind it.
        event.preventDefault();
        event.stopPropagation();
        closeList(true);
        break;
      case "Tab":
        closeList(false);
        break;
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (open) {
      handleOpenKeyDown(event);
      return;
    }
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (["ArrowDown", "ArrowUp", " ", "Enter"].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  }

  const fieldStyle: CSSProperties = {
    ...textStyle("body"),
    height: 44,
    paddingInline: spacing[4],
    borderRadius: radius.md,
    border: `1px solid ${invalid ? colors.danger : "transparent"}`,
    backgroundColor: colors.surfaceSunken,
    boxSizing: "border-box",
    width: "100%",
    ...style,
  };

  if (creating) {
    return (
      <span style={{ display: "inline-block", width: "100%" }}>
        <input
          id={id}
          autoFocus
          autoComplete="off"
          placeholder={createLabel}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finishCreating(true, false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finishCreating(true, true);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              finishCreating(false, true);
            }
          }}
          style={{ ...fieldStyle, color: colors.ink }}
        />
      </span>
    );
  }

  return (
    <span ref={rootRef} style={{ position: "relative", display: "inline-block", width: "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={aria["aria-label"]}
        disabled={disabled}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
        style={{
          ...fieldStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[2],
          textAlign: "start",
          color: disabled ? colors.inkFaint : selected || value ? colors.ink : colors.inkFaint,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? (value || placeholder)}
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, color: colors.inkMuted }}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            ...(openUp ? { bottom: "100%", marginBottom: spacing[1] } : { top: "100%", marginTop: spacing[1] }),
            padding: spacing[1],
            backgroundColor: colors.surfaceRaised,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: elevation.md.web,
            boxSizing: "border-box",
            zIndex: 20,
          }}
        >
          {searchable ? (
            <div style={{ padding: spacing[1], paddingBottom: spacing[2] }}>
              <Input
                autoFocus
                type="search"
                autoComplete="off"
                placeholder="Search"
                aria-label="Search options"
                aria-controls={listId}
                aria-activedescendant={items[highlight] ? `${listId}-${highlight}` : undefined}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                onKeyDown={handleOpenKeyDown}
              />
            </div>
          ) : null}
          <ul id={listId} role="listbox" style={{ maxHeight: LIST_MAX_HEIGHT, overflowY: "auto", margin: 0, padding: 0, listStyle: "none" }}>
            {!hasMatches ? (
              <li role="presentation" style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[3] }}>
                {query.trim() ? "No matches" : "No options"}
              </li>
            ) : null}
            {items.map((item, index) => {
              const isCreate = item.value === CREATE;
              return (
                <li
                  key={item.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={item.value === value}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(item);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                  style={{
                    ...textStyle(item.value === value ? "bodyMedium" : "body"),
                    padding: `${spacing[2]}px ${spacing[3]}px`,
                    borderRadius: radius.md,
                    color: isCreate ? colors.accent : colors.ink,
                    cursor: "pointer",
                    backgroundColor: index === highlight ? colors.surfaceSunken : "transparent",
                  }}
                >
                  {item.label}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </span>
  );
}
```

---

## DatePicker

`packages/ui-web/src/DatePicker/DatePicker.tsx` — a themed date field with a
day/month/year calendar panel (replaces the native `<input type="date">`,
whose popup can't be themed). Supports `min`/`max` bounds, a `clearable`
shortcut, and flips to open upward/align right when it would run off-screen.

```tsx
"use client";

import { useTheme } from "@app/design-tokens";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Icon } from "../Icon";
import { IconButton } from "../IconButton";
import { textStyle } from "../internal/textStyle";

export interface DatePickerProps {
  /** An ISO date, YYYY-MM-DD, or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Earliest and latest pickable ISO dates. */
  min?: string;
  max?: string;
  /** Shows a Clear shortcut. On by default; turn off for a field that must always have a date. */
  clearable?: boolean;
  /** Which edge of the field the calendar lines up with. Use "right" for a field near the right edge. */
  align?: "left" | "right";
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  style?: CSSProperties;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PANEL_ESTIMATED_HEIGHT = 400;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function format(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A themed date field: a trigger that looks like an Input, and a month grid
 * that opens beneath it. Use it instead of the browser's own date input, whose
 * popup ignores the theme.
 */
export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Select a date",
  disabled,
  min,
  max,
  clearable = true,
  align = "left",
  style,
  ...aria
}: DatePickerProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const selected = fromIso(value);
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  // The date the keyboard is on; the month shown follows it.
  const [focused, setFocused] = useState<Date>(selected ?? today);
  // Days is the usual view; months and years let you jump far without paging.
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [yearStart, setYearStart] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const first = new Date(focused.getFullYear(), focused.getMonth(), 1);
  // Monday-first: getDay() is 0 for Sunday, so shift it to the end of the week.
  const lead = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => addDays(first, index - lead));

  const minDate = min ? fromIso(min) : null;
  const maxDate = max ? fromIso(max) : null;
  const blocked = (date: Date) =>
    Boolean((minDate && date < minDate) || (maxDate && date > maxDate));

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setOpenUp(
      window.innerHeight - rect.bottom < PANEL_ESTIMATED_HEIGHT &&
        rect.top > PANEL_ESTIMATED_HEIGHT,
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // Move real focus to the day the keyboard is on.
  useEffect(() => {
    if (!open || view !== "days") return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${toIso(focused)}"]`)?.focus();
  }, [open, view, focused]);

  function openPanel() {
    setFocused(selected ?? today);
    setView("days");
    setOpen(true);
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(date: Date) {
    if (blocked(date)) return;
    onChange(toIso(date));
    close();
  }

  function shiftMonth(by: number) {
    setFocused((current) => {
      const target = new Date(current.getFullYear(), current.getMonth() + by, 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      return new Date(
        target.getFullYear(),
        target.getMonth(),
        Math.min(current.getDate(), lastDay),
      );
    });
  }

  function withYear(current: Date, year: number, month = current.getMonth()): Date {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(current.getDate(), lastDay));
  }

  function pickMonth(month: number) {
    setFocused((current) => withYear(current, current.getFullYear(), month));
    setView("days");
  }

  function pickYear(year: number) {
    setFocused((current) => withYear(current, year));
    setView("months");
  }

  function showYears() {
    setYearStart(Math.floor(focused.getFullYear() / 12) * 12);
    setView("years");
  }

  // Previous / next means a month, a year, or a page of twelve years, depending on the view.
  function step(by: number) {
    if (view === "days") shiftMonth(by);
    else if (view === "months")
      setFocused((current) => withYear(current, current.getFullYear() + by));
    else setYearStart((current) => current + by * 12);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in moves && view === "days") {
      event.preventDefault();
      setFocused((current) => addDays(current, moves[event.key] ?? 0));
    } else if ((event.key === "PageUp" || event.key === "PageDown") && view === "days") {
      event.preventDefault();
      shiftMonth(event.key === "PageUp" ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      // Escape backs out of the month and year views before it closes the calendar.
      if (view === "days") close();
      else setView("days");
    }
  }

  const textButton: CSSProperties = {
    ...textStyle("bodyMedium"),
    height: 36,
    paddingInline: spacing[3],
    border: "none",
    borderRadius: radius.md,
    background: "transparent",
    cursor: "pointer",
  };

  // Months and years sit in a 3 x 4 grid as tall as the days view, so the panel does not jump.
  const cellGrid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: "repeat(4, 1fr)",
    gap: spacing[2],
    height: 264,
  };

  const bigCell = (isSelected: boolean, isCurrent: boolean, isBlocked: boolean): CSSProperties => ({
    ...textStyle(isSelected ? "bodyMedium" : "body"),
    border: `1px solid ${isCurrent && !isSelected ? colors.accent : "transparent"}`,
    borderRadius: radius.full,
    backgroundColor: isSelected ? colors.accent : "transparent",
    color: isSelected ? colors.onAccent : isBlocked ? colors.inkFaint : colors.ink,
    cursor: isBlocked ? "not-allowed" : "pointer",
  });

  const invalid = aria["aria-invalid"] === true;

  return (
    <span ref={rootRef} style={{ position: "relative", display: "block", ...style }}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={aria["aria-label"]}
        aria-invalid={aria["aria-invalid"]}
        onClick={() => (open ? close(false) : openPanel())}
        style={{
          ...textStyle("body"),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[3],
          width: "100%",
          height: 44,
          paddingInline: spacing[4],
          borderRadius: radius.md,
          border: `1px solid ${invalid ? colors.danger : "transparent"}`,
          backgroundColor: colors.surfaceSunken,
          color: disabled ? colors.inkFaint : selected ? colors.ink : colors.inkFaint,
          boxSizing: "border-box",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
        }}
      >
        <span>{selected ? format(selected) : placeholder}</span>
        <span style={{ color: colors.inkMuted, display: "inline-flex" }}>
          <Icon name="calendar" size={18} />
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a date"
          onKeyDown={handleKeyDown}
          style={{
            position: "absolute",
            ...(align === "right" ? { right: 0 } : { left: 0 }),
            ...(openUp
              ? { bottom: "100%", marginBottom: spacing[1] }
              : { top: "100%", marginTop: spacing[1] }),
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            padding: spacing[4],
            backgroundColor: colors.surfaceRaised,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            boxShadow: elevation.md.web,
            boxSizing: "border-box",
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: spacing[3] }}>
            <IconButton
              icon="back"
              label={view === "days" ? "Previous month" : view === "months" ? "Previous year" : "Previous years"}
              onClick={() => step(-1)}
            />
            {view === "years" ? (
              <span style={{ ...textStyle("headline"), color: colors.ink }}>
                {yearStart} - {yearStart + 11}
              </span>
            ) : (
              <button
                type="button"
                aria-label={view === "days" ? "Choose month and year" : "Choose year"}
                onClick={() => (view === "days" ? setView("months") : showYears())}
                style={{
                  ...textStyle("headline"),
                  display: "inline-flex",
                  alignItems: "center",
                  gap: spacing[2],
                  height: 36,
                  paddingInline: spacing[3],
                  border: "none",
                  borderRadius: radius.full,
                  background: "transparent",
                  color: colors.ink,
                  cursor: "pointer",
                }}
              >
                {view === "days"
                  ? focused.toLocaleDateString("en-IN", { month: "long", year: "numeric" })
                  : focused.getFullYear()}
                <span style={{ display: "inline-flex", transform: "rotate(-90deg)", color: colors.inkMuted }}>
                  <Icon name="back" size={14} />
                </span>
              </button>
            )}
            <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
              <IconButton
                icon="back"
                label={view === "days" ? "Next month" : view === "months" ? "Next year" : "Next years"}
                onClick={() => step(1)}
              />
            </span>
          </div>

          {view === "months" ? (
            <div style={cellGrid}>
              {MONTHS.map((name, month) => {
                const isSelected =
                  selected !== null &&
                  selected.getFullYear() === focused.getFullYear() &&
                  selected.getMonth() === month;
                const isCurrent =
                  today.getFullYear() === focused.getFullYear() && today.getMonth() === month;
                const isBlocked =
                  (minDate !== null && new Date(focused.getFullYear(), month + 1, 0) < minDate) ||
                  (maxDate !== null && new Date(focused.getFullYear(), month, 1) > maxDate);
                return (
                  <button key={name} type="button" disabled={isBlocked} aria-pressed={isSelected} onClick={() => pickMonth(month)} style={bigCell(isSelected, isCurrent, isBlocked)}>
                    {name}
                  </button>
                );
              })}
            </div>
          ) : null}

          {view === "years" ? (
            <div style={cellGrid}>
              {Array.from({ length: 12 }, (_, index) => yearStart + index).map((year) => {
                const isSelected = selected !== null && selected.getFullYear() === year;
                const isCurrent = today.getFullYear() === year;
                const isBlocked =
                  (minDate !== null && year < minDate.getFullYear()) ||
                  (maxDate !== null && year > maxDate.getFullYear());
                return (
                  <button key={year} type="button" disabled={isBlocked} aria-pressed={isSelected} onClick={() => pickYear(year)} style={bigCell(isSelected, isCurrent, isBlocked)}>
                    {year}
                  </button>
                );
              })}
            </div>
          ) : null}

          {view === "days" ? (
            <div ref={gridRef} role="grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2 }}>
              {WEEKDAYS.map((day) => (
                <span key={day} style={{ ...textStyle("caption"), color: colors.inkMuted, textAlign: "center", paddingBottom: spacing[2] }}>
                  {day}
                </span>
              ))}
              {cells.map((date) => {
                const iso = toIso(date);
                const isSelected = selected !== null && iso === toIso(selected);
                const isToday = iso === toIso(today);
                const outside = date.getMonth() !== focused.getMonth();
                const isBlocked = blocked(date);
                return (
                  <button
                    key={iso}
                    type="button"
                    data-iso={iso}
                    disabled={isBlocked}
                    tabIndex={iso === toIso(focused) ? 0 : -1}
                    aria-label={date.toLocaleDateString("en-IN", { dateStyle: "full" })}
                    aria-pressed={isSelected}
                    onClick={() => choose(date)}
                    style={{
                      ...textStyle(isSelected ? "bodyMedium" : "body"),
                      justifySelf: "center",
                      width: 36,
                      height: 36,
                      borderRadius: radius.full,
                      border: `1px solid ${isToday && !isSelected ? colors.accent : "transparent"}`,
                      backgroundColor: isSelected ? colors.accent : "transparent",
                      color: isSelected ? colors.onAccent : isBlocked ? colors.inkFaint : outside ? colors.inkMuted : colors.ink,
                      opacity: outside && !isSelected ? 0.6 : 1,
                      cursor: isBlocked ? "not-allowed" : "pointer",
                    }}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: spacing[3], paddingTop: spacing[3], borderTop: `1px solid ${colors.border}` }}>
            {clearable ? (
              <button type="button" style={{ ...textButton, color: colors.inkMuted }} onClick={() => { onChange(""); close(); }}>
                Clear
              </button>
            ) : (
              <span />
            )}
            <button type="button" disabled={blocked(today)} style={{ ...textButton, color: colors.accent }} onClick={() => choose(today)}>
              Today
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
```

---

## Modal

`packages/ui-web/src/Modal/Modal.tsx` — a centered, portal-rendered dialog
with a dimmed backdrop. Use `Sheet` instead for a focused side-panel task
(add/edit) rather than something that interrupts the whole screen.

```tsx
import { useTheme } from "@app/design-tokens";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
  const { colors, radius, spacing, elevation } = useTheme();

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: `color-mix(in srgb, ${colors.ink} 40%, transparent)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing[8],
        boxSizing: "border-box",
        zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundColor: colors.surfaceRaised,
          borderRadius: radius.xl,
          padding: spacing[8],
          boxShadow: elevation.lg.web,
          minWidth: 320,
          maxWidth: "90vw",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

---

## Sheet

`packages/ui-web/src/Sheet/Sheet.tsx` — a panel that slides in from the right
edge, for focused tasks that sit beside the page (add/edit a record). Closes
on Escape or backdrop click; supports a `title`+close button header and a
pinned `footer`.

```tsx
"use client";

import { useTheme } from "@app/design-tokens";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../IconButton";
import { textStyle } from "../internal/textStyle";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Shown at the top with a close button. Also the panel's accessible name unless `label` is set. */
  title?: string;
  /** Accessible name for the panel, when it differs from the title or there is no title. */
  label?: string;
  /** Pinned to the bottom of the panel while the content above scrolls. */
  footer?: ReactNode;
  width?: number;
}

/**
 * A panel that slides in from the right edge. Use it for focused tasks that
 * sit beside the page (adding or editing a record) rather than interrupting
 * it the way a Modal does.
 */
export function Sheet({ open, onClose, children, title, label, footer, width = 440 }: SheetProps) {
  const { colors, radius, spacing, elevation } = useTheme();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: `color-mix(in srgb, ${colors.ink} 24%, transparent)`,
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <aside
        role="dialog"
        aria-label={label ?? title}
        onClick={(event) => event.stopPropagation()}
        style={{
          width,
          maxWidth: "100vw",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          backgroundColor: colors.surfaceRaised,
          borderStartStartRadius: radius.xl,
          borderEndStartRadius: radius.xl,
          boxShadow: elevation.lg.web,
          boxSizing: "border-box",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: spacing[8] }}>
          {title ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing[4], marginBottom: spacing[6] }}>
              <div style={{ ...textStyle("title2"), color: colors.ink }}>{title}</div>
              <IconButton icon="close" label="Close" onClick={onClose} />
            </div>
          ) : null}
          {children}
        </div>
        {footer ? (
          <div style={{ padding: `${spacing[4]}px ${spacing[8]}px`, borderTop: `1px solid ${colors.border}` }}>
            {footer}
          </div>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
```

---

## Switch

`packages/ui-web/src/Switch/Switch.tsx` — an on/off toggle. Label it with a
neighbouring `<label>` or `aria-label`.

```tsx
import { useTheme } from "@app/design-tokens";
import type { ButtonHTMLAttributes } from "react";

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const THUMB_SIZE = 22;

/** An on/off toggle. Label it with a neighbouring <label> or `aria-label`. */
export function Switch({ checked, onChange, disabled, style, ...props }: SwitchProps) {
  const { colors, radius, elevation } = useTheme();
  const inset = (TRACK_HEIGHT - THUMB_SIZE) / 2;

  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        flexShrink: 0,
        padding: 0,
        border: "none",
        borderRadius: radius.full,
        backgroundColor: checked ? colors.accent : colors.border,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background-color 0.12s ease",
        ...style,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: inset,
          left: checked ? TRACK_WIDTH - THUMB_SIZE - inset : inset,
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: radius.full,
          backgroundColor: colors.surfaceRaised,
          boxShadow: elevation.xs.web,
          transition: "left 0.12s ease",
        }}
      />
    </button>
  );
}
```

---

## Tabs

`packages/ui-web/src/Tabs/Tabs.tsx` — a row of tabs on a hairline, with
arrow-key roving focus. Render the matching panel yourself with
`role="tabpanel"` and `aria-labelledby={`tab-${id}`}`.

```tsx
"use client";

import { useTheme } from "@app/design-tokens";
import type { KeyboardEvent } from "react";
import { textStyle } from "../internal/textStyle";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Label for the tab list, for screen readers. */
  "aria-label": string;
}

/**
 * A row of tabs sitting on a hairline. Render the matching panel yourself
 * with `role="tabpanel"` and `aria-labelledby={`tab-${id}`}`.
 */
export function Tabs({ tabs, value, onChange, ...aria }: TabsProps) {
  const { colors, spacing } = useTheme();

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <div role="tablist" aria-label={aria["aria-label"]} style={{ display: "flex", gap: spacing[12], borderBottom: `1px solid ${colors.border}` }}>
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            style={{
              ...textStyle(active ? "headline" : "body"),
              background: "none",
              border: "none",
              borderBottom: `2px solid ${active ? colors.accent : "transparent"}`,
              marginBottom: -1,
              padding: `${spacing[4]}px 0`,
              color: active ? colors.ink : colors.inkMuted,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

---

## Chips / MultiChips

`packages/ui-web/src/Chips/Chips.tsx` — `Chips` is single-select (a
`radiogroup`, for filters/short lists); `MultiChips` is multi-select (ticks
inside each picked chip). Both support an optional equal-width `columns` grid
layout.

```tsx
"use client";

import { useTheme } from "@app/design-tokens";
import type { KeyboardEvent } from "react";
import { Icon } from "../Icon";
import { textStyle } from "../internal/textStyle";

export interface ChipOption {
  value: string;
  label: string;
}

export interface ChipsProps {
  options: ChipOption[];
  /** The chosen option's value, or "" when nothing is chosen yet. */
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  /**
   * Lay the chips out in this many equal columns, each as wide as its column
   * and as tall as its tallest neighbour. Without it they sit side by side at
   * their natural width.
   */
  columns?: number;
}

/** A row of pill choices where exactly one can be picked - for short lists and filters. */
export function Chips({ options, value, onChange, columns, ...aria }: ChipsProps) {
  const { colors, radius, spacing } = useTheme();

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    document.getElementById(`chip-${next.value}`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      style={
        columns
          ? { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: spacing[2] }
          : { display: "flex", flexWrap: "wrap", gap: spacing[2] }
      }
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`chip-${option.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (value === "" && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            style={{
              ...textStyle("callout"),
              ...(columns
                ? { minHeight: 44, paddingBlock: spacing[2], textAlign: "center" as const }
                : { height: 36 }),
              paddingInline: spacing[4],
              borderRadius: radius.full,
              border: `1px solid ${selected ? colors.accent : colors.border}`,
              backgroundColor: selected ? colors.surfaceSunken : "transparent",
              color: selected ? colors.ink : colors.inkMuted,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface MultiChipsProps {
  options: ChipOption[];
  /** The values currently picked. Empty means none picked. */
  value: string[];
  onChange: (value: string[]) => void;
  "aria-label": string;
  /** Lay the chips out in this many equal columns, as with `Chips`. */
  columns?: number;
}

/** Pill choices where any number can be picked - for filters. A picked chip carries a tick. */
export function MultiChips({ options, value, onChange, columns, ...aria }: MultiChipsProps) {
  const { colors, radius, spacing } = useTheme();

  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  }

  return (
    <div
      role="group"
      aria-label={aria["aria-label"]}
      style={
        columns
          ? { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: spacing[2] }
          : { display: "flex", flexWrap: "wrap", gap: spacing[2] }
      }
    >
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(option.value)}
            style={{
              ...textStyle("callout"),
              ...(columns ? { minHeight: 44, paddingBlock: spacing[2] } : { height: 36 }),
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing[2],
              paddingInline: spacing[4],
              borderRadius: radius.full,
              border: `1px solid ${selected ? colors.accent : colors.border}`,
              backgroundColor: selected ? colors.surfaceSunken : "transparent",
              color: selected ? colors.ink : colors.inkMuted,
              cursor: "pointer",
            }}
          >
            {selected ? <Icon name="check" size={14} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

---

## Pagination

`packages/ui-web/src/Pagination/Pagination.tsx` — page numbers (first, last,
and a window around the current page, with `…` gaps) plus an optional "rows
per page" `Select`.

```tsx
"use client";

import { useTheme } from "@app/design-tokens";
import type { ReactNode } from "react";
import { Select } from "../Select";
import { textStyle } from "../internal/textStyle";

export interface PaginationProps {
  /** The page being shown, starting at 1. */
  page: number;
  pageSize: number;
  /** How many rows there are in all, across every page. */
  total: number;
  onPageChange: (page: number) => void;
  /** With both of these, a "Rows per page" picker appears. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
}

/** Page numbers to show: always the first and last, and the ones around the current page. */
function pageItems(page: number, pageCount: number): (number | "gap")[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  pages.forEach((n, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && n - previous > 1) items.push("gap");
    items.push(n);
  });
  return items;
}

function PageButton({
  label,
  onClick,
  disabled,
  selected,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  children: ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={selected ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...textStyle(selected ? "headline" : "callout"),
        minWidth: 36,
        height: 36,
        paddingInline: spacing[2],
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: radius.full,
        backgroundColor: selected ? colors.surfaceSunken : "transparent",
        color: selected ? colors.ink : colors.inkMuted,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationProps) {
  const { colors, spacing } = useTheme();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), pageCount);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);

  const chevron = (direction: "left" | "right") => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M10 4L6 8l4 4" : "M6 4l4 4-4 4"}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <nav aria-label="Pagination" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing[4], marginTop: spacing[4] }}>
      <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
        Showing {first}-{last} of {total}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: spacing[6], flexWrap: "wrap" }}>
        {pageSizeOptions && onPageSizeChange ? (
          <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
            <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>Rows per page</span>
            <div style={{ width: 88 }}>
              <Select
                aria-label="Rows per page"
                searchable={false}
                options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
                value={String(pageSize)}
                onChange={(next) => onPageSizeChange(Number(next))}
              />
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: spacing[1] }}>
          <PageButton label="Previous page" disabled={current === 1} onClick={() => onPageChange(current - 1)}>
            {chevron("left")}
          </PageButton>
          {pageItems(current, pageCount).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} aria-hidden="true" style={{ ...textStyle("callout"), color: colors.inkFaint, minWidth: 24, textAlign: "center" }}>
                …
              </span>
            ) : (
              <PageButton key={item} label={`Page ${item}`} selected={item === current} onClick={() => onPageChange(item)}>
                {item}
              </PageButton>
            ),
          )}
          <PageButton label="Next page" disabled={current === pageCount} onClick={() => onPageChange(current + 1)}>
            {chevron("right")}
          </PageButton>
        </div>
      </div>
    </nav>
  );
}
```

---

## Icon

`packages/ui-web/src/Icon/Icon.tsx` — a fixed set of outline icons on a 24px
grid, drawn in `currentColor` so they inherit text color. Decorative by
default: the accessible label belongs on whatever button holds it (see
`IconButton`).

```tsx
import type { ReactNode } from "react";

export type IconName =
  | "edit"
  | "copy"
  | "check"
  | "print"
  | "close"
  | "back"
  | "calendar"
  | "info"
  | "tag"
  | "ruler"
  | "theme"
  | "bank"
  | "transfer"
  | "receipt"
  | "history"
  | "card"
  | "users"
  | "lock"
  | "user";

// Outline icons on a 24px grid, drawn in the current text colour.
const SHAPES: Record<IconName, ReactNode> = {
  edit: <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  print: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="4" y="9" width="16" height="8" rx="2" />
      <path d="M7 14h10v6H7z" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 6l-6 6 6 6" />,
  tag: (
    <>
      <path d="M3.5 3.5h8l9 9-8 8-9-9z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  ruler: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
    </>
  ),
  theme: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  bank: (
    <>
      <path d="M3 9l9-5 9 5" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
    </>
  ),
  transfer: (
    <>
      <path d="M4 8h14M14 4l4 4-4 4" />
      <path d="M20 16H6M10 12l-4 4 4 4" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18M7 15h4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.4c1.8.8 3 2.5 3 5.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c0-4 3.3-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  size?: number;
}

/** Decorative by default: put the meaning in the label of whatever button holds it. */
export function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {SHAPES[name]}
    </svg>
  );
}
```

---

## IconButton

`packages/ui-web/src/IconButton/IconButton.tsx` — a round, icon-only button
for row/header actions. `label` doubles as the tooltip and the accessible
name.

```tsx
import { useTheme } from "@app/design-tokens";
import type { MouseEvent } from "react";
import { Icon, type IconName } from "../Icon";

export interface IconButtonProps {
  icon: IconName;
  /** What the button does. Used as the tooltip and for screen readers. */
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** "success" is for a brief confirmation, such as a tick after copying. */
  tone?: "default" | "success";
  disabled?: boolean;
}

/** A round, icon-only button for actions inside rows and headers. */
export function IconButton({ icon, label, onClick, tone = "default", disabled }: IconButtonProps) {
  const { colors, radius } = useTheme();

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        flexShrink: 0,
        padding: 0,
        border: "none",
        borderRadius: radius.full,
        background: "none",
        color: tone === "success" ? colors.success : colors.inkMuted,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <Icon name={icon} />
    </button>
  );
}
```

---

## Notice

`packages/ui-web/src/Notice/Notice.tsx` — a short confirmation shown after
an action completes, announced to screen readers via `role="status"`.

```tsx
import { useTheme } from "@app/design-tokens";
import type { CSSProperties, ReactNode } from "react";
import { textStyle } from "../internal/textStyle";

export interface NoticeProps {
  children: ReactNode;
  /** For placing it (margins); the look is fixed. */
  style?: CSSProperties;
}

/** A short confirmation shown after something was done, announced to screen readers. */
export function Notice({ children, style }: NoticeProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <div
      role="status"
      style={{
        ...textStyle("callout"),
        color: colors.ink,
        backgroundColor: colors.surfaceSunken,
        borderRadius: radius.md,
        padding: spacing[4],
        ...style,
      }}
    >
      {children}
    </div>
  );
}
```

---

## Card

`packages/ui-web/src/Card/Card.tsx` — a raised surface with a soft shadow;
the generic container for grouped content.

```tsx
import { useTheme } from "@app/design-tokens";
import type { HTMLAttributes } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ style, ...props }: CardProps) {
  const { colors, radius, spacing, elevation } = useTheme();

  return (
    <div
      {...props}
      style={{
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.lg,
        padding: spacing[6],
        boxShadow: elevation.sm.web,
        ...style,
      }}
    />
  );
}
```

---

## Table

`packages/ui-web/src/Table/Table.tsx` — a generic, column-driven table.
Columns declare their own `render`, so any cell content works; rows are
optionally clickable (mouse and Enter-from-keyboard).

```tsx
import { useTheme } from "@app/design-tokens";
import type { ReactNode } from "react";
import { textStyle } from "../internal/textStyle";

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  align?: "left" | "right";
  /** Any CSS width (e.g. "30%", "80px"). Columns without one share the remaining width equally. */
  width?: string;
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  /** Makes each row clickable (and reachable with Enter from the keyboard). */
  onRowClick?: (row: Row) => void;
}

export function Table<Row>({ columns, rows, getRowKey, onRowClick }: TableProps<Row>) {
  const { colors, radius, spacing } = useTheme();

  return (
    <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", backgroundColor: colors.surfaceRaised, borderRadius: radius.lg }}>
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={column.width ? { width: column.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              style={{
                ...textStyle("caption"),
                textAlign: column.align ?? "left",
                textTransform: "uppercase",
                color: colors.inkMuted,
                padding: `${spacing[3]}px ${spacing[5]}px`,
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={getRowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={
              onRowClick
                ? (event) => {
                    if (event.key === "Enter" && event.target === event.currentTarget) onRowClick(row);
                  }
                : undefined
            }
            tabIndex={onRowClick ? 0 : undefined}
            style={onRowClick ? { cursor: "pointer" } : undefined}
          >
            {columns.map((column) => (
              <td
                key={column.key}
                style={{
                  ...textStyle("body"),
                  textAlign: column.align ?? "left",
                  color: colors.ink,
                  padding: `${spacing[4]}px ${spacing[5]}px`,
                  borderBottom: index === rows.length - 1 ? "none" : `1px solid ${colors.border}`,
                }}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## Badge

`packages/ui-web/src/Badge/Badge.tsx` — a small pill with a status dot.
`tone` picks the dot color (`neutral` / `success` / `warning` / `danger`);
the badge's own text/background stay neutral regardless of tone.

```tsx
import { useTheme, type ColorTokens } from "@app/design-tokens";
import type { HTMLAttributes } from "react";
import { textStyle } from "../internal/textStyle";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

function dotColor(tone: BadgeTone, colors: ColorTokens): string {
  switch (tone) {
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    case "danger":
      return colors.danger;
    case "neutral":
      return colors.inkFaint;
  }
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", style, children, ...props }: BadgeProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <span
      {...props}
      style={{
        ...textStyle("footnote"),
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: spacing[2],
        height: 28,
        paddingInline: `${spacing[2]}px ${spacing[3]}px`,
        borderRadius: radius.full,
        backgroundColor: colors.surfaceSunken,
        color: colors.ink,
        ...style,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: radius.full,
          backgroundColor: dotColor(tone, colors),
          flex: "none",
        }}
      />
      {children}
    </span>
  );
}
```

---

## ThemeProvider

`packages/ui-web/src/ThemeProvider/ThemeProvider.tsx` — wraps
`@app/design-tokens`' own `ThemeProvider` (see [Theme](#theme-packagesdesign-tokenssrctheme) above) with web-specific
system-preference detection and a persisted choice. By default it follows
`prefers-color-scheme` and keeps it live; a saved "light"/"dark" choice
overrides that. Also exposes `useThemePreference()` for a settings screen to
read/change the choice.

```tsx
"use client";

import { ThemeProvider as TokensThemeProvider, type ThemeName } from "@app/design-tokens";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface ThemeProviderProps {
  children: ReactNode;
}

/** What the person chose: follow the device, or always light, or always dark. */
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "app-theme";

interface PreferenceContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const PreferenceContext = createContext<PreferenceContextValue>({
  preference: "system",
  setPreference: () => {},
});

/** Reads and changes the theme preference, for a settings screen. */
export function useThemePreference(): PreferenceContextValue {
  return useContext(PreferenceContext);
}

/**
 * Resolves the theme and provides it through `@app/design-tokens`' theme
 * context. By default it follows the viewer's system light/dark preference and
 * keeps it current; a saved choice of light or dark overrides that. Starts from
 * "light" on the server (where `window` doesn't exist) and corrects itself on
 * mount - a brief flash on a dark-preferring browser is an accepted
 * simplification until the product actually needs a no-flash boot script.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [system, setSystem] = useState<ThemeName>("light");
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    setSystem(query.matches ? "dark" : "light");

    const listener = (event: MediaQueryListEvent) => setSystem(event.matches ? "dark" : "light");
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  // Storage can be blocked or empty (private windows, cleared data), so every access is guarded.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") setPreferenceState(saved);
    } catch {
      // keep following the system
    }
  }, []);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // the choice still applies for this visit
    }
  }

  const theme: ThemeName = preference === "system" ? system : preference;

  return (
    <PreferenceContext.Provider value={{ preference, setPreference }}>
      <TokensThemeProvider theme={theme}>{children}</TokensThemeProvider>
    </PreferenceContext.Provider>
  );
}
```

---

## Package exports

`packages/ui-web/src/index.ts` — everything above is re-exported from
`@app/ui-web`'s root:

```ts
export * from "./Button";
export * from "./Input";
export * from "./Select";
export * from "./DatePicker";
export * from "./Modal";
export * from "./Sheet";
export * from "./Switch";
export * from "./Tabs";
export * from "./Chips";
export * from "./Pagination";
export * from "./Icon";
export * from "./IconButton";
export * from "./Notice";
export * from "./Card";
export * from "./Table";
export * from "./Badge";
export * from "./ThemeProvider";
export * from "./internal/textStyle";
```
