# Playwright + TypeScript API Test (TA88 Title)

Dự án mẫu kiểm thử tự động bằng Playwright + TypeScript kèm API HTTP để chạy test và phục vụ HTML report. Mục tiêu: truy cập https://ta88.pro/ và PASS nếu tiêu đề trang đúng “TA88 - NHÀ CÁI UY TÍN SỐ 1”, ngược lại FAIL. API này có thể tích hợp làm Action trong Google AppSheet.

## Tính năng chính
- Test E2E kiểm tra title trang TA88 (Chromium, headless mặc định).
- API HTTP để chạy test và trả về JSON (kèm URL report):
  - `GET /api/run-ta88-test`
  - `GET /health` (kiểm tra sống)
  - Phục vụ report: `/report/index.html`
- Tự rơi xuống cổng kế tiếp nếu `9323` đang bận; có thể cố định cổng bằng biến môi trường `PORT`.
- Tham số query hữu ích:
  - `?logs=1` đính kèm stdout/stderr vào JSON
  - `?headed=1` chạy hiện UI trình duyệt (headful)
  - `?debug=1` mở Playwright Inspector (cũng headful, chạy chậm, hữu ích khi quan sát)

## Yêu cầu môi trường
- Node.js >= 18, npm
- Internet (để truy cập trang đích và tải trình duyệt Playwright Chromium)

## Cài đặt nhanh
```bash
npm install
npx playwright install chromium
```

## Chạy test qua CLI (dev nội bộ)
```bash
npx playwright test --project=chromium -g "homepage title is correct"
npx playwright show-report
```

## Khởi chạy API server (local)
```bash
# Khuyến nghị cố định cổng
$env:PORT=9323; npm run api       # PowerShell (Windows)
# Hoặc
PORT=9323 npm run api             # macOS/Linux
```

- Kiểm tra sống: mở `http://localhost:<port>/health` → `{ "ok": true }`
- Gọi chạy test: `http://localhost:<port>/api/run-ta88-test`
- Kèm log: `http://localhost:<port>/api/run-ta88-test?logs=1`
- Hiện UI trình duyệt: `http://localhost:<port>/api/run-ta88-test?headed=1`
- Debug/Inspector: `http://localhost:<port>/api/run-ta88-test?debug=1`
- Xem báo cáo: `http://localhost:<port>/report/index.html`

Lưu ý: nếu cổng 9323 bận, server sẽ tự chuyển sang 9324, 9325,… Console khi khởi động sẽ in “API server listening on http://localhost:<port>”. Hãy dùng đúng `<port>` đó.

## Tích hợp Google AppSheet
- Public API qua ngrok (HTTPS):
  1) Cài ngrok (Windows có thể dùng Chocolatey):
     - `choco install ngrok -y`
  2) Thêm authtoken (không dùng dấu `<>`):
     - `ngrok config add-authtoken YOUR_TOKEN`
  3) Chạy tunnel trỏ cổng API:
     - `ngrok http <port>` (vd: `ngrok http 9323`)
  4) Lấy URL “Forwarding” dạng `https://<random>.ngrok-free.app`.

- Dùng URL ngrok trong AppSheet Action (Open a URL):
  - Chạy test: `https://<ngrok-url>/api/run-ta88-test`
  - Có log: `https://<ngrok-url>/api/run-ta88-test?logs=1`
  - Xem report: `https://<ngrok-url>/report/index.html`

Mẹo: nếu cần URL ổn định, hãy dùng “Reserved Domain” trong ngrok rồi chạy: `ngrok http --domain=<your-subdomain>.ngrok-free.app <port>`.

## Cấu trúc dự án
```text
src/
  pages/
    home.page.ts           # Page Object: goto() truy cập TA88, fallback URL, timeout ổn định
tests/
  example.spec.ts          # Test: "homepage title is correct" (Chromium-only, timeout 60s)
api/
  server.js                # API HTTP: /health, /api/run-ta88-test, phục vụ /report
playwright.config.ts        # Chỉ Chromium, headless=true, ignoreHTTPSErrors, retries=2, UA desktop
package.json                # scripts: test, test:ui, codegen, api
```

## Tuỳ chỉnh & Bằng chứng (Evidence)
- Mặc định chỉ lưu ảnh/video/trace khi FAIL: xem `playwright.config.ts` (`screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`, `trace: 'on-first-retry'`).
- Nếu muốn lưu cả khi PASS:
  - Đổi `screenshot: 'on'`, `trace: 'on'` (và `video: 'on'` nếu cần) trong `playwright.config.ts`.

## Ghi chú & Khắc phục sự cố
- Port bận (EADDRINUSE): đặt `PORT` cố định khác hoặc để server tự fallback; xem log để biết cổng thực tế.
- Windows npm ENOENT (thiếu `%APPDATA%\npm`): tạo thư mục và set prefix
  ```powershell
  New-Item -ItemType Directory -Force "$env:APPDATA\npm"
  npm config set prefix "$env:APPDATA\npm"
  ```
- Lỗi mạng/DNS (ERR_INTERNET_DISCONNECTED/ERR_NAME_NOT_RESOLVED): kiểm tra internet/VPN/Firewall; site có thể chỉ ổn định trên Chromium.
- Không thấy trình duyệt khi gọi API: dùng `?debug=1` hoặc `?headed=1` và đảm bảo API chạy trong phiên desktop đang mở (không phải service nền/RDP đã disconnect).

---

Chúc bạn tích hợp suôn sẻ với AppSheet! Nếu muốn mình thêm endpoint "run-then-redirect" (chạy test xong tự chuyển hướng sang trang report để 1-click từ AppSheet), hãy mở issue hoặc ping mình.

## Docker
- Build image:
  - `docker build -t ta88-api .`
- Run (map cổng 9323):
  - `docker run --rm -p 9323:9323 --name ta88-api ta88-api`
- Tuỳ chỉnh cổng:
  - `docker run --rm -e PORT=9400 -p 9400:9400 ta88-api`
- Endpoints trong container (giống local):
  - Health: `http://localhost:9323/health`
  - Run TA88: `http://localhost:9323/api/run-ta88-test`
  - Run login: `http://localhost:9323/api/run-login-test`
  - Generic: `http://localhost:9323/api/run-test?spec=tests/login.spec.ts`
  - Report: `http://localhost:9323/report/index.html`

Lưu ý: bên trong Docker không có GUI, nên `headed=1`/`debug=1` sẽ không hiện cửa sổ trình duyệt trừ khi bạn cấu hình thêm (X11/VNC). Mặc định test chạy headless trong container.
