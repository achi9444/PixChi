import React, { useState } from 'react';

export const EMPTY_EDIT_COLOR_NAME = '__EMPTY__';
export const EMPTY_EDIT_COLOR = { name: '無', hex: '#FFFFFF' };

type ColorInfo = { name: string; hex: string };

type ColorEditPanelProps = {
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

export default function ColorEditPanel({
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
}: ColorEditPanelProps) {
  const [open, setOpen] = useState(false);

  const chevronSvg = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );

  return (
    <>
      <div className="collapsible-header" onClick={() => setOpen((v) => !v)}>
        <h3>手動修色</h3>
        <span className={`chevron ${open ? 'open' : ''}`}>{chevronSvg}</span>
      </div>

      {open && (<>
      <label>
        快速搜尋色號（焦點預覽）
        <div className="color-select" ref={focusColorMenuRef}>
          <div className="color-select-trigger-input">
            {selectedFocusColor && <span className="color-pill tiny" style={{ color: selectedFocusColor.hex }} />}
            <input
              type="text"
              placeholder={constructionMode ? '施工模式下焦點由任務選取決定' : '請選擇要設為焦點的色號'}
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
            <button
              type="button"
              className="ghost color-select-toggle"
              onClick={() => onFocusColorMenuOpenChange((v) => !v)}
            >
              ▾
            </button>
          </div>
          {focusColorMenuOpen && (
            <div className="color-select-menu">
              <button
                type="button"
                className="color-select-option clear-option"
                onClick={() => {
                  if (constructionMode) onClearConstructionFocus();
                  else onFocusColorNameChange('');
                  onFocusColorMenuOpenChange(false);
                }}
              >
                清除焦點
              </button>
              {!constructionMode && filteredFocusColors.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="color-select-option"
                  onClick={() => {
                    onFocusColorNameChange(c.name);
                    onFocusColorMenuOpenChange(false);
                  }}
                >
                  <span className="color-pill tiny" style={{ color: c.hex }} />
                  <span>{c.name}</span>
                </button>
              ))}
              {constructionMode && <div className="hint" style={{ padding: '8px 10px' }}>施工模式僅可在此清除焦點。</div>}
            </div>
          )}
        </div>
      </label>
      <label className="switch-row">
        同時選取相近色
        <input
          type="checkbox"
          checked={focusNeighborEnabled}
          disabled={constructionMode}
          onChange={(e) => onFocusNeighborEnabledChange(e.target.checked)}
        />
      </label>
      {focusNeighborEnabled && !constructionMode && (
        <label>
          相近色範圍
          <input
            type="number"
            min={1}
            max={10}
            step={0.5}
            value={focusNeighborDeltaE}
            onChange={(e) => onFocusNeighborDeltaEChange(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
          />
        </label>
      )}
      {constructionMode && <div className="hint">施工模式中，焦點色由任務選取與取色工具控制。</div>}

      <label>
        選擇替換色號
        <div className="color-select" ref={colorMenuRef}>
          <div className="color-select-trigger-input">
            {selectedEditColor && <span className="color-pill tiny" style={{ color: selectedEditColor.hex }} />}
            <input
              type="text"
              placeholder="搜尋可替換色號..."
              value={editColorMenuOpen ? paletteSearch : selectedEditColor ? selectedEditColor.name : ''}
              onFocus={() => {
                onEditColorMenuOpenChange(true);
                onPaletteSearchChange('');
              }}
              onChange={(e) => {
                onPaletteSearchChange(e.target.value);
                if (!editColorMenuOpen) onEditColorMenuOpenChange(true);
              }}
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
            <button
              type="button"
              className="ghost color-select-toggle"
              onClick={() => onEditColorMenuOpenChange((v) => !v)}
            >
              ▾
            </button>
          </div>
          {editColorMenuOpen && (
            <div className="color-select-menu">
              <button
                key={EMPTY_EDIT_COLOR_NAME}
                type="button"
                className="color-select-option"
                onClick={() => {
                  onEditColorNameChange(EMPTY_EDIT_COLOR_NAME);
                  onEditColorMenuOpenChange(false);
                  onPaletteSearchChange('');
                }}
              >
                <span className="color-pill tiny" style={{ color: EMPTY_EDIT_COLOR.hex }} />
                <span>{EMPTY_EDIT_COLOR.name}</span>
              </button>
              {filteredEditColors.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="color-select-option"
                  onClick={() => {
                    onEditColorNameChange(c.name);
                    onEditColorMenuOpenChange(false);
                    onPaletteSearchChange('');
                  }}
                >
                  <span className="color-pill tiny" style={{ color: c.hex }} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </label>

      <div className="row two">
        <button className="ghost" onClick={onReplaceAllSameColor} title="將焦點色全部替換為選取色">
          全替換
        </button>
        <button className="ghost" onClick={onAddOneCellOutline} title="加外框（1格）">
          加外框
        </button>
      </div>
      </>)}
    </>
  );
}
