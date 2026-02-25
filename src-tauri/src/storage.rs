use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageSnapshot {
    pub id: Option<i64>,
    pub provider: String,
    pub model: String,
    pub date: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_tokens: i64,
    pub cost_usd: f64,
    pub fetched_at: String,
}

/// SQL to initialise the database — called once at startup via the frontend
/// using tauri-plugin-sql's `execute` from JavaScript.
/// We expose these as constants so the frontend can run them.
pub const INIT_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS usage_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  date TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  fetched_at TEXT NOT NULL,
  UNIQUE(provider, model, date)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;
