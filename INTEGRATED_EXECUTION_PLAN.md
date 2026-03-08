# PixChi 整合執行清單（Spec + 搬遷限制）

## A. 已完成

- 後端基礎骨架（Express + Prisma + SQLite）
- 官方色庫 API 化
- 登入 / refresh / logout / me
- 角色機制（guest/member/pro/admin）
- 前端 API Client 與自動續登入
- Pro 專屬 palette API 上鎖

## B. 進行中（優先）

1. 草稿/版本後端化
- 後端 `projects` 路由補齊並掛載
- 前端：member/pro/admin 走 API，guest 走本地 fallback

2. 自訂色庫後端化
- 後端 `custom-palettes` 路由
- 前端：登入用 API，未登入用本地 fallback

3. API Spec 同步
- 將 auth/refresh/projects/custom-palettes 寫入 `pixchi-api.yaml`

## C. 上線前

- rate limit、審計 log、備份策略
- staging/prod 環境與 CORS 白名單
- SQLite -> PostgreSQL 切換演練（本地或 staging）

## D. 每步驗收

- `apps/api` typecheck
- `apps/web` typecheck
- `prisma migrate` + `seed`
- guest/member/pro 三角色行為測試
