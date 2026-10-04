# Auth

Where a request's JWT is verified and turned into a `CapabilityActor`
(`@zenzoo/types`) - and where that actor's permissions are looked up.

Nothing in here enforces authorization by itself; `capabilities/capability.ts`
is what actually calls `hasPermission()` before a capability runs. This
folder is only responsible for answering two questions correctly:

1. Who is making this request? (`getActor`)
2. What is this actor allowed to do? (`hasPermission`)

No concrete auth provider is wired up yet - see docs/db-design.md's `users`
table notes: identity/credential storage is deliberately deferred to
whichever provider is chosen (Supabase Auth, Clerk, custom). `getActor`
below is the integration point for that decision, not a replacement for it.
