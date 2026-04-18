import { useState } from 'react';

type PdfTileInfo = {
  pageNo: number;
  px: number;
  py: number;
  startCol: number;
  startRow: number;
  colsPart: number;
  rowsPart: number;
};

type PdfPaginationInfo = {
  fitsSinglePage: boolean;
  hasRightSpace: boolean;
  tileCols: number;
  tileRows: number;
  xPages: number;
  yPages: number;
  totalTiles: number;
  tiles: PdfTileInfo[];
};

type OversizePlan = {
  cols: number;
  rows: number;
  total: number;
  suggestCols: number;
  suggestRows: number;
  suggestTotal: number;
};

type PaletteGroupOption = {
  name: string;
  colors: { name: string }[];
};

type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type ImageBitmapLike = {
  width: number;
  height: number;
};

type ConversionPanelProps = {
  // palette groups
  groups: PaletteGroupOption[];
  activeGroupName: string;
  onActiveGroupNameChange: (name: string) => void;
  // crop hint (display only)
  imageBitmap: ImageBitmapLike | null;
  cropToolEnabled: boolean;
  cropRect: CropRect | null;
  // deltaE
  preMergeDeltaE: number;
  onPreMergeDeltaEChange: (v: number) => void;
  preMergeDeltaEMax: number;
  // pdf pagination
  proMode: boolean;
  pdfPagination: PdfPaginationInfo | null;
  pdfJumpPage: number;
  onPdfJumpPageChange: (v: number) => void;
  pdfTileThumbMap: Map<number, string>;
  // large grid
  largeGridMode: boolean;
  largeViewTilePage: number;
  onLargeViewTilePageChange: (v: number) => void;
  // convert
  onConvert: () => void;
  onResetAll: () => void;
  convertProgress: { running: boolean; phase: string; percent: number };
  paletteReady: boolean;
  // oversize
  oversizePlan: OversizePlan | null;
  onApplyOversizeSuggest: () => void;
  onApplyOversizeLargeMode: () => void;
  onDismissOversizePlan: () => void;
  gridSoftLimit: number;
  // tracing mode
  onStartTracing: () => void;
  tracingOpacity: number;
  onTracingOpacityChange: (v: number) => void;
};

function clampInt(value: number, min: number, max: number) {
  const n = Math.floor(Number(value) || 0);
  return Math.min(max, Math.max(min, n));
}

export default function ConversionPanel({
  groups,
  activeGroupName,
  onActiveGroupNameChange,
  imageBitmap,
  cropToolEnabled,
  cropRect,
  preMergeDeltaE,
  onPreMergeDeltaEChange,
  preMergeDeltaEMax,
  proMode,
  pdfPagination,
  pdfJumpPage,
  onPdfJumpPageChange,
  pdfTileThumbMap,
  largeGridMode,
  largeViewTilePage,
  onLargeViewTilePageChange,
  onConvert,
  onResetAll,
  convertProgress,
  paletteReady,
  oversizePlan,
  onApplyOversizeSuggest,
  onApplyOversizeLargeMode,
  onDismissOversizePlan,
  gridSoftLimit,
  onStartTracing,
  tracingOpacity,
  onTracingOpacityChange,
}: ConversionPanelProps) {
  const [selectedMode, setSelectedMode] = useState<'convert' | 'tracing'>('convert');
  const isTracing = selectedMode === 'tracing';
  return (
    <>
      {imageBitmap && cropToolEnabled && (
        <div className="hint">
          裁切：{cropRect?.w ?? imageBitmap.width}×{cropRect?.h ?? imageBitmap.height}（拖曳超出圖片邊界可補白邊）
        </div>
      )}

      {/* ── 模式切換 ── */}
      <div className="mode-toggle">
        <button
          className={`mode-toggle-btn${!isTracing ? ' active' : ''}`}
          onClick={() => setSelectedMode('convert')}
          type="button"
        >
          自動轉換
        </button>
        <button
          className={`mode-toggle-btn${isTracing ? ' active' : ''}`}
          onClick={() => setSelectedMode('tracing')}
          type="button"
        >
          底稿描圖
        </button>
      </div>

      {/* ── 拼豆色庫 ── */}
      <label>
        拼豆色庫
        <select value={activeGroupName} onChange={(e) => onActiveGroupNameChange(e.target.value)}>
          {groups.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name} ({g.colors.length})
            </option>
          ))}
        </select>
      </label>

      {/* ── 顏色合併強度（僅自動轉換模式）── */}
      {!isTracing && (
        <>
          <div className="inline-field">
            <span>合併相近色</span>
            <input
              type="number"
              min={0}
              max={preMergeDeltaEMax}
              step={0.5}
              value={preMergeDeltaE}
              onChange={(e) => onPreMergeDeltaEChange(Math.max(0, Math.min(preMergeDeltaEMax, Number(e.target.value) || 0)))}
            />
          </div>
          <div className="hint">
            0 = 不合色；數值越高，越多相近色合成一色，配色更簡潔。
          </div>
        </>
      )}

      {/* ── 底稿透明度（僅底稿描圖模式）── */}
      {isTracing && (
        <>
          <div className="inline-field">
            <span>底稿透明度</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(tracingOpacity * 100)}
              onChange={(e) => onTracingOpacityChange(Number(e.target.value) / 100)}
              style={{ flex: 1 }}
            />
            <span style={{ minWidth: 36, textAlign: 'right' }}>{Math.round(tracingOpacity * 100)}%</span>
          </div>
          <div className="hint">
            底稿圖片顯示於格子下層，方便對照描繪。匯出時不含底稿。
          </div>
        </>
      )}

      {/* ── 主要操作按鈕 ── */}
      <div className="row two">
        {isTracing ? (
          <button className="primary" onClick={onStartTracing} disabled={!imageBitmap}>
            開始描圖
          </button>
        ) : (
          <button className="primary" onClick={onConvert} disabled={convertProgress.running || !paletteReady} title={!paletteReady ? '色庫載入中…' : undefined}>
            {!paletteReady ? '載入中…' : '開始轉換'}
          </button>
        )}
        <button className="ghost" onClick={onResetAll}>
          清空結果
        </button>
      </div>

      {convertProgress.running && (
        <div className="progress-box">
          <div className="progress-head">
            <strong>轉換進度</strong>
            <span>{convertProgress.phase} {convertProgress.percent}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${convertProgress.percent}%` }} />
          </div>
        </div>
      )}

      {oversizePlan && (
        <div className="oversize-box">
          <strong>⚠ 格子數超過建議上限</strong>
          <div className="hint">
            {oversizePlan.cols}×{oversizePlan.rows}＝{oversizePlan.total.toLocaleString()} 格（上限 {gridSoftLimit.toLocaleString()} 格）
          </div>
          <div className="row one">
            <button type="button" className="primary" onClick={onApplyOversizeSuggest}>
              縮小至 {oversizePlan.suggestCols}×{oversizePlan.suggestRows} 並轉換
            </button>
          </div>
          <div className="row two">
            {proMode && (
              <button type="button" className="ghost" onClick={onApplyOversizeLargeMode}>
                大圖模式繼續
              </button>
            )}
            <button type="button" className="ghost" onClick={onDismissOversizePlan}>
              略過上限
            </button>
          </div>
        </div>
      )}

    </>
  );
}
