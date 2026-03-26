# PixChi — 專案全貌速覽

> 本文件供 Claude Project 使用，讓任何對話都能快速理解專案全貌與開發進度。
> 最後更新：2026-03-23

---

## 一句話描述

**PixChi 是一個拼豆（Perler Bead）圖紙生成工具，結合創作者媒合市場。** 使用者可上傳圖片、自動轉換為拼豆圖紙、編輯調色、匯出 PDF/CSV；創作者可上架設計圖，買家透過外部平台完成交易。

---

## 技術架構

| 層級 | 技術 | 說明 |
|------|------|------|
| 前端 | React 18 + TypeScript + Vite | SPA，hash-based routing（`#/`, `#/palette`, `#/market`, `#/creator`） |
| 後端 | Express + TypeScript (tsx watch) | REST API，port 3001 |
| 資料庫 | Prisma + SQLite | 輕量本機部署，預覽圖以 base64 存 TEXT 欄位 |
| 認證 | JWT | access token 30min + refresh token 14 天 |
| PDF | pdf-lib + fontkit | 前端產生，支援多頁拼版 |
| 部署 | 前端 gh-pages / 後端本機 | 開發中，尚無正式線上環境 |

**Monorepo 結構：**
```
apps/
  web/   → 前端（React SPA）
  api/   → 後端（Express API）
```

---

## 核心功能與完成度

### ✅ 已完成（可運作）

| 功能 | 位置 | 說明 |
|------|------|------|
| 圖片轉拼豆圖紙 | `ConversionPanel.tsx` | 上傳圖片 → 色彩匹配（LAB/RGB）→ 格子化 |
| Canvas 編輯器 | `CanvasPanel.tsx` | 畫格子、填色、裁切、undo/redo |
| 色庫管理 | `PalettePage.tsx` | 系統色庫 + 自訂色庫，雲端同步 |
| 顏色編輯 | `ColorEditPanel.tsx` | 單格/批次換色 |
| 用料統計 & 報價 | `StatsPanel.tsx` | 各色用量、成本估算 |
| PDF 匯出 | `StatsPanel.tsx` + `App.tsx` | 多頁拼版、自訂紙張/格子大小 |
| CSV 匯出 | `App.tsx` | 匯出格子資料 |
| 施工模式 | `ConstructionPanel.tsx` | 分板施工引導、模板規則推導 |
| 雲端草稿 | `DraftBox.tsx` + `/api/projects` | 登入後自動同步，版本歷史 |
| 登入/註冊 | `AuthPanel.tsx` + `/api/auth` | JWT 認證，含 refresh 機制 |
| 快捷鍵 | `App.tsx` | 可自訂快捷鍵配置 |

### 🔨 已建立但仍在開發中

| 功能 | 位置 | 狀態 |
|------|------|------|
| 市集頁面 | `MarketPage.tsx` + `/api/market` | 設計圖列表 + 創作者列表，基本 UI 已有 |
| 創作者後台 | `CreatorPage.tsx` + `/api/creator` | 個人資料編輯 + 設計圖管理，基本 CRUD 已有 |
| 設計圖上架 | `PublishDesignModal.tsx` | 含浮水印預覽、標籤、授權類型、價格 |
| 創作者 DB | `CreatorProfile` + `Design` model | Schema 已建，含 migration |

### ❌ 尚未實作

| 功能 | 說明 |
|------|------|
| Guest PDF 浮水印 | 未登入匯出 PDF 時應有浮水印（差異化核心） |
| 訂閱管理 | 無 subscription model，無付費流程 |
| PDF 圖紙匯入還原 | 創作者功能，目前只有概念 |
| 收藏功能 | 會員收藏設計圖 |
| 排序/推薦 | 市集設計圖的熱門/最新排序 |
| 創作者認證標章 | 訂閱中的創作者顯示標章 |

---

## 資料庫模型

```
User ──┬── AuthSession（JWT refresh token）
       ├── Project ── ProjectVersion（雲端草稿 + 版本歷史）
       ├── CustomPaletteGroup ── CustomPaletteColor（自訂色庫）
       ├── UserSetting（快捷鍵、施工模板）
       └── CreatorProfile ── Design（創作者資料 + 設計圖）

PaletteGroup ── PaletteColor（系統色庫，如 Artkal、Perler）
```

---

## 使用者角色

