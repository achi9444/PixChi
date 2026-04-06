import { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomPaletteColor, CustomPaletteGroup } from '../services/customPaletteStore';
import type { PaletteColor, PaletteGroup } from '../types/palette';

// ---- color utilities ----
function normalizeColorHex(input: string) {
  const hex = String(input ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex.toUpperCase();
  return '#FFFFFF';
}
function clampByte(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}
function rgbToHex(r: number, g: number, b: number) {
  const to2 = (n: number) => clampByte(n).toString(16).toUpperCase().padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
// 計算相對亮度，決定文字要用白或黑
function swatchInkColor(hex: string): string {
  const [r, g, b] = hexToRgb(normalizeColorHex(hex));
  // sRGB 亮度公式
  const L = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  return L > 0.45 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)';
}

// ---- props ----
type Props = {
  paletteTab: 'builtin' | 'custom';
  onSetPaletteTab: (tab: 'builtin' | 'custom') => void;
  builtinGroups: PaletteGroup[];
  customPaletteGroups: CustomPaletteGroup[];
  builtinPreviewGroupName: string;
  builtinPreviewGroup: PaletteGroup | null;
  onSetBuiltinPreviewGroupName: (name: string) => void;
  paletteNewGroupName: string;
  onSetPaletteNewGroupName: (name: string) => void;
  paletteEditGroupId: string;
  onSetPaletteEditGroupId: (id: string) => void;
  editablePaletteGroup: CustomPaletteGroup | null;
  paletteNewColorName: string;
  onSetPaletteNewColorName: (name: string) => void;
  paletteNewColorHex: string;
  onSetPaletteNewColorHex: (hex: string) => void;
  proMode: boolean;
  statusText: string;
  onCreateCustomGroup: (source?: PaletteGroup | null) => void;
  onUpdateCustomGroupName: () => void;
  onDeleteCustomGroup: () => void;
  onAddColorToCustomGroup: () => void;
  onUpdateColor: (colorIndex: number, next: Partial<CustomPaletteColor>) => void;
  onExportCustomPaletteJson: () => void;
  onImportCustomPaletteJson: (file: File | null) => void;
};

export default function PalettePage({
  paletteTab, onSetPaletteTab,
  builtinGroups, customPaletteGroups,
  builtinPreviewGroupName, builtinPreviewGroup, onSetBuiltinPreviewGroupName,
  paletteNewGroupName, onSetPaletteNewGroupName,
  paletteEditGroupId, onSetPaletteEditGroupId,
  editablePaletteGroup,
  paletteNewColorName, onSetPaletteNewColorName,
  paletteNewColorHex, onSetPaletteNewColorHex,
  proMode, statusText,
  onCreateCustomGroup, onUpdateCustomGroupName, onDeleteCustomGroup,
  onAddColorToCustomGroup, onUpdateColor,
  onExportCustomPaletteJson, onImportCustomPaletteJson,
}: Props) {
  const [customEditColorIndex, setCustomEditColorIndex] = useState<number | null>(null);
  const [customEditColorHex, setCustomEditColorHex] = useState('#ffffff');

  // ESC 關閉色號編輯 popover
  useEffect(() => {
    if (customEditColorIndex == null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCustomEditColorIndex(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [customEditColorIndex]);

  // 當編輯群組或選取色號改變時，同步 hex 輸入框
  useEffect(() => {
    if (!editablePaletteGroup || customEditColorIndex == null) {
      setCustomEditColorIndex(null);
      return;
    }
    const c = editablePaletteGroup.colors[customEditColorIndex];
    if (!c) {
      setCustomEditColorIndex(null);
      return;
    }
    setCustomEditColorHex(normalizeColorHex(c.hex).toLowerCase());
  }, [editablePaletteGroup, customEditColorIndex]);

  const customEditRgb = useMemo(() => {
    return hexToRgb(normalizeColorHex(customEditColorHex));
  }, [customEditColorHex]);

  const applyCustomEditHex = () => {
    if (customEditColorIndex == null) return;
    const hex = normalizeColorHex(customEditColorHex);
    onUpdateColor(customEditColorIndex, { hex });
    setCustomEditColorHex(hex.toLowerCase());
  };

  const setCustomEditRgbChannel = (channel: 0 | 1 | 2, value: string) => {
    const v = clampByte(Number(value));
    const next: [number, number, number] = [...customEditRgb] as [number, number, number];
    next[channel] = v;
    setCustomEditColorHex(rgbToHex(next[0], next[1], next[2]).toLowerCase());
  };

  const paletteImportRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="page-shell palette-page">
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h2>色庫管理</h2>
            <p className="hint">
              {proMode
                ? '可複製現有群組建立自訂色庫，並編輯色號。支援匯入/匯出 JSON。'
                : '可複製現有群組建立自訂色庫，並編輯色號。升級 Pro 可匯入/匯出。'}
            </p>
          </div>
          {proMode && (
            <div className="page-header-actions">
              <button type="button" className="ghost" style={{ width: 'auto' }} onClick={onExportCustomPaletteJson}>
                匯出 JSON
              </button>
              <button type="button" className="ghost" style={{ width: 'auto' }} onClick={() => paletteImportRef.current?.click()}>
                匯入 JSON
              </button>
              <input
                ref={paletteImportRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  onImportCustomPaletteJson(file);
                  e.currentTarget.value = '';
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="page-sticky-bar">
        <div className="page-sticky-bar-inner" style={{ height: 44 }}>
          <div className="page-tabs">
            <button type="button" className={`page-tab-btn${paletteTab === 'builtin' ? ' active' : ''}`} onClick={() => onSetPaletteTab('builtin')}>
              原有色庫
            </button>
            <button type="button" className={`page-tab-btn${paletteTab === 'custom' ? ' active' : ''}`} onClick={() => onSetPaletteTab('custom')}>
              自訂色庫
            </button>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="page-content-inner">
          <div className="palette-two-col">
            <aside className="panel palette-controls-col">
              {paletteTab === 'builtin' ? (
                <>
                  <p className="hint">請在右側卡片點選要預覽的群組，進入後可複製到自訂色庫。</p>
                  <label>
                    新群組名稱（可選）
                    <input type="text" value={paletteNewGroupName} onChange={(e) => onSetPaletteNewGroupName(e.target.value)} placeholder="留空會自動命名" />
                  </label>
                </>
              ) : (
                <>
                  {/* ── 新建群組 ── */}
                  <div className="row one">
                    <button type="button" className="ghost" onClick={() => onCreateCustomGroup(null)}>
                      新建空白色庫
                    </button>
                  </div>
                  <p className="hint">點選右側群組卡片進入編輯模式，可直接點色票改色。</p>

                  {editablePaletteGroup && (
                    <>
                      <hr />

                      {/* ── 群組管理 ── */}
                      <h3>群組管理</h3>
                      <label>
                        群組名稱
                        <input
                          type="text"
                          value={paletteNewGroupName}
                          onChange={(e) => onSetPaletteNewGroupName(e.target.value)}
                        />
                      </label>
                      <div className="row two" style={{ marginTop: 8 }}>
                        <button type="button" className="ghost" onClick={onUpdateCustomGroupName}>更新名稱</button>
                        <button type="button" className="danger" onClick={onDeleteCustomGroup}>刪除群組</button>
                      </div>

                      <hr />

                      {/* ── 新增色號 ── */}
                      <h3>新增色號</h3>
                      <label>
                        色號名稱
                        <input
                          type="text"
                          placeholder="例如 A1、紅色…"
                          value={paletteNewColorName}
                          onChange={(e) => onSetPaletteNewColorName(e.target.value)}
                        />
                      </label>
                      <label style={{ marginTop: 8 }}>
                        選色
                        <div className="palette-add-color-row">
                          <input
                            type="color"
                            value={normalizeColorHex(paletteNewColorHex).toLowerCase()}
                            onChange={(e) => onSetPaletteNewColorHex(e.target.value)}
                            style={{ width: 48, height: 36, padding: '2px 4px', flexShrink: 0 }}
                          />
                          <input
                            type="text"
                            className="palette-add-color-hex"
                            value={paletteNewColorHex}
                            onChange={(e) => onSetPaletteNewColorHex(e.target.value)}
                            onBlur={(e) => onSetPaletteNewColorHex(normalizeColorHex(e.target.value))}
                            placeholder="#RRGGBB"
                            maxLength={7}
                            spellCheck={false}
                          />
                        </div>
                      </label>
                      <div className="row one" style={{ marginTop: 8 }}>
                        <button type="button" className="primary" onClick={onAddColorToCustomGroup}>新增色號</button>
                      </div>
                    </>
                  )}
                </>
              )}
              <p className="status">{statusText}</p>
            </aside>

            <section>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>
                {paletteTab === 'builtin' ? '原有色庫總覽' : '自訂色號明細'}
              </h3>
        {paletteTab === 'builtin' ? (
          <div className="palette-library">
            <div className="palette-group-grid">
              {builtinGroups.map((g) => (
                <button
                  type="button"
                  key={`builtin-card-${g.name}`}
                  className={`palette-group-card ${builtinPreviewGroupName === g.name ? 'active' : ''}`.trim()}
                  onClick={() => onSetBuiltinPreviewGroupName(g.name)}
                >
                  <div className="palette-group-cover">
                    {(g.colors.length ? g.colors : [{ name: '-', hex: '#FFFFFF', rgb: [255, 255, 255] as [number, number, number], lab: [100, 0, 0] as [number, number, number] }])
                      .slice(0, 36)
                      .map((c) => (
                        <span key={`${g.name}-${c.name}`} style={{ background: c.hex }} />
                      ))}
                  </div>
                  <div className="palette-group-meta">
                    <strong>{g.name}</strong>
                    <small>{g.colors.length} 色</small>
                  </div>
                </button>
              ))}
            </div>
            {builtinPreviewGroup && (
              <div className="palette-preview">
                <div className="palette-preview-head">
                  <h3>{builtinPreviewGroup.name} 色號預覽（{builtinPreviewGroup.colors.length}）</h3>
                  <button type="button" className="primary" onClick={() => onCreateCustomGroup(builtinPreviewGroup)}>
                    複製到自訂
                  </button>
                </div>
                <div className="palette-color-grid">
                  {builtinPreviewGroup.colors.map((c) => (
                    <div key={`${builtinPreviewGroup.name}-${c.name}`} className="palette-color-tile">
                      <span className="color-pill tiny" style={{ color: c.hex }} />
                      <strong>{c.name}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : customPaletteGroups.length ? (
          <div className="palette-library">
            <div className="palette-group-grid">
              {customPaletteGroups.map((g) => (
                <button
                  type="button"
                  key={`custom-card-${g.id}`}
                  className={`palette-group-card ${paletteEditGroupId === g.id ? 'active' : ''}`.trim()}
                  onClick={() => onSetPaletteEditGroupId(g.id)}
                >
                  <div className="palette-group-cover">
                    {(g.colors.length ? g.colors : [{ name: '-', hex: '#FFFFFF' }])
                      .slice(0, 36)
                      .map((c) => (
                        <span key={`${g.id}-${c.name}`} style={{ background: c.hex }} />
                      ))}
                  </div>
                  <div className="palette-group-meta">
                    <strong>{g.name}</strong>
                    <small>{g.colors.length} 色</small>
                  </div>
                </button>
              ))}
            </div>
            {editablePaletteGroup && (
              <div className="palette-preview">
                <div className="palette-preview-head">
                  <h3>{editablePaletteGroup.name} 色號預覽（{editablePaletteGroup.colors.length}）</h3>
                </div>
                <div className="palette-color-grid">
                  {editablePaletteGroup.colors.map((c, idx) => (
                    <div key={`${editablePaletteGroup.id}-${c.name}-${idx}`} className="palette-color-edit-cell">
                      <button
                        type="button"
                        className={`palette-color-tile editable ${customEditColorIndex === idx ? 'active' : ''}`.trim()}
                        onClick={() => {
                          if (customEditColorIndex === idx) {
                            setCustomEditColorIndex(null);
                            return;
                          }
                          setCustomEditColorIndex(idx);
                          setCustomEditColorHex(normalizeColorHex(c.hex).toLowerCase());
                        }}
                      >
                        <span className="color-pill tiny" style={{ color: c.hex }} />
                        <strong>{c.name}</strong>
                      </button>
                      {customEditColorIndex === idx && (
                        <div className="palette-color-popover" onClick={(e) => e.stopPropagation()}>
                          {/* 大色塊 = 選色器觸發區，關閉鈕在右上角 */}
                          <label
                            className="palette-color-popover-swatch"
                            style={{ background: normalizeColorHex(customEditColorHex), cursor: 'pointer' }}
                            title="點擊選色"
                          >
                            <button
                              type="button"
                              className="palette-color-popover-close"
                              onClick={(e) => { e.preventDefault(); setCustomEditColorIndex(null); }}
                              aria-label="關閉"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                            <span className="palette-color-popover-swatch-label" style={{ color: swatchInkColor(customEditColorHex) }}>
                              {c.name}
                            </span>
                            <span className="palette-color-popover-swatch-hint" style={{ color: swatchInkColor(customEditColorHex) }}>
                              點擊選色
                            </span>
                            <input
                              type="color"
                              value={normalizeColorHex(customEditColorHex).toLowerCase()}
                              onChange={(e) => setCustomEditColorHex(e.target.value)}
                              aria-label="選擇顏色"
                              style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer' }}
                            />
                          </label>
                          {/* 標題列（只留標題，無關閉鈕） */}
                          <div className="palette-color-popover-head">
                            <strong>編輯色號</strong>
                          </div>
                          {/* 表單區 */}
                          <div className="palette-color-popover-body">
                            <div className="palette-color-popover-hex-row">
                              <input
                                type="text"
                                value={customEditColorHex.toUpperCase()}
                                onChange={(e) => setCustomEditColorHex(e.target.value)}
                                onBlur={applyCustomEditHex}
                                onKeyDown={(e) => { if (e.key === 'Enter') applyCustomEditHex(); }}
                                placeholder="#RRGGBB"
                              />
                              <button type="button" className="primary" onClick={applyCustomEditHex}>
                                套用
                              </button>
                            </div>
                            <div className="palette-color-popover-rgb">
                              <div className="palette-color-popover-rgb-channel">
                                <label>R</label>
                                <input type="number" min={0} max={255} value={customEditRgb[0]} onChange={(e) => setCustomEditRgbChannel(0, e.target.value)} onBlur={applyCustomEditHex} aria-label="R" />
                              </div>
                              <div className="palette-color-popover-rgb-channel">
                                <label>G</label>
                                <input type="number" min={0} max={255} value={customEditRgb[1]} onChange={(e) => setCustomEditRgbChannel(1, e.target.value)} onBlur={applyCustomEditHex} aria-label="G" />
                              </div>
                              <div className="palette-color-popover-rgb-channel">
                                <label>B</label>
                                <input type="number" min={0} max={255} value={customEditRgb[2]} onChange={(e) => setCustomEditRgbChannel(2, e.target.value)} onBlur={applyCustomEditHex} aria-label="B" />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="hint">請先建立或選擇一個自訂群組。</p>
        )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
