---
name: zenzoo-ui-review
description: Reviews ZenZoo UI code (apps/admin, apps/pos, packages/ui-web, packages/ui-native, and any component or screen touching them) against the project's own design system and folder-structure rules. Use this whenever UI, screen, or component code changes anywhere in the ZenZoo monorepo - reviewing a diff, a PR, or a just-written component - and whenever the user asks if code "follows the style guide," "matches the design system," "is in the right place," "looks right," or asks for a UI, styling, or architecture review. Trigger it proactively after writing or editing any .tsx file under apps/ or packages/ui-*, even if the user only asked for the feature itself and didn't explicitly request a review.
---

# ZenZoo UI review

This project has two sources of drift that are easy to introduce without noticing, because nothing
stops the code from compiling or running when they happen:

1. **Visual drift** - a component reaches for a hardcoded hex color, a raw pixel number, or a
   hand-written shadow instead of the design system's tokens. It looks _almost_ right today, then
   quietly stops matching everything else the moment the palette or spacing scale changes, and it
   won't follow light/dark mode at all.
2. **Architectural drift** - business logic creeps into a screen or component, a service makes a
   network call UI should never make directly, or logic gets duplicated between POS and Admin
   instead of living once in a shared capability. None of this fails a build; it just makes the
   codebase harder to trust every time it happens.

Your job is to catch both kinds of drift before they land, by reading the actual current token
definitions and architecture docs in this repo (never from memory - they change) and comparing the
changed code against them.

## Before you start: read the live sources, not this file's memory of them

Token names and values _will_ change as the product grows. Don't rely on examples below as a fixed
list - always check the real files first:

- `packages/design-tokens/src/colors/index.ts` - the current `ColorTokens` interface is the
  complete, authoritative list of valid color keys.
- `packages/design-tokens/src/typography/index.ts` - the current `textStyles` object is the
  complete list of valid named text styles.
- `packages/design-tokens/src/radius/index.ts` and `src/spacing/index.ts` - the current radius and
  spacing scales.
- `packages/design-tokens/src/shadows/index.ts` - the current elevation levels.

If a changed file uses a token name that doesn't appear in these files, that's not a style
preference - it's either a typo, a reference to a token that was renamed or removed, or a value
that was never a token to begin with.

## Step 1: Design-system compliance

Read `references/design-system-rules.md` for the full rule set (color, typography, spacing,
radius, elevation, and the "theme-live" requirement) with the reasoning behind each one. The short
version: every visual value in a component should trace back to `useTheme()` or the
`textStyle()` helper, not a literal.

**One important exception**: the `/style-guide` pages themselves (`apps/admin/app/style-guide/`,
`apps/pos/app/style-guide.tsx`) and `packages/design-tokens/src/styleGuideContent.ts` exist
specifically to enumerate and display every raw token value - that's the one place iterating over
`Object.entries(colors)` or printing a literal hex string is correct, not a violation. Don't flag
them for doing the thing they're for.

## Step 2: Architecture and folder-structure compliance

Read `references/architecture-rules.md` for the full rule set on where code is allowed to live:
what `app/`, `components/`, `features/`, and `services/` may and may not contain in each app, and
how backend logic must flow through `server/api/capabilities/` rather than being duplicated or
reached into directly.

## How to review

1. Identify the changed files (from the diff, PR, or files just written).
2. For each changed `.tsx`/`.ts` file under `apps/` or `packages/ui-*`, check it against both
   reference files above. Open the live token files when you need to confirm a name or value is
   current.
3. For each violation, note the exact file and line, what rule it breaks, and why it matters in
   practice (not just "doesn't follow convention" - say what actually goes wrong: it won't follow
   dark mode, it duplicates logic that now has two places to drift apart, etc.).
4. Prefer a concrete fix over a vague note - name the token or pattern that should be used instead.

## Output format

Report findings with the `ReportFindings` tool, most-severe first, the same way the `/code-review`
skill does. Use `category` values `design-system` or `architecture` to tell the two kinds of
finding apart at a glance. Architecture violations (business logic in a UI component, a UI
component calling Prisma or the network directly, duplicated logic between POS and Admin) are more
severe than a styling literal, which in turn is more severe than a minor token-choice mismatch
(e.g. `radius.lg` on a modal that should be `radius.xl`). If nothing is wrong, report an empty
findings list rather than inventing something to say.
