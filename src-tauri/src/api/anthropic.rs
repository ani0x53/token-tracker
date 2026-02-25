use chrono::{Duration, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::storage::UsageSnapshot;

#[derive(Debug, Deserialize)]
struct AnthropicUsageResponse {
    data: Option<Vec<Value>>,
}

/// Pricing per 1M tokens (input / output) as of early 2025 — best-effort.
fn model_price(model: &str) -> (f64, f64) {
    // (input_per_mtok, output_per_mtok)
    if model.contains("claude-opus-4") || model.contains("claude-opus-3-5") {
        (15.0, 75.0)
    } else if model.contains("claude-sonnet-4") || model.contains("claude-sonnet-3-5") {
        (3.0, 15.0)
    } else if model.contains("claude-haiku-4") || model.contains("claude-haiku-3-5") {
        (0.8, 4.0)
    } else if model.contains("claude-haiku-3") {
        (0.25, 1.25)
    } else if model.contains("claude-opus") {
        (15.0, 75.0)
    } else if model.contains("claude-sonnet") {
        (3.0, 15.0)
    } else if model.contains("claude-haiku") {
        (0.25, 1.25)
    } else {
        (3.0, 15.0) // default to sonnet pricing
    }
}

pub async fn fetch_anthropic_usage(api_key: &str) -> Result<Vec<UsageSnapshot>, String> {
    if api_key.is_empty() {
        return Ok(vec![]);
    }

    let client = Client::new();
    let now = Utc::now();
    let start = (now - Duration::days(30))
        .format("%Y-%m-%dT00:00:00Z")
        .to_string();
    let end = now.format("%Y-%m-%dT23:59:59Z").to_string();

    let url = "https://api.anthropic.com/v1/organizations/usage_report/messages";
    let response = client
        .get(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .query(&[
            ("start_time", start.as_str()),
            ("end_time", end.as_str()),
            ("granularity", "1d"),
            ("group_by", "model"),
        ])
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {e}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("Anthropic parse error: {e}"))?;

    if !status.is_success() {
        return Err(format!("Anthropic API error {status}: {body}"));
    }

    let fetched_at = Utc::now().to_rfc3339();
    let mut snapshots = Vec::new();

    if let Some(data) = body.get("data").and_then(|d| d.as_array()) {
        for item in data {
            let model = item
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            let date = item
                .get("timestamp")
                .and_then(|v| v.as_str())
                .map(|s| &s[..10])
                .unwrap_or("1970-01-01")
                .to_string();

            let input_tokens = item
                .get("input_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let output_tokens = item
                .get("output_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let cache_tokens = item
                .get("cache_read_input_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            // Use reported cost if available, otherwise estimate
            let cost_usd = if let Some(c) = item.get("cost_usd").and_then(|v| v.as_f64()) {
                c
            } else {
                let (inp_price, out_price) = model_price(&model);
                (input_tokens as f64 * inp_price + output_tokens as f64 * out_price) / 1_000_000.0
            };

            snapshots.push(UsageSnapshot {
                id: None,
                provider: "anthropic".to_string(),
                model,
                date,
                input_tokens,
                output_tokens,
                cache_tokens,
                cost_usd,
                fetched_at: fetched_at.clone(),
            });
        }
    }

    Ok(snapshots)
}
