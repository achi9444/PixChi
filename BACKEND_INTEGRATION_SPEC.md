# PixChi 後端串接規格（可擴充、可換 DB）

## 1. 架構原則
- 前端只呼叫 API，不直接碰資料庫。
- 後端負責權限、商業邏輯、資料存取。

附加說明：
- 前端改版（UI/CSS）時，通常不會影響資料庫層。

## 2. 後端分層
- `controller`：接收/回應 HTTP 請求。
- `service`：處理業務規則。
- `repository`：集中 Prisma/SQL 存取。

附加說明：
- 之後換資料庫時，主要修改 `repository`，降低重工。

## 3. ORM 與資料庫策略
- 先用 `Prisma + SQLite`（本機開發最簡單）。
- 後續可換 `PostgreSQL`。

附加說明：
- 先建立 Prisma schema + migration，未來切換資料庫會更穩定。

## 4. 連線設定環境化
- 使用 `.env` 管理：
  - `DATABASE_URL`
  - `PORT`
  - `JWT_SECRET`
- 不把連線字串寫死在程式碼中。

附加說明：
- 可快速切換本機/測試/正式環境。

## 5. API 規格（第一版）
- `POST /api/auth/login`
- `GET /api/palette-groups`
- `GET /api/palette/:id`
- `GET /api/custom-palettes`
- `POST /api/custom-palettes`

附加說明：
- 前端依賴固定 API contract；底層 DB 更換時前端可維持不動。

## 6. 權限與資料保護
- `guest`：可讀官方色庫。
- `pro`：可讀寫雲端自訂色庫。
- `admin`：可管理官方色庫（後續擴充）。

附加說明：
- 可保護的是「未授權拿不到完整資料」，不是「授權後完全看不到資料」。

## 7. 前端改造重點
- `loadPalette()` 改打 API，不再讀 `public/color-palette.json`。
- 加入 token/session 處理與 `401` 流程（導登入或提示）。

附加說明：
- 完成後資料來源即為後端，便於控權與審計。

## 8. API Base URL 與 Port
- 前端：`VITE_API_BASE_URL`
- 後端：`PORT`（可自訂，不固定 8787）

附加說明：
- `8787` 只是建議預設值；可改成任何未占用 port。
