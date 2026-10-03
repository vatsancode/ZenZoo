# Design-system compliance rules

For each rule: what to look for, and why it's worth catching. Current token names/values live in
`packages/design-tokens/src/*` - confirm against those files, this document explains the _rules_,
not the authoritative value list.

## 1. Color must come from `useTheme()`, never a literal

Every color a component sets - background, text, border, fill - should be read from the `colors`
object returned by `useTheme()` (web: `@zenzoo/design-tokens`'s `useTheme`, native: the same hook
re-exported through `@zenzoo/ui-native`). Flag:

- A hex/rgb/hsl color literal anywhere in a component's style (`"#1c1c1e"`, `backgroundColor:
"white"`, etc.).
- A reference to a color token name that isn't in the current `ColorTokens` interface - this
  usually means either a typo or a leftover reference to a token that was renamed (older code in
  this repo used `primary`, `background`, `surface`, `textPrimary`, `textSecondary`,
  `textInverse`, `neutral`, `brand` - none of these exist anymore).
- Colors read from a static import (`lightColors`, `darkColors`) instead of `useTheme().colors`.
  This compiles fine but silently breaks dark mode: the component will always render the theme it
  happened to import, regardless of the viewer's actual preference.

**Why it matters**: a literal color can't respond to light/dark mode, and when the palette changes
later (a brand refresh, a contrast fix), every hardcoded value is a place that was supposed to
update automatically and didn't.

## 2. Text must use a named text style, not raw font properties

Every piece of text styling - size, weight, line height, letter spacing - should come from
`textStyle(name)` (exported from both `@zenzoo/ui-web` and `@zenzoo/ui-native`), which maps a named
style (`"body"`, `"headline"`, `"caption"`, etc.) to the full set of properties at once. Flag:

- A raw `fontSize: 16` (or any number) set directly instead of spreading `textStyle("body")`.
- `fontWeight`/`lineHeight` set independently of a named style - these three almost always need to
  move together, and setting them separately is how a component drifts from the type scale one
  property at a time.
- A new one-off text size that doesn't correspond to any existing named style. If a screen
  genuinely needs a size the scale doesn't have, that's a design-tokens change to propose, not a
  reason to hand-roll one `fontSize` value in a single component.

**Why it matters**: the type scale exists so every screen reads at a small, deliberate set of
sizes. A one-off `fontSize: 17` next to the real `headline` style (also 17px) looks identical today
and silently diverges the moment the scale is tuned.

## 3. Spacing must come from the spacing scale

Padding, margin, and gap values should be `spacing[n]` (imported directly, or via
`useTheme().spacing`), not an arbitrary pixel number. Flag any numeric padding/margin/gap literal
that isn't one of the current spacing scale's values. On `apps/pos` specifically, also check that
tappable elements (buttons, list rows, anything with an `onPress`) are at least 44px in their
smallest dimension - the design system's own rule for a touch target on a counter, independent of
what the spacing scale would otherwise suggest for that element.

**Why it matters**: the spacing scale is what makes "spacious" mean something consistent across
screens. A handful of one-off pixel values is how a layout drifts from generously-spaced to
cramped without anyone deciding that on purpose.

## 4. Radius must match what the element _is_, not just look right

Current mapping (confirm against `packages/design-tokens/src/radius/index.ts`):

- `radius.full` - buttons, badges, avatars. Every pill-shaped element is a true pill.
- `radius.xl` - modals, sheets, hero cards - anything meant to anchor a screen.
- `radius.lg` - standard cards and list containers.
- `radius.md` - inputs, selects, other contained form controls.
- `radius.sm` - small chips, thumbnails, inline tags only.

Flag a numeric radius literal, and flag a token used on the wrong _kind_ of element (e.g.
`radius.lg` on a button, or `radius.sm` on a card) even when the number might look fine - the rule
is about what the element is, not what looks acceptable in isolation. Mixing radius steps across
sibling elements of the same kind (two cards on one screen with different radii) is also worth
flagging.

**Why it matters**: consistent radius-by-role is a big part of why the system reads as "one
system" rather than a pile of components that each made their own call.

## 5. Shadows come from `elevation`, and never pair with a border

Shadows should be `elevation.<level>.web` (CSS) or `elevation.<level>.native` (spread into a
`StyleSheet`), read from `useTheme().elevation`, not a hand-written `boxShadow` string or
`shadowColor`/`shadowOpacity`/etc. set individually. Separately: a surface should get a `border`
**or** an elevation shadow to separate it from what's behind it, never both at once - check for a
component that sets both a `colors.border` border and a non-`none` elevation on the same element.

**Why it matters**: hand-rolled shadows don't adapt between light and dark (dark surfaces need a
much stronger, more opaque shadow to read as lifted at all - see the theme-aware values in
`shadows/index.ts`). Pairing a border with a shadow doubles the visual separation and is one of the
most common ways a screen ends up looking busier than the rest of the system.

## 6. A component must actually read the theme live

A component using any color or elevation value must call `useTheme()` itself (or receive the
resolved values as props from something that did) rather than computing styles once at module load
time from a static import. A `const styles = StyleSheet.create({...})` (React Native) built outside
the component function, referencing colors directly, is a strong signal of this: it can only ever
reflect whichever theme was active when the module first evaluated. Flag it and suggest moving the
style computation inside the component, after calling `useTheme()`.
