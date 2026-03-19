import { useEffect, useMemo, useState } from 'react';
import type { CustomPaletteColor, CustomPaletteGroup } from '../services/customPaletteStore';

// ---- local types ----
type PaletteColor = {
  name: string;
  hex: string;
  rgb: [number, number, number];
  lab: [number, number, number];
};
type PaletteGroup = {
  id?: string;
  isCustom?: boolean;
  name: string;
  colors: PaletteColor[];
};

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

  return (
    <main className="layout palette-layout">
      <section className="panel controls">
        <h2>色庫管理</h2>
        <p className="hint">可複製現有群組建立自訂色庫，並編輯色號。一般版不提供匯入/匯出。</p>
        <div className="row two">
          <button type="button" className={paletteTab === 'builtin' ? 'primary' : 'ghost'} onClick={() => onSetPaletteTab('builtin')}>
            原有色庫
          </button>
          <button type="button" className={paletteTab === 'custom' ? 'primary' : 'ghost'} onClick={() => onSetPaletteTab('custom')}>
            自訂色庫
          </button>
        </div>
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
            <div className="row one">
              <button type="button" className="ghost" onClick={() => onCreateCustomGroup(null)}>
                新建空白色庫
              </button>
            </div>
            <p className="hint">請在右側卡片點選要編輯的自訂群組，進入後可直接點色票改色。</p>
            {editablePaletteGroup && (
              <>
                <div className="row three">
                  <input type="text" value={paletteNewGroupName} onChange={(e) => onSetPaletteNewGroupName(e.target.value)} />
                  <button type="button" className="ghost" onClick={onUpdateCustomGroupName}>更新群組名</button>
                  <button type="button" className="ghost" onClick={onDeleteCustomGroup}>刪除群組</button>
                </div>
                <div className="row three">
                  <input type="text" placeholder="色號名稱" value={paletteNewColorName} onChange={(e) => onSetPaletteNewColorName(e.target.value)} />
                  <input type="color" value={normalizeColorHex(paletteNewColorHex).toLowerCase()} onChange={(e) => onSetPaletteNewColorHex(e.target.value)} />
                  <button type="button" className="ghost" onClick={onAddColorToCustomGroup}>新增色號</button>
                </div>
              </>
            )}
          </>
        )}
        {proMode && (
          <div className="row two">
            <button type="button" className="ghost" onClick={onExportCustomPaletteJson}>
              匯出自訂色庫
            </button>
            <label>
              匯入自訂色庫
              <input
                type="file"
                accept="application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  onImportCustomPaletteJson(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        )}
        <p className="status">{statusText}</p>
      </section>

      <section className="panel stats">
        <h2>{paletteTab === 'builtin' ? '原有色庫總覽' : '自訂色號明細'}</h2>
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
                    <div key={`${editablePaletteGroup.id}-${idx}`} className="palette-color-edit-cell">
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
                          <div className="palette-color-popover-head">
                            <strong>{c.name}</strong>
                            <button type="button" className="ghost" onClick={() => setCustomEditColorIndex(null)}>
                              關閉
                            </button>
                          </div>
                          <input
                            type="color"
                            value={normalizeColorHex(customEditColorHex).toLowerCase()}
                            onChange={(e) => setCustomEditColorHex(e.target.value)}
                            aria-label="選擇顏色"
                          />
                          <div className="row two">
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
                          <div className="row three">
                            <input type="number" min={0} max={255} value={customEditRgb[0]} onChange={(e) => setCustomEditRgbChannel(0, e.target.value)} onBlur={applyCustomEditHex} aria-label="R" />
                            <input type="number" min={0} max={255} value={customEditRgb[1]} onChange={(e) => setCustomEditRgbChannel(1, e.target.value)} onBlur={applyCustomEditHex} aria-label="G" />
                            <input type="number" min={0} max={255} value={customEditRgb[2]} onChange={(e) => setCustomEditRgbChannel(2, e.target.value)} onBlur={applyCustomEditHex} aria-label="B" />
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
    </main>
  );
}
