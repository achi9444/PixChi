import React, { useRef, useState, useCallback, useEffect } from 'react';

export const EMPTY_EDIT_COLOR_NAME = '__EMPTY__';
export const EMPTY_EDIT_COLOR = { name: '無', hex: '#FFFFFF' };

type ColorInfo = { name: string; hex: string };

type FloatingColorPanelProps = {
  visible: boolean;
  onClose: () => void;
  // focus color
  focusColorName: string;
  focusColorSearch: string;
  focusColorMenuOpen: boolean;
  focusColorMenuRef: React.RefObject<HTMLDivElement | null>;
  selectedFocusColor: ColorInfo | null;
  filteredFocusColors: ColorInfo[];
  constructionMode: boolean;
  focusNeighborEnabled: boolean;
  focusNeighborDeltaE: number;
  onFocusColorNameChange: (name: string) => void;
  onFocusColorSearchChange: (v: string) => void;
  onFocusColorMenuOpenChange: (v: boolean | ((prev: boolean) => boolean)) => void;
  onClearConstructionFocus: () => void;
  onFocusNeighborEnabledChange: (v: boolean) => void;
  onFocusNeighborDeltaEChange: (v: number) => void;
  // edit color
  editColorName: string;
  editColorMenuOpen: boolean;
  colorMenuRef: React.RefObject<HTMLDivElement | null>;
  selectedEditColor: ColorInfo | null;
  paletteSearch: string;
  filteredEditColors: ColorInfo[];
  onEditColorNameChange: (name: string) => void;
  onEditColorMenuOpenChange: (v: boolean | ((prev: boolean) => boolean)) => void;
  onPaletteSearchChange: (v: string) => void;
  // actions
  onReplaceAllSameColor: () => void;
  onAddOneCellOutline: () => void;
};

const DEFAULT_POS = { x: 300, y: 80 };

