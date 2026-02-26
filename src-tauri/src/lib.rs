mod api;
mod commands;
mod poller;
mod storage;
mod tray;

use tauri::Manager;
use tokio::sync::Mutex;

pub use storage::UsageSnapshot;
pub use storage::INIT_SQL;

// ─── Shared app state ────────────────────────────────────────────────────────

pub struct AppState {
    pub refresh_tx: tokio::sync::mpsc::Sender<()>,
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
            commands::save_setting,
            commands::save_settings,
            commands::get_settings,
            commands::trigger_refresh,
            commands::get_init_sql,
        ])
        .setup(|app| {
            tray::setup_tray(app.handle())?;

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
