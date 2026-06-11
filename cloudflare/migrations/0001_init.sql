-- DUFC D1 schema (replaces Google Sheets)

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  name_norm TEXT NOT NULL,
  position TEXT NOT NULL,
  secondary_positions TEXT DEFAULT '',
  preferred_side TEXT DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 5,
  mvp_count INTEGER NOT NULL DEFAULT 0,
  avatar TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_players_name_norm ON players(name_norm);

CREATE TABLE IF NOT EXISTS match_summary (
  match_id TEXT PRIMARY KEY,
  match_label TEXT DEFAULT '',
  match_date TEXT DEFAULT '',
  match_date_norm TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  match_type TEXT DEFAULT 'internal',
  opponent_name TEXT DEFAULT '',
  formation_a TEXT DEFAULT '',
  formation_b TEXT DEFAULT '',
  team_a_score TEXT DEFAULT '',
  team_b_score TEXT DEFAULT '',
  mvp_players TEXT DEFAULT '',
  player_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'lineup_exported',
  image_filename TEXT DEFAULT '',
  result_saved_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_summary_status ON match_summary(status);
CREATE INDEX IF NOT EXISTS idx_summary_date_norm ON match_summary(match_date_norm);
CREATE INDEX IF NOT EXISTS idx_summary_saved ON match_summary(result_saved_at);

CREATE TABLE IF NOT EXISTS match_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  match_date TEXT DEFAULT '',
  match_date_norm TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  team TEXT DEFAULT '',
  shirt TEXT DEFAULT '',
  formation TEXT DEFAULT '',
  player_name TEXT NOT NULL,
  player_name_norm TEXT NOT NULL,
  rating REAL DEFAULT 5,
  starter INTEGER DEFAULT 0,
  lineup_order INTEGER DEFAULT 0,
  assigned_position TEXT DEFAULT '',
  assigned_side TEXT DEFAULT '',
  main_position TEXT DEFAULT '',
  secondary_positions TEXT DEFAULT '',
  preferred_side TEXT DEFAULT '',
  fit_label TEXT DEFAULT '',
  captain INTEGER DEFAULT 0,
  image_filename TEXT DEFAULT '',
  status TEXT DEFAULT 'lineup_exported',
  team_a_score TEXT DEFAULT '',
  team_b_score TEXT DEFAULT '',
  match_score TEXT DEFAULT '',
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  is_mvp INTEGER DEFAULT 0,
  rating_before REAL DEFAULT 0,
  rating_delta INTEGER DEFAULT 0,
  rating_after REAL DEFAULT 0,
  result_saved_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_history_match ON match_history(match_id);
CREATE INDEX IF NOT EXISTS idx_history_date_status ON match_history(match_date_norm, status);
CREATE INDEX IF NOT EXISTS idx_history_player_norm ON match_history(player_name_norm);

CREATE TABLE IF NOT EXISTS rating_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  match_date TEXT DEFAULT '',
  player_name TEXT NOT NULL,
  match_score REAL DEFAULT 0,
  rating_before REAL DEFAULT 0,
  rating_delta INTEGER DEFAULT 0,
  rating_after REAL DEFAULT 0,
  is_mvp INTEGER DEFAULT 0,
  mvp_count_before INTEGER DEFAULT 0,
  mvp_count_after INTEGER DEFAULT 0,
  saved_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS admin_users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  permissions TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  permissions TEXT DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);