export default function FloatingColorPanel({
  visible,
  onClose,
  focusColorName,
  focusColorSearch,
  focusColorMenuOpen,
  focusColorMenuRef,
  selectedFocusColor,
  filteredFocusColors,
  constructionMode,
  focusNeighborEnabled,
  focusNeighborDeltaE,
  onFocusColorNameChange,
  onFocusColorSearchChange,
  onFocusColorMenuOpenChange,
  onClearConstructionFocus,
  onFocusNeighborEnabledChange,
  onFocusNeighborDeltaEChange,
  editColorMenuOpen,
  colorMenuRef,
  selectedEditColor,
  paletteSearch,
  filteredEditColors,
  onEditColorNameChange,
  onEditColorMenuOpenChange,
  onPaletteSearchChange,
  onReplaceAllSameColor,
  onAddOneCellOutline,
}: FloatingColorPanelProps) {
  const [pos, setPos] = useState(DEFAULT_POS);
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Reset position on close
  const handleClose = useCallback(() => {
    onClose();
    setPos(DEFAULT_POS);
    setMinimized(false);
  }, [onClose]);

  // Drag handling
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({ x: dragRef.current.startPosX + dx, y: dragRef.current.startPosY + dy });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  // Keep panel within viewport
  useEffect(() => {
    if (!visible || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    let nx = pos.x;
    let ny = pos.y;
    if (rect.right > window.innerWidth) nx = Math.max(0, window.innerWidth - rect.width - 8);
    if (rect.bottom > window.innerHeight) ny = Math.max(0, window.innerHeight - rect.height - 8);
    if (nx < 0) nx = 8;
    if (ny < 0) ny = 8;
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
  }, [visible, pos]);

  if (!visible) return null;

  // Minimized state: small color chip
  if (minimized) {
    return (
      <div
        className="floating-panel-mini"
        style={{ left: pos.x, top: pos.y }}
        onClick={() => setMinimized(false)}
        onMouseDown={onDragStart}
        title={selectedEditColor ? `修色面板 — ${selectedEditColor.name}` : '修色面板'}
      >
        <span
          className="floating-panel-mini-color"
          style={{ background: selectedEditColor?.hex || '#ccc' }}
        />
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="floating-panel" ref={panelRef} style={{ left: pos.x, top: pos.y }}>
      {/* Title bar — draggable */}
      <div className="floating-panel-titlebar" onMouseDown={onDragStart}>
        <span className="floating-panel-title">修色面板</span>
        <div className="floating-panel-actions">
          <button type="button" className="floating-panel-btn" onClick={() => setMinimized(true)} title="縮小">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button type="button" className="floating-panel-btn" onClick={handleClose} title="關閉">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="floating-panel-body">
        {/* Focus color */}
        <label>
          <span className="floating-label-row">
            焦點色
            {selectedFocusColor && <span className="color-pill tiny" style={{ color: selectedFocusColor.hex }} />}
          </span>
          <div className="color-select" ref={focusColorMenuRef}>
            <div className="color-select-trigger-input">
              <input
                type="text"
                placeholder={constructionMode ? '施工模式焦點由任務決定' : '搜尋焦點色...'}
                value={focusColorMenuOpen ? focusColorSearch : selectedFocusColor ? selectedFocusColor.name : ''}
                disabled={constructionMode}
                onFocus={() => {
                  if (constructionMode) return;
                  onFocusColorMenuOpenChange(true);
                  onFocusColorSearchChange('');
                }}
                onChange={(e) => {
                  if (constructionMode) return;
                  onFocusColorSearchChange(e.target.value);
                  if (!focusColorMenuOpen) onFocusColorMenuOpenChange(true);
                }}
                onKeyDown={(e) => {
                  if (constructionMode) return;
                  if (e.key !== 'Enter') return;
                  if (!filteredFocusColors.length) return;
                  onFocusColorNameChange(filteredFocusColors[0].name);
                  onFocusColorMenuOpenChange(false);
                  onFocusColorSearchChange('');
                }}
              />
              <button type="button" className="ghost color-select-toggle" onClick={() => onFocusColorMenuOpenChange((v) => !v)}>▾</button>
            </div>
            {focusColorMenuOpen && (
              <div className="color-select-menu">
                <button type="button" className="color-select-option clear-option" onClick={() => {
                  if (constructionMode) onClearConstructionFocus();
                  else onFocusColorNameChange('');
                  onFocusColorMenuOpenChange(false);
                }}>清除焦點</button>
                {!constructionMode && filteredFocusColors.map((c) => (
                  <button key={c.name} type="button" className="color-select-option" onClick={() => { onFocusColorNameChange(c.name); onFocusColorMenuOpenChange(false); }}>
                    <span className="color-pill tiny" style={{ color: c.hex }} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>

        <label className="switch-row" style={{ minHeight: 28, fontSize: 12 }}>
          鄰近色模式
          <input type="checkbox" checked={focusNeighborEnabled} disabled={constructionMode} onChange={(e) => onFocusNeighborEnabledChange(e.target.checked)} />
        </label>
        {focusNeighborEnabled && !constructionMode && (
          <div className="inline-field" style={{ marginBottom: 4 }}>
            <span>DeltaE</span>
            <input type="number" min={1} max={50} step={0.5} value={focusNeighborDeltaE} onChange={(e) => onFocusNeighborDeltaEChange(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
          </div>
        )}

        <hr style={{ margin: '8px 0' }} />

        {/* Edit color */}
        <label>
          <span className="floating-label-row">
            編輯色（畫筆/替換）
            {selectedEditColor && <span className="color-pill tiny" style={{ color: selectedEditColor.hex }} />}
          </span>
          <div className="color-select" ref={colorMenuRef}>
            <div className="color-select-trigger-input">
              <input
                type="text"
                placeholder="搜尋色號..."
                value={editColorMenuOpen ? paletteSearch : selectedEditColor ? selectedEditColor.name : ''}
                onFocus={() => { onEditColorMenuOpenChange(true); onPaletteSearchChange(''); }}
                onChange={(e) => { onPaletteSearchChange(e.target.value); if (!editColorMenuOpen) onEditColorMenuOpenChange(true); }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  if (paletteSearch.trim() === '無') {
                    onEditColorNameChange(EMPTY_EDIT_COLOR_NAME);
                    onEditColorMenuOpenChange(false);
                    onPaletteSearchChange('');
                    return;
                  }
                  if (filteredEditColors.length) {
                    onEditColorNameChange(filteredEditColors[0].name);
                    onEditColorMenuOpenChange(false);
                    onPaletteSearchChange('');
                  }
                }}
              />
              <button type="button" className="ghost color-select-toggle" onClick={() => onEditColorMenuOpenChange((v) => !v)}>▾</button>
            </div>
            {editColorMenuOpen && (
              <div className="color-select-menu">
                <button key={EMPTY_EDIT_COLOR_NAME} type="button" className="color-select-option" onClick={() => { onEditColorNameChange(EMPTY_EDIT_COLOR_NAME); onEditColorMenuOpenChange(false); onPaletteSearchChange(''); }}>
                  <span className="color-pill tiny" style={{ color: EMPTY_EDIT_COLOR.hex }} />
                  <span>{EMPTY_EDIT_COLOR.name}</span>
                </button>
                {filteredEditColors.map((c) => (
                  <button key={c.name} type="button" className="color-select-option" onClick={() => { onEditColorNameChange(c.name); onEditColorMenuOpenChange(false); onPaletteSearchChange(''); }}>
                    <span className="color-pill tiny" style={{ color: c.hex }} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>

        <div className="row two" style={{ marginTop: 8 }}>
          <button className="ghost" onClick={onReplaceAllSameColor} title="將焦點色全部替換為選取色">全替換</button>
          <button className="ghost" onClick={onAddOneCellOutline} title="加外框（1格）">加外框</button>
        </div>
      </div>
    </div>
  );
}
