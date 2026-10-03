# Services

Application services and integrations. No UI component or screen calls the
network directly - everything goes through `api/`, so that `api/` can later
be rerouted to read/write `local-db/` first (offline-first) without
touching a single screen.

```
POS UI -> services -> api   (today)
POS UI -> services -> local-db -> sync -> backend   (future, not built yet)
```

- `api/` - the HTTP client POS screens actually call today.
- `local-db/` - interface only for now; no SQLite wired up yet.
- `sync/` - interface only for now; no sync engine wired up yet.

Do not implement the sync engine or add PowerSync yet - the goal right now
is only that nothing upstream of this folder needs to change when that
happens later.
