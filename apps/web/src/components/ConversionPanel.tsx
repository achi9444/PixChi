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
}: ConversionPanelProps) {
  return (
    <>
      {imageBitmap && cropToolEnabled && (
        <div className="hint">
          裁切：{cropRect?.w ?? imageBitmap.width}×{cropRect?.h ?? imageBitmap.height}（拖曳超出圖片邊界可補白邊）
        </div>
      )}

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

      {/* ── 顏色合併強度 ── */}
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

      {/* ── 主要操作按鈕 ── */}
      <div className="row two">
        <button className="primary" onClick={onConvert} disabled={convertProgress.running || !paletteReady} title={!paletteReady ? '色庫載入中…' : undefined}>
          {!paletteReady ? '載入中…' : '開始轉換'}
        </button>
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
          <strong>大圖提示</strong>
          <div className="hint">
            目前格線 {oversizePlan.cols}x{oversizePlan.rows}（{oversizePlan.total.toLocaleString()} 格）超過建議上限 {gridSoftLimit.toLocaleString()} 格。
          </div>
          <div className="row two">
            <button type="button" className="ghost" onClick={onApplyOversizeSuggest}>
              自動縮放至 {oversizePlan.suggestCols}x{oversizePlan.suggestRows}
            </button>
            {proMode && (
              <button type="button" className="ghost" onClick={onApplyOversizeLargeMode}>
                以大圖模式繼續
              </button>
            )}
          </div>
          <div className="row one">
            <button type="button" className="ghost" onClick={onDismissOversizePlan}>
              取消本次超限轉換
            </button>
          </div>
        </div>
      )}

      {largeGridMode && pdfPagination && pdfPagination.totalTiles > 1 && (
        <div className="pdf-nav-box">
          <strong>大圖分塊編輯</strong>
          <div className="hint">全圖可看整體構圖；選擇分塊後可放大查看色號並編輯。</div>
          <div className="row three">
            <button type="button" className={largeViewTilePage === 0 ? 'primary' : 'ghost'} onClick={() => onLargeViewTilePageChange(0)}>
              全圖
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => onLargeViewTilePageChange(pdfJumpPage)}
              disabled={pdfJumpPage <= 0 || pdfJumpPage > pdfPagination.totalTiles}
            >
              切到跳轉頁
            </button>
            <div className="hint">當前：{largeViewTilePage > 0 ? `分塊 #${largeViewTilePage}` : '全圖'}</div>
          </div>
          {largeViewTilePage === 0 && (
            <div className="oversize-box">
              <div className="hint">目前在全圖模式，色號顯示會簡化。建議切到分塊編輯以檢視色號。</div>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  if (!pdfPagination.tiles.length) return;
                  onLargeViewTilePageChange(pdfPagination.tiles[0].pageNo);
                }}
              >
                切到第一塊
              </button>
            </div>
          )}
          <div className="tile-thumb-list">
            {pdfPagination.tiles.map((tile) => {
              const active = largeViewTilePage === tile.pageNo;
              return (
                <button
                  key={`edit-tile-${tile.pageNo}`}
                  type="button"
                  className={`tile-thumb ${active ? 'is-jump' : ''}`.trim()}
                  onClick={() => onLargeViewTilePageChange(tile.pageNo)}
                >
                  {pdfTileThumbMap.get(tile.pageNo) && (
                    <img src={pdfTileThumbMap.get(tile.pageNo)} alt={`edit-page-${tile.pageNo}`} className="tile-thumb-img" />
                  )}
                  <span>編輯 #{tile.pageNo}</span>
                  <small>X {tile.startCol + 1}-{tile.startCol + tile.colsPart}</small>
                  <small>Y {tile.startRow + 1}-{tile.startRow + tile.rowsPart}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
