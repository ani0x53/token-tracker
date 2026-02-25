use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

use crate::api::{anthropic::fetch_anthropic_usage, openai::fetch_openai_usage};
use crate::tray::update_tray_tooltip;

/// Read a setting from the in-memory store (via JS bridge would be cleaner, but
/// for now we persist settings in the app's local data dir as a JSON file so
/// Rust can read them without going through JS).
async fn read_settings(app: &AppHandle<impl Runtime>) -> serde_json::Map<String, Value> {
    let path = settings_path(app);
    if let Ok(contents) = tokio::fs::read_to_string(&path).await {
        if let Ok(Value::Object(map)) = serde_json::from_str(&contents) {
            return map;
        }
    }
    serde_json::Map::new()
}

fn settings_path(app: &AppHandle<impl Runtime>) -> std::path::PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("settings.json")
}

/// Persist snapshots to SQLite via the sql plugin.
/// We use the app's local data dir to store a simple JSON file that
/// bridges Rust ↔ JS (the SQL plugin is JS-side). Instead of duplicating
/// the sql plugin in Rust, we emit an event with the new snapshots and
/// let the frontend do the upsert.
async fn emit_snapshots<R: Runtime>(app: &AppHandle<R>, snapshots: Vec<crate::storage::UsageSnapshot>) {
    if snapshots.is_empty() {
        return;
    }
    let _ = app.emit("new-snapshots", &snapshots);
}

async fn check_alerts<R: Runtime>(app: &AppHandle<R>, settings: &serde_json::Map<String, Value>) {
    // Read today's total cost from the tray label cache file
    let cache_path = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("today_cost.json");

    let today_cost: f64 = if let Ok(s) = tokio::fs::read_to_string(&cache_path).await {
        serde_json::from_str(&s).unwrap_or(0.0)
    } else {
        0.0
    };

    if let Some(threshold_str) = settings.get("alert_daily_usd").and_then(|v| v.as_str()) {
        if let Ok(threshold) = threshold_str.parse::<f64>() {
            if threshold > 0.0 && today_cost >= threshold {
                let _ = app
                    .notification()
                    .builder()
                    .title("Token Tracker — Spending Alert")
                    .body(format!(
                        "Today's API spend ${today_cost:.2} has reached your ${threshold:.2} daily threshold."
                    ))
                    .show();
            }
        }
    }
}

pub fn start_poller<R: Runtime + 'static>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        loop {
            let settings = read_settings(&app).await;

            let poll_secs: u64 = settings
                .get("poll_interval_secs")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .unwrap_or(300);

            let anthropic_key = settings
                .get("anthropic_key")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let openai_key = settings
                .get("openai_key")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Fetch both providers concurrently
            let (anthropic_result, openai_result) = tokio::join!(
                fetch_anthropic_usage(&anthropic_key),
                fetch_openai_usage(&openai_key),
            );

            let mut all_snapshots = Vec::new();
            if let Ok(snaps) = anthropic_result {
                all_snapshots.extend(snaps);
            }
            if let Ok(snaps) = openai_result {
                all_snapshots.extend(snaps);
            }

            // Compute today's total cost for tray + alert
            let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
            let today_cost: f64 = all_snapshots
                .iter()
                .filter(|s| s.date == today)
                .map(|s| s.cost_usd)
                .sum();

            // Cache today's cost for alert checking
            let cache_path = app
                .path()
                .app_local_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("today_cost.json");
            let _ = tokio::fs::write(&cache_path, today_cost.to_string()).await;

            // Update tray tooltip
            update_tray_tooltip(&app, &format!("Token Tracker — ${today_cost:.2} today"));

            // Push snapshots to frontend for DB upsert
            emit_snapshots(&app, all_snapshots).await;

            // Check spending alerts
            check_alerts(&app, &settings).await;

            // Signal frontend to refresh its data view
            let _ = app.emit("usage-updated", ());

            tokio::time::sleep(Duration::from_secs(poll_secs)).await;
        }
    });
}
