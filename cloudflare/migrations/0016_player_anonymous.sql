-- Cầu thủ ẩn danh (đá ké): chỉ hiện khi chia đội / đội hình
ALTER TABLE players ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0;
