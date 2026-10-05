# ZenZoo Style Guide

The source of truth for these values is code, not this document:
`packages/design-tokens/src/*`. This file is a readable snapshot of it for
reference and sharing — if the two ever disagree, the code is right and
this file is stale and should be regenerated.

Direction: minimal, spacious, slightly playful — one typeface at every
weight, a small neutral palette with a single accent color, generous
whitespace, soft shadows, and full-pill buttons and badges. Every value
below is read live through `useTheme()` (for colors and elevation, which
differ by theme) or `textStyle()` (for type), never hardcoded in a
component — see `.claude/skills/zenzoo-ui-review/` for the enforcement
rules.

---

## Color

Sixteen roles, each with a light and dark value. Components never import
`lightColors`/`darkColors` directly — always `useTheme().colors`, so a
screen follows the viewer's light/dark preference automatically.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `surfaceCanvas` | `#fafafc` | `#000000` | App background, behind every screen |
| `surfaceRaised` | `#ffffff` | `#1c1c1e` | Cards, sheets, modals, menus — anything above the canvas |
| `surfaceSunken` | `#f2f2f6` | `#2c2c2e` | Inputs, selects, chips — controls recessed into a surface |
| `surfacePlayful` | `#f1eeff` | `#241f33` | Soft wash behind empty states, onboarding, callouts — used sparingly |
| `border` | `#e3e3e8` | `#3a3a3c` | Hairline dividers and resting input outlines |
| `ink` | `#1c1c1e` | `#f5f5f7` | Primary text and icons |
| `inkMuted` | `#6e6e73` | `#98989d` | Secondary text and metadata |
| `inkFaint` | `#aeaeb2` | `#68686d` | Placeholder and disabled text only — never body copy |
| `accent` | `#0f66e0` | `#3d9bff` | Primary action: filled buttons, links, active state |
| `accentPressed` | `#0b4fb0` | `#2b86ff` | `accent` while pressed or active |
| `onAccent` | `#ffffff` | `#1c1c1e` | Text/icons on an `accent` or `accentPressed` fill |
| `playful` | `#ff7a47` | `#ff8f66` | The one warm accent — celebrations, highlights, illustrations only |
| `onPlayful` | `#1c1c1e` | `#1c1c1e` | Text/icons on a `playful` fill (stays dark in both themes) |
| `success` | `#198754` | `#3ddc84` | Status: stock levels, confirmations |
| `warning` | `#9c5700` | `#ffc35c` | Status: form errors, caution states |
| `danger` | `#c62828` | `#ff6b6b` | Status: destructive actions, failures |

**Rules:** `accent` is reserved for the one primary action on a screen —
two accent-colored buttons on the same screen means one is wrong. `playful`
never appears on a transactional or primary action. Separate two surfaces
with a hairline `border` **or** an elevation shadow, never both at once.

## Typography

One typeface (Manrope for text, JetBrains Mono for figures) at every
weight, rather than pairing a second display face. Ten steps on the sans
family, two on mono for anywhere digits line up in a column.

| Style | Size / Line height | Weight | Tracking | Usage |
|---|---|---|---|---|
| `display` | 34 / 41 | bold | -0.34 | Hero numbers, empty-state headlines — one per screen, at most |
| `title1` | 28 / 34 | bold | -0.28 | Screen titles |
| `title2` | 22 / 28 | semibold | 0 | Section headers within a screen |
| `title3` | 20 / 25 | semibold | 0 | Card and list-section headers |
| `headline` | 17 / 22 | semibold | 0 | Emphasized single lines — list titles, button labels, dialog headings |
| `body` | 16 / 24 | regular | 0 | Default reading text |
| `bodyMedium` | 16 / 24 | medium | 0 | Body text needing a touch more weight, same size |
| `callout` | 15 / 20 | regular | 0 | Secondary paragraphs, helper text, card descriptions |
| `footnote` | 13 / 18 | regular | 0 | Fine print, timestamps, field hints |
| `caption` | 12 / 16 | semibold | 0.48 | Short, uppercase labels above a section or field — never a sentence |
| `data` (mono) | 16 / 22 | medium | 0 | Prices, totals and quantities in line items and receipts |
| `dataSmall` (mono) | 13 / 18 | medium | 0 | SKUs, barcodes, secondary numeric metadata |

## Spacing

One 4px-based scale, shared by web and native.

| Token | Value |
|---|---|
| `space-0` | 0px |
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |
| `space-12` | 48px |
| `space-16` | 64px |

The jump from `space-4` (a control's own padding) to `space-6`/`space-8` (a
card's or modal's) is what makes a screen feel spacious rather than merely
tidy.

## Radius

| Token | Value | Usage |
|---|---|---|
| `radius-none` | 0px | Full-bleed media and dividers only |
| `radius-sm` | 4px | Small chips, thumbnails, inline tags |
| `radius-md` | 8px | Inputs, selects and other contained controls |
| `radius-lg` | 16px | Standard cards and list containers |
| `radius-xl` | 24px | Modals, sheets and hero surfaces — anything meant to feel spacious |
| `radius-full` | 9999px | Buttons, badges and avatars — every pill shape in the system |

