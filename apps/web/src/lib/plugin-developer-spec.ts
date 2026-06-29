/** Host-enforced limits and contracts — keep in sync with @cfb/plugin-wasm and apps/api/plugins.ts */



export const PLUGIN_LIMITS = {

  wasmMaxBytes: 2 * 1024 * 1024,

  hookTimeoutMs: 50,

  wasmMaxMemoryBytes: 8 * 1024 * 1024,

  wasmMaxMemoryPages: 128,

  skeletonPageMax: 100,

} as const



export const PLUGIN_HOOKS = {

  ranker: 'on_sort',

  injector: 'on_inject',

} as const



export const EXAMPLE_WASM_URL = '/plugin-examples/reverse-rank.wasm'

export const EXAMPLE_WASM_NAME = 'reverse-rank.wasm'

export const EXAMPLE_REPO_PATH = 'examples/cfb-plugin-reverse-rank'



export const PIPELINE_STEPS = [

  'Pool sort (sort pack at candidate build)',

  'Serve-time personalization (on_sort)',

  'Serve-time injector (on_inject)',

  'Skeleton response',

] as const



export const RUNTIME_ROWS = [

  {

    id: 'native',

    label: 'Native',

    latency: '~0.01 ms',

    notes: 'Built-in adapters (pinned URIs, static URI lists). Config only — no upload.',

  },

  {

    id: 'wasm',

    label: 'WASM',

    latency: '~0.5–2 ms (cached)',

    notes: 'Extism sandbox in-process. Module cached by sha256. Lowest custom-code latency.',

  },

  {

    id: 'worker',

    label: 'Worker',

    latency: '~2–5 ms',

    notes: 'Same WASM module on a worker thread. Extra isolation from the API event loop.',

  },

  {

    id: 'remote',

    label: 'Remote',

    latency: '0 ms local',

    notes: 'HTTPS POST to your endpoint. You host compute and networking.',

  },

] as const



export const VERIFICATION_ROWS = [

  {

    action: 'Create custom code (ranker / injector)',

    requirement: 'Deployment verified or global verified',

  },

  {

    action: 'Publish to this deployment',

    requirement: 'Deployment verified (matching deployment)',

  },

  {

    action: 'Publish to global marketplace',

    requirement: 'Global verified (fema.monster operator)',

  },

  {

    action: 'Create logic blocks or sort packs',

    requirement: 'No verification (native JSON only)',

  },

] as const



export const RANKER_REQUEST_EXAMPLE = `{
  "feedId": "my-feed",
  "limit": 50,
  "candidates": [
    "at://did:plc:example/app.bsky.feed.post/abc",
    "at://did:plc:example/app.bsky.feed.post/def"
  ],
  "candidatePosts": [
    {
      "uri": "at://did:plc:example/app.bsky.feed.post/abc",
      "authorDid": "did:plc:author1",
      "indexedAt": "2026-06-17T10:00:00.000Z",
      "likeCount": 12,
      "repostCount": 2,
      "replyCount": 1,
      "quoteCount": 0,
      "authorFollowerCount": 800,
      "hasMedia": false,
      "hasAltText": true,
      "facetTagCount": 1,
      "labelVals": ["porn"]
    }
  ],
  "viewerDid": "did:plc:viewer",
  "viewer": {
    "viewerDid": "did:plc:viewer",
    "followedAuthorDids": ["did:plc:author1"],
    "servedPosts": [],
    "likedPostUris": [],
    "repostedPostUris": []
  },
  "config": { "preset": "balanced" }
}`



export const RANKER_RESPONSE_EXAMPLE = `{ "uris": ["at://did:plc:example/app.bsky.feed.post/def", "at://did:plc:example/app.bsky.feed.post/abc"] }`



export const INJECTOR_REQUEST_EXAMPLE = `{

  "feedId": "my-feed",

  "limit": 50,

  "slots": { "every": 8, "maxPerPage": 2 },

  "config": {}

}`



export const INJECTOR_RESPONSE_EXAMPLE = `{ "uris": ["at://did:plc:promo/app.bsky.feed.post/xyz"] }`



export const MANIFEST_EXAMPLE = `{

  "id": "my-reverse-ranker",

  "version": "1.0.0",

  "kind": "ranker",

  "runtime": "wasm",

  "hooks": ["on_sort"],

  "permissions": [],

  "configSchema": {},

  "disclosure": "Reorders skeleton candidates at serve time."

}`



export const EXAMPLE_RANKER_RUST = `use extism_pdk::*;

use serde::{Deserialize, Serialize};



#[derive(Deserialize)]

struct RankRequest {

    #[serde(rename = "feedId")]

    feed_id: String,

    limit: u32,

    candidates: Vec<String>,

    config: serde_json::Value,

}



#[derive(Serialize)]

struct RankResponse {

    uris: Vec<String>,

}



/// Reorder skeleton candidates — this demo reverses the list.

#[plugin_fn]

pub fn on_sort(input: String) -> FnResult<String> {

    let req: RankRequest = serde_json::from_str(&input)?;

    let mut uris = req.candidates;

    uris.reverse();

    Ok(serde_json::to_string(&RankResponse { uris })?)

}`



export const EXAMPLE_INJECTOR_RUST = `use extism_pdk::*;

use serde::{Deserialize, Serialize};



#[derive(Deserialize)]

struct InjectRequest {

    #[serde(rename = "feedId")]

    feed_id: String,

    limit: u32,

    slots: Slots,

    config: serde_json::Value,

}



#[derive(Deserialize)]

struct Slots {

    every: u32,

    #[serde(rename = "maxPerPage")]

    max_per_page: u32,

}



#[derive(Serialize)]

struct InjectResponse {

    uris: Vec<String>,

}



/// Return promo URIs — CFB merges them respecting slot caps.

#[plugin_fn]

pub fn on_inject(input: String) -> FnResult<String> {

    let req: InjectRequest = serde_json::from_str(&input)?;

    let uris: Vec<String> = req

        .config

        .get("uris")

        .and_then(|v| v.as_array())

        .map(|arr| {

            arr.iter()

                .filter_map(|v| v.as_str().map(String::from))

                .collect()

        })

        .unwrap_or_default();

    Ok(serde_json::to_string(&InjectResponse { uris })?)

}`



export const BUILD_COMMANDS = `# Rust + Extism PDK (from repo root)

rustup target add wasm32-wasip1

cd examples/cfb-plugin-reverse-rank

cargo build --release --target wasm32-wasip1

# Artifact: target/wasm32-wasip1/release/cfb_plugin_reverse_rank.wasm



# Windows (GNU toolchain if MSVC link.exe is missing):

cargo +stable-x86_64-pc-windows-gnu build --release --target wasm32-wasip1`


