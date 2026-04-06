import React, { useState, useEffect } from 'react';

type EditTool = 'pan' | 'paint' | 'erase' | 'bucket' | 'picker';

type CanvasPanelProps = {
  imageMeta: string;
  cols: number;
  rows: number;
  onColsChange: (v: number) => void;
  onRowsChange: (v: number) => void;
  maxGridSize: number;
  isCanvasFullscreen: boolean;
  onToggleFullscreen: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasWrapRef: React.RefObject<HTMLDivElement | null>;
  hasConverted: boolean;
  hasImageBitmap: boolean;
  editTool: EditTool;
  onEditToolChange: (tool: EditTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  largeGridMode: boolean;
  largeOperationScope: 'tile' | 'all';
  onLargeOperationScopeChange: (v: 'tile' | 'all') => void;
  editColorHex: string | null;
  editColorName: string;
  canvasCursor: string | null | undefined;
  cropToolEnabled: boolean;
  onCropToolEnabledChange: (v: boolean) => void;
  onResetCropRect: () => void;
  hasCropRect: boolean;
  gridCropActive: boolean;
  onApplyGridCrop: () => void;
  onColorPanelToggle: () => void;
  largeViewTilePage: number;
  proMode: boolean;
  projectName: string;
  showCode: boolean;
  onShowCodeChange: (v: boolean) => void;
  showRuler: boolean;
  onShowRulerChange: (v: boolean) => void;
  showGuide: boolean;
  onShowGuideChange: (v: boolean) => void;
  guideEvery?: number;
  onGuideEveryChange?: (v: number) => void;
  beadCircleMode: boolean;
  onBeadCircleModeChange: (v: boolean) => void;
  onCanvasClick: React.MouseEventHandler<HTMLCanvasElement>;
  onCanvasMouseDown: React.MouseEventHandler<HTMLCanvasElement>;
  onCanvasMouseMove: React.MouseEventHandler<HTMLCanvasElement>;
  onCanvasMouseUp: React.MouseEventHandler<HTMLCanvasElement>;
  onCanvasMouseLeave: React.MouseEventHandler<HTMLCanvasElement>;
};

export default function CanvasPanel({
  imageMeta,
  cols,
  rows,
  onColsChange,
  onRowsChange,
  maxGridSize,
  isCanvasFullscreen,
  onToggleFullscreen,
  zoom,
  onZoomChange,
  onResetView,
  canvasRef,
  canvasWrapRef,
  hasConverted,
  hasImageBitmap,
  editTool,
  onEditToolChange,
  onUndo,
  onRedo,
  largeGridMode,
  largeOperationScope,
  onLargeOperationScopeChange,
  editColorHex,
  editColorName,
  canvasCursor,
  cropToolEnabled,
  onCropToolEnabledChange,
  onResetCropRect,
  hasCropRect,
  gridCropActive,
  onApplyGridCrop,
  onColorPanelToggle,
  largeViewTilePage,
  proMode,
  projectName,
  showCode,
  onShowCodeChange,
  showRuler,
  onShowRulerChange,
  showGuide,
  onShowGuideChange,
  guideEvery,
  onGuideEveryChange,
  beadCircleMode,
  onBeadCircleModeChange,
  onCanvasClick,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasMouseLeave,
}: CanvasPanelProps) {
  const [colsDraft, setColsDraft] = useState(String(cols));
  const [rowsDraft, setRowsDraft] = useState(String(rows));
  useEffect(() => { setColsDraft(String(cols)); }, [cols]);
  useEffect(() => { setRowsDraft(String(rows)); }, [rows]);

  const commitCols = () => {
    const v = Math.max(1, Math.min(maxGridSize, Math.floor(Number(colsDraft) || 1)));
    setColsDraft(String(v));
    onColsChange(v);
  };
  const commitRows = () => {
    const v = Math.max(1, Math.min(maxGridSize, Math.floor(Number(rowsDraft) || 1)));
    setRowsDraft(String(v));
    onRowsChange(v);
  };

  return (
    <section className="panel canvas-panel">
      <div className="canvas-header">
        {/* ── 左區：尺寸資訊 + 專案名稱 ── */}
        <div className="canvas-header-left">
          {/* 大圖分塊操作範圍（僅大圖模式顯示） */}
          {hasConverted && largeGridMode && (
            <>
              <select value={largeOperationScope} onChange={(e) => onLargeOperationScopeChange(e.target.value as 'tile' | 'all')} title="操作範圍">
                <option value="tile">當前分塊</option>
                <option value="all">全圖</option>
              </select>
              <span className="tool-divider" />
            </>
          )}

          {/* 尺寸輸入 */}
          {hasConverted && (
            <div className="canvas-info">
              <input
                type="number"
                min={1}
                max={maxGridSize}
                value={colsDraft}
                onChange={(e) => setColsDraft(e.target.value)}
                onBlur={commitCols}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                aria-label="寬度（cols）"
              />
              <span style={{ color: 'var(--faint)', fontSize: 12 }}>×</span>
              <input
                type="number"
                min={1}
                max={maxGridSize}
                value={rowsDraft}
                onChange={(e) => setRowsDraft(e.target.value)}
                onBlur={commitRows}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                aria-label="高度（rows）"
              />
            </div>
          )}

          {/* 專案名稱 */}
          <span className="canvas-header-project-name">
            {projectName || '未命名專案'}
          </span>
        </div>

        {/* ── 右區：工具控制槽（較深背景） ── */}
        <div className="canvas-controls-right">
          {/* Guide input 佔位 slot — visibility 控制，不影響其他按鈕位置 */}
          {hasConverted && (
            <div
              className="guide-input-slot"
              style={{ visibility: proMode && showGuide && guideEvery !== undefined ? 'visible' : 'hidden' }}
            >
              <span>每</span>
              <input
                type="number"
                className="canvas-guide-every-input"
                min={1}
                max={256}
                value={guideEvery ?? 10}
                onChange={(e) => onGuideEveryChange && onGuideEveryChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                title="參考線間距（每幾格）"
                aria-label="參考線間距"
              />
              <span>格</span>
            </div>
          )}

          {/* Toggle 按鈕（SVG 圖示，順序：╋ ▦ ∟ ●） */}
          {hasConverted && (
            <div className="canvas-view-toggles">
              {/* 參考線：十字準線，中心留空 */}
              <button
                type="button"
                className={`canvas-view-btn${showGuide ? ' active' : ''}`}
                onClick={() => onShowGuideChange(!showGuide)}
                title="顯示參考線"
                aria-label="顯示參考線"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <line x1="7" y1="1.5" x2="7" y2="5.5"/>
                  <line x1="7" y1="8.5" x2="7" y2="12.5"/>
                  <line x1="1.5" y1="7" x2="5.5" y2="7"/>
                  <line x1="8.5" y1="7" x2="12.5" y2="7"/>
                </svg>
              </button>
              {/* 色碼：# 井號 */}
              <button
                type="button"
                className={`canvas-view-btn${showCode ? ' active' : ''}`}
                onClick={() => onShowCodeChange(!showCode)}
                title="顯示色號"
                aria-label="顯示色號"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <line x1="4.5" y1="2" x2="3" y2="12"/>
                  <line x1="9" y1="2" x2="7.5" y2="12"/>
                  <line x1="1.5" y1="5.5" x2="11.5" y2="5.5"/>
                  <line x1="1" y1="8.5" x2="11" y2="8.5"/>
                </svg>
              </button>
              {/* 尺規：水平長條 + 底部刻度線 */}
              <button
                type="button"
                className={`canvas-view-btn${showRuler ? ' active' : ''}`}
                onClick={() => onShowRulerChange(!showRuler)}
                title="顯示尺規"
                aria-label="顯示尺規"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <rect x="1.5" y="4" width="11" height="5"/>
                  <line x1="4.5" y1="9" x2="4.5" y2="12"/>
                  <line x1="7" y1="9" x2="7" y2="11"/>
                  <line x1="9.5" y1="9" x2="9.5" y2="12"/>
                </svg>
              </button>
              {/* 圓形豆：空心圓圈 */}
              <button
                type="button"
                className={`canvas-view-btn${beadCircleMode ? ' active' : ''}`}
                onClick={() => onBeadCircleModeChange(!beadCircleMode)}
                title={beadCircleMode ? '切換方形格子' : '切換圓形拼豆'}
                aria-label="圓形拼豆模式"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <circle cx="7" cy="7" r="4.5"/>
                </svg>
              </button>
            </div>
          )}

          {/* 分隔線 */}
          <span className="canvas-divider" />

          {/* 縮放控制（使用相同的 canvas-view-btn 樣式） */}
          <div className="zoom-tools">
            <button
              type="button"
              className="canvas-view-btn"
              onClick={onToggleFullscreen}
              title={isCanvasFullscreen ? '退出全螢幕' : '畫布全螢幕'}
              aria-label={isCanvasFullscreen ? '退出全螢幕' : '畫布全螢幕'}
            >
              {isCanvasFullscreen ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>
              )}
            </button>
            <button
              type="button"
              className="canvas-view-btn"
              onClick={() => onZoomChange(Math.max(0.25, Number((zoom - 0.1).toFixed(2))))}
              title="縮小"
              aria-label="縮小"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <input
              type="number"
              className="zoom-input"
              min={25}
              max={800}
              step={0.1}
              value={Number((zoom * 100).toFixed(1))}
              onChange={(e) => {
                const p = Number(e.target.value);
                if (Number.isFinite(p)) onZoomChange(Math.max(0.25, Math.min(8, p / 100)));
              }}
              aria-label="縮放比例"
            />
            <span className="zoom-percent">%</span>
            <button
              type="button"
              className="canvas-view-btn"
              onClick={() => onZoomChange(Math.min(8, Number((zoom + 0.1).toFixed(2))))}
              title="放大"
              aria-label="放大"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button
              type="button"
              className="canvas-view-btn"
              onClick={onResetView}
              title="重置視圖"
              aria-label="重置視圖"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
          </div>
        </div>
      </div>

        {/* ── Canvas ── */}
        <div className="canvas-wrap" ref={canvasWrapRef} style={{ position: 'relative' }}>
          {!hasConverted && !hasImageBitmap && (
            <div className="empty-state-card" style={{ position: 'absolute', inset: 0 }}>
              <div className="empty-state-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <p className="empty-state-title">開始製作拼豆圖紙</p>
              <p className="empty-state-desc">在左側面板選擇色庫、上傳圖片，點擊「開始轉換」後圖紙會顯示在這裡。</p>
              <ol className="empty-state-steps">
                <li><span className="step-num">1</span>選擇作用群組（色庫）</li>
                <li><span className="step-num">2</span>上傳或拖曳一張圖片</li>
                <li><span className="step-num">3</span>設定格線大小後點「開始轉換」</li>
              </ol>
              <p className="empty-state-desc" style={{ marginTop: 8 }}>
                或點擊左側「建立空白畫布」，從零開始繪製。
              </p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={
              cropToolEnabled && hasImageBitmap
                ? 'tool-crop'
                : gridCropActive
                ? 'tool-crop'
                : !hasConverted
                ? 'tool-pan'
                : editTool === 'pan'
                ? 'tool-pan'
                : editTool === 'erase'
                ? 'tool-erase'
                : editTool === 'picker'
                ? 'tool-picker'
                : 'tool-paint'
            }
            style={{
              ...(canvasCursor ? { cursor: canvasCursor } : {}),
              opacity: (!hasConverted && !hasImageBitmap) ? 0 : 1,
            }}
            width={960}
            height={960}
            onClick={onCanvasClick}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            onMouseLeave={onCanvasMouseLeave}
          />
        </div>
      {largeGridMode && (
        <p className="hint">
          大圖模式：{largeViewTilePage > 0 ? `分塊 #${largeViewTilePage}` : '全圖'}｜替換/油漆桶可選「當前分塊 / 全圖」
        </p>
      )}
    </section>
  );
}
