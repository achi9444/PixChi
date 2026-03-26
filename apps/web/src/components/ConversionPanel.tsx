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

import { useState } from 'react';

type ConversionPanelProps = {
  // palette groups
  groups: PaletteGroupOption[];
  activeGroupName: string;
  onActiveGroupNameChange: (name: string) => void;
  // image upload
  onImageSelected: (file: File | null) => void;
  // crop (display only)
  imageBitmap: ImageBitmapLike | null;
  cropToolEnabled: boolean;
  cropRect: CropRect | null;
  // grid
  cols: number;
  rows: number;
  onColsChange: (v: number) => void;
  onRowsChange: (v: number) => void;
  maxGridSize: number;
  // deltaE
  preMergeDeltaE: number;
  onPreMergeDeltaEChange: (v: number) => void;
  preMergeDeltaEMax: number;
  // display
  showCode: boolean;
  onShowCodeChange: (v: boolean) => void;
  exportScale: 1 | 2 | 3;
  onExportScaleChange: (v: 1 | 2 | 3) => void;
  // pdf pagination
  proMode: boolean;
  pdfPagination: PdfPaginationInfo | null;
  pdfPageFrom: number;
  pdfPageTo: number;
  pdfJumpPage: number;
  onPdfPageFromChange: (v: number) => void;
  onPdfPageToChange: (v: number) => void;
  onPdfJumpPageChange: (v: number) => void;
  pdfTileThumbMap: Map<number, string>;
  // large grid
  largeGridMode: boolean;
  largeViewTilePage: number;
  onLargeViewTilePageChange: (v: number) => void;
  // ruler/guide
  showRuler: boolean;
  onShowRulerChange: (v: boolean) => void;
  showGuide: boolean;
  onShowGuideChange: (v: boolean) => void;
  guideEvery: number;
  onGuideEveryChange: (v: number) => void;
  // blank canvas
  onCreateBlankCanvas: (opts: { cols: number; rows: number; name: string }) => void;
  hasConverted: boolean;
  projectName: string;
  // convert
  onConvert: () => void;
  onResetAll: () => void;
  convertProgress: { running: boolean; phase: string; percent: number };
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

function UploadIcon() {
  return (
    <svg className="upload-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

export default function ConversionPanel({
  groups,
  activeGroupName,
  onActiveGroupNameChange,
  onImageSelected,
  imageBitmap,
  cropToolEnabled,
  cropRect,
  cols,
  rows,
  onColsChange,
  onRowsChange,
  maxGridSize,
  preMergeDeltaE,
  onPreMergeDeltaEChange,
  preMergeDeltaEMax,
  showCode,
  onShowCodeChange,
  exportScale,
  onExportScaleChange,
  proMode,
  pdfPagination,
  pdfPageFrom,
  pdfPageTo,
  pdfJumpPage,
  onPdfPageFromChange,
  onPdfPageToChange,
  onPdfJumpPageChange,
  pdfTileThumbMap,
  largeGridMode,
  largeViewTilePage,
  onLargeViewTilePageChange,
  showRuler,
  onShowRulerChange,
  showGuide,
  onShowGuideChange,
  guideEvery,
  onGuideEveryChange,
  onCreateBlankCanvas,
  hasConverted,
  projectName,
  onConvert,
  onResetAll,
  convertProgress,
  oversizePlan,
  onApplyOversizeSuggest,
  onApplyOversizeLargeMode,
  onDismissOversizePlan,
  gridSoftLimit,
}: ConversionPanelProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rulerOpen, setRulerOpen] = useState(false);
  const [blankModalOpen, setBlankModalOpen] = useState(false);
  const [blankCols, setBlankCols] = useState(29);
  const [blankRows, setBlankRows] = useState(29);
  const [blankName, setBlankName] = useState('');

  function handleFileChange(file: File | null) {
    setFileName(file?.name ?? null);
    onImageSelected(file);
  }

  return (
    <>
      {/* ── 1. 來源：上傳圖片 or 空白畫布 ── */}
      <div style={{ marginBottom: 2 }}>
        <label style={{ marginBottom: 6 }}>圖片上傳</label>
        <div
          className={`upload-dropzone ${dragOver ? 'drag-over' : ''} ${imageBitmap ? 'has-image' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0] ?? null;
            if (file && file.type.startsWith('image/')) handleFileChange(file);
          }}
        >
          {imageBitmap ? (
            <>
              <CheckIcon />
              <span className="upload-dropzone-text">{fileName ?? '已載入圖片'}</span>
              <span className="upload-dropzone-sub" style={{ color: 'var(--faint)', fontSize: 11 }}>點擊更換</span>
            </>
          ) : (
            <>
              <UploadIcon />
              <div>
                <div className="upload-dropzone-text">點擊選擇或拖曳圖片</div>
                <div className="upload-dropzone-sub">支援 JPG、PNG、GIF、WebP 等格式</div>
              </div>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              handleFileChange(file);
            }}
          />
        </div>
      </div>

      {!imageBitmap && !hasConverted && (
        <button className="ghost" style={{ width: '100%' }} onClick={() => {
          setBlankName(projectName || '');
          setBlankCols(cols || 29);
          setBlankRows(rows || 29);
          setBlankModalOpen(true);
        }}>
          建立空白畫布
        </button>
      )}

      {blankModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setBlankModalOpen(false); }}>
          <div className="modal-box blank-canvas-modal">
            <div className="modal-header">
              <h3>建立空白畫布</h3>
              <button className="ghost topbar-icon" onClick={() => setBlankModalOpen(false)} aria-label="關閉">✕</button>
            </div>
            <div className="blank-canvas-body">
              <label>
                專案名稱
                <input
                  type="text"
                  value={blankName}
                  onChange={(e) => setBlankName(e.target.value)}
                  placeholder="未命名專案"
                />
              </label>
              <div className="row two">
                <label>
                  寬 (cols)
                  <input
                    type="number"
                    min={1}
                    max={maxGridSize}
                    value={blankCols}
                    onChange={(e) => setBlankCols(Number(e.target.value) || 1)}
                  />
                </label>
                <label>
                  高 (rows)
                  <input
                    type="number"
                    min={1}
                    max={maxGridSize}
                    value={blankRows}
                    onChange={(e) => setBlankRows(Number(e.target.value) || 1)}
                  />
                </label>
              </div>
              <button
                className="primary"
                onClick={() => {
                  onCreateBlankCanvas({
                    cols: blankCols,
                    rows: blankRows,
                    name: blankName.trim(),
                  });
                  setBlankModalOpen(false);
                }}
              >
                建立畫布
              </button>
              <p className="blank-canvas-desc">從零開始用畫筆繪製拼豆圖案，無需上傳圖片。</p>
            </div>
          </div>
        </div>
      )}

      {imageBitmap && cropToolEnabled && (
        <div className="hint">
          裁切：{cropRect?.w ?? imageBitmap.width}×{cropRect?.h ?? imageBitmap.height}（拖曳超出圖片邊界可補白邊）
        </div>
      )}

      {/* ── 2. 轉換參數 ── */}
      <hr className="panel-divider" />
      <label>
        作用群組
        <select value={activeGroupName} onChange={(e) => onActiveGroupNameChange(e.target.value)}>
          {groups.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name} ({g.colors.length})
            </option>
          ))}
        </select>
      </label>

      <div className="row two">
        <label>
          寬(cols)
          <input
            type="number"
            min={1}
            max={maxGridSize}
            value={cols}
            onChange={(e) => onColsChange(Number(e.target.value))}
          />
        </label>
        <label>
          高(rows)
          <input
            type="number"
            min={1}
            max={maxGridSize}
            value={rows}
            onChange={(e) => onRowsChange(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="inline-field">
        <span>併色門檻 DeltaE</span>
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
        0 表示關閉；數值越高，越多相近色會在轉換時直接合併成同色。
      </div>

      {/* ── 3. 主要操作按鈕 ── */}
      <div className="row two">
        <button className="primary" onClick={onConvert}>
          開始轉換
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
            <button
              type="button"
              className="ghost"
              onClick={onApplyOversizeSuggest}
            >
              自動縮放至 {oversizePlan.suggestCols}x{oversizePlan.suggestRows}
            </button>
            {proMode && (
              <button
                type="button"
                className="ghost"
                onClick={onApplyOversizeLargeMode}
              >
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

      {/* ── 4. 顯示設定（轉換後相關） ── */}
      <hr className="panel-divider" />
      <label className="switch-row">
        顯示色號文字
        <input type="checkbox" checked={showCode} onChange={(e) => onShowCodeChange(e.target.checked)} />
      </label>
      <div className="inline-field">
        <span>匯出清晰度</span>
        <select value={exportScale} onChange={(e) => onExportScaleChange((Number(e.target.value) as 1 | 2 | 3) || 2)}>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={3}>3x</option>
        </select>
      </div>

      {proMode && (
        <>
          <div className="collapsible-header" onClick={() => setRulerOpen((v) => !v)}>
            <h3>尺規 / 參考線</h3>
            <span className={`chevron ${rulerOpen ? 'open' : ''}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </div>
          {rulerOpen && (
            <>
              <label className="switch-row">
                顯示尺規
                <input type="checkbox" checked={showRuler} onChange={(e) => onShowRulerChange(e.target.checked)} />
              </label>
              <label className="switch-row">
                顯示參考線
                <input type="checkbox" checked={showGuide} onChange={(e) => onShowGuideChange(e.target.checked)} />
              </label>
              <label>
                參考線間距（每幾格）
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={guideEvery}
                  onChange={(e) => onGuideEveryChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                />
              </label>
            </>
          )}
        </>
      )}

      {/* ── 5. 多頁 / 大圖（條件顯示） ── */}
      {proMode && pdfPagination && (
        <div className="pdf-nav-box">
          <strong>多頁輸出導覽</strong>
          <div className="hint">
            {pdfPagination.totalTiles > 1
              ? `共 ${pdfPagination.totalTiles} 頁（${pdfPagination.xPages} x ${pdfPagination.yPages}）`
              : '目前內容為單頁輸出（可直接匯出）'}
          </div>
          {pdfPagination.totalTiles > 1 && (
            <>
              <div className="row three">
                <label>
                  起始頁
                  <input
                    type="number"
                    min={1}
                    max={pdfPagination.totalTiles}
                    value={pdfPageFrom}
                    onChange={(e) => onPdfPageFromChange(clampInt(Number(e.target.value) || 1, 1, pdfPagination.totalTiles))}
                  />
                </label>
                <label>
                  結束頁
                  <input
                    type="number"
                    min={1}
                    max={pdfPagination.totalTiles}
                    value={pdfPageTo}
                    onChange={(e) => onPdfPageToChange(clampInt(Number(e.target.value) || 1, 1, pdfPagination.totalTiles))}
                  />
                </label>
                <label>
                  頁碼跳轉
                  <input
                    type="number"
                    min={1}
                    max={pdfPagination.totalTiles}
                    value={pdfJumpPage}
                    onChange={(e) => onPdfJumpPageChange(clampInt(Number(e.target.value) || 1, 1, pdfPagination.totalTiles))}
                  />
                </label>
              </div>
              <div className="row two">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    onPdfPageFromChange(pdfJumpPage);
                    onPdfPageToChange(pdfJumpPage);
                  }}
                >
                  只匯出跳轉頁
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    onPdfPageFromChange(1);
                    onPdfPageToChange(pdfPagination.totalTiles);
                  }}
                >
                  還原全範圍
                </button>
              </div>
              <div className="tile-thumb-list">
                {pdfPagination.tiles.map((tile) => {
                  const from = Math.min(pdfPageFrom, pdfPageTo);
                  const to = Math.max(pdfPageFrom, pdfPageTo);
                  const inRange = tile.pageNo >= from && tile.pageNo <= to;
                  const isJump = tile.pageNo === pdfJumpPage;
                  return (
                    <button
                      key={`tile-${tile.pageNo}`}
                      type="button"
                      className={`tile-thumb ${inRange ? 'in-range' : ''} ${isJump ? 'is-jump' : ''}`.trim()}
                      onClick={() => onPdfJumpPageChange(tile.pageNo)}
                    >
                      {pdfTileThumbMap.get(tile.pageNo) && (
                        <img src={pdfTileThumbMap.get(tile.pageNo)} alt={`page-${tile.pageNo}`} className="tile-thumb-img" />
                      )}
                      <span>#{tile.pageNo}</span>
                      <small>X {tile.startCol + 1}-{tile.startCol + tile.colsPart}</small>
                      <small>Y {tile.startRow + 1}-{tile.startRow + tile.rowsPart}</small>
                    </button>
                  );
                })}
              </div>
            </>
          )}
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
