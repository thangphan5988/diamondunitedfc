-- Thống kê quảng cáo: lượt xem & click
ALTER TABLE sponsors ADD COLUMN view_count INTEGER DEFAULT 0;
ALTER TABLE sponsors ADD COLUMN click_count INTEGER DEFAULT 0;
