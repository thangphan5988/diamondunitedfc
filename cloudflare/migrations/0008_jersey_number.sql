-- Số áo cầu thủ (0–99, NULL = chưa gán)
ALTER TABLE players ADD COLUMN jersey_number INTEGER DEFAULT NULL;
