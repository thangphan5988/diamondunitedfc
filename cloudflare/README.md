# DUFC API — Cloudflare Workers + D1

Backend thay thế Google Sheets / Apps Script. Nhanh hơn, API tập trung một URL.

## Yêu cầu

- Tài khoản [Cloudflare](https://dash.cloudflare.com) (free tier đủ dùng)
- Node.js 18+

## Cài đặt & Deploy (lần đầu)

```bash
cd cloudflare
npm install

# Đăng nhập Cloudflare
npx wrangler login

# Tạo database D1
npx wrangler d1 create dufc-db
```

Copy `database_id` từ output → dán vào `wrangler.toml` thay `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

```bash
# Chạy migration schema
npm run db:migrate

# Tạo secret cho migrate dữ liệu (tự chọn chuỗi bí mật)
npx wrangler secret put MIGRATE_SECRET

# Deploy Worker
npm run deploy
```

Sau deploy, API production:

- **Custom domain:** `https://api.diamondunitedfc.com` (cấu hình trong `wrangler.toml` → `[[routes]]`)
- **Fallback workers.dev:** `https://dufc-api.thangpt5988.workers.dev`

### Custom domain `api.diamondunitedfc.com`

1. Thêm site `diamondunitedfc.com` vào [Cloudflare Dashboard](https://dash.cloudflare.com) (cùng account với Worker).
2. `npm run deploy` — Wrangler tự tạo DNS record cho subdomain `api`.
3. Nếu nameserver vẫn ở **PA Việt Nam** (web GitHub Pages): vào Cloudflare → Workers → dufc-api → Custom Domains, copy CNAME target rồi thêm trên PA:
   - **Host:** `api`
   - **Loại:** CNAME
   - **Value:** target Cloudflare hiển thị (vd `dufc-api.thangpt5988.workers.dev`)

Frontend (`js/config.js`): `API_BASE_URL = "https://api.diamondunitedfc.com"`.

## Migrate dữ liệu từ Google Sheets

```bash
MIGRATE_SECRET=your-secret \
WORKER_URL=https://api.diamondunitedfc.com \
npm run migrate:sheets
```

Script sẽ:
1. Đọc roster từ Google Sheet CSV (public)
2. Đọc lịch sử trận từ Apps Script cũ
3. Import vào D1 qua API `import_data`

## Cập nhật Frontend

`js/config.js`:

```javascript
const API_BASE_URL = "https://api.diamondunitedfc.com";
```

## API

Giữ nguyên contract với Apps Script cũ + thêm:

| Action | Mô tả |
|--------|--------|
| `get_roster` | Danh sách cầu thủ (thay Google Sheet CSV) |
| `import_data` | Migrate bulk (cần `migrate_secret`) |
| `wc2026_news` | Tin World Cup 2026 từ RSS 24h (cache KV ~10 phút) |
| `wc2026_fixtures` | Lịch / kết quả / live (`scope=upcoming\|results\|live\|all`) |
| `wc2026_standings` | Bảng xếp hạng vòng bảng |
| `wc2026_teams` | Danh sách đội tham dự |
| `wc2026_team` | Chi tiết đội (BXH, lịch, đội hình Wikipedia) |
| `wc2026_player` | Chi tiết cầu thủ (ảnh + bio Wikipedia, cache KV ~24h) |
| `wc2026_hub` | Gộp tất cả (prefetch trang hub) |

### World Cup 2026 (hybrid 24h + worldcup26.ir)

- **Tin tức:** RSS bóng đá [24h.com.vn](https://www.24h.com.vn/world-cup-2026-c860.html) — không cần API key.
- **Lịch / BXH / kết quả / đội:** [worldcup26.ir](https://worldcup26.ir) — API miễn phí, open-source, **không cần đăng ký**.

Frontend: trang [`world-cup-2026.html`](../world-cup-2026.html) gọi các action `wc2026_*` qua `api.diamondunitedfc.com`.

> Ghi chú: `api-football.com` thường bị chặn/khó truy cập từ VN — dự án dùng worldcup26.ir thay thế.

## Lệnh hữu ích

```bash
npm run dev              # Chạy local
npm run deploy           # Deploy production
npm run db:migrate       # Apply schema lên D1 remote
npx wrangler d1 execute dufc-db --remote --command "SELECT COUNT(*) FROM players"
```
