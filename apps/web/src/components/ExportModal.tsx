import { useEffect } from 'react';

export type ExportMode = 'jpeg' | 'pdf';

type Props = {
  proMode: boolean;
  exportMode: ExportMode;
  onExportModeChange: (m: ExportMode) => void;
  exportScale: 1 | 2 | 3;
  onExportScaleChange: (s: 1 | 2 | 3) => void;
  pdfPagination: { totalTiles: number; xPages: number; yPages: number } | null;
  pdfPageFrom: number;
  pdfPageTo: number;
  onPdfPageFromChange: (v: number) => void;
  onPdfPageToChange: (v: number) => void;
  isPdfBusy: boolean;
  onExport: () => void;
  onExportCsv: () => void;
  onClose: () => void;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(v)));
}

export default function ExportModal({
  proMode,
  exportMode, onExportModeChange,
  exportScale, onExportScaleChange,
  pdfPagination,
  pdfPageFrom, pdfPageTo,
  onPdfPageFromChange, onPdfPageToChange,
  isPdfBusy,
  onExport, onExportCsv, onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const totalTiles = pdfPagination?.totalTiles ?? 1;
  const showPageRange = exportMode === 'pdf' && proMode && totalTiles > 1;

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box export-modal-box" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
        {/* Header */}
        <div className="modal-header">
          <h3 id="export-modal-title">匯出</h3>
          <button type="button" className="ghost topbar-icon" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        <div className="export-modal-body">
          {/* ── 圖紙匯出 ── */}
          <section className="export-section">
            <h4 className="export-section-title">圖紙匯出</h4>

            {/* Mode */}
            <div className="export-field">
              <span className="export-field-label">輸出模式</span>
              <div className="export-radio-group">
                <div
                  className={`export-radio-card${exportMode === 'jpeg' ? ' selected' : ''}`}
                  onClick={() => onExportModeChange('jpeg')}
                  role="radio"
                  aria-checked={exportMode === 'jpeg'}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === ' ' && onExportModeChange('jpeg')}
                >
                  <input
                    type="radio"
                    name="export-mode"
                    value="jpeg"
                    checked={exportMode === 'jpeg'}
                    onChange={() => onExportModeChange('jpeg')}
                    tabIndex={-1}
                  />
                  <div className="export-radio-content">
                    <span className="export-radio-title">整頁 JPEG</span>
                    <span className="export-radio-hint">整張圖紙縮放成單張影像</span>
                  </div>
                </div>
                <div
                  className={`export-radio-card${exportMode === 'pdf' ? ' selected' : ''}`}
                  onClick={() => onExportModeChange('pdf')}
                  role="radio"
                  aria-checked={exportMode === 'pdf'}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === ' ' && onExportModeChange('pdf')}
                >
                  <input
                    type="radio"
                    name="export-mode"
                    value="pdf"
                    checked={exportMode === 'pdf'}
                    onChange={() => onExportModeChange('pdf')}
                    tabIndex={-1}
                  />
                  <div className="export-radio-content">
                    <span className="export-radio-title">分頁 PDF</span>
                    <span className="export-radio-hint">
                      {pdfPagination && pdfPagination.totalTiles > 1
                        ? `依實際格子大小分頁（共 ${pdfPagination.totalTiles} 頁）`
                        : '依實際格子大小分頁輸出'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Scale */}
            <div className="export-field export-field-row">
              <span className="export-field-label">清晰度</span>
              <div className="export-scale-group">
                {([1, 2, 3] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`export-scale-btn${exportScale === s ? ' selected' : ''}`}
                    onClick={() => onExportScaleChange(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* Page range (pdf + pro + multi-page) */}
            {showPageRange && (
              <div className="export-field export-page-range">
                <span className="export-field-label">匯出範圍</span>
                <div className="export-page-range-row">
                  <label>
                    起始頁
                    <input
                      type="number"
                      min={1}
                      max={totalTiles}
                      value={pdfPageFrom}
                      onChange={(e) => onPdfPageFromChange(clamp(Number(e.target.value) || 1, 1, totalTiles))}
                    />
                  </label>
                  <span className="export-page-sep">—</span>
                  <label>
                    結束頁
                    <input
                      type="number"
                      min={1}
                      max={totalTiles}
                      value={pdfPageTo}
                      onChange={(e) => onPdfPageToChange(clamp(Number(e.target.value) || 1, 1, totalTiles))}
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => { onPdfPageFromChange(1); onPdfPageToChange(totalTiles); }}
                  >
                    全選
                  </button>
                </div>
                <div className="export-page-hint">
                  共 {pdfPagination!.xPages} × {pdfPagination!.yPages} = {totalTiles} 頁
                </div>
              </div>
            )}
          </section>

          {/* ── 用料清單 ── */}
          <section className="export-section export-section-csv">
            <h4 className="export-section-title">用料清單</h4>
            <div className="export-csv-row">
              <div className="export-field-hint">色號名稱與數量，可用試算表開啟對照購買</div>
              <button type="button" className="ghost small" onClick={() => { onExportCsv(); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下載 CSV
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="export-modal-footer">
          <button type="button" className="ghost" onClick={onClose}>取消</button>
          <button
            type="button"
            className="primary"
            onClick={onExport}
            disabled={isPdfBusy}
          >
            {isPdfBusy ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                處理中…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {exportMode === 'jpeg' ? '匯出 JPEG' : '匯出 PDF'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
