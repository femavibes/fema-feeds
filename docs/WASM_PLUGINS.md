# CFB WASM plugins

Verified publishers can upload compiled **WebAssembly** modules for ranker (`on_sort`) and injector (`on_inject`) packages.

**In-app docs:** Collection → **Plugin developer guide** (full contracts, limits, publish flow, and a downloadable example WASM).

## Efficiency

| Runtime | Typical cost per skeleton page | Notes |
|---------|-------------------------------|--------|
| **Native** | ~0.01 ms | Built-in adapters |
| **WASM (cached)** | ~0.5–2 ms | Module compiled once per version; fine for 50–100 URIs |
| **Worker** | ~2–5 ms | Same WASM + thread IPC; isolates CPU from API event loop |
| **Remote** | 0 ms local | Your server does the work |

WASM is a good fit for feed skeleton hooks — small inputs, short CPU bursts, modules stay hot in cache.

## Contract (Extism)

Build plugins with the [Extism PDK](https://extism.org/docs/quickstart/plugin-quickstart) (Rust, Go, JavaScript, Python, etc.).

### Ranker — export `on_sort`

**Input JSON:**

```json
{
  "feedId": "my-feed",
  "limit": 50,
  "candidates": ["at://did:plc:…/app.bsky.feed.post/abc"],
  "config": {}
}
```

**Output JSON:**

```json
{ "uris": ["at://…"] }
```

Return a reordering of `candidates` (subset allowed; missing URIs are appended by CFB).

### Injector — export `on_inject`

**Input JSON:**

```json
{
  "feedId": "my-feed",
  "limit": 50,
  "slots": { "every": 8, "maxPerPage": 2 },
  "config": {}
}
```

**Output JSON:**

```json
{ "uris": ["at://promo/…"] }
```

CFB enforces slot caps when merging into the skeleton.

## Publish flow

1. **New custom code** (verified publisher) → runtime **WASM** or **Worker**
2. Upload `.wasm` in collection detail (max 2 MB)
3. Publish to deployment or global
4. Subscribers apply on feed **Sorting** tab

## Limits (enforced by host)

- **Timeout:** 50 ms per hook call
- **Memory:** 8 MB linear memory
- **Artifact size:** 2 MB max
- **Sandbox:** Extism/WASI — no DB or network from guest unless explicit host functions are added later

## Worker vs WASM runtime

- **`wasm`** — in-process on the API host (module cache keyed by sha256)
- **`worker`** — same module via Extism worker thread when supported

Choose **worker** to keep plugin CPU off the main event loop; choose **wasm** for lowest latency.
