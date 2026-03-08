# PixChi 後端整合與主機遷移總規格

> 本文件整合原 `BACKEND_INTEGRATION_SPEC.md` 與 `HOST_MIGRATION_CONSTRAINTS.md`。
> 後續以本檔為唯一維護來源。

## 1. 目標
- 前端僅透過 API 取資料，不直接依賴資料庫。
- 一般版（guest/member）與 Pro/Admin 權限在後端強制生效。
- 支援未來從 SQLite 無痛切換 PostgreSQL，前端幾乎不改。
- 保持部署可攜與主機遷移成本可控。

## 2. 角色與權限
- `guest`
  - 可使用基本工具與公開色庫。
  - 不可使用雲端草稿、自訂色庫 API、Pro API。
- `member`
  - 可登入並使用雲端草稿與自訂色庫。
  - 雲端草稿上限 5 份。
- `pro`
  - 可使用 Pro 功能（進階排序、Pro 色庫 API、進階報價參數等）。
- `admin`
  - 具備 Pro 權限，並可做系統維運。

## 3. 架構原則
- 前端（apps/web）
  - 不碰 DB，不持有敏感商業資料來源。
  - 所有資料由 `ApiClient` 存取。
- 後端（apps/api）
  - Express + Prisma。
  - 權限由 middleware (`requireAuth` / `requireRole`) 強制。
  - 錯誤格式統一：`{ code, message, details? }`。
- 資料庫
  - 透過 Prisma schema + migration 管理。
  - 連線字串完全由 `DATABASE_URL` 控制。

## 4. API 合約（現況）
- Auth
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- Palette
  - `GET /api/palette/groups`
  - `GET /api/palette/groups/:code`
  - `GET /api/palette/pro/groups`（Pro/Admin）
  - `GET /api/palette/pro/groups/:code`（Pro/Admin）
- Projects（雲端草稿）
  - `GET /api/projects`
  - `POST /api/projects`
  - `GET /api/projects/:id`
  - `PUT /api/projects/:id/save`
  - `PATCH /api/projects/:id/name`
  - `PATCH /api/projects/:id/version-note`
  - `DELETE /api/projects/:id`
- Custom palettes
  - `GET /api/custom-palettes`
  - `PUT /api/custom-palettes`
- User settings
  - `GET /api/user-settings`
  - `PUT /api/user-settings`

## 5. 已完成項目
- Auth + refresh token 流程。
- 雲端草稿 API 串接前端（登入走 API、未登入走本地）。
- 自訂色庫 API 串接前端。
- API 權限防護（避免只靠前端隱藏）。
- API 錯誤碼標準化。
- OpenAPI 檔更新至現況路由。
- 一鍵權限測試腳本：`scripts/test-auth.ps1`。

## 6. 本輪新增（主機遷移友善）
- API 新增設定儲存端點：`/api/user-settings`。
- 新增資料模型：`UserSetting`。
- 新增 DB 維運腳本（apps/api）：
  - `npm run db:backup`
  - `npm run db:restore [backupPath]`
  - `npm run prisma:migrate:deploy`
  - `npm run deploy:check`

## 7. 部署與遷移約束
- 所有環境差異透過 `.env`：
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `JWT_EXPIRE`
  - `JWT_REFRESH_EXPIRE_DAYS`
  - `CORS_ORIGIN`
  - `JSON_BODY_LIMIT`
- 後端服務應維持 stateless（refresh session 存 DB）。
- 前端只依賴 API 契約，不依賴 DB 類型。
- 遷移到新主機時，優先保持 API 路徑與回應格式不變。

## 8. 標準部署流程
1. 設定 `.env`（含正確 `DATABASE_URL`）。
2. `npm --prefix apps/api run deploy:check`
3. `npm --prefix apps/api run prisma:migrate:deploy`
4. （需要時）`npm --prefix apps/api run prisma:seed`
5. 啟動 API + Web。
6. 執行權限煙霧測試：
   - `powershell -ExecutionPolicy Bypass -File .\scripts\test-auth.ps1 -ApiBase "http://127.0.0.1:8787"`

## 9. 待辦（高優先）
- `/api/projects` 支援分頁與搜尋（草稿大量時效能）。
- Pro 功能清單再做一次 API 層權限盤點（逐功能對照）。
- 自訂色庫由整包 PUT 擴充成單一群組 CRUD（降低覆蓋衝突）。
- CI 加入 OpenAPI 與路由一致性檢查。

## 10. 開發期固定守則（先做功能、後做正式上架）
- 目前以「功能完成度」為優先，暫不進入正式平台部署流程。
- 前端一律透過 API 取資料，不再新增直連本地色庫檔的流程。
- 所有新功能都必須先定義角色差異（guest/member/pro/admin），並在後端做權限檢查。
- 可調參數一律走 `.env` 或設定檔，避免硬編碼（主機遷移時可直接搬）。
- 每次串接調整後，至少執行：
  - `npm --prefix apps/api run typecheck`
  - `npm --prefix apps/web run typecheck`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\test-auth.ps1 -ApiBase "http://127.0.0.1:8787"`
- 後續協作（含我）以本檔為唯一參考規格，不再回寫已移除的舊規格檔。

