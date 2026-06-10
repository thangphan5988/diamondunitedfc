# Apps Script — Deploy hướng dẫn

## Cài đặt

1. Mở [Google Spreadsheet](https://docs.google.com/spreadsheets/d/1Ffv-98Ld8jW2AKu-1NmGXFbhsuWJogw83F5p0q0HRGU) của CLB
2. **Extensions → Apps Script**
3. **Thay toàn bộ** `Code.gs` cũ (v1.11.9) bằng file mới trong repo
4. **Deploy → Manage deployments → Edit (biểu tượng bút) → New version → Deploy**
   - Hoặc **New deployment → Web app** nếu chưa có
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy URL Web App → cập nhật `MATCH_HISTORY_WEB_APP_URL` trong `index.html` (nếu URL đổi)

## Thay đổi so với v1.11.9

- Giữ nguyên `HEADERS` 18 cột gốc + logic `normalizeMatchDate_`
- **Cập nhật rule xóa cùng ngày:** chỉ xóa dòng `pending` (chưa `completed`), không xóa trận đã chấm điểm
- Thêm 9 cột phụ: `status`, `match_score`, `rating_before`, ...
- Thêm sheet **Match Summary**, **Rating Log**
- Thêm action: `save_match_result`, `get_match_list`, `get_match_detail`

## Sheets tự tạo

| Sheet | Mục đích |
|-------|----------|
| Match Summary | 1 dòng / trận (tỷ số, MVP, status) |
| Rating Log | Lịch sử thay đổi rating sau mỗi trận |
| Match History (gid có sẵn) | Chi tiết từng cầu thủ mỗi trận |

## API

| Action | Method | Mô tả |
|--------|--------|-------|
| `save_match_history` | POST | Lưu lineup sau xuất ảnh |
| `save_match_result` | POST | Lưu kết quả + cập nhật rating roster |
| `get_match_list` | GET | Danh sách trận đã hoàn tất |
| `get_match_detail` | GET | Chi tiết 1 trận |

Sau khi deploy lại, URL có thể đổi — nhớ cập nhật trong frontend.