Every button, badge and avatar is a true pill (`radius-full`), not a very
rounded rectangle.

## Elevation (shadows)

Four levels, each with a light and dark value — dark surfaces need a
stronger, more opaque shadow to read as lifted at all.

| Level | Light (web) | Dark (web) | Usage |
|---|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(28,28,30,.04)` | `0 1px 2px rgba(0,0,0,.5)` | A focused input or a resting list row, lifted by a hair |
| `shadow-sm` | `0 2px 8px rgba(28,28,30,.06)` | `0 2px 8px rgba(0,0,0,.55)` | Cards resting on the canvas |
| `shadow-md` | `0 8px 24px rgba(28,28,30,.10)` | `0 8px 24px rgba(0,0,0,.6)` | Dropdowns, popovers, open selects |
| `shadow-lg` | `0 24px 48px rgba(28,28,30,.16)` | `0 24px 48px rgba(0,0,0,.7)` | Modals and sheets, floating above everything |

Soft and shallow by design — reach for the next level up rather than
increasing an existing shadow's opacity, and never pair a shadow with a
border on the same edge.

## Components

Shared, cross-platform components live in `@zenzoo/ui-web` (React) and
`@zenzoo/ui-native` (React Native), both built from the tokens above:

| Component | Web | Native | Notes |
|---|---|---|---|
| Button | ✅ | ✅ | `primary` / `secondary` / `danger`, always a pill, 44px tall |
| Input | ✅ | ✅ | Filled (no border at rest), focus ring in `accent`, error state in `danger` |
| Select | ✅ | — | Filled field + chevron; the open list is our own floating panel (`radius-md`, `shadow-md`) with a search box (on by default, `searchable={false}` to hide) and keyboard support, not the browser's. Takes an `options` array. `creatable` adds a "+ Add new…" choice that lets the user type a value |
| DatePicker | ✅ | — | Date field that looks like an Input (value shown as "4 Oct 2026", calendar icon) and opens our own month grid (`radius-lg`, `shadow-md`), not the browser's. Monday-first, selected day filled `accent`, today ringed in `accent`, neighbouring months faded. The month title opens a month grid, and its year opens a 12-year grid, so far-off dates take two clicks. Arrow keys move between days, Page Up/Down change month, Esc backs out a level. Value is an ISO `YYYY-MM-DD` string. `clearable={false}` for a required date, `min`/`max` limit the range, `align="right"` for fields near the right edge |
| Switch | ✅ | — | On/off toggle, pill track (`accent` when on, `border` when off), 48×28px, `role="switch"` |
| Chips | ✅ | — | Pill choices where one can be picked (reasons, filters): `radius-full`, 36px tall, picked chip gets an `accent` outline and a `surfaceSunken` fill. Arrow keys move the choice. `columns` lays them out as an even grid (e.g. 3 columns as a segmented control) |
| Pagination | ✅ | — | Sits under a table: "Showing 1-10 of 111", an optional "Rows per page" picker, previous/next and page numbers with gaps (…). The current page is a `surfaceSunken` pill |
| Icon, IconButton | ✅ | — | Outline icons (edit, copy, check, print, close, back, calendar) drawn in the text colour. `IconButton` is a 32px round button for row and header actions; `tone="success"` for a brief confirmation tick |
| Notice | ✅ | — | A short confirmation after an action: `surfaceSunken`, `radius-md`, `space-4` padding, announced to screen readers |
| Tabs | ✅ | — | Text tabs on a hairline; the active tab is `ink` + semibold with a 2px `accent` underline. Arrow keys move between tabs |
| Card | ✅ | ✅ | `radius-lg`, `shadow-sm`, `space-6` padding |
| Table | ✅ | — | Columns share the width equally unless a column sets its own `width`, hairline row dividers, uppercase caption headers, optional column alignment, optional clickable rows (`onRowClick`) |
| Badge | ✅ | — | Neutral pill + a colored status dot, never a tinted background |
| Modal | ✅ | ✅ | `radius-xl`, `shadow-lg`, `space-8` padding |
| Sheet | ✅ | — | Right-edge side panel for add/edit tasks. `radius-xl` on its inner corners, `shadow-lg`, `space-8` padding, 440px wide, light scrim, Esc or scrim click closes. `title` adds the heading and a close button; optional `footer` stays pinned at the bottom while the content scrolls |
| List | — | ✅ | `FlatList` wrapper with hairline separators |

A live, interactive reference of all of the above is at `/style-guide` in
both the Admin and POS apps.

## Where the rules are enforced

`.claude/skills/zenzoo-ui-review/` is a Claude Code skill checked into this
repo that reviews new UI code against this exact system (plus the folder/
architecture rules) — see `references/design-system-rules.md` in that
skill for the full rationale behind each rule above.
