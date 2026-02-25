mod api;
mod poller;
mod storage;
mod tray;

use std::collections::HashMap;

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::sync::Mutex;

pub use storage::UsageSnapshot;
pub use storage::INIT_SQL;

// ─── Shared app state ────────────────────────────────────────────────────────

pub struct AppState {
    pub refresh_tx: tokio::sync::mpsc::Sender<()>,
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Save a key/value pair to the settings file.
#[tauri::command]
pub async fn save_setting<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    value: String,
) -> Result<(), String> {
    let path = settings_path(&app);
    let mut map = read_settings_map(&path).await;
    map.insert(key, Value::String(value));
    write_settings_map(&path, &map).await
}

/// Save multiple settings at once.
#[tauri::command]
pub async fn save_settings<R: Runtime>(
    app: AppHandle<R>,
    settings: HashMap<String, String>,
) -> Result<(), String> {
    let path = settings_path(&app);
    let mut map = read_settings_map(&path).await;
    for (k, v) in settings {
        map.insert(k, Value::String(v));
    }
    write_settings_map(&path, &map).await
}

/// Return all settings as a string→string map.
#[tauri::command]
pub async fn get_settings<R: Runtime>(
    app: AppHandle<R>,
) -> Result<HashMap<String, String>, String> {
    let path = settings_path(&app);
    let map = read_settings_map(&path).await;
    Ok(map
        .into_iter()
        .filter_map(|(k, v)| v.as_str().map(|s| (k, s.to_string())))
        .collect())
}

/// Trigger an immediate refresh without waiting for the next poll cycle.
#[tauri::command]
pub async fn trigger_refresh(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let tx = state.lock().await.refresh_tx.clone();
    let _ = tx.try_send(());
    Ok(())
}

/// Return the INIT_SQL constant so the frontend can run it on first launch.
#[tauri::command]
pub fn get_init_sql() -> &'static str {
    INIT_SQL
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> std::path::PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("settings.json")
}

async fn read_settings_map(path: &std::path::PathBuf) -> serde_json::Map<String, Value> {
    if let Ok(contents) = tokio::fs::read_to_string(path).await {
        if let Ok(Value::Object(map)) = serde_json::from_str(&contents) {
            return map;
        }
    }
    serde_json::Map::new()
}

async fn write_settings_map(
    path: &std::path::PathBuf,
    map: &serde_json::Map<String, Value>,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    tokio::fs::write(path, json)
        .await
        .map_err(|e| e.to_string())
}

// ─── App builder ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (refresh_tx, _refresh_rx) = tokio::sync::mpsc::channel::<()>(4);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(Mutex::new(AppState {
            refresh_tx: refresh_tx.clone(),
        }))
        .invoke_handler(tauri::generate_handler![
            save_setting,
            save_settings,
            get_settings,
            trigger_refresh,
            get_init_sql,
        ])
        .setup(|app| {
            // System tray
            tray::setup_tray(app.handle())?;

            // Ensure local data dir exists, then start the background poller
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(data_dir) = handle.path().app_local_data_dir() {
                    let _ = tokio::fs::create_dir_all(&data_dir).await;
                }
                poller::start_poller(handle);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
