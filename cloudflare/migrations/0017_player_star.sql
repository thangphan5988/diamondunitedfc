-- Trình độ thủ công, tách khỏi voting (rating/base_rating).
ALTER TABLE players ADD COLUMN star INTEGER NOT NULL DEFAULT 5;
