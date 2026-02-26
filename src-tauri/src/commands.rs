use std::collections::HashMap;

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::sync::Mutex;

use crate::storage::INIT_SQL;
use crate::AppState;

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

#[tauri::command]
pub async fn trigger_refresh(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let tx = state.lock().await.refresh_tx.clone();
    let _ = tx.try_send(());
    Ok(())
}

#[tauri::command]
pub fn get_init_sql() -> &'static str {
    INIT_SQL
}

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

pub async fn write_settings_map(
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
