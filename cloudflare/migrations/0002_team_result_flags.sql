ALTER TABLE match_summary ADD COLUMN team_a_result_saved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_summary ADD COLUMN team_b_result_saved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_summary ADD COLUMN team_a_lineup_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_summary ADD COLUMN team_b_lineup_confirmed INTEGER NOT NULL DEFAULT 0;
