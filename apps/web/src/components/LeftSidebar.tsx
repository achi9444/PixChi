import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ConversionPanel from './ConversionPanel';
import ConstructionPanel from './ConstructionPanel';
import DraftBox from './DraftBox';
import { SHORTCUTS, SHORTCUT_LABELS } from '../config/shortcuts';
import type { AuthUser } from '../services/api';
import type { DraftSummary } from '../services/draftStore';
import type {
  ConstructionTask,
  ConstructionOrderRule,
  ConstructionTemplate,
} from './ConstructionPanel';

// ── 共用型別 ─────────────────────────────────────────────────
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

type VersionMeta = {
  id: string;
  at: number;
  reason: 'manual' | 'autosave';
  note?: string;
};

type ShortcutConfig = Record<keyof typeof SHORTCUTS, string[]>;

type ShortcutConflict = {
  hotkey: string;
  actions: Array<keyof typeof SHORTCUTS>;
};

export type LeftSidebarProps = {
  converted: boolean;
  proMode: boolean;
  statusText: string;

  // 圖片上傳（FileSection）
  onImageSelected: (file: File | null) => void;
  imageBitmap: { width: number; height: number } | null;
  cropToolEnabled: boolean;
  cropRect: { x: number; y: number; w: number; h: number } | null;
  onCreateBlankCanvas: (opts: { cols: number; rows: number; name: string }) => void;
  cols: number;
  rows: number;
  maxGridSize: number;

  // ConversionPanel
  groups: PaletteGroupOption[];
  activeGroupName: string;
  onActiveGroupNameChange: (name: string) => void;
  preMergeDeltaE: number;
  onPreMergeDeltaEChange: (v: number) => void;
  preMergeDeltaEMax: number;
  pdfPagination: PdfPaginationInfo | null;
  pdfJumpPage: number;
  onPdfJumpPageChange: (v: number) => void;
  pdfTileThumbMap: Map<number, string>;
  largeGridMode: boolean;
  largeViewTilePage: number;
  onLargeViewTilePageChange: (v: number) => void;
  hasConverted: boolean;
  projectName: string;
  onConvert: () => void;
  onResetAll: () => void;
  convertProgress: { running: boolean; phase: string; percent: number };
  paletteReady: boolean;
  oversizePlan: OversizePlan | null;
  onApplyOversizeSuggest: () => void;
  onApplyOversizeLargeMode: () => void;
  onDismissOversizePlan: () => void;
  gridSoftLimit: number;

  // 顯示設定（施工 tab 中）
  showCode: boolean;
  onShowCodeChange: (v: boolean) => void;
  showRuler: boolean;
  onShowRulerChange: (v: boolean) => void;
  showGuide: boolean;
  onShowGuideChange: (v: boolean) => void;
  guideEvery: number;
  onGuideEveryChange: (v: number) => void;

  // ConstructionPanel
  constructionMode: boolean;
  onConstructionModeChange: (v: boolean) => void;
  constructionStrategy: 'block' | 'color';
  onConstructionStrategyChange: (v: 'block' | 'color') => void;
  constructionOrderRule: ConstructionOrderRule;
  onConstructionOrderRuleChange: (rule: ConstructionOrderRule) => void;
  constructionShowDoneOverlay: boolean;
  onConstructionShowDoneOverlayChange: (v: boolean) => void;
  constructionRuleInference: { bestRule: string; bestScore: number } | null;
  onApplyInferredRule: () => void;
  constructionTemplates: ConstructionTemplate[];
  constructionTemplateId: string;
  onConstructionTemplateIdChange: (id: string) => void;
  constructionTemplateName: string;
  onConstructionTemplateNameChange: (name: string) => void;
  onApplyConstructionTemplate: () => void;
  onDeleteConstructionTemplate: () => void;
  onSaveConstructionTemplate: () => void;
  constructionTasks: ConstructionTask[];
  constructionDoneMap: Record<string, boolean>;
  constructionCurrentTaskId: string;
  constructionDragTaskId: string;
  constructionItemRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  constructionListRef: React.RefObject<HTMLDivElement | null>;
  constructionCompletionText: string;
  onToggleConstructionDone: (id: string, done: boolean) => void;
  onReorderConstructionTask: (fromId: string, toId: string) => void;
  onConstructionDragTaskIdChange: (id: string) => void;
  onSetFocusFromTask: (id: string) => void;

  // Draft
  onProjectNameChange: (v: string) => void;
  authUser: AuthUser | null;
  lastSavedAt: number | null;
  storageEstimateText: string;
  drafts: DraftSummary[];
  activeDraftId: string;
  activeDraft: DraftSummary | null;
  activeVersionMeta: VersionMeta | null;
  isDraftBusy: boolean;
  draftRenameInput: string;
  onDraftRenameInputChange: (v: string) => void;
  activeDraftVersionId: string;
  draftVersionNoteInput: string;
  onDraftVersionNoteInputChange: (v: string) => void;
  compareVersionA: string;
  compareVersionB: string;
  compareSummary: string;
  onCompareVersionAChange: (v: string) => void;
  onCompareVersionBChange: (v: string) => void;
  getDraftLimit: () => number;
  onSelectDraft: (id: string) => void;
  onSelectDraftVersion: (versionId: string) => void;
  onSaveDraft: (opts: { asNew?: boolean; reason: 'manual' | 'autosave' }) => void;
  onRemoveDraft: () => void;
  onSaveDraftRename: () => void;
  onSaveVersionNote: () => void;
  onCompareDraftVersions: () => void;

  // Settings
  shortcutConfig: ShortcutConfig;
  onUpdateShortcutByText: (key: keyof typeof SHORTCUTS, input: string) => void;
  shortcutConflicts: ShortcutConflict[];
  onResetShortcutDefaults: () => void;
  undoStack: Array<{ label: string }>;
  onRollbackToStep: (remainingUndoCount: number) => void;
  historyItems: string[];
  // Drawing tools (shown in sidebar-rail when hasConverted || hasImageBitmap)
  editTool: 'pan' | 'paint' | 'erase' | 'bucket' | 'picker';
  onEditToolChange: (tool: 'pan' | 'paint' | 'erase' | 'bucket' | 'picker') => void;
  editColorHex: string | null;
  editColorName: string;
  onColorPanelToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  hasImageBitmap: boolean;
  // Tool params
  brushSize: number;
  onBrushSizeChange: (v: number) => void;
  bucketMode: 'global' | 'region';
  onBucketModeChange: (v: 'global' | 'region') => void;
  // Crop tool
  onCropToolEnabledChange: (v: boolean) => void;
  hasCropRect: boolean;
  gridCropActive: boolean;
  onResetCropRect: () => void;
  onApplyGridCrop: () => void;
  onApplyCrop: () => void;
  collapseSignal?: number;
  constructionPanelVisible: boolean;
  onConstructionPanelToggle: () => void;
};

