import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export const EMPTY_EDIT_COLOR_NAME = '__EMPTY__';
export const EMPTY_EDIT_COLOR = { name: '無', hex: '#FFFFFF' };

type ColorInfo = { name: string; hex: string };

type FloatingColorPanelProps = {
  visible: boolean;
  onClose: () => void;
  // focus color / mask
  focusMaskEnabled: boolean;
  onFocusMaskEnabledChange: (v: boolean) => void;
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
  zIndex?: number;
  onBringToFront?: () => void;
};

const getDefaultPos = () => ({ x: 108, y: Math.max(160, window.innerHeight - 420) });
const DEFAULT_SIZE = { w: 256, h: 360 };
const MIN_W = 220, MAX_W = 400, MIN_H = 200;

/** Renders a dropdown menu via portal so it escapes overflow containers */
function PortalDropdown({ anchorRef, children }: { anchorRef: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  const [style, setStyle] = useState<React.CSSProperties>({ position: 'fixed', opacity: 0 });

  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const maxH = window.innerHeight - rect.bottom - 8;
    setStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(220, Math.max(maxH, 120)),
      opacity: 1,
    });
  }, [anchorRef]);

  return createPortal(
    <div className="color-select-menu color-select-menu-portal" style={style}>
      {children}
    </div>,
    document.body,
  );
}

export default function FloatingColorPanel({
  visible,
  onClose,
  focusMaskEnabled,
  onFocusMaskEnabledChange,
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
  zIndex,
  onBringToFront,
}: FloatingColorPanelProps) {
  const [pos, setPos] = useState(getDefaultPos);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const editTriggerRef = useRef<HTMLDivElement | null>(null);
  const focusTriggerRef = useRef<HTMLDivElement | null>(null);

  // Reset position & size on close
  const handleClose = useCallback(() => {
    onClose();
    setPos(getDefaultPos);
    setSize(DEFAULT_SIZE);
    setMinimized(false);
  }, [onClose]);

  // Resize handling
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = ev.clientX - resizeRef.current.startX;
      const dh = ev.clientY - resizeRef.current.startY;
      const maxH = window.innerHeight * 0.8;
      setSize({
        w: Math.max(MIN_W, Math.min(MAX_W, resizeRef.current.startW + dw)),
        h: Math.max(MIN_H, Math.min(maxH, resizeRef.current.startH + dh)),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size]);

  // Drag handling
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onBringToFront?.();
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

  // ESC 關閉
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, handleClose]);

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
        style={{ left: pos.x, top: pos.y, zIndex: zIndex ?? 500 }}
        onClick={() => setMinimized(false)}
        onMouseDown={(e) => { onBringToFront?.(); onDragStart(e); }}
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
    <div className="floating-panel" ref={panelRef} style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: zIndex ?? 500 }}>
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
        {/* Focus color dropdown */}
        <label>
          <span className="floating-label-row">
            焦點色
            {selectedFocusColor && <span className="color-pill tiny" style={{ color: selectedFocusColor.hex }} />}
          </span>
          <div className="color-select" ref={focusColorMenuRef}>
            <div className="color-select-trigger-input" ref={focusTriggerRef}>
              <input
                type="text"
                placeholder={constructionMode ? '施工模式：由任務選取' : '選擇焦點色…'}
                value={focusColorMenuOpen ? focusColorSearch : selectedFocusColor ? selectedFocusColor.name : ''}
                disabled={constructionMode}
                onFocus={() => { if (constructionMode) return; onFocusColorMenuOpenChange(true); onFocusColorSearchChange(''); }}
                onChange={(e) => { if (constructionMode) return; onFocusColorSearchChange(e.target.value); if (!focusColorMenuOpen) onFocusColorMenuOpenChange(true); }}
                onKeyDown={(e) => {
                  if (constructionMode) return;
                  if (e.key !== 'Enter') return;
                  if (!filteredFocusColors.length) return;
                  onFocusColorNameChange(filteredFocusColors[0].name);
                  onFocusColorMenuOpenChange(false);
                  onFocusColorSearchChange('');
                }}
              />
              <button type="button" className="ghost color-select-toggle" onClick={() => { if (!constructionMode) onFocusColorMenuOpenChange((v) => !v); }}>▾</button>
            </div>
            {focusColorMenuOpen && !constructionMode && (
              <PortalDropdown anchorRef={focusTriggerRef}>
                <button type="button" className="color-select-option clear-option" onClick={() => { onFocusColorNameChange(''); onFocusColorMenuOpenChange(false); onFocusColorSearchChange(''); }}>
                  清除焦點
                </button>
                {filteredFocusColors.map((c) => (
                  <button key={c.name} type="button" className="color-select-option" onClick={() => { onFocusColorNameChange(c.name); onFocusColorMenuOpenChange(false); onFocusColorSearchChange(''); }}>
                    <span className="color-pill tiny" style={{ color: c.hex }} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </PortalDropdown>
            )}
          </div>
        </label>
        {constructionMode && (
          <div className="hint" style={{ marginBottom: 4 }}>施工模式中，焦點色由任務選取與取色工具控制。</div>
        )}

        {/* Mask toggle */}
        <label className="switch-row" style={{ minHeight: 28, fontSize: 12 }}>
          啟用焦點遮罩
          <input
            type="checkbox"
            checked={focusMaskEnabled}
            disabled={constructionMode || !focusColorName}
            onChange={(e) => onFocusMaskEnabledChange(e.target.checked)}
          />
        </label>

        {/* Neighbor toggle */}
        <label className="switch-row" style={{ minHeight: 28, fontSize: 12 }}>
          同時選取相近色
          <input type="checkbox" checked={focusNeighborEnabled} disabled={constructionMode || !focusColorName} onChange={(e) => onFocusNeighborEnabledChange(e.target.checked)} />
        </label>
        {focusNeighborEnabled && focusColorName && !constructionMode && (
          <div className="inline-field" style={{ marginBottom: 4 }}>
            <span>相近色範圍</span>
            <input type="number" min={1} max={10} step={0.5} value={focusNeighborDeltaE} onChange={(e) => onFocusNeighborDeltaEChange(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
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
            <div className="color-select-trigger-input" ref={editTriggerRef}>
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
              <PortalDropdown anchorRef={editTriggerRef}>
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
              </PortalDropdown>
            )}
          </div>
        </label>

        <div className="row two" style={{ marginTop: 8 }}>
          <button className="ghost" onClick={onReplaceAllSameColor} title="將焦點色全部替換為選取色">全替換</button>
          <button className="ghost" onClick={onAddOneCellOutline} title="加外框（1格）">加外框</button>
        </div>
      </div>
      {/* Resize handle */}
      <div className="floating-panel-resize" onMouseDown={onResizeStart} />
    </div>
  );
}
