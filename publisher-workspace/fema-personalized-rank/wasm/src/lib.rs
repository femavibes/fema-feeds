//! CFB ranker plugin — Near You-inspired global scoring (no geo/viewer).
//! Export: `on_sort` (Extism PDK)

use extism_pdk::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
struct RankerCandidate {
    uri: String,
    #[serde(rename = "authorDid")]
    author_did: String,
    #[serde(rename = "indexedAt")]
    indexed_at: String,
    #[serde(rename = "likeCount", default)]
    like_count: f64,
    #[serde(rename = "repostCount", default)]
    repost_count: f64,
    #[serde(rename = "replyCount", default)]
    reply_count: f64,
    #[serde(rename = "quoteCount", default)]
    quote_count: f64,
    #[serde(rename = "authorFollowerCount", default)]
    author_follower_count: f64,
    #[serde(rename = "hasMedia", default)]
    has_media: bool,
    #[serde(rename = "hasAltText", default = "default_true")]
    has_alt_text: bool,
    #[serde(rename = "facetTagCount", default)]
    facet_tag_count: u32,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
struct RankRequest {
    #[serde(rename = "feedId")]
    feed_id: String,
    limit: u32,
    candidates: Vec<String>,
    #[serde(rename = "candidatePosts")]
    candidate_posts: Option<Vec<RankerCandidate>>,
    config: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct RankResponse {
    uris: Vec<String>,
}

#[derive(Clone)]
struct ScoringConfig {
    freshness_halflife_hours: f64,
    freshness_exponent: f64,
    like_weight: f64,
    repost_weight: f64,
    reply_weight: f64,
    quote_weight: f64,
    engagement_exponent: f64,
    cold_start_min: f64,
    media_multiplier: f64,
    alt_text_penalty: f64,
    alt_text_enabled: bool,
    hashtag_post_weight: f64,
    follower_norm_enabled: bool,
    follower_norm_baseline_rate: f64,
    follower_norm_max_boost: f64,
    follower_norm_min_followers: f64,
    follower_norm_boost_damp_rate: f64,
    follower_norm_penalty_amp_rate: f64,
    velocity_boost_enabled: bool,
    velocity_baseline_percentile: f64,
    velocity_cap: f64,
    diversity_enabled: bool,
    diversity_min_gap: usize,
}

impl Default for ScoringConfig {
    fn default() -> Self {
        Self {
            freshness_halflife_hours: 24.0,
            freshness_exponent: 1.5,
            like_weight: 1.0,
            repost_weight: 0.5,
            reply_weight: 0.75,
            quote_weight: 0.5,
            engagement_exponent: 0.6,
            cold_start_min: 1.0,
            media_multiplier: 1.05,
            alt_text_penalty: 0.85,
            alt_text_enabled: true,
            hashtag_post_weight: 0.95,
            follower_norm_enabled: true,
            follower_norm_baseline_rate: 0.01,
            follower_norm_max_boost: 2.5,
            follower_norm_min_followers: 50.0,
            follower_norm_boost_damp_rate: 0.15,
            follower_norm_penalty_amp_rate: 0.2,
            velocity_boost_enabled: true,
            velocity_baseline_percentile: 75.0,
            velocity_cap: 3.0,
            diversity_enabled: true,
            diversity_min_gap: 3,
        }
    }
}

fn resolve_config(config: &Option<serde_json::Value>) -> ScoringConfig {
    let mut cfg = ScoringConfig::default();
    let Some(v) = config else {
        return cfg;
    };
    if let Some(preset) = v.get("preset").and_then(|p| p.as_str()) {
        match preset {
            "fresh" => {
                cfg.freshness_halflife_hours = 12.0;
                cfg.freshness_exponent = 2.0;
                cfg.velocity_boost_enabled = false;
            }
            "engagement" => {
                cfg.freshness_halflife_hours = 48.0;
                cfg.freshness_exponent = 1.0;
                cfg.repost_weight = 1.0;
                cfg.reply_weight = 1.0;
                cfg.engagement_exponent = 0.75;
                cfg.velocity_cap = 4.0;
            }
            _ => {}
        }
    }
    if let Some(gap) = v.get("diversityMinGap").and_then(|g| g.as_i64()) {
        cfg.diversity_min_gap = gap.clamp(0, 10) as usize;
    }
    cfg
}

fn parse_time_ms(iso: &str) -> Option<f64> {
    chrono::DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|dt| dt.timestamp_millis() as f64)
}

fn age_hours(post: &RankerCandidate, now_ms: f64) -> f64 {
    parse_time_ms(&post.indexed_at)
        .map(|t| ((now_ms - t) / 3_600_000.0).max(0.0))
        .unwrap_or(0.0)
}

fn velocity_baseline(posts: &[RankerCandidate], now_ms: f64, percentile: f64) -> f64 {
    let mut rates: Vec<f64> = posts
        .iter()
        .map(|p| p.like_count / age_hours(p, now_ms).max(0.25))
        .collect();
    if rates.is_empty() {
        return 1.0;
    }
    rates.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = ((rates.len() - 1) as f64 * (percentile / 100.0)).floor() as usize;
    rates[idx].max(0.1)
}

fn score_post(post: &RankerCandidate, cfg: &ScoringConfig, now_ms: f64, velocity_baseline: f64) -> f64 {
    let hours = age_hours(post, now_ms);
    let freshness = (0.5_f64).powf(hours / cfg.freshness_halflife_hours).powf(cfg.freshness_exponent);

    let raw = cfg.cold_start_min
        + cfg.like_weight * post.like_count
        + cfg.repost_weight * post.repost_count
        + cfg.reply_weight * post.reply_count
        + cfg.quote_weight * post.quote_count;
    let engagement = raw.max(0.0).sqrt().powf(cfg.engagement_exponent);

    let velocity = if cfg.velocity_boost_enabled {
        let rate = post.like_count / hours.max(0.25);
        if rate > velocity_baseline {
            (rate / velocity_baseline).min(cfg.velocity_cap)
        } else {
            1.0
        }
    } else {
        1.0
    };

    let follower_norm = if cfg.follower_norm_enabled && post.author_follower_count >= cfg.follower_norm_min_followers {
        let engagement_rate =
            (post.like_count + post.repost_count + post.reply_count) / post.author_follower_count.max(1.0);
        if engagement_rate >= cfg.follower_norm_baseline_rate {
            let excess = engagement_rate / cfg.follower_norm_baseline_rate;
            (1.0 / (1.0 + cfg.follower_norm_boost_damp_rate * (excess - 1.0)))
                .max(1.0 / cfg.follower_norm_max_boost)
        } else {
            let deficit = cfg.follower_norm_baseline_rate / engagement_rate.max(1e-6);
            (1.0 + cfg.follower_norm_penalty_amp_rate * (deficit - 1.0)).min(cfg.follower_norm_max_boost)
        }
    } else {
        1.0
    };

    let media = if post.has_media { cfg.media_multiplier } else { 1.0 };
    let alt = if cfg.alt_text_enabled && post.has_media && !post.has_alt_text {
        cfg.alt_text_penalty
    } else {
        1.0
    };
    let hashtag = if post.facet_tag_count > 0 {
        cfg.hashtag_post_weight
    } else {
        1.0
    };

    freshness * engagement * velocity * follower_norm * media * alt * hashtag
}

struct Scored {
    uri: String,
    author_did: String,
    score: f64,
}

fn apply_diversity(mut posts: Vec<Scored>, min_gap: usize) -> Vec<Scored> {
    if min_gap == 0 {
        return posts;
    }
    posts.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let mut result: Vec<Scored> = Vec::with_capacity(posts.len());
    let mut last_author: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut used = std::collections::HashSet::new();

    for post in posts.iter() {
        if let Some(&last_idx) = last_author.get(&post.author_did) {
            if result.len() - last_idx < min_gap {
                continue;
            }
        }
        last_author.insert(post.author_did.clone(), result.len());
        used.insert(post.uri.clone());
        result.push(Scored {
            uri: post.uri.clone(),
            author_did: post.author_did.clone(),
            score: post.score,
        });
    }
    for post in posts.iter() {
        if !used.contains(&post.uri) {
            result.push(Scored {
                uri: post.uri.clone(),
                author_did: post.author_did.clone(),
                score: post.score,
            });
        }
    }
    result
}

fn posts_from_request(req: &RankRequest) -> Vec<RankerCandidate> {
    if let Some(posts) = &req.candidate_posts {
        let by_uri: std::collections::HashMap<_, _> = posts.iter().map(|p| (p.uri.clone(), p.clone())).collect();
        return req
            .candidates
            .iter()
            .filter_map(|u| by_uri.get(u).cloned())
            .collect();
    }
    req.candidates
        .iter()
        .enumerate()
        .map(|(i, uri)| RankerCandidate {
            uri: uri.clone(),
            author_did: format!("did:unknown:{i}"),
            indexed_at: chrono::Utc::now().to_rfc3339(),
            like_count: 0.0,
            repost_count: 0.0,
            reply_count: 0.0,
            quote_count: 0.0,
            author_follower_count: 0.0,
            has_media: false,
            has_alt_text: true,
            facet_tag_count: 0,
        })
        .collect()
}

#[plugin_fn]
pub fn on_sort(input: String) -> FnResult<String> {
    let req: RankRequest = serde_json::from_str(&input).map_err(|e| Error::msg(e.to_string()))?;
    let cfg = resolve_config(&req.config);
    let posts = posts_from_request(&req);
    let now_ms = chrono::Utc::now().timestamp_millis() as f64;
    let baseline = velocity_baseline(&posts, now_ms, cfg.velocity_baseline_percentile);

    let mut scored: Vec<Scored> = posts
        .iter()
        .map(|p| Scored {
            uri: p.uri.clone(),
            author_did: p.author_did.clone(),
            score: score_post(p, &cfg, now_ms, baseline),
        })
        .collect();

    if cfg.diversity_enabled {
        scored = apply_diversity(scored, cfg.diversity_min_gap);
    } else {
        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    }

    let uris: Vec<String> = scored.into_iter().map(|s| s.uri).collect();
    Ok(serde_json::to_string(&RankResponse { uris }).map_err(|e| Error::msg(e.to_string()))?)
}
