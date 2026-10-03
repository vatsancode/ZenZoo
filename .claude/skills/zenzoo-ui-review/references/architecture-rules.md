# Architecture and folder-structure rules

These are the boundaries the ZenZoo monorepo was scaffolded around. None of them are enforced by
the compiler or a lint rule - they only hold if a reviewer actually checks for them, which is what
this file is for.

## The core principle

ZenZoo has one real business-logic layer: `server/api`'s capabilities, built on top of `modules/`.
POS, Admin, and anything else that needs to do something (place an order, adjust stock, process a
payment) call the same capability through the same pipeline - permission check, policy check,
handler, event/audit. Nothing about that pipeline is optional for a given caller: a read-only actor
hitting an action capability directly must still be rejected server-side, not merely hidden from
in the UI.

The folder rules below all exist to protect that one principle: so that "add a feature" never means
"write the business logic a second time," and so a UI bug can never become a security bug.

## apps/admin and apps/pos

- **`app/`** - navigation and routes only (Next.js App Router pages, Expo Router screens). A file
  here should primarily lay out components and wire them to data; it should not contain the actual
  business rules for what happens when, say, a sale is voided. Some direct state (`useState` for a
  modal's open/closed state, a form's local value) is fine - the line is business *rules*
  (validation beyond basic form shape, calculations, anything that decides whether an action is
  allowed), not all local state.
- **`components/`** - presentational, app-specific UI. These can and should use `@zenzoo/ui-web` /
  `@zenzoo/ui-native` as building blocks, and can hold layout/display logic, but shouldn't call a
  capability or make a network request themselves - that belongs in `services/` (POS) or a
  data-fetching layer the screen wires up.
- **`features/`** - only exists for a workflow that's actually been implemented end to end. Flag an
  empty or speculative `features/<name>/` folder created for a workflow that isn't built yet - the
  project deliberately avoids pre-creating structure for imagined future work.
- **`apps/pos/services/{api,local-db,sync}`** - must stay thin wrappers around network/storage
  calls. The one hard rule: **no UI component may make a network call directly.** Every request
  goes through `services/api`, even today, before there's an offline story - that's what keeps the
  POS architecturally able to go offline-first later without a UI rewrite. If you see `fetch` or
  similar called from inside `app/` or `components/`, that's a violation regardless of how small
  the call looks.

## server/api

- Business logic lives in `modules/`, organized by domain, and is exposed to every caller (POS,
  Admin, internal AI, external agents) through `capabilities/{reads,actions}` - never
  reimplemented per caller. If you see what's clearly the same business rule written twice (once
  inline in a POS-facing handler, again in an Admin-facing one), that's the single most expensive
  kind of drift this project is trying to avoid: the two copies start identical and silently
  diverge from the first bug fix that only touches one of them.
- A capability's permission and policy checks happen in `auth/`/`policies/` and must run
  server-side inside the capability pipeline itself - not merely in a UI condition that decides
  whether to show a button. A UI hiding an action from an unauthorized user is a nice-to-have; the
  capability rejecting that same user if they call it directly is the actual security boundary.
  Flag any capability handler that looks like it skips or only partially runs the permission/policy
  step.
- UI code (anywhere in `apps/`) must never import Prisma or query the database directly. All data
  access from a screen goes through a capability call - an `import { prisma }` or equivalent
  anywhere under `apps/` is always worth flagging.

## Shared packages

- `packages/types` holds genuinely shared TypeScript types only - no business logic. A function
  with real behavior (not a type guard) showing up here is worth a second look.
- `packages/design-tokens`, `packages/ui-web`, `packages/ui-native` should stay platform-boundary
  code: tokens, theming, and presentational components. They should never import from `apps/*` or
  `server/*` (that would invert the dependency direction the whole monorepo is built on), and
  `ui-web`/`ui-native` should never contain logic that's specific to one screen or workflow - that
  belongs in the app that uses it.
