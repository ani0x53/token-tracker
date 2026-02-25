use chrono::{Duration, Utc};
use reqwest::Client;
use serde_json::Value;

use crate::storage::UsageSnapshot;

/// Pricing per 1M tokens (prompt / completion) — best-effort approximations.
fn model_price(model: &str) -> (f64, f64) {
    if model.contains("gpt-4o-mini") {
        (0.15, 0.60)
    } else if model.contains("gpt-4o") {
        (2.50, 10.0)
    } else if model.contains("gpt-4-turbo") || model.contains("gpt-4-1106") {
        (10.0, 30.0)
    } else if model.contains("gpt-4") {
        (30.0, 60.0)
    } else if model.contains("gpt-3.5") {
        (0.50, 1.50)
    } else if model.contains("o1-mini") {
        (3.0, 12.0)
    } else if model.contains("o1") {
        (15.0, 60.0)
    } else {
        (2.50, 10.0) // default gpt-4o pricing
    }
}

pub async fn fetch_openai_usage(api_key: &str) -> Result<Vec<UsageSnapshot>, String> {
    if api_key.is_empty() {
        return Ok(vec![]);
    }

    let client = Client::new();
    let fetched_at = Utc::now().to_rfc3339();
    let mut snapshots: std::collections::HashMap<(String, String), UsageSnapshot> =
        std::collections::HashMap::new();

    // Fetch 30 days of data (one request per day)
    for days_ago in 0..30i64 {
        let date = (Utc::now() - Duration::days(days_ago))
            .format("%Y-%m-%d")
            .to_string();

        let response = client
            .get("https://api.openai.com/v1/usage")
            .header("Authorization", format!("Bearer {api_key}"))
            .query(&[("date", date.as_str())])
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {e}"))?;

        let status = response.status();
        if !status.is_success() {
            // Non-fatal: skip this day
            continue;
        }

        let body: Value = response
            .json()
            .await
            .map_err(|e| format!("OpenAI parse error: {e}"))?;

        if let Some(data) = body.get("data").and_then(|d| d.as_array()) {
            for item in data {
                let model = item
                    .get("snapshot_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                let input_tokens = item
                    .get("n_context_tokens_total")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                let output_tokens = item
                    .get("n_generated_tokens_total")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);

                let (inp_price, out_price) = model_price(&model);
                let cost_usd =
                    (input_tokens as f64 * inp_price + output_tokens as f64 * out_price)
                        / 1_000_000.0;

                let key = (model.clone(), date.clone());
                let entry = snapshots.entry(key).or_insert(UsageSnapshot {
                    id: None,
                    provider: "openai".to_string(),
                    model: model.clone(),
                    date: date.clone(),
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_tokens: 0,
                    cost_usd: 0.0,
                    fetched_at: fetched_at.clone(),
                });
                entry.input_tokens += input_tokens;
                entry.output_tokens += output_tokens;
                entry.cost_usd += cost_usd;
            }
        }
    }

    Ok(snapshots.into_values().collect())
}