| 角色 | 代碼 | 能力 |
|------|------|------|
| 路人 | `guest` | 免費使用工具，PDF 有浮水印，無雲端草稿 |
| 會員 | `member` | 雲端草稿（上限 5）、聯絡創作者 |
| 創作者 | `pro` | 月費訂閱，上架設計圖、創作者主頁、無限草稿 |
| 管理員 | `admin` | 同 pro 全部權限 |

---

## 商業模式

```
路人 → 免費工具（有浮水印）→ 瀏覽市場 → 引導註冊
會員 → 免費/低門檻 → 工具 + 聯絡創作者
創作者 → 月費訂閱（NT$199-299/月）→ 市場曝光 → 外部平台交易
```

**核心原則：無金流。** 平台只做媒合，創作者設定外部連結（賣貨便/好賣+/Line），交易在外部完成。平台收入 = 創作者訂閱費。

---

## API 路由總覽

| 路徑 | 說明 | 認證需求 |
|------|------|---------|
| `/api/auth/*` | 登入/註冊/refresh/logout | 公開 |
| `/api/palette/*` | 系統色庫 CRUD | 公開 |
| `/api/projects/*` | 雲端草稿 CRUD + 版本 | 需登入 |
| `/api/custom-palettes/*` | 自訂色庫同步 | 需登入 |
| `/api/user-settings/*` | 使用者設定 | 需登入 |
| `/api/market/*` | 市集設計圖/創作者列表 | 公開 |
| `/api/creator/*` | 創作者後台操作 | 需 pro/admin |
| `/api/health` | 健康檢查 | 公開 |

---

## 前端頁面路由

| Hash | 頁面 | 元件 |
|------|------|------|
| `#/` | 工具主頁 | `App.tsx`（含 Canvas、轉換、色編輯、施工、草稿、統計） |
| `#/palette` | 色庫管理 | `PalettePage.tsx` |
| `#/market` | 市集 | `MarketPage.tsx` |
| `#/creator` | 創作者後台 | `CreatorPage.tsx` |

---

## 重要設計決策

1. **預覽圖儲存**：base64 JPEG 存 SQLite TEXT 欄位（≤200KB）
2. **浮水印**：`drawWatermark()` 斜向平鋪半透明文字，在 `PublishDesignModal.tsx` 實作
3. **標籤分隔符**：只支援頓號（、）和空白，不支援逗號
4. **外部連結**：`{ label, url }[]` 格式，最多 10 筆
5. **proMode 判斷**：`authUser?.role === 'pro' || authUser?.role === 'admin'`
6. **狀態管理**：所有狀態集中在 `App.tsx`，無 Redux/Zustand

---

## 開發環境

```bash
# 前端（http://localhost:5173）
cd apps/web && npm run dev

# 後端（http://localhost:3001）
cd apps/api && npm run dev

# TypeScript 檢查
cd apps/web && npx tsc --noEmit
cd apps/api && npx tsc --noEmit

# Prisma migration
cd apps/api && npx prisma migrate dev --name <name>
```

**測試帳號（本機）：** `pro / pro123`（創作者）、`admin / admin123`（管理員）

---

## 開發歷程摘要

- **2026-03-01**：專案建立，React + TypeScript + PDF 匯出
- 陸續新增：裁切、施工模式、色庫管理、捲軸樣式
- **重構為 Monorepo**：前後端分離，Express + Prisma + SQLite
- 完成 JWT 認證、雲端草稿、API 串接
- 加入市集 & 創作者功能（DB schema + 基本 UI）
- 最近：元件拆分重構（AuthPanel、TopBar、PalettePage）
- **目前共 22 個 commit，正在進行大量未提交的 UI/樣式改版**

---

## 當前進行中的工作

根據 git diff，目前有大量未提交的變更（約 +2575 / -1563 行），主要包括：
- `styles.css` 大幅擴充（+1897 行）— 全面 UI 改版
- `App.tsx` 重構精簡（-1000+ 行）— 持續拆分元件
- `AuthPanel.tsx` 功能擴充（+224 行）
- `api.ts` 新增 API 端點（+131 行）— 市集/創作者相關
- `schema.prisma` 擴充（+40 行）— 新增 Design/CreatorProfile 欄位
- 新增多個元件：`MarketPage`、`CreatorPage`、`PublishDesignModal` 等
