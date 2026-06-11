-- Inactivity rating decay: -1 effective rating per 8 days without a completed match

ALTER TABLE players ADD COLUMN base_rating INTEGER;
ALTER TABLE players ADD COLUMN last_match_at TEXT DEFAULT '';
ALTER TABLE players ADD COLUMN joined_at TEXT DEFAULT '';

UPDATE players SET base_rating = rating WHERE base_rating IS NULL;
UPDATE players SET joined_at = COALESCE(NULLIF(joined_at, ''), datetime('now')) WHERE joined_at IS NULL OR joined_at = '';
