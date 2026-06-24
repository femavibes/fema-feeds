# List sources

Modular author list resolution. Projects reference **sources**; runtime resolves them to DIDs.

## Source types (v1)

| Type | Config | Notes |
|------|--------|-------|
| `manual_dids` | `{ "dids": ["did:plc:..."] }` | Static paste |
| `bluesky_list` | `{ "uri": "at://... or https://..." }` | Curate lists **and moderation lists** (same API) |
| `bluesky_starter_pack` | `{ "uri": "https://bsky.app/starter-pack/..." }` | Resolves via getStarterPack → backing list |

## URL formats

**Lists & mod lists** (both use `app.bsky.graph.list`):
- `at://did:plc:xxx/app.bsky.graph.list/3jxxxx`
- `https://bsky.app/profile/handle/lists/3jxxxx`
- `https://bsky.app/profile/did:plc:xxx/lists/3jxxxx`

**Starter packs**:
- `at://did:plc:xxx/app.bsky.graph.starterpack/3jxxxx`
- `https://bsky.app/starter-pack/did:plc:xxx/3jxxxx`
- `https://bsky.app/starter-pack/handle/3jxxxx`

Poll `pollIntervalMinutes` (default 60) — lists change when people follow/unfollow.

## Adding a new source type

1. Add variant to `ListSource` in `@cfb/core-types`
2. Implement resolver in `packages/list-sources/src/resolve.ts`
3. Document here

No changes to L1 filters required.
