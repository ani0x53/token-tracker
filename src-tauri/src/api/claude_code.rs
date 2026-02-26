use std::collections::HashMap;
use std::path::PathBuf;

use chrono::{Duration, Utc};
use serde_json::Value;

use crate::storage::UsageSnapshot;

/// Pricing per 1M tokens (input / output) — mirrors anthropic.rs
fn model_price(model: &str) -> (f64, f64) {
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
        (3.0, 15.0)
    }
}

#[derive(Default)]
struct Accumulator {
    input_tokens: i64,
    output_tokens: i64,
    cache_tokens: i64,
}

/// Read token usage from Claude Code's local session JSONL files.
/// `home_dir` should be the user's home directory (e.g. `/home/user`).
pub async fn fetch_claude_code_usage(home_dir: PathBuf) -> Result<Vec<UsageSnapshot>, String> {
    let projects_dir = home_dir.join(".claude").join("projects");
    if !projects_dir.exists() {
        return Ok(vec![]);
    }

    let cutoff = Utc::now() - Duration::days(30);
    let cutoff_date = cutoff.format("%Y-%m-%d").to_string();

    // Accumulate tokens keyed by (date, model)
    let mut acc: HashMap<(String, String), Accumulator> = HashMap::new();

    let mut project_entries = tokio::fs::read_dir(&projects_dir)
        .await
        .map_err(|e| format!("Cannot read ~/.claude/projects: {e}"))?;

    while let Ok(Some(project_entry)) = project_entries.next_entry().await {
        let Ok(ft) = project_entry.file_type().await else { continue };
        if !ft.is_dir() {
            continue;
        }

        let mut session_entries = match tokio::fs::read_dir(project_entry.path()).await {
            Ok(e) => e,
            Err(_) => continue,
        };

        while let Ok(Some(session_entry)) = session_entries.next_entry().await {
            let path = session_entry.path();
            // Only process .jsonl files directly inside the project directory
            // (skips <session-uuid>/ subdirectories that contain subagent logs)
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            // Skip files not modified in the last 30 days for performance
            if let Ok(meta) = session_entry.metadata().await {
                if let Ok(modified) = meta.modified() {
                    let age = std::time::SystemTime::now()
                        .duration_since(modified)
                        .unwrap_or_default();
                    if age.as_secs() > 30 * 24 * 3600 {
                        continue;
                    }
                }
            }
            parse_session_file(&path, &cutoff_date, &mut acc).await;
        }
    }

    let fetched_at = Utc::now().to_rfc3339();
    let mut snapshots: Vec<UsageSnapshot> = acc
        .into_iter()
        .filter(|(_, data)| data.input_tokens > 0 || data.output_tokens > 0)
        .map(|((date, model), data)| {
            let (inp_price, out_price) = model_price(&model);
            let cost_usd = (data.input_tokens as f64 * inp_price
                + data.output_tokens as f64 * out_price)
                / 1_000_000.0;
            UsageSnapshot {
                id: None,
                provider: "claude_code".to_string(),
                model,
                date,
                input_tokens: data.input_tokens,
                output_tokens: data.output_tokens,
                cache_tokens: data.cache_tokens,
                cost_usd,
                fetched_at: fetched_at.clone(),
            }
        })
        .collect();

    snapshots.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(snapshots)
}

async fn parse_session_file(
    path: &PathBuf,
    cutoff_date: &str,
    acc: &mut HashMap<(String, String), Accumulator>,
) {
    let content = match tokio::fs::read_to_string(path).await {
        Ok(c) => c,
        Err(_) => return,
    };

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(val): Result<Value, _> = serde_json::from_str(line) else {
            continue;
        };
        if val.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }
        let Some(message) = val.get("message") else { continue };
        let Some(usage) = message.get("usage") else { continue };

        let timestamp = val
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if timestamp.len() < 10 {
            continue;
        }
        let date = &timestamp[..10];
        if date < cutoff_date {
            continue;
        }

        let model = message
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let input_tokens = usage.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
        let output_tokens = usage.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
        let cache_tokens = usage
            .get("cache_read_input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);

        let entry = acc.entry((date.to_string(), model)).or_default();
        entry.input_tokens += input_tokens;
        entry.output_tokens += output_tokens;
        entry.cache_tokens += cache_tokens;
    }
}
