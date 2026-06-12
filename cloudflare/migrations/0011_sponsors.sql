-- Nhà tài trợ / quảng cáo
CREATE TABLE IF NOT EXISTS sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  link_url TEXT DEFAULT '',
  image_side TEXT DEFAULT '',
  image_mobile TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO sponsors (name, link_url, sort_order, active) VALUES
  ('Diamond Coffee', '#', 1, 1),
  ('Riverside Gym', '#', 2, 1),
  ('Saigon Water', '#', 3, 1);
