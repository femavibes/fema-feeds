//! CFB example ranker plugin — reverses the candidate URI list.
//! Export: `on_sort` (Extism PDK)

use extism_pdk::*;
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

/// Reorder skeleton candidates. This demo reverses the list.
#[plugin_fn]
pub fn on_sort(input: String) -> FnResult<String> {
    let req: RankRequest = serde_json::from_str(&input).map_err(|e| Error::msg(e.to_string()))?;
    let mut uris = req.candidates;
    uris.reverse();
    Ok(serde_json::to_string(&RankResponse { uris }).map_err(|e| Error::msg(e.to_string()))?)
}
