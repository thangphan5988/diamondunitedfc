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

Sau deploy, copy URL Worker (vd: `https://dufc-api.<account>.workers.dev`).

## Migrate dữ liệu từ Google Sheets

```bash
MIGRATE_SECRET=your-secret \
WORKER_URL=https://dufc-api.<account>.workers.dev \
npm run migrate:sheets
```

Script sẽ:
1. Đọc roster từ Google Sheet CSV (public)
2. Đọc lịch sử trận từ Apps Script cũ
3. Import vào D1 qua API `import_data`

## Cập nhật Frontend

Trong `index.html`, đổi:

```javascript
const API_BASE_URL = "https://dufc-api.<account>.workers.dev";
```

## API

Giữ nguyên contract với Apps Script cũ + thêm:

| Action | Mô tả |
|--------|--------|
| `get_roster` | Danh sách cầu thủ (thay Google Sheet CSV) |
| `import_data` | Migrate bulk (cần `migrate_secret`) |

## Lệnh hữu ích

```bash
npm run dev              # Chạy local
npm run deploy           # Deploy production
npm run db:migrate       # Apply schema lên D1 remote
npx wrangler d1 execute dufc-db --remote --command "SELECT COUNT(*) FROM players"
```
