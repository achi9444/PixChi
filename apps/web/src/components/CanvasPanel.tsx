import React from 'react';

type EditTool = 'pan' | 'paint' | 'erase' | 'bucket' | 'picker';

type CanvasPanelProps = {
  gridMeta: string;
  imageMeta: string;
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
  brushSize: number;
  onBrushSizeChange: (v: number) => void;
  bucketMode: 'global' | 'region';
  onBucketModeChange: (v: 'global' | 'region') => void;
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
  onSetFocusColor: () => void;
  largeViewTilePage: number;
  proMode: boolean;
  onCanvasClick: React.MouseEventHandler<HTMLCanvasElement>;
  onCanvasMouseDown: React.MouseEventHandler<HTMLCanvasElement>;
  onCanvasMouseMove: React.MouseEventHandler<HTMLCanvasElement>;
  onCanvasMouseUp: React.MouseEventHandler<HTMLCanvasElement>;
  onCanvasMouseLeave: React.MouseEventHandler<HTMLCanvasElement>;
};

export default function CanvasPanel({
  gridMeta,
  imageMeta,
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
  brushSize,
  onBrushSizeChange,
  bucketMode,
  onBucketModeChange,
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
  onSetFocusColor,
  largeViewTilePage,
  proMode,
  onCanvasClick,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasMouseLeave,
}: CanvasPanelProps) {
  return (
    <section className="panel canvas-panel">
      {/* ── Canvas Header: 工具列 + 尺寸資訊 + 縮放 ── */}
      <div className="canvas-header">
        {/* 左：工具按鈕（僅轉換後顯示）*/}
        {hasConverted && (
          <div className="tool-group">
            <button className={`icon-btn ${editTool === 'pan' ? 'primary active-tool' : 'ghost'}`} onClick={() => onEditToolChange('pan')} type="button" title="手型（拖曳視圖）">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
              </svg>
            </button>
            <button className={`icon-btn ${editTool === 'paint' ? 'primary active-tool' : 'ghost'}`} onClick={() => onEditToolChange('paint')} type="button" title="上色工具">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
            </button>
            <button className={`icon-btn ${editTool === 'erase' ? 'primary active-tool' : 'ghost'}`} onClick={() => onEditToolChange('erase')} type="button" title="橡皮擦">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>
                <path d="M22 21H7"/>
              </svg>
            </button>
            <button className={`icon-btn ${editTool === 'bucket' ? 'primary active-tool' : 'ghost'}`} onClick={() => onEditToolChange('bucket')} type="button" title="油漆桶">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m19 11-8-8-8.5 8.5a5.5 5.5 0 0 0 7.78 7.78L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/>
                <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/>
              </svg>
            </button>
            <button className={`icon-btn ${editTool === 'picker' ? 'primary active-tool' : 'ghost'}`} onClick={() => onEditToolChange('picker')} type="button" title="取色工具">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/>
                <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>
              </svg>
            </button>

            <span className="tool-divider" />

            {/* 目前選色指示器 — 左鍵開修色面板，右鍵設焦點色 */}
            {editColorHex && (
              <span
                className="color-indicator clickable"
                role="button"
                tabIndex={0}
                title={`${editColorName || '目前選色'}（點擊開啟修色面板 / 右鍵設焦點色）`}
                style={{ background: editColorHex, borderColor: editColorHex === '#FFFFFF' ? 'var(--line)' : editColorHex }}
                onClick={onColorPanelToggle}
                onContextMenu={(e) => { e.preventDefault(); onSetFocusColor(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onColorPanelToggle(); } }}
              />
            )}

            <span className="tool-divider" />

            {(editTool === 'paint' || editTool === 'erase') && (
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={brushSize}
                onChange={(e) => onBrushSizeChange(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))}
                title={`筆刷 ${brushSize}×${brushSize}`}
              />
            )}
            {editTool === 'bucket' && (
              <select value={bucketMode} onChange={(e) => onBucketModeChange(e.target.value as 'global' | 'region')} title="油漆桶模式">
                <option value="global">全圖同色</option>
                <option value="region">連通區</option>
              </select>
            )}
            {largeGridMode && (
              <select value={largeOperationScope} onChange={(e) => onLargeOperationScopeChange(e.target.value as 'tile' | 'all')} title="操作範圍">
                <option value="tile">當前分塊</option>
                <option value="all">全圖</option>
              </select>
            )}

            <span className="tool-divider" />

            <button className="ghost icon-btn" onClick={onUndo} type="button" title="復原 (Ctrl+Z)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
              </svg>
            </button>
            <button className="ghost icon-btn" onClick={onRedo} type="button" title="重做 (Ctrl+Y)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
              </svg>
            </button>
          </div>
        )}

        {/* 中：尺寸資訊 */}
        <span className="canvas-info">{gridMeta}</span>

        {/* 裁切工具（僅有圖片時顯示）*/}
        {(hasImageBitmap || hasConverted) && (
          <div className="tool-group">
            <button
              className={`icon-btn ${cropToolEnabled ? 'primary active-tool' : 'ghost'}`}
              onClick={() => onCropToolEnabledChange(!cropToolEnabled)}
              type="button"
              title={cropToolEnabled ? '關閉裁切' : '裁切工具'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 2v4"/><path d="M6 6h14v14"/><path d="M18 22v-4"/><path d="M18 18H4V4"/>
              </svg>
            </button>
            {cropToolEnabled && hasCropRect && !gridCropActive && (
              <button className="ghost icon-btn" onClick={onResetCropRect} type="button" title="重設裁切">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
              </button>
            )}
            {gridCropActive && (
              <button className="primary icon-btn" onClick={onApplyGridCrop} type="button" title="套用格線裁切" style={{ fontSize: 12, padding: '2px 8px' }}>
                套用
              </button>
            )}
            <span className="tool-divider" />
          </div>
        )}

        {/* 右：縮放控制 */}
        <div className="zoom-tools">
          <button type="button" className="ghost" onClick={onToggleFullscreen} title={isCanvasFullscreen ? '退出全螢幕' : '畫布全螢幕'} aria-label={isCanvasFullscreen ? '退出全螢幕' : '畫布全螢幕'}>
            {isCanvasFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>
            )}
          </button>
          <button type="button" className="ghost" onClick={() => onZoomChange(Math.max(0.25, Number((zoom - 0.1).toFixed(2))))} title="縮小" aria-label="縮小">
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
          />
          <span>%</span>
          <button type="button" className="ghost" onClick={() => onZoomChange(Math.min(8, Number((zoom + 0.1).toFixed(2))))} title="放大" aria-label="放大">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button type="button" className="ghost" onClick={onResetView} title="重置視圖" aria-label="重置視圖">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
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
      <p className="hint">
        {hasConverted
          ? '手型可拖曳視圖，滾輪可縮放；上色與橡皮擦可編輯格子。若要再裁切，先開啟左側裁切工具。'
          : '上傳後會先顯示原圖；裁切工具支援角/邊微調與框內移動。Shift 鎖比例、Alt 由中心縮放、Esc 取消拖曳。拖曳超出圖片邊界可補白邊。'}
      </p>
      {largeGridMode && (
        <p className="hint">
          大圖檢視：{largeViewTilePage > 0 ? `分塊 #${largeViewTilePage}` : '全圖'}；替換/油漆桶全圖同色可套用「當前分塊 / 全圖」範圍。
        </p>
      )}
      {largeGridMode && <p className="hint">已啟用大圖模式：為了流暢度，畫布會簡化格線與色號文字顯示。</p>}
      {proMode && <p className="hint">Pro 模式已啟用：可使用尺規與參考線（並會套用到 PDF 匯出）。</p>}
    </section>
  );
}
