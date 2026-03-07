# 複雜度收費備忘錄

此文件僅供開發者查找設定位置，不會顯示在網頁上。

## 主要檔案
- `src/App.tsx`

## 可調整的預設參數
- `PUBLIC_PRICING_PRESET`
  - `complexityPerBead`: 複雜度加成的每顆基礎費率
  - `unitCost`, `lossRate`, `labor`, `fixedCost`, `margin`: 一般版預設報價參數

## 中文名稱對應（欄位/畫面）
- 單顆成本：`unitCost`（Pro 輸入狀態為 `proUnitCost`）
- 損耗率 (%)：`lossRate`（Pro 輸入狀態為 `proLossRate`）
- 人工（一般版固定值）：`labor`
- 時薪（Pro）：`proHourlyRate`
- 預估工時（Pro）：`proWorkHours`
- 固定成本：`fixedCost`（Pro 輸入狀態為 `proFixedCost`）
- 利潤率 (%)：`margin`（Pro 輸入狀態為 `proMargin`）
- 複雜度每顆基礎費率：`complexityPerBead`
- 複雜度分數：`complexityScore`
- 複雜度原始加成：`complexityFeeRaw`
- 複雜度加成上限：`complexityCap`（由 `COMPLEXITY_CAP_TIERS` 決定）
- 複雜度實際加成：`complexityFee`
- 預估材料成本：`materialCost`
- 建議報價：`quotePrice`

## 複雜度上限級距
- `COMPLEXITY_CAP_TIERS`
  - 依總顆數 (`maxBeads`) 設定複雜度加成費上限 (`cap`)
  - 例：`<=500`, `<=1200`, `<=2500`, 其餘用 Infinity 級距

## 複雜度計算位置
- `const complexityScore = useMemo(...)`
  - 由以下指標組成：
    - 鄰格顏色切換率 (`transitionRate`)
    - 色號數 (`colorCount`)
    - 零碎小色比例 (`tinyColorRatio`)

## 複雜度費用計算
- `complexityFeeRaw`
  - 公式：`totalBeads * complexityPerBead * complexityScore`
- `complexityCap`
  - 由 `getComplexityCap(totalBeads)` 取得（讀 `COMPLEXITY_CAP_TIERS`）
- `complexityFee`
  - 一般版：`min(complexityFeeRaw, complexityCap)`
  - Pro 版：目前固定 `0`

## 最終報價公式
- `subtotal = materialCost + laborCost + fixedCost + complexityFee`
- `quotePrice = subtotal * (1 + marginRate / 100)`
