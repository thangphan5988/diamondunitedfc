-- Thời gian kết thúc quảng cáo (mặc định +14 ngày từ lúc tạo)
ALTER TABLE sponsors ADD COLUMN end_at TEXT;

UPDATE sponsors
SET end_at = datetime(COALESCE(NULLIF(created_at, ''), datetime('now')), '+14 days')
WHERE end_at IS NULL OR end_at = '';
