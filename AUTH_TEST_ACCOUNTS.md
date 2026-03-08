# PixChi 測試帳號清單

## 使用方式

- 前端右上角點 `登入`
- 輸入下方帳號密碼
- 成功後會在右上顯示目前身份與角色

## 帳號列表

| 角色 | 帳號 | 密碼 | 用途 |
|---|---|---|---|
| `admin` | `admin` | `admin123` | 管理員權限（目前等同 Pro 能力測試） |
| `pro` | `pro` | `pro123` | Pro 版功能測試 |
| `member` | `member` | `member123` | 一般會員登入測試（非 Pro） |

## 補充

- 未登入時視為 `guest`，可使用一般版功能。
- 目前帳號為開發測試用，定義位置在 `apps/api/src/services/authService.ts`。
