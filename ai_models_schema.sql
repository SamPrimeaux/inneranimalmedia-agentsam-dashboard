
 ⛅️ wrangler 4.81.0 (update available 4.81.1)
─────────────────────────────────────────────
Resource location: remote 

🌀 Executing on remote database inneranimalmedia-business (cf87b717-d4e2-4cf8-bab0-a81268e32d49):
🌀 To execute on your local development database, remove the --remote flag from your wrangler command.
🚣 Executed 1 command in 0.47ms
[
  {
    "results": [
      {
        "sql": "CREATE TABLE ai_models (\n  id TEXT PRIMARY KEY,\n  provider TEXT NOT NULL,\n  model_key TEXT NOT NULL,\n  display_name TEXT NOT NULL,\n  billing_unit TEXT NOT NULL DEFAULT 'tokens',\n  context_default_tokens INTEGER DEFAULT 0,\n  context_max_tokens INTEGER DEFAULT 0,\n  supports_cache INTEGER DEFAULT 0,\n  supports_tools INTEGER DEFAULT 1,\n  supports_vision INTEGER DEFAULT 0,\n  supports_web_search INTEGER DEFAULT 0,\n  supports_fast_mode INTEGER DEFAULT 0,\n  size_class TEXT DEFAULT 'medium',\n  is_active INTEGER DEFAULT 1,\n  metadata_json TEXT DEFAULT '{}',\n  created_at INTEGER NOT NULL DEFAULT (unixepoch()),\n  updated_at INTEGER NOT NULL DEFAULT (unixepoch()), input_rate_per_mtok REAL, output_rate_per_mtok REAL, cache_write_rate_per_mtok REAL, cache_read_rate_per_mtok REAL, web_search_per_1k_usd REAL DEFAULT 0, neurons_usd_per_1k REAL DEFAULT 0, pricing_source TEXT DEFAULT 'cursor_list', show_in_picker INTEGER DEFAULT 0, secret_key_name TEXT, api_platform TEXT DEFAULT 'unknown', pricing_unit TEXT NOT NULL DEFAULT 'usd_per_mtok', cost_per_unit REAL, rpm_limit INTEGER DEFAULT 0, itpm_limit INTEGER DEFAULT 0, otpm_limit INTEGER DEFAULT 0, features_json TEXT DEFAULT '{}',\n  UNIQUE(provider, model_key)\n)"
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "ENAM",
      "served_by_colo": "EWR",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.4746
      },
      "duration": 0.4746,
      "changes": 0,
      "last_row_id": 0,
      "changed_db": false,
      "size_after": 341684224,
      "rows_read": 2203,
      "rows_written": 0,
      "total_attempts": 1
    }
  }
]
