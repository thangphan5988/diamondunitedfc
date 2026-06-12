-- Thống kê traffic website
CREATE TABLE IF NOT EXISTS site_analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  page_path TEXT DEFAULT '',
  meta_json TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON site_analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON site_analytics_events(created_at);
