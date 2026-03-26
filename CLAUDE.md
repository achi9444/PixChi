# PixChi — Claude 全域說明

## 語言
**所有回覆一律使用繁體中文。**

---

## 專案簡介

「PixChi」是一個拼豆（Perler Bead）圖紙生成工具，結合創作者媒合市場。

- **Monorepo**：`apps/web`（前端）、`apps/api`（後端）
- **前端**：React 18 + TypeScript + Vite，單頁應用，hash-based routing
- **後端**：Express + Prisma + SQLite，部署於本機開發伺服器
- **認證**：JWT（access token 30 分鐘 + refresh token 14 天）

---

## 使用者角色

| 角色 | 代碼 | 說明 |
|------|------|------|
| 路人 | `guest` | 未登入，工具有浮水印限制 |
| 會員 | `member` | 登入後，可使用雲端草稿、聯絡創作者 |
| 創作者 | `pro` | 月費訂閱，可上架設計圖、創作者主頁 |
| 管理員 | `admin` | 同 pro 所有權限 |

---

## 目錄結構重點

```
apps/
  web/
    src/
      App.tsx                  # 主元件，所有狀態集中管理
      components/
        TopBar.tsx             # 頂部導覽列（匯出 AppPage 型別）
        AuthPanel.tsx          # 登入/註冊面板
        MarketPage.tsx         # 市集頁（設計圖 + 創作者列表）
        CreatorPage.tsx        # 創作者後台（個人資料 + 設計圖管理）
        PublishDesignModal.tsx # 上架 modal（含浮水印預覽）
        PalettePage.tsx        # 色庫管理頁
        CanvasPanel.tsx        # 畫布面板
        StatsPanel.tsx         # 用料統計與報價
        DraftBox.tsx           # 雲端草稿
        ConversionPanel.tsx    # 圖片轉換設定
        ColorEditPanel.tsx     # 顏色編輯
        ConstructionPanel.tsx  # 施工模式
      services/
        api.ts                 # ApiClient 類別 + 所有 DTO 型別
        authStorage.ts         # Token 本地儲存
        draftStore.ts          # 草稿本地/雲端同步
        customPaletteStore.ts  # 自訂色庫
      types/
        palette.ts
      styles.css               # 全域樣式（單一 CSS 檔）
  api/
    src/
      routes/
        auth.ts                # /api/auth/*
        creator.ts             # /api/creator/* (需 pro/admin)
        market.ts              # /api/market/* (公開)
        projects.ts            # /api/projects/* (需登入)
        palette.ts             # /api/palette/*
      middleware/
        auth.ts                # requireAuth, requireRole
      prisma/
        schema.prisma          # 資料庫 schema
```

---

## 頁面路由

hash-based，`AppPage = 'main' | 'palette' | 'market' | 'creator'`

- `#/` → 工具主頁
- `#/palette` → 色庫
- `#/market` → 市集（公開）
- `#/creator` → 創作者後台（需 pro/admin）

---

## 重要設計決策

- **無金流**：平台只做媒合，創作者設定外部連結（賣貨便/好賣+/Line），交易在外部完成
- **預覽圖儲存**：base64 JPEG 存入 SQLite TEXT 欄位（上限約 200KB）
- **浮水印**：`drawWatermark(ctx, w, h, text)` 在 `PublishDesignModal.tsx` 匯出，斜向平鋪半透明文字
- **標籤分隔符**：只支援頓號（、）和空白，不支援逗號
- **外部連結格式**：`{ label: string; url: string }[]` 動態新增/刪除，最多 10 筆
- **proMode**：`authUser?.role === 'pro' || authUser?.role === 'admin'`

---

## 開發指令

```bash
# 前端
cd apps/web && npm run dev

# 後端
cd apps/api && npm run dev

# TypeScript 檢查
cd apps/web && npx tsc --noEmit
cd apps/api && npx tsc --noEmit

# Prisma migration
cd apps/api && npx prisma migrate dev --name <migration-name>
```

---

## 測試帳號（本機）

- `pro / pro123` — 創作者角色
- `admin / admin123` — 管理員角色
