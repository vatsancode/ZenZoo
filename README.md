# ZenZoo

A multi-tenant retail/F&B platform. This repository is a pnpm + Turborepo
monorepo covering the POS app, the admin web app, the backend API, and the
shared packages between them.

This is the **foundation only** - architecture and boundaries, not business
features. Domains, features, and capabilities are added progressively as
each product workflow is actually built (see "How this repo grows", below).

## Structure

```
zenzoo/
├── apps/
│   ├── pos/          React Native (Expo) + TypeScript - the POS app
│   └── admin/        Next.js + TypeScript - the admin web app
│
├── server/
│   └── api/          Node.js + TypeScript - the backend. All business
│                      logic lives here; POS, Admin, and any future AI/MCP
│                      interface call the same capabilities, never their own
│                      copy of the logic.
│
├── packages/
│   ├── design-tokens/  Colors, typography, spacing, radius, shadows -
│   │                    the one source of design values for both UI libs.
│   ├── ui-web/         Shared React components for Next.js/web.
│   ├── ui-native/      Shared React Native components.
│   ├── types/          Genuinely shared TypeScript types. No business logic.
│   └── config/         Shared tsconfig/eslint/prettier base configs.
│
├── docs/
│   ├── requirements.md   Product requirements.
│   └── db-design.md      The database design (source of truth for the schema).
│
└── prisma/
    └── schema.prisma     Generated from docs/db-design.md's schema via
                           introspection - see prisma/README.md.
```

There is no Figma dependency. `design-tokens` → `ui-web`/`ui-native` is the
entire design system, and it is code-owned from day one.

## Prerequisites

- Node.js >= 20
- pnpm 10.x (`corepack enable` will pick up the pinned version)
- A local PostgreSQL instance for the database (see `prisma/README.md`)

## Getting started

```sh
pnpm install

# copy env examples and fill in real values
cp server/api/.env.example server/api/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/pos/.env.example apps/pos/.env
cp prisma/.env.example prisma/.env

# generate the Prisma client
pnpm db:generate

# run everything in dev mode
pnpm dev
```

`pnpm dev` runs each app's own dev server in parallel via Turborepo:
Next.js (admin), Expo (POS), and the API (`tsx watch`).

## Common commands

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `pnpm build`       | Builds every app/package that has a build step            |
| `pnpm lint`        | Lints every workspace                                     |
| `pnpm typecheck`   | Type-checks every workspace                               |
| `pnpm format`      | Formats the repo with Prettier                            |
| `pnpm db:generate` | Regenerates the Prisma client from `prisma/schema.prisma` |
| `pnpm db:migrate`  | Creates/applies a dev migration                           |
| `pnpm db:studio`   | Opens Prisma Studio against the configured database       |

## How this repo grows

Domains are **discovered progressively**, not designed upfront:

```
Design a workflow → Build the UI → Understand the business operation →
Identify the domain → Identify required reads/actions →
Define the capability contract → Add permissions/policies →
Implement backend logic
```

Concretely: `server/api/modules/*`, `capabilities/reads/*`,
`capabilities/actions/*`, and the apps' own `features/*` folders start
empty and only ever gain a folder when that specific workflow is actually
being built - never a batch of empty domain folders created in advance.

## What's deliberately not here yet

Redis, Kafka, Python, PowerSync, MCP servers, vector databases, a sync
engine, and an AI agent framework are all out of scope for this foundation.
The architecture (see `server/api/capabilities`, `apps/pos/services`) is
shaped so each of these can be introduced later without a rewrite - they
are simply not needed yet.
