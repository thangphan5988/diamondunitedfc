-- Scheduled kickoff time for internal & cap matches (HH:MM, Vietnam local)

ALTER TABLE match_summary ADD COLUMN match_start_time TEXT DEFAULT '19:30';