// ── Icons ─────────────────────────────────────────────────────
function IconFile() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconConvert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}

function IconConstruction() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

// ── 快捷鍵格式化 ─────────────────────────────────────────────
function fmtKey(keys: readonly string[]): string {
  if (!keys.length) return '';
  return keys[0]
    .split('+')
    .map((k) => {
      if (k === 'ctrl') return 'Ctrl';
      if (k === 'meta') return '⌘';
      if (k === 'shift') return 'Shift';
      if (k === 'alt') return 'Alt';
      if (k === 'space') return 'Space';
      if (k === 'arrowleft') return '←';
      if (k === 'arrowright') return '→';
      return k.toUpperCase();
    })
    .join('+');
}

// ── IconButton ────────────────────────────────────────────────
function IconButton({
  icon, label, active, disabled, onClick, tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  tooltip: string;
}) {
  return (
    <button
      type="button"
      className={`sidebar-icon-btn${active ? ' active' : ''}`}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
}

// ── FileSection ───────────────────────────────────────────────
function FileSection({
  onImageSelected, imageBitmap, onCreateBlankCanvas,
  cols, rows, maxGridSize, projectName, onProjectNameChange,
  hasConverted, authUser, lastSavedAt, storageEstimateText,
  drafts, activeDraftId, activeDraft, activeVersionMeta,
  isDraftBusy, draftRenameInput, onDraftRenameInputChange,
  activeDraftVersionId, draftVersionNoteInput, onDraftVersionNoteInputChange,
  compareVersionA, compareVersionB, compareSummary,
  onCompareVersionAChange, onCompareVersionBChange,
  proMode, getDraftLimit,
  onSelectDraft, onSelectDraftVersion, onSaveDraft, onRemoveDraft,
  onSaveDraftRename, onSaveVersionNote, onCompareDraftVersions,
}: {
  onImageSelected: (file: File | null) => void;
  imageBitmap: { width: number; height: number } | null;
  onCreateBlankCanvas: (opts: { cols: number; rows: number; name: string }) => void;
  cols: number;
  rows: number;
  maxGridSize: number;
  projectName: string;
  onProjectNameChange: (v: string) => void;
  hasConverted: boolean;
  authUser: AuthUser | null;
  lastSavedAt: number | null;
  storageEstimateText: string;
  drafts: DraftSummary[];
  activeDraftId: string;
  activeDraft: DraftSummary | null;
  activeVersionMeta: VersionMeta | null;
  isDraftBusy: boolean;
  draftRenameInput: string;
  onDraftRenameInputChange: (v: string) => void;
  activeDraftVersionId: string;
  draftVersionNoteInput: string;
  onDraftVersionNoteInputChange: (v: string) => void;
  compareVersionA: string;
  compareVersionB: string;
  compareSummary: string;
  onCompareVersionAChange: (v: string) => void;
  onCompareVersionBChange: (v: string) => void;
  proMode: boolean;
  getDraftLimit: () => number;
  onSelectDraft: (id: string) => void;
  onSelectDraftVersion: (versionId: string) => void;
  onSaveDraft: (opts: { asNew?: boolean; reason: 'manual' | 'autosave' }) => void;
  onRemoveDraft: () => void;
  onSaveDraftRename: () => void;
  onSaveVersionNote: () => void;
  onCompareDraftVersions: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
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
      {/* 圖片上傳 */}
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--success)' }}><polyline points="20 6 9 17 4 12"/></svg>
            <span className="upload-dropzone-text">{fileName ?? '已載入圖片'}</span>
            <span className="upload-dropzone-sub" style={{ color: 'var(--faint)', fontSize: 11 }}>點擊更換</span>
          </>
        ) : (
          <>
            <svg className="upload-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
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

      {!imageBitmap && !hasConverted && (
        <button className="ghost" style={{ width: '100%', marginTop: 6 }} onClick={() => {
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
                <input type="text" value={blankName} onChange={(e) => setBlankName(e.target.value)} placeholder="未命名專案" />
              </label>
              <div className="row two">
                <label>
                  寬 (cols)
                  <input type="number" min={1} max={maxGridSize} value={blankCols} onChange={(e) => setBlankCols(Number(e.target.value) || 1)} />
                </label>
                <label>
                  高 (rows)
                  <input type="number" min={1} max={maxGridSize} value={blankRows} onChange={(e) => setBlankRows(Number(e.target.value) || 1)} />
                </label>
              </div>
              <button className="primary" onClick={() => {
                onCreateBlankCanvas({ cols: blankCols, rows: blankRows, name: blankName.trim() });
                setBlankModalOpen(false);
              }}>
                建立畫布
              </button>
              <p className="blank-canvas-desc">從零開始用畫筆繪製拼豆圖案，無需上傳圖片。</p>
            </div>
          </div>
        </div>
      )}

      <hr className="panel-divider" />

      {/* 專案名稱 */}
      <label>
        專案名稱
        <input type="text" value={projectName} onChange={(e) => onProjectNameChange(e.target.value)} />
      </label>

      {/* 草稿管理 */}
      <DraftBox
        authUser={authUser}
        lastSavedAt={lastSavedAt}
        storageEstimateText={storageEstimateText}
        drafts={drafts}
        activeDraftId={activeDraftId}
        activeDraft={activeDraft}
        activeVersionMeta={activeVersionMeta}
        isDraftBusy={isDraftBusy}
        draftRenameInput={draftRenameInput}
        onDraftRenameInputChange={onDraftRenameInputChange}
        activeDraftVersionId={activeDraftVersionId}
        draftVersionNoteInput={draftVersionNoteInput}
        onDraftVersionNoteInputChange={onDraftVersionNoteInputChange}
        compareVersionA={compareVersionA}
        compareVersionB={compareVersionB}
        compareSummary={compareSummary}
        onCompareVersionAChange={onCompareVersionAChange}
        onCompareVersionBChange={onCompareVersionBChange}
        proMode={proMode}
        getDraftLimit={getDraftLimit}
        onSelectDraft={onSelectDraft}
        onSelectDraftVersion={onSelectDraftVersion}
        onSaveDraft={onSaveDraft}
        onRemoveDraft={onRemoveDraft}
        onSaveDraftRename={onSaveDraftRename}
        onSaveVersionNote={onSaveVersionNote}
        onCompareDraftVersions={onCompareDraftVersions}
      />
    </>
  );
}


// ── SettingsSection ───────────────────────────────────────────
function SettingsSection({
  proMode, shortcutConfig, onUpdateShortcutByText,
  shortcutConflicts, onResetShortcutDefaults,
  undoStack, onRollbackToStep, historyItems, statusText,
}: {
  proMode: boolean;
  shortcutConfig: ShortcutConfig;
  onUpdateShortcutByText: (key: keyof typeof SHORTCUTS, input: string) => void;
  shortcutConflicts: ShortcutConflict[];
  onResetShortcutDefaults: () => void;
  undoStack: Array<{ label: string }>;
  onRollbackToStep: (remainingUndoCount: number) => void;
  historyItems: string[];
  statusText: string;
}) {
  const [shortcutOpen, setShortcutOpen] = useState(false);

  return (
    <>
      {proMode && (
        <div className="shortcut-box">
          <div className="collapsible-header" onClick={() => setShortcutOpen((v) => !v)}>
            <h3>快捷鍵設定</h3>
            <span className={`chevron ${shortcutOpen ? 'open' : ''}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </div>
          {shortcutOpen && (
            <>
              {(Object.keys(SHORTCUTS) as Array<keyof typeof SHORTCUTS>).map((k) => (
                <label key={`shortcut-${k}`}>
                  {SHORTCUT_LABELS[k]}
                  <input
                    type="text"
                    value={(shortcutConfig[k] ?? []).join(', ')}
                    onChange={(e) => onUpdateShortcutByText(k, e.target.value)}
                    placeholder={SHORTCUTS[k].join(', ')}
                  />
                </label>
              ))}
              {shortcutConflicts.length > 0 && (
                <div className="shortcut-conflict">
                  <strong>快捷鍵衝突</strong>
                  {shortcutConflicts.map((c) => (
                    <div key={`conflict-${c.hotkey}`} className="history-item">
                      {c.hotkey}：{c.actions.map((a) => SHORTCUT_LABELS[a]).join(' / ')}
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="ghost" style={{ width: '100%' }} onClick={onResetShortcutDefaults}>
                還原預設
              </button>
            </>
          )}
        </div>
      )}
      <div className="history-box">
        <strong>最近操作</strong>
        {undoStack.length ? (
          [...undoStack].slice(-6).reverse().map((batch, i) => {
            const remaining = undoStack.length - (i + 1);
            return (
              <button key={`${batch.label}-${i}`} type="button" className="history-item history-jump" onClick={() => onRollbackToStep(remaining)}>
                {batch.label}
              </button>
            );
          })
        ) : (
          <div className="history-item">尚無操作</div>
        )}
        {historyItems.length > 0 && <div className="history-item">最新：{historyItems[0]}</div>}
      </div>
      <p className="status">{statusText}</p>
    </>
  );
}

// ── LeftSidebar ───────────────────────────────────────────────
type SidebarTab = 'file' | 'convert' | 'construction' | 'settings';

const STORAGE_TAB_KEY = 'pixchi-sidebar-tab';

export default function LeftSidebar(props: LeftSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>(() => {
    const stored = localStorage.getItem(STORAGE_TAB_KEY);
    // 舊版 tab 名稱相容
    if (stored === 'draft' || stored === 'file') return 'file';
    if (stored === 'convert') return 'convert';
    if (stored === 'construction' || stored === 'display') return 'construction';
    if (stored === 'settings') return 'settings';
    return 'convert';
  });
  const [isOpen, setIsOpen] = useState(false);
  const [statsMobileOpen, setStatsMobileOpen] = useState(false);
  const [toolParamOpen, setToolParamOpen] = useState<'paint' | 'erase' | 'bucket' | null>(null);
  const sc = props.shortcutConfig;
  const paintBtnRef = useRef<HTMLButtonElement | null>(null);
  const eraseBtnRef = useRef<HTMLButtonElement | null>(null);
  const bucketBtnRef = useRef<HTMLButtonElement | null>(null);
  const toolParamPortalRef = useRef<HTMLDivElement | null>(null);

  // 切換到沒有參數的工具時自動關閉 popover
  useEffect(() => {
    if (props.editTool !== 'paint' && props.editTool !== 'erase' && props.editTool !== 'bucket') {
      setToolParamOpen(null);
    }
  }, [props.editTool]);

  // 點擊 popover 與觸發按鈕外部時關閉
  useEffect(() => {
    if (!toolParamOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (paintBtnRef.current?.contains(target)) return;
      if (eraseBtnRef.current?.contains(target)) return;
      if (bucketBtnRef.current?.contains(target)) return;
      if (toolParamPortalRef.current?.contains(target)) return;
      setToolParamOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [toolParamOpen]);

  // 計算 popover 位置（固定在按鈕右側）
  const getPopoverStyle = (tool: 'paint' | 'erase' | 'bucket'): React.CSSProperties => {
    const ref = tool === 'paint' ? paintBtnRef : tool === 'erase' ? eraseBtnRef : bucketBtnRef;
    if (!ref.current) return { display: 'none' };
    const rect = ref.current.getBoundingClientRect();
    return {
      position: 'fixed',
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
      transform: 'translateY(-50%)',
    };
  };
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem(STORAGE_TAB_KEY, activeTab); }, [activeTab]);
  useEffect(() => { if (props.collapseSignal) setIsOpen(false); }, [props.collapseSignal]);

  useEffect(() => {
    if (statsMobileOpen) {
      document.body.classList.add('stats-mobile-open');
    } else {
      document.body.classList.remove('stats-mobile-open');
    }
    return () => document.body.classList.remove('stats-mobile-open');
  }, [statsMobileOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  function handleTabClick(tab: SidebarTab) {
    if (activeTab === tab) {
      setIsOpen((v) => !v);
    } else {
      setActiveTab(tab);
      setIsOpen(true);
    }
  }

  const conversionPanelProps = {
    groups: props.groups,
    activeGroupName: props.activeGroupName,
    onActiveGroupNameChange: props.onActiveGroupNameChange,
    imageBitmap: props.imageBitmap,
    cropToolEnabled: props.cropToolEnabled,
    cropRect: props.cropRect,
    preMergeDeltaE: props.preMergeDeltaE,
    onPreMergeDeltaEChange: props.onPreMergeDeltaEChange,
    preMergeDeltaEMax: props.preMergeDeltaEMax,
    proMode: props.proMode,
    pdfPagination: props.pdfPagination,
    pdfJumpPage: props.pdfJumpPage,
    onPdfJumpPageChange: props.onPdfJumpPageChange,
    pdfTileThumbMap: props.pdfTileThumbMap,
    largeGridMode: props.largeGridMode,
    largeViewTilePage: props.largeViewTilePage,
    onLargeViewTilePageChange: props.onLargeViewTilePageChange,
    onConvert: props.onConvert,
    onResetAll: props.onResetAll,
    convertProgress: props.convertProgress,
    paletteReady: props.paletteReady,
    oversizePlan: props.oversizePlan,
    onApplyOversizeSuggest: props.onApplyOversizeSuggest,
    onApplyOversizeLargeMode: props.onApplyOversizeLargeMode,
    onDismissOversizePlan: props.onDismissOversizePlan,
    gridSoftLimit: props.gridSoftLimit,
  };

  return (
    <>
    <div ref={sidebarRef} className={`left-sidebar${!isOpen ? ' collapsed' : ''}`}>
      {statsMobileOpen && (
        <div className="stats-mobile-backdrop" aria-hidden="true" onClick={() => setStatsMobileOpen(false)} />
      )}
      {/* 圖示列 */}
      <div className="sidebar-rail">
        <IconButton icon={<IconFile />} label="檔案" active={isOpen && activeTab === 'file'} onClick={() => handleTabClick('file')} tooltip="檔案與草稿" />
        <IconButton icon={<IconConvert />} label="轉換" active={isOpen && activeTab === 'convert'} onClick={() => handleTabClick('convert')} tooltip="轉換設定" />
        {(props.hasConverted || props.hasImageBitmap) && (
          <>
            <div className="sidebar-tool-divider" aria-hidden="true" />
            {/* 裁切工具：只要有畫布就顯示 */}
            <button
              className={`sidebar-icon-btn${props.cropToolEnabled ? ' active' : ''}`}
              onClick={() => props.onCropToolEnabledChange(!props.cropToolEnabled)}
              title={props.cropToolEnabled ? '關閉裁切工具' : '裁切工具 (Enter 套用 / Esc 取消)'}
              aria-label="裁切工具"
              type="button"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 2 6 8 2 8"/><polyline points="18 22 18 16 22 16"/><path d="M2 8h16v12"/><path d="M6 2v16h16"/></svg>
            </button>
            {props.hasConverted && (
              <>
                <button className={`sidebar-icon-btn${props.editTool === 'picker' ? ' active' : ''}`} onClick={() => props.onEditToolChange('picker')} title={`取色 (${fmtKey(sc.toolPicker)})`} aria-label="取色工具" type="button">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>
                </button>
                <button className={`sidebar-icon-btn${props.editTool === 'pan' ? ' active' : ''}`} onClick={() => props.onEditToolChange('pan')} title={`移動 (${fmtKey(sc.toolPan)})`} aria-label="移動工具" type="button">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
                </button>
                {/* 畫筆 */}
                <button
                  ref={paintBtnRef}
                  className={`sidebar-icon-btn${props.editTool === 'paint' ? ' active' : ''}`}
                  onClick={() => { props.onEditToolChange('paint'); setIsOpen(false); setToolParamOpen(toolParamOpen === 'paint' ? null : 'paint'); }}
                  title={`畫筆 (${fmtKey(sc.toolPaint)})`}
                  aria-label="上色工具"
                  type="button"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                </button>
                {/* 橡皮擦 */}
                <button
                  ref={eraseBtnRef}
                  className={`sidebar-icon-btn${props.editTool === 'erase' ? ' active' : ''}`}
                  onClick={() => { props.onEditToolChange('erase'); setIsOpen(false); setToolParamOpen(toolParamOpen === 'erase' ? null : 'erase'); }}
                  title={`橡皮擦 (${fmtKey(sc.toolErase)})`}
                  aria-label="橡皮擦"
                  type="button"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/></svg>
                </button>
                {/* 油漆桶 */}
                <button
                  ref={bucketBtnRef}
                  className={`sidebar-icon-btn${props.editTool === 'bucket' ? ' active' : ''}`}
                  onClick={() => { props.onEditToolChange('bucket'); setIsOpen(false); setToolParamOpen(toolParamOpen === 'bucket' ? null : 'bucket'); }}
                  title={`油漆桶 (${fmtKey(sc.toolBucket)})`}
                  aria-label="油漆桶"
                  type="button"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m19 11-8-8-8.5 8.5a5.5 5.5 0 0 0 7.78 7.78L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/></svg>
                </button>
                <IconButton icon={<IconConstruction />} label="施工" active={props.constructionPanelVisible} onClick={props.onConstructionPanelToggle} tooltip="施工面板與顯示設定" />
                {props.editColorHex && (
                  <span
                    className="color-indicator clickable"
                    role="button"
                    tabIndex={0}
                    title={`${props.editColorName || '目前選色'}（點擊開啟修色面板）`}
                    style={{ background: props.editColorHex }}
                    onClick={props.onColorPanelToggle}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onColorPanelToggle(); } }}
                  />
                )}
                <div className="sidebar-tool-divider" aria-hidden="true" />
                <button className="sidebar-icon-btn" onClick={props.onUndo} title={`復原 (${fmtKey(sc.undo)})`} aria-label="復原" type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                </button>
                <button className="sidebar-icon-btn" onClick={props.onRedo} title={`重做 (${fmtKey(sc.redo)})`} aria-label="重做" type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
                </button>
              </>
            )}
          </>
        )}
        <div className="sidebar-tool-divider" aria-hidden="true" />
        <IconButton icon={<IconSettings />} label="設定" active={isOpen && activeTab === 'settings'} onClick={() => handleTabClick('settings')} tooltip="快捷鍵與歷史" />
        <div className="sidebar-tool-divider stats-mobile-only" aria-hidden="true" />
        <button
          type="button"
          className={`sidebar-icon-btn stats-toggle-btn${statsMobileOpen ? ' active' : ''}`}
          onClick={() => setStatsMobileOpen((v) => !v)}
          title="色號統計"
          aria-label="色號統計面板"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        </button>
      </div>

      {/* 懸浮面板 */}
      <div className="sidebar-panel">
        {activeTab === 'file' && (
          <FileSection
            onImageSelected={props.onImageSelected}
            imageBitmap={props.imageBitmap}
            onCreateBlankCanvas={props.onCreateBlankCanvas}
            cols={props.cols}
            rows={props.rows}
            maxGridSize={props.maxGridSize}
            projectName={props.projectName}
            onProjectNameChange={props.onProjectNameChange}
            hasConverted={props.hasConverted}
            authUser={props.authUser}
            lastSavedAt={props.lastSavedAt}
            storageEstimateText={props.storageEstimateText}
            drafts={props.drafts}
            activeDraftId={props.activeDraftId}
            activeDraft={props.activeDraft}
            activeVersionMeta={props.activeVersionMeta}
            isDraftBusy={props.isDraftBusy}
            draftRenameInput={props.draftRenameInput}
            onDraftRenameInputChange={props.onDraftRenameInputChange}
            activeDraftVersionId={props.activeDraftVersionId}
            draftVersionNoteInput={props.draftVersionNoteInput}
            onDraftVersionNoteInputChange={props.onDraftVersionNoteInputChange}
            compareVersionA={props.compareVersionA}
            compareVersionB={props.compareVersionB}
            compareSummary={props.compareSummary}
            onCompareVersionAChange={props.onCompareVersionAChange}
            onCompareVersionBChange={props.onCompareVersionBChange}
            proMode={props.proMode}
            getDraftLimit={props.getDraftLimit}
            onSelectDraft={props.onSelectDraft}
            onSelectDraftVersion={props.onSelectDraftVersion}
            onSaveDraft={props.onSaveDraft}
            onRemoveDraft={props.onRemoveDraft}
            onSaveDraftRename={props.onSaveDraftRename}
            onSaveVersionNote={props.onSaveVersionNote}
            onCompareDraftVersions={props.onCompareDraftVersions}
          />
        )}
        {activeTab === 'convert' && (
          <ConversionPanel {...conversionPanelProps} />
        )}
        {activeTab === 'settings' && (
          <SettingsSection
            proMode={props.proMode}
            shortcutConfig={props.shortcutConfig}
            onUpdateShortcutByText={props.onUpdateShortcutByText}
            shortcutConflicts={props.shortcutConflicts}
            onResetShortcutDefaults={props.onResetShortcutDefaults}
            undoStack={props.undoStack}
            onRollbackToStep={props.onRollbackToStep}
            historyItems={props.historyItems}
            statusText={props.statusText}
          />
        )}
      </div>
    </div>
    {/* ── Tool param popover（portal，完全脫離 stacking context） */}
    {toolParamOpen && createPortal(
      <div
        ref={toolParamPortalRef}
        className="tool-param-popover"
        style={getPopoverStyle(toolParamOpen)}
      >
        {(toolParamOpen === 'paint' || toolParamOpen === 'erase') && (
          <>
            <span className="tool-param-label">筆刷大小</span>
            <input
              type="number"
              className="tool-param-input"
              min={1}
              max={100}
              value={props.brushSize}
              onChange={(e) => props.onBrushSizeChange(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))}
              aria-label="筆刷大小"
            />
          </>
        )}
        {toolParamOpen === 'bucket' && (
          <>
            <span className="tool-param-label">填色模式</span>
            <button
              className={`tool-param-option${props.bucketMode === 'global' ? ' active' : ''}`}
              onClick={() => props.onBucketModeChange('global')}
              type="button"
            >
              全圖同色
            </button>
            <button
              className={`tool-param-option${props.bucketMode === 'region' ? ' active' : ''}`}
              onClick={() => props.onBucketModeChange('region')}
              type="button"
            >
              連通區域
            </button>
          </>
        )}
      </div>,
      document.body
    )}
    </>
  );
}
