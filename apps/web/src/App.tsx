import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthPanel from './components/AuthPanel';
import { PUBLIC_PRICING_PRESET, COMPLEXITY_CAP_TIERS } from './config/pricing';
import { SHORTCUTS } from './config/shortcuts';
import { createDraft, deleteDraft, getDraftLimit, getDraftSnapshot, listDrafts, renameDraft, setDraftVersionNote, updateDraft, type DraftSnapshot, type DraftSummary } from './services/draftStore';
import { loadCustomPaletteGroups, makeCustomPaletteId, saveCustomPaletteGroups, type CustomPaletteColor, type CustomPaletteGroup } from './services/customPaletteStore';
import { ApiClient, type AuthUser, type CustomPaletteGroupDto, type DraftSummaryDto, type PaletteApiGroupDetail, type UserSettingsDto } from './services/api';
import { loadAuthAccessToken, loadAuthRefreshToken, loadAuthUser, persistAuthAccessToken, persistAuthRefreshToken, persistAuthUser } from './services/authStorage';

type MatchStrategy = 'lab_nearest' | 'rgb_nearest';
type LayoutMode = 'fit' | 'lock' | 'pad';

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

type Cell = {
  x: number;
  y: number;
  rgb: [number, number, number];
  colorName: string;
  hex: string;
  isEmpty?: boolean;
};

type Converted = {
  cols: number;
  rows: number;
  mode: LayoutMode;
  sourceW: number;
  sourceH: number;
  processInfo: string;
  cells: Cell[];
};

type CellChange = {
  idx: number;
  before: Cell;
  after: Cell;
};

type ChangeBatch = {
  label: string;
  changes: CellChange[];
};

type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type CropDragMode = 'new' | 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
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
type ConstructionTask = {
  id: string;
  title: string;
  subtitle: string;
  count: number;
  cellIndices: number[];
};
type ConstructionOrderRule = 'count_desc' | 'count_asc' | 'title_asc' | 'title_desc' | 'manual';
type ConstructionTemplate = {
  id: string;
  name: string;
  strategy: 'block' | 'color';
  rule: Exclude<ConstructionOrderRule, 'manual'>;
  colorPriority?: string[];
  inferredFromManual?: boolean;
};

const MAX_GRID_SIZE = 10000;
const GRID_SOFT_LIMIT = 40000;
const PRE_MERGE_DELTAE_MAX = 30;
const PIXCHI_META_PREFIX = 'PIXCHI_META_V1:';
const EMPTY_EDIT_COLOR_NAME = '__EMPTY__';
const EMPTY_EDIT_COLOR = { name: '無', hex: '#FFFFFF' };
const AUTO_SAVE_INTERVAL_MS = 3 * 60 * 1000;
const PDF_BEAD_MM = 2.6;
const SHORTCUTS_STORAGE_KEY = 'pixchi_shortcuts_v1';
const CONSTRUCTION_TEMPLATE_STORAGE_KEY = 'pixchi_construction_templates_v1';
const SHORTCUT_LABELS: Record<keyof typeof SHORTCUTS, string> = {
  undo: '復原',
  redo: '重做',
  toolPan: '手型',
  toolPaint: '上色',
  toolErase: '橡皮擦',
  toolBucket: '油漆桶',
  toolPicker: '取色',
  toggleCode: '切換色號文字',
  brushDown: '筆刷縮小',
  brushUp: '筆刷放大',
  zoomIn: '放大',
  zoomOut: '縮小',
  zoomReset: '重置視圖',
  toggleCanvasFullscreen: '畫布全螢幕',
  tilePrev: '上一分塊',
  tileNext: '下一分塊'
};
const ASSET_BASE_URL = import.meta.env.BASE_URL;
const PDF_FONT_URL = `${ASSET_BASE_URL}fonts/NotoSansTC-VF.ttf`;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:8787';
const LOCAL_PALETTE_FALLBACK =
  (import.meta.env.VITE_LOCAL_PALETTE_FALLBACK ?? '').trim().toLowerCase() !== 'off';
const LOCAL_PALETTE_URL = `${ASSET_BASE_URL}color-palette.json`;
let pdfRuntimePromise: Promise<{
  PDFDocument: any;
  StandardFonts: any;
  rgb: (...args: number[]) => any;
  fontkit: any;
}> | null = null;

function isShortcutMatch(ev: KeyboardEvent, shortcut: string) {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const needCtrl = parts.includes('ctrl');
  const needMeta = parts.includes('meta');
  const needShift = parts.includes('shift');
  if (!!ev.ctrlKey !== needCtrl) return false;
  if (!!ev.metaKey !== needMeta) return false;
  if (!!ev.shiftKey !== needShift) return false;
  const actualKey = ev.key === ' ' ? 'space' : ev.key.toLowerCase();
  return actualKey === key;
}

function matchesShortcutSet(ev: KeyboardEvent, shortcuts: readonly string[]) {
  return shortcuts.some((s) => isShortcutMatch(ev, s));
}

type ShortcutConfig = Record<keyof typeof SHORTCUTS, string[]>;

function buildDefaultShortcutConfig(): ShortcutConfig {
  const next = {} as ShortcutConfig;
  for (const key of Object.keys(SHORTCUTS) as Array<keyof typeof SHORTCUTS>) {
    next[key] = [...SHORTCUTS[key]];
  }
  return next;
}

function loadShortcutConfig(): ShortcutConfig {
  const fallback = buildDefaultShortcutConfig();
  try {
    const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Record<keyof typeof SHORTCUTS, string[]>>;
    for (const key of Object.keys(fallback) as Array<keyof typeof SHORTCUTS>) {
      const next = parsed[key];
      if (Array.isArray(next) && next.length) fallback[key] = next.map((x) => String(x).trim()).filter(Boolean);
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function normalizeShortcutConfig(raw: unknown): ShortcutConfig {
  const fallback = buildDefaultShortcutConfig();
  if (!raw || typeof raw !== 'object') return fallback;
  const parsed = raw as Partial<Record<keyof typeof SHORTCUTS, string[]>>;
  for (const key of Object.keys(fallback) as Array<keyof typeof SHORTCUTS>) {
    const next = parsed[key];
    if (Array.isArray(next) && next.length) {
      fallback[key] = next.map((x) => String(x).trim()).filter(Boolean);
    }
  }
  return fallback;
}

function loadConstructionTemplates(): ConstructionTemplate[] {
  try {
    const raw = localStorage.getItem(CONSTRUCTION_TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<ConstructionTemplate>>;
    return normalizeConstructionTemplates(parsed);
  } catch {
    return [];
  }
}

function normalizeConstructionTemplates(raw: unknown): ConstructionTemplate[] {
  try {
    const parsed = Array.isArray(raw) ? (raw as Array<Partial<ConstructionTemplate>>) : [];
    const out: ConstructionTemplate[] = [];
    for (const item of parsed ?? []) {
      const id = String(item.id ?? '').trim();
      const name = String(item.name ?? '').trim();
      const strategy = item.strategy === 'color' ? 'color' : 'block';
      const ruleRaw = String((item as any).rule ?? '').trim();
      const rule: Exclude<ConstructionOrderRule, 'manual'> =
        ruleRaw === 'count_asc' || ruleRaw === 'title_asc' || ruleRaw === 'title_desc'
          ? (ruleRaw as Exclude<ConstructionOrderRule, 'manual'>)
          : 'count_desc';
      const colorPriority = Array.isArray((item as any).colorPriority)
        ? (item as any).colorPriority.map((x: unknown) => String(x).trim()).filter(Boolean)
        : undefined;
      const inferredFromManual = !!(item as any).inferredFromManual;
      if (!id || !name) continue;
      out.push({ id, name, strategy, rule, colorPriority, inferredFromManual });
    }
    return out;
  } catch {
    return [];
  }
}

function toPaletteColor(input: { name: string; hex: string }): PaletteColor {
  const hex = input.hex.toUpperCase();
  const rgb = hexToRgb(hex);
  return { name: input.name, hex, rgb, lab: rgbToLab(...rgb) };
}

function toCustomPaletteViewGroup(group: CustomPaletteGroup): PaletteGroup {
  return {
    id: group.id,
    isCustom: true,
    name: group.name,
    colors: group.colors.map((c) => toPaletteColor(c))
  };
}

function toDraftSummaryFromApi(input: DraftSummaryDto): DraftSummary {
  return {
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    versionCount: input.versionCount,
    versions: (input.versions ?? []).map((v) => ({
      id: v.id,
      at: v.at,
      reason: v.reason,
      note: v.note
    }))
  };
}

function getCloudDraftLimit(user: AuthUser | null): number | null {
  if (!user) return null;
  if (user.role === 'member') return 5;
  return null;
}

function getPageFromHash(): 'main' | 'palette' {
  const hash = (typeof window !== 'undefined' ? window.location.hash : '').toLowerCase();
  if (hash.includes('palette')) return 'palette';
  return 'main';
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const colorMenuRef = useRef<HTMLDivElement | null>(null);
  const focusColorMenuRef = useRef<HTMLDivElement | null>(null);
  const constructionListRef = useRef<HTMLDivElement | null>(null);
  const constructionItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pdfImportRef = useRef<HTMLInputElement | null>(null);
  const renderMetaRef = useRef({ ox: 0, oy: 0, cell: 1, viewStartCol: 0, viewStartRow: 0, viewCols: 1, viewRows: 1 });
  const imagePreviewMetaRef = useRef({ ox: 0, oy: 0, scale: 1, drawW: 0, drawH: 0 });
  const isPointerDownRef = useRef(false);
  const lastDragCellIdxRef = useRef<number | null>(null);
  const panLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const cropDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const cropDragModeRef = useRef<CropDragMode | null>(null);
  const cropStartRectRef = useRef<CropRect | null>(null);
  const isCropDraggingRef = useRef(false);
  const isApplyingDraftRef = useRef(false);
  const latestSnapshotRef = useRef<DraftSnapshot | null>(null);
  const isDraftBusyRef = useRef(false);
  const activeDraftIdRef = useRef('');
  const lastManualSaveAtRef = useRef(0);
  const lastSavedFingerprintRef = useRef('');
  const customPaletteSyncLockRef = useRef(false);
  const customPaletteSyncTimerRef = useRef<number | null>(null);
  const userSettingsSyncLockRef = useRef(false);
  const userSettingsSyncTimerRef = useRef<number | null>(null);

  const [projectName, setProjectName] = useState('未命名專案');
  const [builtinGroups, setBuiltinGroups] = useState<PaletteGroup[]>([]);
  const [customPaletteGroups, setCustomPaletteGroups] = useState<CustomPaletteGroup[]>([]);
  const [activeGroupName, setActiveGroupName] = useState('');
  const [page, setPage] = useState<'main' | 'palette'>(() => getPageFromHash());
  const [paletteTab, setPaletteTab] = useState<'builtin' | 'custom'>('builtin');
  const [builtinPreviewGroupName, setBuiltinPreviewGroupName] = useState('');
  const [paletteNewGroupName, setPaletteNewGroupName] = useState('');
  const [paletteEditGroupId, setPaletteEditGroupId] = useState('');
  const [paletteNewColorName, setPaletteNewColorName] = useState('');
  const [paletteNewColorHex, setPaletteNewColorHex] = useState('#ffffff');
  const [customEditColorIndex, setCustomEditColorIndex] = useState<number | null>(null);
  const [customEditColorHex, setCustomEditColorHex] = useState('#ffffff');
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState('-');
  const [cropRect, setCropRect] = useState<CropRect | null>(null);

  const [cols, setCols] = useState(32);
  const [rows, setRows] = useState(32);
  const [mode, setMode] = useState<LayoutMode>('fit');
  const strategy: MatchStrategy = 'lab_nearest';
  const [preMergeDeltaE, setPreMergeDeltaE] = useState(0);
  const [showCode, setShowCode] = useState(true);
  const [exportScale, setExportScale] = useState<1 | 2 | 3>(2);
  const [cropToolEnabled, setCropToolEnabled] = useState(true);
  const [cropHoverMode, setCropHoverMode] = useState<CropDragMode | null>(null);
  const [editTool, setEditTool] = useState<'pan' | 'paint' | 'erase' | 'bucket' | 'picker'>('pan');
  const [brushSize, setBrushSize] = useState(1);
  const [bucketMode, setBucketMode] = useState<'global' | 'region'>('global');
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const [authAccessToken, setAuthAccessToken] = useState(() => loadAuthAccessToken());
  const [authRefreshToken, setAuthRefreshToken] = useState(() => loadAuthRefreshToken());
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => loadAuthUser());
  const [authBusy, setAuthBusy] = useState(false);
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErrorText, setLoginErrorText] = useState('');
  const proMode = authUser?.role === 'pro' || authUser?.role === 'admin';
  const [showRuler, setShowRuler] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideEvery, setGuideEvery] = useState(5);

  const [paletteSearch, setPaletteSearch] = useState('');
  const [editColorName, setEditColorName] = useState('');
  const [editColorMenuOpen, setEditColorMenuOpen] = useState(false);
  const [focusColorName, setFocusColorName] = useState('');
  const [focusColorSearch, setFocusColorSearch] = useState('');
  const [focusColorMenuOpen, setFocusColorMenuOpen] = useState(false);
  const [focusNeighborEnabled, setFocusNeighborEnabled] = useState(false);
  const [focusNeighborDeltaE, setFocusNeighborDeltaE] = useState(10);
  const [statsSearch, setStatsSearch] = useState('');
  const [proUnitCost, setProUnitCost] = useState(PUBLIC_PRICING_PRESET.unitCost);
  const [proLossRate, setProLossRate] = useState(PUBLIC_PRICING_PRESET.lossRate);
  const [proHourlyRate, setProHourlyRate] = useState(160);
  const [proWorkHours, setProWorkHours] = useState(1);
  const [proFixedCost, setProFixedCost] = useState(PUBLIC_PRICING_PRESET.fixedCost);
  const [proMargin, setProMargin] = useState(PUBLIC_PRICING_PRESET.margin);

  const [converted, setConverted] = useState<Converted | null>(null);
  const [gridMeta, setGridMeta] = useState('-');
  const [statusText, setStatusText] = useState('尚未載入圖片。');
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const [undoStack, setUndoStack] = useState<ChangeBatch[]>([]);
  const [redoStack, setRedoStack] = useState<ChangeBatch[]>([]);
  const [lastPickedOldColor, setLastPickedOldColor] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [activeDraftId, setActiveDraftId] = useState('');
  const [activeDraftVersionId, setActiveDraftVersionId] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isDraftBusy, setIsDraftBusy] = useState(false);
  const [draftRenameInput, setDraftRenameInput] = useState('');
  const [draftVersionNoteInput, setDraftVersionNoteInput] = useState('');
  const [compareVersionA, setCompareVersionA] = useState('');
  const [compareVersionB, setCompareVersionB] = useState('');
  const [compareSummary, setCompareSummary] = useState('');
  const [shortcutConfig, setShortcutConfig] = useState<ShortcutConfig>(() => loadShortcutConfig());
  const [preflightCsv, setPreflightCsv] = useState<Array<{ ok: boolean; label: string; detail: string }>>([]);
  const [preflightPdf, setPreflightPdf] = useState<Array<{ ok: boolean; label: string; detail: string }>>([]);
  const [storageEstimateText, setStorageEstimateText] = useState('-');
  const [convertProgress, setConvertProgress] = useState<{ running: boolean; phase: string; percent: number }>({
    running: false,
    phase: '',
    percent: 0
  });
  const [pdfPageFrom, setPdfPageFrom] = useState(1);
  const [pdfPageTo, setPdfPageTo] = useState(1);
  const [pdfJumpPage, setPdfJumpPage] = useState(1);
  const [oversizePlan, setOversizePlan] = useState<OversizePlan | null>(null);
  const [largeGridMode, setLargeGridMode] = useState(false);
  const [largeViewTilePage, setLargeViewTilePage] = useState(0);
  const [largeOperationScope, setLargeOperationScope] = useState<'tile' | 'all'>('tile');
  const [constructionMode, setConstructionMode] = useState(false);
  const [constructionStrategy, setConstructionStrategy] = useState<'block' | 'color'>('block');
  const [constructionShowDoneOverlay, setConstructionShowDoneOverlay] = useState(true);
  const [constructionDoneMap, setConstructionDoneMap] = useState<Record<string, boolean>>({});
  const [constructionCurrentTaskId, setConstructionCurrentTaskId] = useState('');
  const [constructionOrderRule, setConstructionOrderRule] = useState<ConstructionOrderRule>('count_desc');
  const [constructionCustomOrder, setConstructionCustomOrder] = useState<string[]>([]);
  const [constructionDragTaskId, setConstructionDragTaskId] = useState('');
  const [constructionTemplates, setConstructionTemplates] = useState<ConstructionTemplate[]>(() => loadConstructionTemplates());
  const [constructionTemplateName, setConstructionTemplateName] = useState('我的模板');
  const [constructionTemplateId, setConstructionTemplateId] = useState('');
  const defaultShortcutConfig = useMemo(() => buildDefaultShortcutConfig(), []);
  const effectiveShortcutConfig = useMemo(
    () => (proMode ? shortcutConfig : defaultShortcutConfig),
    [proMode, shortcutConfig, defaultShortcutConfig]
  );

  const groups = useMemo(
    () => [...builtinGroups, ...customPaletteGroups.map((g) => toCustomPaletteViewGroup(g))],
    [builtinGroups, customPaletteGroups]
  );
  const activeGroup = useMemo(() => groups.find((x) => x.name === activeGroupName) ?? null, [groups, activeGroupName]);
  const editablePaletteGroup = useMemo(
    () => customPaletteGroups.find((g) => g.id === paletteEditGroupId) ?? null,
    [customPaletteGroups, paletteEditGroupId]
  );
  const builtinPreviewGroup = useMemo(
    () => builtinGroups.find((g) => g.name === builtinPreviewGroupName) ?? null,
    [builtinGroups, builtinPreviewGroupName]
  );
  const activeDraft = useMemo(() => drafts.find((d) => d.id === activeDraftId) ?? null, [drafts, activeDraftId]);
  const activeVersionMeta = useMemo(
    () => (activeDraft?.versions ?? []).find((v) => v.id === activeDraftVersionId) ?? null,
    [activeDraft, activeDraftVersionId]
  );

  useEffect(() => {
    isDraftBusyRef.current = isDraftBusy;
  }, [isDraftBusy]);

  useEffect(() => {
    activeDraftIdRef.current = activeDraftId;
  }, [activeDraftId]);

  useEffect(() => {
    setDraftRenameInput(activeDraft?.name ?? '');
    setDraftVersionNoteInput(activeVersionMeta?.note ?? '');
  }, [activeDraft?.name, activeVersionMeta?.note]);

  useEffect(() => {
    const versions = activeDraft?.versions ?? [];
    if (!versions.length) {
      setCompareVersionA('');
      setCompareVersionB('');
      setCompareSummary('');
      return;
    }
    const latest = versions[versions.length - 1]?.id ?? '';
    const prev = versions[versions.length - 2]?.id ?? latest;
    setCompareVersionA(prev);
    setCompareVersionB(latest);
  }, [activeDraftId, activeDraft?.versionCount]);

  useEffect(() => {
    if (!paletteEditGroupId) {
      setPaletteNewGroupName('');
      return;
    }
    const found = customPaletteGroups.find((g) => g.id === paletteEditGroupId);
    if (found) setPaletteNewGroupName(found.name);
  }, [paletteEditGroupId, customPaletteGroups]);

  useEffect(() => {
    const onHash = () => setPage(getPageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (proMode) return;
    if (constructionOrderRule === 'manual') setConstructionOrderRule('count_desc');
  }, [proMode, constructionOrderRule]);

  const filteredEditColors = useMemo(() => {
    const q = paletteSearch.trim().toLowerCase();
    const colors = activeGroup?.colors ?? [];
    return colors.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [activeGroup, paletteSearch]);

  const selectedEditColor = useMemo(() => {
    if (editColorName === EMPTY_EDIT_COLOR_NAME) return EMPTY_EDIT_COLOR;
    return activeGroup?.colors.find((c) => c.name === editColorName) ?? null;
  }, [activeGroup, editColorName]);

  const effectiveUnitCost = useMemo(() => {
    const base = proMode ? proUnitCost : PUBLIC_PRICING_PRESET.unitCost;
    const lossRate = proMode ? proLossRate : PUBLIC_PRICING_PRESET.lossRate;
    return base * (1 + lossRate / 100);
  }, [proMode, proUnitCost, proLossRate]);

  const statsRows = useMemo(() => {
    if (!converted) return [];
    const map = new Map<string, { name: string; hex: string; count: number }>();
    for (const c of converted.cells) {
      if (c.isEmpty) continue;
      const row = map.get(c.colorName) ?? { name: c.colorName, hex: c.hex, count: 0 };
      row.count += 1;
      map.set(c.colorName, row);
    }
    const total = converted.cells.length || 1;
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .map((r) => ({
        ...r,
        ratio: (r.count / total) * 100,
        lineCost: r.count * effectiveUnitCost
      }));
  }, [converted, effectiveUnitCost]);

  const filteredStatsRows = useMemo(() => {
    const q = statsSearch.trim().toLowerCase();
    return statsRows.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [statsRows, statsSearch]);

  const filteredFocusColors = useMemo(() => {
    const q = focusColorSearch.trim().toLowerCase();
    return statsRows.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [statsRows, focusColorSearch]);

  const selectedFocusColor = useMemo(
    () => statsRows.find((r) => r.name === focusColorName) ?? null,
    [statsRows, focusColorName]
  );

  const focusVisibleNameSet = useMemo(() => {
    if (!focusColorName || !focusNeighborEnabled || !selectedFocusColor) return null;
    const focusLab = rgbToLab(...hexToRgb(selectedFocusColor.hex));
    const names = new Set<string>();
    for (const row of statsRows) {
      const lab = rgbToLab(...hexToRgb(row.hex));
      if (deltaE2000(focusLab, lab) <= focusNeighborDeltaE) names.add(row.name);
    }
    names.add(focusColorName);
    return names;
  }, [focusColorName, focusNeighborEnabled, focusNeighborDeltaE, selectedFocusColor, statsRows]);

  const totalBeads = converted?.cells.filter((c) => !c.isEmpty).length ?? 0;
  const complexityScore = useMemo(() => {
    if (!converted || totalBeads <= 0) return 0;

    let transitions = 0;
    let neighborChecks = 0;
    for (let y = 0; y < converted.rows; y++) {
      for (let x = 0; x < converted.cols; x++) {
        const idx = y * converted.cols + x;
        const cur = converted.cells[idx];
        if (!cur || cur.isEmpty) continue;
        if (x + 1 < converted.cols) {
          const right = converted.cells[idx + 1];
          if (right && !right.isEmpty) {
            neighborChecks += 1;
            if (right.colorName !== cur.colorName) transitions += 1;
          }
        }
        if (y + 1 < converted.rows) {
          const down = converted.cells[idx + converted.cols];
          if (down && !down.isEmpty) {
            neighborChecks += 1;
            if (down.colorName !== cur.colorName) transitions += 1;
          }
        }
      }
    }

    const transitionRate = neighborChecks > 0 ? transitions / neighborChecks : 0;
    const colorCount = statsRows.length;
    const tinyColorCount = statsRows.filter((r) => r.count <= Math.max(3, Math.floor(totalBeads * 0.01))).length;
    const tinyColorRatio = colorCount > 0 ? tinyColorCount / colorCount : 0;

    const colorScore = clamp01((colorCount - 4) / 24);
    const transitionScore = clamp01((transitionRate - 0.08) / 0.42);
    const tinyColorScore = clamp01((tinyColorRatio - 0.15) / 0.5);
    return clamp01(0.45 * transitionScore + 0.35 * colorScore + 0.2 * tinyColorScore);
  }, [converted, statsRows, totalBeads]);

  const complexityCap = useMemo(() => getComplexityCap(totalBeads), [totalBeads]);
  const complexityFeeRaw = useMemo(
    () => totalBeads * PUBLIC_PRICING_PRESET.complexityPerBead * complexityScore,
    [totalBeads, complexityScore]
  );
  const complexityFee = useMemo(() => {
    if (proMode) return 0;
    return Math.min(complexityFeeRaw, complexityCap);
  }, [proMode, complexityFeeRaw, complexityCap]);

  const materialCost = statsRows.reduce((acc, row) => acc + row.lineCost, 0);
  const laborCost = proMode ? proHourlyRate * proWorkHours : PUBLIC_PRICING_PRESET.labor;
  const fixedCost = proMode ? proFixedCost : PUBLIC_PRICING_PRESET.fixedCost;
  const marginRate = proMode ? proMargin : PUBLIC_PRICING_PRESET.margin;
  const subtotal = materialCost + laborCost + fixedCost + complexityFee;
  const quotePrice = Math.ceil(subtotal * (1 + marginRate / 100));
  const pdfPagination = useMemo(() => {
    if (!converted) return null;
    return buildPdfPagination(converted, PDF_BEAD_MM);
  }, [converted]);
  const pdfTileThumbMap = useMemo(() => {
    const map = new Map<number, string>();
    if (!converted || !pdfPagination || pdfPagination.totalTiles <= 1) return map;
    const maxThumbs = 80;
    for (const tile of pdfPagination.tiles.slice(0, maxThumbs)) {
      const c = document.createElement('canvas');
      const w = Math.max(24, tile.colsPart);
      const h = Math.max(24, tile.rowsPart);
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      const sx = w / tile.colsPart;
      const sy = h / tile.rowsPart;
      for (let y = 0; y < tile.rowsPart; y++) {
        for (let x = 0; x < tile.colsPart; x++) {
          const srcX = tile.startCol + x;
          const srcY = tile.startRow + y;
          const idx = srcY * converted.cols + srcX;
          const cell = converted.cells[idx];
          ctx.fillStyle = cell?.hex ?? '#ffffff';
          ctx.fillRect(Math.floor(x * sx), Math.floor(y * sy), Math.ceil(sx), Math.ceil(sy));
        }
      }
      map.set(tile.pageNo, c.toDataURL('image/png'));
    }
    return map;
  }, [converted, pdfPagination]);
  const selectedLargeTile = useMemo(() => {
    if (!pdfPagination || !largeGridMode || largeViewTilePage <= 0) return null;
    return pdfPagination.tiles.find((t) => t.pageNo === largeViewTilePage) ?? null;
  }, [pdfPagination, largeGridMode, largeViewTilePage]);
  const constructionBaseTasks = useMemo(() => {
    if (!converted) return [];
    return buildConstructionTasks(converted, constructionStrategy);
  }, [converted, constructionStrategy]);
  const constructionTasks = useMemo(() => {
    if (!constructionBaseTasks.length) return [];
    if (constructionOrderRule !== 'manual') {
      return sortConstructionTasksByRule(constructionBaseTasks, constructionOrderRule);
    }
    if (!proMode || !constructionCustomOrder.length) return constructionBaseTasks;
    const map = new Map(constructionBaseTasks.map((t) => [t.id, t]));
    const ordered: ConstructionTask[] = [];
    for (const id of constructionCustomOrder) {
      const t = map.get(id);
      if (!t) continue;
      ordered.push(t);
      map.delete(id);
    }
    for (const t of constructionBaseTasks) {
      if (map.has(t.id)) ordered.push(t);
    }
    return ordered;
  }, [constructionBaseTasks, proMode, constructionCustomOrder, constructionOrderRule]);
  const constructionCurrentTask = useMemo(() => {
    if (!constructionTasks.length) return null;
    if (!constructionCurrentTaskId) return null;
    const byId = constructionTasks.find((t) => t.id === constructionCurrentTaskId);
    if (byId) return byId;
    return null;
  }, [constructionTasks, constructionCurrentTaskId, constructionDoneMap]);
  const constructionCellTaskMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const task of constructionTasks) {
      for (const idx of task.cellIndices) {
        if (!map.has(idx)) map.set(idx, task.id);
      }
    }
    return map;
  }, [constructionTasks]);
  const constructionDoneCellSet = useMemo(() => {
    const set = new Set<number>();
    if (!constructionTasks.length) return set;
    for (const t of constructionTasks) {
      if (!constructionDoneMap[t.id]) continue;
      for (const idx of t.cellIndices) set.add(idx);
    }
    return set;
  }, [constructionTasks, constructionDoneMap]);
  const constructionCurrentCellSet = useMemo(() => {
    const set = new Set<number>();
    if (!constructionCurrentTask) return set;
    for (const idx of constructionCurrentTask.cellIndices) set.add(idx);
    return set;
  }, [constructionCurrentTask]);
  const shortcutConflicts = useMemo(() => {
    if (!proMode) return [];
    const rev = new Map<string, Array<keyof typeof SHORTCUTS>>();
    for (const key of Object.keys(shortcutConfig) as Array<keyof typeof SHORTCUTS>) {
      for (const raw of shortcutConfig[key]) {
        const normalized = String(raw).trim().toLowerCase();
        if (!normalized) continue;
        const arr = rev.get(normalized) ?? [];
        arr.push(key);
        rev.set(normalized, arr);
      }
    }
    return Array.from(rev.entries())
      .filter(([, actions]) => actions.length > 1)
      .map(([hotkey, actions]) => ({ hotkey, actions }));
  }, [proMode, shortcutConfig]);
  const constructionCompletionText = useMemo(() => {
    if (!constructionTasks.length) return '0 / 0';
    let done = 0;
    for (const t of constructionTasks) {
      if (constructionDoneMap[t.id]) done += 1;
    }
    return `${done} / ${constructionTasks.length}`;
  }, [constructionTasks, constructionDoneMap]);
  const constructionRuleInference = useMemo(() => {
    if (!proMode || constructionOrderRule !== 'manual' || !constructionTasks.length) return null;
    const currentIds = constructionTasks.map((t) => t.id);
    const rules: Exclude<ConstructionOrderRule, 'manual'>[] = ['count_desc', 'count_asc', 'title_asc', 'title_desc'];
    const scores = rules.map((rule) => {
      const ids = sortConstructionTasksByRule(constructionBaseTasks, rule).map((t) => t.id);
      return { rule, score: calcOrderSimilarity(currentIds, ids) };
    });
    scores.sort((a, b) => b.score - a.score);
    return { bestRule: scores[0].rule, bestScore: scores[0].score, scores };
  }, [proMode, constructionOrderRule, constructionTasks, constructionBaseTasks]);

  useEffect(() => {
    if (!constructionMode) return;
    const id = constructionCurrentTask?.id;
    if (!id) return;
    const node = constructionItemRefs.current[id];
    if (!node) return;
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [constructionMode, constructionCurrentTask?.id]);

  useEffect(() => {
    const ids = new Set(constructionTasks.map((t) => t.id));
    setConstructionDoneMap((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!ids.has(k)) {
          changed = true;
          continue;
        }
        next[k] = v;
      }
      if (!changed && Object.keys(next).length === Object.keys(prev).length) return prev;
      return next;
    });
    setConstructionCurrentTaskId((prev) => {
      if (prev === '') return '';
      if (prev && ids.has(prev)) return prev;
      return constructionTasks.find((t) => !constructionDoneMap[t.id])?.id ?? constructionTasks[0]?.id ?? '';
    });
    if (proMode) {
      setConstructionCustomOrder((prev) => {
        const next = prev.filter((id) => ids.has(id));
        return next.length === prev.length ? prev : next;
      });
    } else {
      setConstructionCustomOrder((prev) => (prev.length ? [] : prev));
    }
  }, [constructionTasks, constructionDoneMap, proMode]);

  useEffect(() => {
    persistAuthAccessToken(authAccessToken);
  }, [authAccessToken]);

  useEffect(() => {
    persistAuthRefreshToken(authRefreshToken);
  }, [authRefreshToken]);

  useEffect(() => {
    persistAuthUser(authUser);
  }, [authUser]);

  const clearAuthSession = useCallback(() => {
    setAuthAccessToken('');
    setAuthRefreshToken('');
    setAuthUser(null);
  }, []);

  const handleTokenRefreshed = useCallback(() => {
    setStatusText('登入狀態已自動續期。');
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearAuthSession();
    setStatusText('登入狀態已過期，請重新登入。');
  }, [clearAuthSession]);

  const apiClient = useMemo(
    () =>
      new ApiClient({
        baseUrl: API_BASE_URL,
        getAccessToken: () => authAccessToken,
        getRefreshToken: () => authRefreshToken,
        onAuthUpdate: ({ accessToken, refreshToken, user }) => {
          setAuthAccessToken(accessToken);
          setAuthRefreshToken(refreshToken);
          if (user) setAuthUser(user);
        },
        onTokenRefreshed: handleTokenRefreshed,
        onUnauthorized: handleUnauthorized
      }),
    [authAccessToken, authRefreshToken, handleTokenRefreshed, handleUnauthorized]
  );

  useEffect(() => {
    if (!authAccessToken && !authRefreshToken) return;
    let canceled = false;
    const run = async () => {
      try {
        const data = await apiClient.getMe();
        if (canceled) return;
        if (!data.user) {
          clearAuthSession();
          return;
        }
        setAuthUser(data.user);
      } catch {
        if (!canceled) clearAuthSession();
      }
    };
    void run();
    return () => {
      canceled = true;
    };
  }, [authAccessToken, authRefreshToken, apiClient, clearAuthSession]);

  useEffect(() => {
    let canceled = false;
    const run = async () => {
      customPaletteSyncLockRef.current = true;
      try {
        if (!authUser) {
          const loaded = loadCustomPaletteGroups();
          if (!canceled) setCustomPaletteGroups(loaded);
          return;
        }
        const data = await apiClient.getCustomPalettes();
        if (canceled) return;
        const groups = (data.groups ?? []).map((g) => ({
          id: g.id,
          name: g.name,
          colors: (g.colors ?? []).map((c) => ({ name: c.name, hex: normalizeColorHex(c.hex) }))
        })) as CustomPaletteGroup[];
        setCustomPaletteGroups(groups);
      } catch {
        if (!canceled) {
          const loaded = loadCustomPaletteGroups();
          setCustomPaletteGroups(loaded);
        }
      } finally {
        customPaletteSyncLockRef.current = false;
      }
    };
    void run();
    return () => {
      canceled = true;
    };
  }, [authUser, apiClient]);

  useEffect(() => {
    if (customPaletteSyncLockRef.current) return;
    if (customPaletteSyncTimerRef.current != null) {
      window.clearTimeout(customPaletteSyncTimerRef.current);
      customPaletteSyncTimerRef.current = null;
    }
    if (!authUser) {
      saveCustomPaletteGroups(customPaletteGroups);
      return;
    }
    customPaletteSyncTimerRef.current = window.setTimeout(() => {
      const payload: CustomPaletteGroupDto[] = customPaletteGroups.map((g) => ({
        id: g.id,
        name: g.name,
        colors: g.colors.map((c) => ({ name: c.name, hex: normalizeColorHex(c.hex) }))
      }));
      void apiClient.putCustomPalettes(payload).catch(() => {
        // keep UI responsive; status toast is handled by action handlers
      });
      customPaletteSyncTimerRef.current = null;
    }, 300);
    return () => {
      if (customPaletteSyncTimerRef.current != null) {
        window.clearTimeout(customPaletteSyncTimerRef.current);
        customPaletteSyncTimerRef.current = null;
      }
    };
  }, [authUser, customPaletteGroups, apiClient]);

  useEffect(() => {
    let canceled = false;
    const run = async () => {
      userSettingsSyncLockRef.current = true;
      try {
        if (!authUser) {
          if (!canceled) {
            setShortcutConfig(loadShortcutConfig());
            setConstructionTemplates(loadConstructionTemplates());
          }
          return;
        }
        const data = await apiClient.getUserSettings();
        if (canceled) return;
        const settings = data.settings ?? {};
        if (settings.shortcutConfig) {
          setShortcutConfig(normalizeShortcutConfig(settings.shortcutConfig));
        }
        if (settings.constructionTemplates) {
          setConstructionTemplates(normalizeConstructionTemplates(settings.constructionTemplates));
        }
      } catch {
        if (!canceled && !authUser) {
          setShortcutConfig(loadShortcutConfig());
          setConstructionTemplates(loadConstructionTemplates());
        }
      } finally {
        userSettingsSyncLockRef.current = false;
      }
    };
    void run();
    return () => {
      canceled = true;
    };
  }, [authUser, apiClient]);

  useEffect(() => {
    if (userSettingsSyncLockRef.current) return;
    if (userSettingsSyncTimerRef.current != null) {
      window.clearTimeout(userSettingsSyncTimerRef.current);
      userSettingsSyncTimerRef.current = null;
    }
    if (!authUser) {
      if (proMode) {
        localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcutConfig));
        localStorage.setItem(CONSTRUCTION_TEMPLATE_STORAGE_KEY, JSON.stringify(constructionTemplates));
      }
      return;
    }
    if (!proMode) return;
    userSettingsSyncTimerRef.current = window.setTimeout(() => {
      const payload: UserSettingsDto = {
        shortcutConfig,
        constructionTemplates
      };
      void apiClient.putUserSettings(payload).catch(() => {
        // keep UI responsive
      });
      userSettingsSyncTimerRef.current = null;
    }, 300);
    return () => {
      if (userSettingsSyncTimerRef.current != null) {
        window.clearTimeout(userSettingsSyncTimerRef.current);
        userSettingsSyncTimerRef.current = null;
      }
    };
  }, [authUser, proMode, shortcutConfig, constructionTemplates, apiClient]);

  const loadPalette = useCallback(async () => {
    const parseGroups = (groupsRaw: Array<{ name: string; colors?: Array<{ name?: string; hex?: string }> }>) => {
      return groupsRaw.map((g) => ({
        isCustom: false,
        name: g.name,
        colors: (g.colors ?? [])
          .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex ?? ''))
          .map((c) => {
            const rgb = hexToRgb((c.hex ?? '#000000').toUpperCase());
            return {
              name: String(c.name ?? '').trim() || '未命名色號',
              hex: (c.hex ?? '#000000').toUpperCase(),
              rgb,
              lab: rgbToLab(...rgb)
            } as PaletteColor;
          })
      }));
    };

    const loadPaletteFromLocal = async () => {
      const res = await fetch(LOCAL_PALETTE_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`本地色庫讀取失敗 (${res.status})`);
      const data = (await res.json()) as { groups?: Array<{ name: string; colors?: Array<{ name?: string; hex?: string }> }> };
      const groupsRaw = Array.isArray(data.groups) ? data.groups : [];
      const parsed = parseGroups(groupsRaw);
      if (!parsed.length) throw new Error('本地色庫沒有可用群組');
      setBuiltinGroups(parsed);
      setStatusText(`色庫載入完成（本地），內建群組數：${parsed.length}`);
    };

    try {
      const summaryData = await apiClient.getPaletteGroups();
      const summaries = summaryData.groups ?? [];
      if (!summaries.length) throw new Error('API 找不到可用色庫群組');
      const detailDataList = await Promise.all(
        summaries.map((g) => apiClient.getPaletteGroup(g.code))
      );
      const groupsRaw = detailDataList
        .map((x) => x.group)
        .filter((x): x is PaletteApiGroupDetail => !!x?.name)
        .map((g) => ({ name: g.name, colors: g.colors ?? [] }));
      const parsed = parseGroups(groupsRaw);

      if (!parsed.length) throw new Error('找不到可用色庫群組');
      setBuiltinGroups(parsed);
      setStatusText(`色庫載入完成（API），內建群組數：${parsed.length}`);
    } catch (err) {
      const apiMsg = `無法載入色庫（API）：${(err as Error).message}`;
      if (!LOCAL_PALETTE_FALLBACK) {
        setStatusText(apiMsg);
        return;
      }
      try {
        await loadPaletteFromLocal();
      } catch (localErr) {
        setStatusText(`${apiMsg}；本地色庫也失敗：${(localErr as Error).message}`);
      }
    }
  }, [apiClient]);

  const loginByForm = useCallback(async () => {
    if (authBusy) return;
    const username = loginUsername.trim();
    const password = loginPassword;
    if (!username || !password) {
      setLoginErrorText('請輸入帳號與密碼。');
      return;
    }
    setAuthBusy(true);
    setLoginErrorText('');
    try {
      const data = await apiClient.login(username, password);
      if (!data.accessToken || !data.refreshToken || !data.user) throw new Error('登入回應不完整');
      setAuthAccessToken(data.accessToken);
      setAuthRefreshToken(data.refreshToken);
      setAuthUser(data.user);
      setStatusText(`登入成功：${data.user.username} (${data.user.role})`);
      setAuthPanelOpen(false);
      setLoginPassword('');
    } catch (err) {
      clearAuthSession();
      const msg = `登入失敗：${(err as Error).message}`;
      setLoginErrorText(msg);
      setStatusText(msg);
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, apiClient, clearAuthSession, loginUsername, loginPassword]);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } finally {
      clearAuthSession();
      setAuthPanelOpen(false);
      setLoginPassword('');
      setLoginErrorText('');
      setStatusText('已登出，回到一般版訪客模式。');
    }
  }, [apiClient, clearAuthSession]);

  useEffect(() => {
    void loadPalette();
  }, [loadPalette]);

  useEffect(() => {
    if (!groups.length) return;
    setActiveGroupName((prev) => {
      if (prev && groups.some((g) => g.name === prev)) return prev;
      const defaultGroup = groups.find((g) => g.name.includes('小舞'));
      return defaultGroup?.name ?? groups[0].name;
    });
  }, [groups]);

  useEffect(() => {
    if (!builtinGroups.length) {
      setBuiltinPreviewGroupName('');
      return;
    }
    setBuiltinPreviewGroupName((prev) => {
      if (prev && builtinGroups.some((g) => g.name === prev)) return prev;
      return builtinGroups[0].name;
    });
  }, [builtinGroups]);

  useEffect(() => {
    if (paletteEditGroupId && customPaletteGroups.some((g) => g.id === paletteEditGroupId)) return;
    setPaletteEditGroupId(customPaletteGroups[0]?.id ?? '');
  }, [customPaletteGroups, paletteEditGroupId]);

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

  useEffect(() => {
    const run = async () => {
      try {
        const est = await navigator.storage?.estimate?.();
        if (!est) return;
        const used = est.usage ?? 0;
        const quota = est.quota ?? 0;
        if (!quota) {
          setStorageEstimateText(`${(used / 1024 / 1024).toFixed(2)} MB`);
          return;
        }
        setStorageEstimateText(`${(used / 1024 / 1024).toFixed(2)} / ${(quota / 1024 / 1024).toFixed(0)} MB`);
      } catch {
        setStorageEstimateText('-');
      }
    };
    void run();
  }, [drafts.length, customPaletteGroups.length]);

  useEffect(() => {
    const total = pdfPagination?.totalTiles ?? 1;
    setPdfPageFrom((prev) => clampInt(prev, 1, total));
    setPdfPageTo((prev) => clampInt(prev, 1, total));
    setPdfJumpPage((prev) => clampInt(prev, 1, total));
  }, [pdfPagination?.totalTiles]);

  const refreshDrafts = useCallback(async () => {
    try {
      const rows = authUser
        ? ((await apiClient.listProjects()).drafts ?? []).map(toDraftSummaryFromApi)
        : await listDrafts();
      setDrafts(rows);
      if (activeDraftId && !rows.some((d) => d.id === activeDraftId)) {
        setActiveDraftId('');
        setActiveDraftVersionId('');
        setLastSavedAt(null);
        lastSavedFingerprintRef.current = '';
        lastManualSaveAtRef.current = 0;
      }
    } catch (err) {
      setStatusText(`草稿清單讀取失敗：${(err as Error).message}`);
    }
  }, [activeDraftId, authUser, apiClient]);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  const buildDraftSnapshot = useCallback((): DraftSnapshot => {
    return {
      projectName,
      activeGroupName,
      cols,
      rows,
      mode,
      strategy,
      preMergeDeltaE,
      showCode,
      exportScale,
      cropToolEnabled,
      cropRect,
      imageDataUrl,
      imageMeta,
      gridMeta,
      converted
    };
  }, [projectName, activeGroupName, cols, rows, mode, strategy, preMergeDeltaE, showCode, exportScale, cropToolEnabled, cropRect, imageDataUrl, imageMeta, gridMeta, converted]);

  useEffect(() => {
    latestSnapshotRef.current = buildDraftSnapshot();
  }, [buildDraftSnapshot]);

  const saveDraft = useCallback(
    async (options?: { asNew?: boolean; reason?: 'manual' | 'autosave'; silent?: boolean }) => {
      const asNew = !!options?.asNew;
      const reason = options?.reason ?? 'manual';
      const silent = !!options?.silent;
      if (!imageDataUrl && !converted) {
        if (!silent) setStatusText('目前沒有可儲存的圖片或轉換結果。');
        return;
      }
      const snapshot = buildDraftSnapshot();
      const snapshotFingerprint = buildDraftFingerprint(snapshot);
      setIsDraftBusy(true);
      try {
        if (asNew || !activeDraftId) {
          const guestLimit = getDraftLimit();
          const cloudLimit = getCloudDraftLimit(authUser);
          if (!authUser && drafts.length >= guestLimit) {
            setStatusText(`未登入模式最多 ${guestLimit} 份草稿，請先刪除一份再新增。`);
            return;
          }
          if (authUser && cloudLimit != null && drafts.length >= cloudLimit) {
            setStatusText(`一般版登入最多 ${cloudLimit} 份雲端草稿，請先刪除一份再新增。`);
            return;
          }
          const draftName = (projectName || '').trim() || `草稿 ${drafts.length + 1}`;
          const newId = authUser
            ? ((await apiClient.createProject(draftName, snapshot)).id ?? '')
            : await createDraft(draftName, snapshot);
          if (!newId) throw new Error('PROJECT_CREATE_FAILED');
          setActiveDraftId(newId);
          setActiveDraftVersionId('');
          const now = Date.now();
          setLastSavedAt(now);
          if (reason === 'manual' || asNew) lastManualSaveAtRef.current = now;
          lastSavedFingerprintRef.current = snapshotFingerprint;
          if (!silent) setStatusText(`已新增草稿：${draftName}`);
        } else {
          const note = reason === 'manual' ? '手動存檔' : '自動存檔';
          if (authUser) {
            const result = await apiClient.saveProject(activeDraftId, {
              snapshot,
              reason,
              nextName: (projectName || '').trim() || undefined,
              note
            });
            setActiveDraftVersionId(result.versionId ?? '');
          } else {
            await updateDraft(activeDraftId, snapshot, reason, (projectName || '').trim() || undefined, note);
            setActiveDraftVersionId('');
          }
          const now = Date.now();
          setLastSavedAt(now);
          if (reason === 'manual') lastManualSaveAtRef.current = now;
          lastSavedFingerprintRef.current = snapshotFingerprint;
          if (!silent && reason === 'manual') setStatusText('草稿已更新。');
        }
        await refreshDrafts();
      } catch (err) {
        const message = (err as Error).message;
        if (!authUser && message === 'MAX_DRAFTS_REACHED') {
          setStatusText(`未登入模式最多 ${getDraftLimit()} 份草稿，請先刪除一份再新增。`);
        } else if (authUser && message.startsWith('MEMBER_DRAFT_LIMIT_REACHED')) {
          const cloudLimit = getCloudDraftLimit(authUser) ?? 5;
          setStatusText(`一般版登入最多 ${cloudLimit} 份雲端草稿，請先刪除一份再新增。`);
        } else {
          setStatusText(`草稿儲存失敗：${message}`);
        }
      } finally {
        setIsDraftBusy(false);
      }
    },
    [imageDataUrl, converted, buildDraftSnapshot, activeDraftId, drafts.length, projectName, refreshDrafts, authUser, apiClient]
  );

  const loadDraftById = useCallback(
    async (draftId: string, versionId?: string) => {
      if (!draftId) return;
      setIsDraftBusy(true);
      try {
        const snapshot = authUser
          ? ((await apiClient.getProjectSnapshot(draftId, versionId)).snapshot as DraftSnapshot | undefined)
          : await getDraftSnapshot(draftId, versionId);
        if (!snapshot) {
          setStatusText('找不到草稿內容。');
          return;
        }
        isApplyingDraftRef.current = true;
        const bitmap = snapshot.imageDataUrl ? await dataUrlToBitmap(snapshot.imageDataUrl) : null;
        setProjectName(snapshot.projectName || '未命名專案');
        setActiveGroupName(snapshot.activeGroupName || activeGroupName);
        setCols(Math.max(1, Math.floor(Number(snapshot.cols) || 1)));
        setRows(Math.max(1, Math.floor(Number(snapshot.rows) || 1)));
        setMode(snapshot.mode);
        setPreMergeDeltaE(Math.max(0, Math.min(PRE_MERGE_DELTAE_MAX, Number(snapshot.preMergeDeltaE) || 0)));
        setShowCode(!!snapshot.showCode);
        setExportScale(snapshot.exportScale);
        setCropToolEnabled(!!snapshot.cropToolEnabled);
        setCropRect(snapshot.cropRect);
        setImageDataUrl(snapshot.imageDataUrl ?? null);
        setImageBitmap(bitmap);
        setImageMeta(snapshot.imageMeta || '-');
        setGridMeta(snapshot.gridMeta || '-');
        setConverted(snapshot.converted ?? null);
        setUndoStack([]);
        setRedoStack([]);
        setHistoryItems([]);
        setFocusColorName('');
        setFocusColorSearch('');
        setEditColorMenuOpen(false);
        setFocusColorMenuOpen(false);
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
        setActiveDraftId(draftId);
        setActiveDraftVersionId(versionId ?? '');
        setLastSavedAt(Date.now());
        lastSavedFingerprintRef.current = buildDraftFingerprint(snapshot);
        setStatusText(versionId ? '已還原到指定版本。' : '草稿載入完成。');
      } catch (err) {
        setStatusText(`草稿載入失敗：${(err as Error).message}`);
      } finally {
        isApplyingDraftRef.current = false;
        setIsDraftBusy(false);
      }
    },
    [activeGroupName, authUser, apiClient]
  );

  const removeDraftById = useCallback(
    async (draftId: string) => {
      if (!draftId) return;
      setIsDraftBusy(true);
      try {
        if (authUser) {
          await apiClient.deleteProject(draftId);
        } else {
          await deleteDraft(draftId);
        }
        if (activeDraftId === draftId) {
          setActiveDraftId('');
          setActiveDraftVersionId('');
          setLastSavedAt(null);
          lastSavedFingerprintRef.current = '';
          lastManualSaveAtRef.current = 0;
        }
        await refreshDrafts();
        setStatusText('草稿已刪除。');
      } catch (err) {
        setStatusText(`刪除草稿失敗：${(err as Error).message}`);
      } finally {
        setIsDraftBusy(false);
      }
    },
    [activeDraftId, refreshDrafts, authUser, apiClient]
  );

  const saveDraftRename = useCallback(async () => {
    if (!activeDraftId) return;
    const name = draftRenameInput.trim();
    if (!name) {
      setStatusText('草稿名稱不可為空。');
      return;
    }
    setIsDraftBusy(true);
    try {
      if (authUser) {
        await apiClient.renameProject(activeDraftId, name);
      } else {
        await renameDraft(activeDraftId, name);
      }
      await refreshDrafts();
      setStatusText('草稿名稱已更新。');
    } catch (err) {
      setStatusText(`草稿改名失敗：${(err as Error).message}`);
    } finally {
      setIsDraftBusy(false);
    }
  }, [activeDraftId, draftRenameInput, refreshDrafts, authUser, apiClient]);

  const saveVersionNote = useCallback(async () => {
    if (!activeDraftId || !activeDraftVersionId) return;
    setIsDraftBusy(true);
    try {
      if (authUser) {
        await apiClient.setProjectVersionNote(activeDraftId, activeDraftVersionId, draftVersionNoteInput.trim());
      } else {
        await setDraftVersionNote(activeDraftId, activeDraftVersionId, draftVersionNoteInput.trim());
      }
      await refreshDrafts();
      setStatusText('版本備註已更新。');
    } catch (err) {
      setStatusText(`版本備註更新失敗：${(err as Error).message}`);
    } finally {
      setIsDraftBusy(false);
    }
  }, [activeDraftId, activeDraftVersionId, draftVersionNoteInput, refreshDrafts, authUser, apiClient]);

  const compareDraftVersions = useCallback(async () => {
    if (!activeDraftId || !compareVersionA || !compareVersionB) {
      setCompareSummary('請先選擇兩個版本。');
      return;
    }
    try {
      const a = authUser
        ? ((await apiClient.getProjectSnapshot(activeDraftId, compareVersionA)).snapshot as DraftSnapshot | undefined)
        : await getDraftSnapshot(activeDraftId, compareVersionA);
      const b = authUser
        ? ((await apiClient.getProjectSnapshot(activeDraftId, compareVersionB)).snapshot as DraftSnapshot | undefined)
        : await getDraftSnapshot(activeDraftId, compareVersionB);
      if (!a || !b) {
        setCompareSummary('版本資料不存在。');
        return;
      }
      const changedSettings: string[] = [];
      if (a.projectName !== b.projectName) changedSettings.push('專案名稱');
      if (a.activeGroupName !== b.activeGroupName) changedSettings.push('作用群組');
      if (a.cols !== b.cols || a.rows !== b.rows) changedSettings.push('格線尺寸');
      if (a.mode !== b.mode) changedSettings.push('版面模式');
      if (a.strategy !== b.strategy) changedSettings.push('比對策略');
      if ((a.preMergeDeltaE ?? 0) !== (b.preMergeDeltaE ?? 0)) changedSettings.push('轉換前併色門檻');
      if (a.showCode !== b.showCode) changedSettings.push('色號顯示');
      const cellsA = a.converted?.cells ?? [];
      const cellsB = b.converted?.cells ?? [];
      const len = Math.min(cellsA.length, cellsB.length);
      let changedCells = 0;
      for (let i = 0; i < len; i++) {
        const ca = cellsA[i];
        const cb = cellsB[i];
        if (!ca || !cb) continue;
        if (ca.colorName !== cb.colorName || !!ca.isEmpty !== !!cb.isEmpty) changedCells += 1;
      }
      const sizeDiff = cellsA.length !== cellsB.length ? `；格子總數不同 ${cellsA.length}/${cellsB.length}` : '';
      const settingsText = changedSettings.length ? changedSettings.join('、') : '無';
      setCompareSummary(`差異格數 ${changedCells}${sizeDiff}；設定差異：${settingsText}`);
    } catch (err) {
      setCompareSummary(`比較失敗：${(err as Error).message}`);
    }
  }, [activeDraftId, compareVersionA, compareVersionB, authUser, apiClient]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (isApplyingDraftRef.current) return;
      if (!activeDraftIdRef.current) return;
      if (isDraftBusyRef.current) return;

      const snapshot = latestSnapshotRef.current;
      if (!snapshot) return;
      if (!snapshot.imageDataUrl && !snapshot.converted) return;

      const now = Date.now();
      if (now - lastManualSaveAtRef.current < AUTO_SAVE_INTERVAL_MS) return;

      const fingerprint = buildDraftFingerprint(snapshot);
      if (fingerprint === lastSavedFingerprintRef.current) return;

      void saveDraft({ reason: 'autosave', silent: true });
    }, AUTO_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [saveDraft]);

  useEffect(() => {
    const colors = activeGroup?.colors ?? [];
    if (!colors.length) {
      setEditColorName('');
      return;
    }
    if (editColorName === EMPTY_EDIT_COLOR_NAME) return;
    if (!colors.some((c) => c.name === editColorName)) setEditColorName(colors[0].name);
  }, [activeGroup, editColorName]);

  useEffect(() => {
    if (!focusColorName) return;
    if (!statsRows.some((r) => r.name === focusColorName)) setFocusColorName('');
  }, [statsRows, focusColorName]);

  useEffect(() => {
    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (colorMenuRef.current && !colorMenuRef.current.contains(target)) {
        setEditColorMenuOpen(false);
      }
      if (focusColorMenuRef.current && !focusColorMenuRef.current.contains(target)) {
        setFocusColorMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, []);

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = Math.max(320, Math.floor(wrap.clientWidth - 6));
    const height = Math.max(320, Math.floor(wrap.clientHeight - 6));
    canvas.width = width;
    canvas.height = height;

    if (!converted || (cropToolEnabled && imageBitmap)) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      if (!imageBitmap) return;

      const pad = 12;
      const drawAreaW = Math.max(1, width - pad * 2);
      const drawAreaH = Math.max(1, height - pad * 2);
      const scale = Math.min(drawAreaW / imageBitmap.width, drawAreaH / imageBitmap.height);
      const drawW = Math.max(1, Math.floor(imageBitmap.width * scale));
      const drawH = Math.max(1, Math.floor(imageBitmap.height * scale));
      const ox = Math.floor((width - drawW) / 2);
      const oy = Math.floor((height - drawH) / 2);
      imagePreviewMetaRef.current = { ox, oy, scale, drawW, drawH };

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imageBitmap, ox, oy, drawW, drawH);

      if (cropRect) {
        const cx = Math.round(ox + cropRect.x * scale);
        const cy = Math.round(oy + cropRect.y * scale);
        const cw = Math.max(1, Math.round(cropRect.w * scale));
        const ch = Math.max(1, Math.round(cropRect.h * scale));
        const right = ox + drawW;
        const bottom = oy + drawH;
        const cropRight = cx + cw;
        const cropBottom = cy + ch;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        // Draw 4 masks around crop area (do not clear image pixels).
        ctx.fillRect(ox, oy, drawW, Math.max(0, cy - oy)); // top
        ctx.fillRect(ox, cy, Math.max(0, cx - ox), Math.max(0, ch)); // left
        ctx.fillRect(cropRight, cy, Math.max(0, right - cropRight), Math.max(0, ch)); // right
        ctx.fillRect(ox, cropBottom, drawW, Math.max(0, bottom - cropBottom)); // bottom
        const isMoveHover = cropToolEnabled && cropHoverMode === 'move';
        ctx.strokeStyle = cropToolEnabled ? '#d66d5b' : '#8f8a84';
        ctx.lineWidth = isMoveHover ? 3 : 2;
        ctx.strokeRect(cx + 0.5, cy + 0.5, Math.max(0, cw - 1), Math.max(0, ch - 1));
        if (cropToolEnabled) {
          const hs = 5;
          const handles = [
            { mode: 'nw', x: cx, y: cy },
            { mode: 'n', x: cx + cw / 2, y: cy },
            { mode: 'ne', x: cx + cw, y: cy },
            { mode: 'w', x: cx, y: cy + ch / 2 },
            { mode: 'e', x: cx + cw, y: cy + ch / 2 },
            { mode: 'sw', x: cx, y: cy + ch },
            { mode: 's', x: cx + cw / 2, y: cy + ch },
            { mode: 'se', x: cx + cw, y: cy + ch }
          ];
          for (const h of handles) {
            const hx = Math.round(h.x);
            const hy = Math.round(h.y);
            const isHover = cropHoverMode === (h.mode as CropDragMode);
            ctx.fillStyle = isHover ? '#d66d5b' : '#ffffff';
            ctx.strokeStyle = '#d66d5b';
            ctx.lineWidth = isHover ? 2 : 1.5;
            ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
            ctx.strokeRect(hx - hs + 0.5, hy - hs + 0.5, hs * 2 - 1, hs * 2 - 1);
          }
        }
        ctx.restore();
      }
      return;
    }

    const pad = 12;
    const drawW = width - pad * 2;
    const drawH = height - pad * 2;
    const viewStartCol = selectedLargeTile ? selectedLargeTile.startCol : 0;
    const viewStartRow = selectedLargeTile ? selectedLargeTile.startRow : 0;
    const viewCols = selectedLargeTile ? selectedLargeTile.colsPart : converted.cols;
    const viewRows = selectedLargeTile ? selectedLargeTile.rowsPart : converted.rows;
    const baseCell = Math.max(1, Math.floor(Math.min(drawW / viewCols, drawH / viewRows)));
    const cell = Math.max(1, Math.floor(baseCell * zoom));
    const gridW = cell * viewCols;
    const gridH = cell * viewRows;
    const ox = Math.floor((width - gridW) / 2 + panOffset.x);
    const oy = Math.floor((height - gridH) / 2 + panOffset.y);

    renderMetaRef.current = { ox, oy, cell, viewStartCol, viewStartRow, viewCols, viewRows };

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    const fullTotal = converted.cols * converted.rows;
    const fastRender = largeGridMode && fullTotal > GRID_SOFT_LIMIT && !selectedLargeTile;
    const showConstruction = constructionMode && constructionTasks.length > 0;

    for (let vy = 0; vy < viewRows; vy++) {
      for (let vx = 0; vx < viewCols; vx++) {
        const srcX = viewStartCol + vx;
        const srcY = viewStartRow + vy;
        const srcIdx = srcY * converted.cols + srcX;
        const c = converted.cells[srcIdx];
        if (!c) continue;
        const x = ox + vx * cell;
        const y = oy + vy * cell;
      const focusMatch = focusVisibleNameSet ? focusVisibleNameSet.has(c.colorName) : c.colorName === focusColorName;
      const hasFocus = !!focusColorName;
      const focusOutlineEnabled = !constructionMode;
      const isDimmed = hasFocus && !c.isEmpty && !focusMatch;
      const displayHex = isDimmed ? toGrayHex(c.hex) : c.hex;
      ctx.fillStyle = displayHex;
      ctx.fillRect(x, y, cell, cell);
      if (isDimmed) {
        // Wash out non-focused cells so the focused group remains visually dominant.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
        ctx.fillRect(x, y, cell, cell);
      }
      if (!fastRender) {
        ctx.strokeStyle = '#dbe5df';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cell, cell);
      }

      if (showConstruction) {
        if (constructionShowDoneOverlay && constructionDoneCellSet.has(srcIdx)) {
          ctx.fillStyle = toGrayHex(c.hex);
          ctx.fillRect(x, y, cell, cell);
          // Fade completed cells further so they read as "done" even if original colors are similar.
          ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
          ctx.fillRect(x, y, cell, cell);
          if (cell >= 4) {
            const lineW = Math.max(2.1, Math.min(3.6, cell * 0.28));
            ctx.strokeStyle = 'rgba(8, 52, 72, 0.88)';
            ctx.lineWidth = lineW;
            ctx.beginPath();
            ctx.moveTo(x + 1, y + cell - 1);
            ctx.lineTo(x + cell - 1, y + 1);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(8, 52, 72, 0.72)';
            ctx.lineWidth = Math.max(1.2, lineW * 0.8);
            ctx.beginPath();
            ctx.moveTo(x + 1, y + 1);
            ctx.lineTo(x + cell - 1, y + cell - 1);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(8, 52, 72, 0.92)';
            ctx.lineWidth = Math.max(1.4, lineW * 0.7);
            ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, cell - 1), Math.max(0, cell - 1));
          }
        }
        if (constructionCurrentCellSet.has(srcIdx)) {
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
          ctx.lineWidth = Math.max(1.5, Math.min(3, cell * 0.14));
          ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, cell - 1), Math.max(0, cell - 1));
        }
      }

      if (focusOutlineEnabled && hasFocus && focusMatch && !c.isEmpty) {
        // Dual outline keeps focus cells readable even when focus color is close to grayscale.
        const outer = Math.max(2, Math.min(4, cell * 0.18));
        const inner = Math.max(1, Math.min(2.5, cell * 0.12));
        ctx.strokeStyle = '#1f1f1f';
        ctx.lineWidth = outer;
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, cell - 1), Math.max(0, cell - 1));
        ctx.strokeStyle = '#ffb703';
        ctx.lineWidth = inner;
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, cell - 1), Math.max(0, cell - 1));
      }

      if (!fastRender && showCode && cell >= 8 && !c.isEmpty) {
        if (hasFocus && focusMatch) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
          ctx.shadowBlur = Math.max(1, cell * 0.14);
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }
        ctx.fillStyle = pickTextColor(displayHex);
        ctx.font = `${Math.max(9, Math.floor(cell * 0.35))}px Segoe UI`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.colorName, x + cell / 2, y + cell / 2);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
    }
    }

    const guideStep = Math.max(1, Math.floor(guideEvery));
    if (proMode && showGuide) {
      ctx.save();
      ctx.strokeStyle = '#8ea39a';
      ctx.lineWidth = 1.5;
      for (let gx = 0; gx <= viewCols; gx += guideStep) {
        const x = ox + gx * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, oy);
        ctx.lineTo(x, oy + viewRows * cell);
        ctx.stroke();
      }
      for (let gy = 0; gy <= viewRows; gy += guideStep) {
        const y = oy + gy * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(ox, y);
        ctx.lineTo(ox + viewCols * cell, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (proMode && showRuler) {
      ctx.save();
      ctx.fillStyle = '#ffffffd9';
      ctx.fillRect(ox, Math.max(0, oy - 20), viewCols * cell, 20);
      ctx.fillRect(Math.max(0, ox - 28), oy, 28, viewRows * cell);
      ctx.fillStyle = '#465a52';
      ctx.font = '11px Segoe UI';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let gx = 0; gx <= viewCols; gx += guideStep) {
        const x = ox + gx * cell;
        ctx.fillText(String(viewStartCol + gx), x, Math.max(10, oy - 10));
      }
      ctx.textAlign = 'right';
      for (let gy = 0; gy <= viewRows; gy += guideStep) {
        const y = oy + gy * cell;
        ctx.fillText(String(viewStartRow + gy), Math.max(20, ox - 6), y);
      }
      ctx.restore();
    }
  }, [converted, imageBitmap, cropRect, cropToolEnabled, cropHoverMode, showCode, focusColorName, focusVisibleNameSet, zoom, panOffset.x, panOffset.y, proMode, showGuide, showRuler, guideEvery, largeGridMode, selectedLargeTile, constructionMode, constructionTasks.length, constructionShowDoneOverlay, constructionDoneCellSet, constructionCurrentCellSet]);

  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  useEffect(() => {
    const onResize = () => drawGrid();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [drawGrid]);

  useEffect(() => {
    const onMouseUp = () => {
      isPointerDownRef.current = false;
      lastDragCellIdxRef.current = null;
      panLastPointRef.current = null;
      isCropDraggingRef.current = false;
      cropDragStartRef.current = null;
      cropDragModeRef.current = null;
      cropStartRectRef.current = null;
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      if (!isCropDraggingRef.current) return;
      isCropDraggingRef.current = false;
      cropDragStartRef.current = null;
      cropDragModeRef.current = null;
      if (cropStartRectRef.current) setCropRect(cropStartRectRef.current);
      cropStartRectRef.current = null;
    };
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!constructionMode) return;
    setFocusColorMenuOpen(false);
    setFocusNeighborEnabled(false);
  }, [constructionMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!canvas || !wrap) return;

    const onWheelNative = (ev: WheelEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const delta = ev.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => Math.max(0.25, Math.min(8, Number((prev + delta).toFixed(2)))));
    };

    canvas.addEventListener('wheel', onWheelNative, { passive: false });
    wrap.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheelNative);
      wrap.removeEventListener('wheel', onWheelNative);
    };
  }, []);

  const onImageSelected = async (file: File | null) => {
    if (!file) return;
    const img = await fileToImage(file);
    // Flatten to opaque white first to avoid dark fringes from transparent pixels.
    const flattenCanvas = document.createElement('canvas');
    flattenCanvas.width = img.width;
    flattenCanvas.height = img.height;
    const fctx = flattenCanvas.getContext('2d')!;
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, img.width, img.height);
    fctx.drawImage(img, 0, 0);
    const sourceDataUrl = flattenCanvas.toDataURL('image/webp', 0.9) || flattenCanvas.toDataURL('image/png');
    const bitmap = await createImageBitmap(flattenCanvas);
    setImageBitmap(bitmap);
    setImageDataUrl(sourceDataUrl);
    setConverted(null);
    setGridMeta('-');
    setCols(img.width);
    setRows(img.height);
    setCropRect({ x: 0, y: 0, w: img.width, h: img.height });
    setCropToolEnabled(true);
    setOversizePlan(null);
    setLargeGridMode(false);
    setLargeViewTilePage(0);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setImageMeta(`來源圖：${img.width} x ${img.height}`);
    setStatusText(`已載入圖片：${file.name}`);
  };

  const runConvert = async (options?: { overrideCols?: number; overrideRows?: number; allowOversize?: boolean; useLargeMode?: boolean }) => {
    if (!imageBitmap || !activeGroup) {
      setStatusText('請先確認圖片與色庫群組都已載入。');
      return;
    }
    setConvertProgress({ running: true, phase: '準備中', percent: 0 });

    try {
      const safeCols = clampInt(options?.overrideCols ?? cols, 1, MAX_GRID_SIZE);
      const safeRows = clampInt(options?.overrideRows ?? rows, 1, MAX_GRID_SIZE);

      let sourceBitmap = imageBitmap;
      const hasCrop =
        !!cropRect &&
        (cropRect.x !== 0 || cropRect.y !== 0 || cropRect.w !== imageBitmap.width || cropRect.h !== imageBitmap.height);
      if (hasCrop && cropRect) {
        sourceBitmap = await createImageBitmap(imageBitmap, cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      }

      const dims = adjustGridByMode(safeCols, safeRows, sourceBitmap.width, sourceBitmap.height, mode);
      const finalCols = Math.max(1, Math.min(dims.cols, sourceBitmap.width));
      const finalRows = Math.max(1, Math.min(dims.rows, sourceBitmap.height));
      const totalCells = finalCols * finalRows;
      if (!proMode && totalCells > GRID_SOFT_LIMIT && options?.allowOversize) {
        setStatusText(`一般版限制建議上限 ${GRID_SOFT_LIMIT.toLocaleString()} 格，請先縮放後再轉換。`);
        return;
      }
      if (!options?.allowOversize && totalCells > GRID_SOFT_LIMIT) {
        const scaled = fitGridWithinLimit(finalCols, finalRows, GRID_SOFT_LIMIT);
        setOversizePlan({
          cols: finalCols,
          rows: finalRows,
          total: totalCells,
          suggestCols: scaled.cols,
          suggestRows: scaled.rows,
          suggestTotal: scaled.cols * scaled.rows
        });
        setStatusText(`格數 ${totalCells.toLocaleString()} 超過建議上限 ${GRID_SOFT_LIMIT.toLocaleString()}。請選擇縮放或大圖模式。`);
        return;
      }
      setOversizePlan(null);

      setConvertProgress({ running: true, phase: '影像預處理', percent: 8 });
      const { processedCanvas, info } = buildProcessedCanvas(sourceBitmap, finalCols, finalRows, mode);

      const imgData = processedCanvas.getContext('2d')!.getImageData(0, 0, processedCanvas.width, processedCanvas.height);

      let cells: Cell[] = [];
      const total = finalRows * finalCols;
      let done = 0;
      setConvertProgress({ running: true, phase: '色彩辨識', percent: 10 });
      for (let y = 0; y < finalRows; y++) {
        for (let x = 0; x < finalCols; x++) {
          const rgb = extractCellMedianRgb(imgData, x, y, finalCols, finalRows);
          const mapped = mapColor(rgb, activeGroup.colors, 'lab_nearest');
          cells.push({ x, y, rgb, colorName: mapped.name, hex: mapped.hex });
          done += 1;
        }
        if (y % 10 === 0 || y === finalRows - 1) {
          const p = 10 + Math.round((done / Math.max(1, total)) * 80);
          setConvertProgress({ running: true, phase: '色彩辨識', percent: Math.min(90, p) });
          await waitNextFrame();
        }
      }

      let mergeInfo = '';
      if (preMergeDeltaE > 0) {
        setConvertProgress({ running: true, phase: '併色整理', percent: 94 });
        const merged = mergeMappedCellsByDeltaE(cells, activeGroup.colors, preMergeDeltaE);
        cells = merged.cells;
        if (merged.mergedColorKinds > 0 || merged.changedCells > 0) {
          mergeInfo = `；轉換前併色 ${merged.mergedColorKinds} 組、影響 ${merged.changedCells} 格`;
        }
      }

      setConvertProgress({ running: true, phase: '完成整理', percent: 100 });
      setConverted({
        cols: finalCols,
        rows: finalRows,
        mode,
        sourceW: sourceBitmap.width,
        sourceH: sourceBitmap.height,
        processInfo: info,
        cells
      });
      setCols(finalCols);
      setRows(finalRows);
      setGridMeta(`格線：${finalCols} x ${finalRows} (${mode})`);
      setUndoStack([]);
      setRedoStack([]);
      setHistoryItems([]);
      setLastPickedOldColor(null);
      setCropToolEnabled(false);
      setImageMeta(`來源圖：${sourceBitmap.width} x ${sourceBitmap.height}`);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
      const enableLarge = proMode && (!!options?.useLargeMode || totalCells > GRID_SOFT_LIMIT);
      setLargeGridMode(enableLarge);
      setLargeViewTilePage(0);
      setLargeOperationScope('tile');
      if (finalCols !== dims.cols || finalRows !== dims.rows) {
        setStatusText(`轉換完成；裁切後像素不足，格線自動調整為 ${finalCols}x${finalRows}${mergeInfo}。`);
      } else {
        setStatusText(`轉換完成，可直接修色與匯出${mergeInfo}。`);
      }
    } finally {
      setTimeout(() => setConvertProgress({ running: false, phase: '', percent: 0 }), 350);
    }
  };

  const onConvert = async () => {
    await runConvert();
  };

  const addHistory = (text: string) => {
    setHistoryItems((prev) => [text, ...prev].slice(0, 8));
  };

  const pushUndo = (changes: CellChange[], label: string) => {
    setUndoStack((prev) => [...prev, { changes, label }]);
    setRedoStack([]);
    addHistory(label);
  };

  const getCellIndexByPointer = (clientX: number, clientY: number) => {
    if (!converted) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const { ox, oy, cell, viewStartCol, viewStartRow, viewCols, viewRows } = renderMetaRef.current;
    const cx = Math.floor((x - ox) / cell);
    const cy = Math.floor((y - oy) / cell);
    if (cx < 0 || cy < 0 || cx >= viewCols || cy >= viewRows) return null;
    const gx = viewStartCol + cx;
    const gy = viewStartRow + cy;
    if (gx < 0 || gy < 0 || gx >= converted.cols || gy >= converted.rows) return null;
    return gy * converted.cols + gx;
  };

  const getPreviewPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !imageBitmap) return null;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (clientY - rect.top) * (canvas.height / rect.height);
    const meta = imagePreviewMetaRef.current;
    if (canvasX < meta.ox || canvasY < meta.oy || canvasX > meta.ox + meta.drawW || canvasY > meta.oy + meta.drawH) return null;
    const imageX = Math.min(imageBitmap.width - 1, Math.max(0, Math.floor((canvasX - meta.ox) / meta.scale)));
    const imageY = Math.min(imageBitmap.height - 1, Math.max(0, Math.floor((canvasY - meta.oy) / meta.scale)));
    return { canvasX, canvasY, imageX, imageY };
  };

  const getCropDragModeAt = (canvasX: number, canvasY: number): CropDragMode | null => {
    if (!cropRect) return null;
    const meta = imagePreviewMetaRef.current;
    const x = meta.ox + cropRect.x * meta.scale;
    const y = meta.oy + cropRect.y * meta.scale;
    const w = Math.max(1, cropRect.w * meta.scale);
    const h = Math.max(1, cropRect.h * meta.scale);
    const right = x + w;
    const bottom = y + h;
    const edgePad = 14;
    const near = (ax: number, ay: number) => Math.abs(canvasX - ax) <= edgePad && Math.abs(canvasY - ay) <= edgePad;
    if (near(x, y)) return 'nw';
    if (near(right, y)) return 'ne';
    if (near(x, bottom)) return 'sw';
    if (near(right, bottom)) return 'se';
    if (Math.abs(canvasX - x) <= edgePad && canvasY >= y && canvasY <= bottom) return 'w';
    if (Math.abs(canvasX - right) <= edgePad && canvasY >= y && canvasY <= bottom) return 'e';
    if (Math.abs(canvasY - y) <= edgePad && canvasX >= x && canvasX <= right) return 'n';
    if (Math.abs(canvasY - bottom) <= edgePad && canvasX >= x && canvasX <= right) return 's';
    if (canvasX >= x && canvasX <= right && canvasY >= y && canvasY <= bottom) return 'move';
    return null;
  };

  const cursorByCropMode = (mode: CropDragMode | null) => {
    if (!mode) return 'crosshair';
    if (mode === 'move') return 'move';
    if (mode === 'n' || mode === 's') return 'ns-resize';
    if (mode === 'e' || mode === 'w') return 'ew-resize';
    if (mode === 'nw' || mode === 'se') return 'nwse-resize';
    if (mode === 'ne' || mode === 'sw') return 'nesw-resize';
    return 'crosshair';
  };

  const normalizeCropRect = (left: number, top: number, right: number, bottom: number, bitmap: ImageBitmap): CropRect => {
    let l = Math.min(left, right);
    let r = Math.max(left, right);
    let t = Math.min(top, bottom);
    let b = Math.max(top, bottom);
    l = Math.max(0, Math.min(l, bitmap.width - 1));
    r = Math.max(0, Math.min(r, bitmap.width - 1));
    t = Math.max(0, Math.min(t, bitmap.height - 1));
    b = Math.max(0, Math.min(b, bitmap.height - 1));
    return { x: l, y: t, w: Math.max(1, r - l + 1), h: Math.max(1, b - t + 1) };
  };

  const getScopeBounds = () => {
    if (largeGridMode && largeOperationScope === 'tile' && selectedLargeTile) {
      return {
        startCol: selectedLargeTile.startCol,
        startRow: selectedLargeTile.startRow,
        endCol: selectedLargeTile.startCol + selectedLargeTile.colsPart - 1,
        endRow: selectedLargeTile.startRow + selectedLargeTile.rowsPart - 1
      };
    }
    return null;
  };

  const applyBrushByIndex = (idx: number) => {
    if (!converted) return;
    const isPaintToEmpty = editTool === 'paint' && editColorName === EMPTY_EDIT_COLOR_NAME;
    const chosen =
      editTool === 'paint' && activeGroup && editColorName && !isPaintToEmpty
        ? activeGroup.colors.find((c) => c.name === editColorName) ?? null
        : null;
    if (editTool === 'paint' && !isPaintToEmpty && !chosen) return;

    const centerX = idx % converted.cols;
    const centerY = Math.floor(idx / converted.cols);
    const half = Math.floor((brushSize - 1) / 2);
    const startX = centerX - half;
    const startY = centerY - half;
    const changes: CellChange[] = [];
    const nextCells = [...converted.cells];

    for (let by = 0; by < brushSize; by++) {
      for (let bx = 0; bx < brushSize; bx++) {
        const x = startX + bx;
        const y = startY + by;
        if (x < 0 || y < 0 || x >= converted.cols || y >= converted.rows) continue;
        const cellIdx = y * converted.cols + x;
        const prev = nextCells[cellIdx];
        if (!prev) continue;
        const before = { ...prev };
        const after =
          editTool === 'erase' || isPaintToEmpty
            ? { ...prev, colorName: '', hex: '#FFFFFF', isEmpty: true }
            : { ...prev, colorName: chosen!.name, hex: chosen!.hex, isEmpty: false };
        if (editTool === 'paint' && !isPaintToEmpty && !before.isEmpty && before.colorName === chosen!.name) continue;
        if ((editTool === 'erase' || isPaintToEmpty) && before.isEmpty) continue;
        nextCells[cellIdx] = after;
        changes.push({ idx: cellIdx, before, after });
      }
    }

    if (!changes.length) return;
    const firstBefore = changes[0].before;
    setLastPickedOldColor(editTool === 'paint' && !isPaintToEmpty && !firstBefore.isEmpty ? firstBefore.colorName : null);
    const toolLabel = editTool === 'erase' || isPaintToEmpty ? '橡皮擦' : '上色';
    pushUndo(changes, `${toolLabel} ${brushSize}x${brushSize}（${changes.length} 格）`);
    setConverted({ ...converted, cells: nextCells });
  };

  const applyBucketByIndex = (idx: number) => {
    if (!converted) return;
    if (!activeGroup || !editColorName) return;
    const isToEmpty = editColorName === EMPTY_EDIT_COLOR_NAME;
    const chosen = isToEmpty ? null : activeGroup.colors.find((c) => c.name === editColorName) ?? null;
    if (!isToEmpty && !chosen) return;

    const target = converted.cells[idx];
    if (!target) return;
    const targetIsEmpty = !!target.isEmpty;
    const targetName = target.colorName;
    if (!isToEmpty && !targetIsEmpty && targetName === chosen!.name) return;
    if (isToEmpty && targetIsEmpty) return;

    const matchesTarget = (cell: Cell) => {
      if (!!cell.isEmpty !== targetIsEmpty) return false;
      if (targetIsEmpty) return true;
      return cell.colorName === targetName;
    };
    const scope = getScopeBounds();
    const inScope = (i: number) => {
      if (!scope) return true;
      const x = i % converted.cols;
      const y = Math.floor(i / converted.cols);
      return x >= scope.startCol && x <= scope.endCol && y >= scope.startRow && y <= scope.endRow;
    };

    const targetIndices: number[] = [];
    if (bucketMode === 'global') {
      converted.cells.forEach((cell, i) => {
        if (!inScope(i)) return;
        if (matchesTarget(cell)) targetIndices.push(i);
      });
    } else {
      const seen = new Set<number>();
      const q: number[] = [idx];
      while (q.length) {
        const cur = q.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        if (!inScope(cur)) continue;
        const cell = converted.cells[cur];
        if (!cell || !matchesTarget(cell)) continue;
        targetIndices.push(cur);
        const x = cur % converted.cols;
        const y = Math.floor(cur / converted.cols);
        if (x > 0) q.push(cur - 1);
        if (x + 1 < converted.cols) q.push(cur + 1);
        if (y > 0) q.push(cur - converted.cols);
        if (y + 1 < converted.rows) q.push(cur + converted.cols);
      }
    }

    const changes: CellChange[] = [];
    const nextCells = [...converted.cells];
    for (const i of targetIndices) {
      const before = { ...nextCells[i] };
      const after = isToEmpty
        ? { ...before, colorName: '', hex: '#FFFFFF', isEmpty: true }
        : { ...before, colorName: chosen!.name, hex: chosen!.hex, isEmpty: false };
      if (before.colorName === after.colorName && before.isEmpty === after.isEmpty && before.hex === after.hex) continue;
      nextCells[i] = after;
      changes.push({ idx: i, before, after });
    }
    if (!changes.length) return;
    pushUndo(changes, `油漆桶-${bucketMode === 'global' ? '全圖同色' : '連通區'}（${changes.length} 格）`);
    setConverted({ ...converted, cells: nextCells });
  };

  const onCanvasClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (cropToolEnabled && imageBitmap) return;
    if (!converted) return;
    const idx = getCellIndexByPointer(ev.clientX, ev.clientY);
    if (idx == null) return;
    if (constructionMode) {
      if (editTool === 'pan') return;
      if (editTool !== 'picker') return;
      const cell = converted.cells[idx];
      if (!cell || cell.isEmpty) {
        clearConstructionFocus();
        return;
      }
      setFocusColorName(cell.colorName);
      const taskId = constructionCellTaskMap.get(idx);
      if (taskId) setConstructionCurrentTaskId(taskId);
      setStatusText(`施工模式：已將 ${cell.colorName} 設為焦點色。`);
      return;
    }
    if (editTool === 'pan') return;
    if (editTool === 'picker') {
      const cell = converted.cells[idx];
      if (!cell || cell.isEmpty) {
        setFocusColorName('');
        setStatusText('該格為空白，已清除焦點。');
        return;
      }
      setFocusColorName(cell.colorName);
      setStatusText(`已將 ${cell.colorName} 設為焦點色。`);
      return;
    }
    if (editTool === 'bucket') {
      applyBucketByIndex(idx);
      return;
    }
    applyBrushByIndex(idx);
  };

  const onCanvasMouseDown = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (cropToolEnabled && imageBitmap) {
      const p = getPreviewPointer(ev.clientX, ev.clientY);
      if (!p) return;
      const mode = getCropDragModeAt(p.canvasX, p.canvasY) ?? 'new';
      setCropHoverMode(mode);
      isCropDraggingRef.current = true;
      cropDragModeRef.current = mode;
      cropDragStartRef.current = { x: p.imageX, y: p.imageY };
      cropStartRectRef.current = cropRect ? { ...cropRect } : null;
      if (mode === 'new') {
        setCropRect({ x: p.imageX, y: p.imageY, w: 1, h: 1 });
      }
      return;
    }

    isPointerDownRef.current = true;
    lastDragCellIdxRef.current = null;
    if (editTool === 'pan') {
      panLastPointRef.current = { x: ev.clientX, y: ev.clientY };
      return;
    }
    if (constructionMode) return;
    if (editTool === 'bucket' || editTool === 'picker') return;
    if (editTool !== 'erase' && editTool !== 'paint') return;
    const idx = getCellIndexByPointer(ev.clientX, ev.clientY);
    if (idx == null) return;
    lastDragCellIdxRef.current = idx;
    applyBrushByIndex(idx);
  };

  const onCanvasMouseMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (cropToolEnabled && imageBitmap) {
      const p = getPreviewPointer(ev.clientX, ev.clientY);
      if (!p) {
        if (!isCropDraggingRef.current && cropHoverMode !== null) setCropHoverMode(null);
        return;
      }
      if (!isCropDraggingRef.current) {
        const hover = getCropDragModeAt(p.canvasX, p.canvasY);
        if (hover !== cropHoverMode) setCropHoverMode(hover);
        return;
      }
      const start = cropDragStartRef.current;
      if (!start) return;
      const mode = cropDragModeRef.current ?? 'new';
      if (mode === 'new') {
        const dx = p.imageX - start.x;
        const dy = p.imageY - start.y;
        let left = start.x;
        let top = start.y;
        let right = p.imageX;
        let bottom = p.imageY;
        if (ev.altKey) {
          left = start.x - dx;
          right = start.x + dx;
          top = start.y - dy;
          bottom = start.y + dy;
        }
        if (ev.shiftKey) {
          const half = ev.altKey ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.max(Math.abs(dx), Math.abs(dy));
          if (ev.altKey) {
            left = start.x - half;
            right = start.x + half;
            top = start.y - half;
            bottom = start.y + half;
          } else {
            right = start.x + Math.sign(dx || 1) * half;
            bottom = start.y + Math.sign(dy || 1) * half;
          }
        }
        setCropRect(normalizeCropRect(left, top, right, bottom, imageBitmap));
        return;
      }

      const base = cropStartRectRef.current ?? cropRect;
      if (!base) return;
      let left = base.x;
      let top = base.y;
      let right = base.x + base.w - 1;
      let bottom = base.y + base.h - 1;
      const dx = p.imageX - start.x;
      const dy = p.imageY - start.y;

      if (mode === 'move') {
        const maxX = imageBitmap.width - base.w;
        const maxY = imageBitmap.height - base.h;
        left = Math.min(maxX, Math.max(0, base.x + dx));
        top = Math.min(maxY, Math.max(0, base.y + dy));
        right = left + base.w - 1;
        bottom = top + base.h - 1;
      } else {
        if (ev.altKey) {
          const cx = base.x + (base.w - 1) / 2;
          const cy = base.y + (base.h - 1) / 2;
          if (mode.includes('w')) left = base.x + dx;
          if (mode.includes('e')) right = base.x + base.w - 1 + dx;
          if (mode.includes('n')) top = base.y + dy;
          if (mode.includes('s')) bottom = base.y + base.h - 1 + dy;
          const halfW = Math.max(Math.abs((mode.includes('w') ? cx - left : 0)), Math.abs((mode.includes('e') ? right - cx : 0)), (base.w - 1) / 2);
          const halfH = Math.max(Math.abs((mode.includes('n') ? cy - top : 0)), Math.abs((mode.includes('s') ? bottom - cy : 0)), (base.h - 1) / 2);
          if (mode.includes('w') || mode.includes('e')) {
            left = Math.round(cx - halfW);
            right = Math.round(cx + halfW);
          }
          if (mode.includes('n') || mode.includes('s')) {
            top = Math.round(cy - halfH);
            bottom = Math.round(cy + halfH);
          }
        } else {
          if (mode.includes('w')) left = base.x + dx;
          if (mode.includes('e')) right = base.x + base.w - 1 + dx;
          if (mode.includes('n')) top = base.y + dy;
          if (mode.includes('s')) bottom = base.y + base.h - 1 + dy;
        }

        if (ev.shiftKey) {
          const target = Math.max(0.1, base.w / Math.max(1, base.h));
          const curW = Math.max(1, right - left + 1);
          const curH = Math.max(1, bottom - top + 1);
          if (curW / curH > target) {
            const newW = Math.max(1, Math.round(curH * target));
            if (mode.includes('w') && !mode.includes('e')) left = right - newW + 1;
            else right = left + newW - 1;
          } else {
            const newH = Math.max(1, Math.round(curW / target));
            if (mode.includes('n') && !mode.includes('s')) top = bottom - newH + 1;
            else bottom = top + newH - 1;
          }
        }
      }

      setCropRect(normalizeCropRect(left, top, right, bottom, imageBitmap));
      return;
    }

    if (!isPointerDownRef.current) return;
    if (editTool === 'pan') {
      const last = panLastPointRef.current;
      if (!last) return;
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      if (dx !== 0 || dy !== 0) {
        setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      }
      panLastPointRef.current = { x: ev.clientX, y: ev.clientY };
      return;
    }
    if (constructionMode) return;
    if (editTool === 'bucket') return;
    if (editTool !== 'erase' && editTool !== 'paint') return;
    const idx = getCellIndexByPointer(ev.clientX, ev.clientY);
    if (idx == null) return;
    if (idx === lastDragCellIdxRef.current) return;
    lastDragCellIdxRef.current = idx;
    applyBrushByIndex(idx);
  };

  const onCanvasMouseLeave = () => {
    if (cropToolEnabled && imageBitmap) {
      isCropDraggingRef.current = false;
      cropDragStartRef.current = null;
      cropDragModeRef.current = null;
      cropStartRectRef.current = null;
      setCropHoverMode(null);
      return;
    }
    if (editTool === 'erase' || editTool === 'paint') lastDragCellIdxRef.current = null;
    if (editTool === 'pan') panLastPointRef.current = null;
  };

  const onCanvasMouseUp = () => {
    if (cropToolEnabled && imageBitmap) {
      isCropDraggingRef.current = false;
      cropDragStartRef.current = null;
      cropDragModeRef.current = null;
      cropStartRectRef.current = null;
      return;
    }
    isPointerDownRef.current = false;
    panLastPointRef.current = null;
    lastDragCellIdxRef.current = null;
  };

  const replaceAllSameColor = () => {
    if (!converted || !editColorName) return;
    const isPaintToEmpty = editColorName === EMPTY_EDIT_COLOR_NAME;
    const chosen = isPaintToEmpty
      ? null
      : activeGroup?.colors.find((c) => c.name === editColorName) ?? null;
    if (!isPaintToEmpty && !chosen) return;
    if (!focusColorName) {
      setStatusText('請先選擇焦點色號，再執行全替換。');
      return;
    }
    if (!isPaintToEmpty && focusColorName === chosen!.name) {
      setStatusText('焦點色與替換色相同，無需替換。');
      return;
    }
    const scope = getScopeBounds();

    const changes: CellChange[] = [];
    const nextCells = converted.cells.map((cell, idx) => {
      if (scope) {
        const x = idx % converted.cols;
        const y = Math.floor(idx / converted.cols);
        if (x < scope.startCol || x > scope.endCol || y < scope.startRow || y > scope.endRow) return cell;
      }
      if (cell.isEmpty || cell.colorName !== focusColorName) return cell;
      const before = { ...cell };
      const after = isPaintToEmpty
        ? { ...cell, colorName: '', hex: '#FFFFFF', isEmpty: true }
        : { ...cell, colorName: chosen!.name, hex: chosen!.hex, isEmpty: false };
      changes.push({ idx, before, after });
      return after;
    });

    if (!changes.length) {
      setStatusText('找不到可替換的舊色。');
      return;
    }

    pushUndo(changes, `焦點色全替換（${changes.length} 格）`);
    setConverted({ ...converted, cells: nextCells });
    const scopeText = largeGridMode && largeOperationScope === 'tile' && selectedLargeTile ? '（當前分塊）' : '（全圖）';
    setStatusText(
      isPaintToEmpty
        ? `已將焦點色 ${focusColorName} 全部清空${scopeText}。`
        : `已將焦點色 ${focusColorName} 全部替換為 ${chosen!.name}${scopeText}。`
    );
  };

  const addOneCellOutline = () => {
    if (!converted || !activeGroup || !editColorName) return;
    if (editColorName === EMPTY_EDIT_COLOR_NAME) {
      setStatusText('外框需選擇一個實際色號。');
      return;
    }
    const chosen = activeGroup.colors.find((c) => c.name === editColorName) ?? null;
    if (!chosen) {
      setStatusText('找不到外框色號。');
      return;
    }
    const scope = getScopeBounds();
    const sourceCells = converted.cells;
    const inScope = (idx: number) => {
      if (!scope) return true;
      const x = idx % converted.cols;
      const y = Math.floor(idx / converted.cols);
      return x >= scope.startCol && x <= scope.endCol && y >= scope.startRow && y <= scope.endRow;
    };
    const deltas = [-1, 0, 1];
    const changes: CellChange[] = [];
    const nextCells = [...converted.cells];

    for (let y = 0; y < converted.rows; y++) {
      for (let x = 0; x < converted.cols; x++) {
        const idx = y * converted.cols + x;
        if (!inScope(idx)) continue;
        const cell = sourceCells[idx];
        if (!cell || !cell.isEmpty) continue;
        let shouldOutline = false;
        for (const dy of deltas) {
          for (const dx of deltas) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= converted.cols || ny >= converted.rows) continue;
            const nIdx = ny * converted.cols + nx;
            if (!inScope(nIdx)) continue;
            const n = sourceCells[nIdx];
            if (n && !n.isEmpty) {
              shouldOutline = true;
              break;
            }
          }
          if (shouldOutline) break;
        }
        if (!shouldOutline) continue;
        const before = { ...cell };
        const after = { ...cell, colorName: chosen.name, hex: chosen.hex, isEmpty: false };
        nextCells[idx] = after;
        changes.push({ idx, before, after });
      }
    }

    if (!changes.length) {
      setStatusText('沒有可新增外框的位置。');
      return;
    }

    pushUndo(changes, `外框1格（${changes.length} 格）`);
    setConverted({ ...converted, cells: nextCells });
    const scopeText = largeGridMode && largeOperationScope === 'tile' && selectedLargeTile ? '（當前分塊）' : '（全圖）';
    setStatusText(`已新增 1 格外框，共 ${changes.length} 格，色號 ${chosen.name}${scopeText}。`);
  };

  const toggleConstructionDone = (taskId: string, done?: boolean) => {
    setConstructionDoneMap((prev) => ({ ...prev, [taskId]: done ?? !prev[taskId] }));
  };

  const setFocusFromTask = (taskId: string) => {
    const task = constructionTasks.find((t) => t.id === taskId);
    if (!task) return;
    if (constructionCurrentTaskId === task.id) {
      clearConstructionFocus();
      return;
    }
    setConstructionCurrentTaskId(task.id);
    if (constructionStrategy === 'color') {
      setFocusColorName(task.title);
      return;
    }
    const firstIdx = task.cellIndices.find((idx) => {
      const c = converted?.cells[idx];
      return !!c && !c.isEmpty;
    });
    if (firstIdx == null || !converted) return;
    const cell = converted.cells[firstIdx];
    if (!cell || cell.isEmpty) return;
    setFocusColorName(cell.colorName);
  };

  const clearConstructionFocus = () => {
    setFocusColorName('');
    setConstructionCurrentTaskId('');
    setStatusText('施工模式：已清除焦點與任務選取。');
  };

  const reorderConstructionTask = (fromId: string, toId: string) => {
    if (!proMode || !constructionTasks.length || fromId === toId) return;
    setConstructionOrderRule('manual');
    const ids = constructionTasks.map((t) => t.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moving] = next.splice(from, 1);
    next.splice(to, 0, moving);
    setConstructionCustomOrder(next);
  };

  const saveConstructionTemplate = () => {
    if (!proMode || !constructionTasks.length) return;
    const name = constructionTemplateName.trim() || `模板 ${constructionTemplates.length + 1}`;
    const baseRule: Exclude<ConstructionOrderRule, 'manual'> =
      constructionOrderRule === 'manual' ? 'count_desc' : constructionOrderRule;
    let payload: ConstructionTemplate = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      strategy: constructionStrategy,
      rule: baseRule
    };
    if (constructionOrderRule === 'manual') {
      if (constructionStrategy !== 'color') {
        setStatusText('手動拖曳僅在「顏色優先」時可自動辨識跨作品模板。');
        return;
      }
      payload = {
        ...payload,
        rule: 'count_desc',
        colorPriority: constructionTasks.map((t) => t.title),
        inferredFromManual: true
      };
    }
    setConstructionTemplates((prev) => [...prev, payload]);
    setConstructionTemplateId(payload.id);
    setStatusText(
      payload.inferredFromManual
        ? `已儲存施工模板：${name}（已自動辨識手動拖曳色序）`
        : `已儲存施工模板：${name}`
    );
  };

  const applyInferredConstructionRule = () => {
    if (!constructionRuleInference) return;
    setConstructionOrderRule(constructionRuleInference.bestRule);
    setConstructionCustomOrder([]);
    setStatusText(
      `已套用最接近規則：${formatConstructionRuleLabel(constructionRuleInference.bestRule)}（相似度 ${(constructionRuleInference.bestScore * 100).toFixed(1)}%）`
    );
  };

  const applyConstructionTemplate = () => {
    if (!proMode || !constructionTemplateId) return;
    const tpl = constructionTemplates.find((t) => t.id === constructionTemplateId);
    if (!tpl) return;
    setConstructionStrategy(tpl.strategy);
    if (tpl.strategy === 'color' && tpl.colorPriority?.length && converted) {
      const tasks = buildConstructionTasks(converted, 'color');
      const orderedIds = orderTaskIdsByColorPriority(tasks, tpl.colorPriority);
      setConstructionOrderRule('manual');
      setConstructionCustomOrder(orderedIds);
    } else {
      setConstructionOrderRule(tpl.rule);
      setConstructionCustomOrder([]);
    }
    setStatusText(`已套用施工模板：${tpl.name}`);
  };

  const deleteConstructionTemplate = () => {
    if (!proMode || !constructionTemplateId) return;
    const tpl = constructionTemplates.find((t) => t.id === constructionTemplateId);
    setConstructionTemplates((prev) => prev.filter((t) => t.id !== constructionTemplateId));
    setConstructionTemplateId('');
    setStatusText(`已刪除施工模板${tpl ? `：${tpl.name}` : ''}`);
  };

  const undo = () => {
    if (!undoStack.length || !converted) return;
    const batch = undoStack[undoStack.length - 1];
    const changes = batch.changes;
    const nextCells = [...converted.cells];
    for (const ch of changes) nextCells[ch.idx] = { ...ch.before };
    setConverted({ ...converted, cells: nextCells });
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, batch]);
    addHistory(`Undo：${batch.label}`);
  };

  const redo = () => {
    if (!redoStack.length || !converted) return;
    const batch = redoStack[redoStack.length - 1];
    const changes = batch.changes;
    const nextCells = [...converted.cells];
    for (const ch of changes) nextCells[ch.idx] = { ...ch.after };
    setConverted({ ...converted, cells: nextCells });
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, batch]);
    addHistory(`Redo：${batch.label}`);
  };

  const rollbackToStep = (remainingUndoCount: number) => {
    if (!converted) return;
    if (remainingUndoCount < 0) remainingUndoCount = 0;
    if (remainingUndoCount >= undoStack.length) return;
    const steps = undoStack.length - remainingUndoCount;
    let nextCells = [...converted.cells];
    const nextUndo = [...undoStack];
    const movedToRedo: ChangeBatch[] = [];
    for (let i = 0; i < steps; i++) {
      const batch = nextUndo.pop();
      if (!batch) break;
      for (const ch of batch.changes) nextCells[ch.idx] = { ...ch.before };
      movedToRedo.push(batch);
    }
    setConverted({ ...converted, cells: nextCells });
    setUndoStack(nextUndo);
    setRedoStack((prev) => [...prev, ...movedToRedo]);
    addHistory(`回溯 ${steps} 步`);
  };

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && isCanvasFullscreen) {
        ev.preventDefault();
        setIsCanvasFullscreen(false);
        return;
      }
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = !!target && (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable);
      if (isTyping) return;

      if (matchesShortcutSet(ev, effectiveShortcutConfig.undo)) {
        ev.preventDefault();
        undo();
        return;
      }
      if (matchesShortcutSet(ev, effectiveShortcutConfig.redo)) {
        ev.preventDefault();
        redo();
        return;
      }
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toolPan)) {
        ev.preventDefault();
        setEditTool('pan');
      }
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toolPaint)) setEditTool('paint');
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toolErase)) setEditTool('erase');
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toolBucket)) setEditTool('bucket');
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toolPicker)) setEditTool('picker');
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toggleCode)) setShowCode((v) => !v);
      if (matchesShortcutSet(ev, effectiveShortcutConfig.brushDown)) setBrushSize((v) => Math.max(1, v - 1));
      if (matchesShortcutSet(ev, effectiveShortcutConfig.brushUp)) setBrushSize((v) => Math.min(100, v + 1));
      if (matchesShortcutSet(ev, effectiveShortcutConfig.zoomIn)) {
        ev.preventDefault();
        setZoom((v) => Math.min(8, Number((v + 0.1).toFixed(2))));
      }
      if (matchesShortcutSet(ev, effectiveShortcutConfig.zoomOut)) {
        ev.preventDefault();
        setZoom((v) => Math.max(0.25, Number((v - 0.1).toFixed(2))));
      }
      if (matchesShortcutSet(ev, effectiveShortcutConfig.zoomReset)) {
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
      }
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toggleCanvasFullscreen)) {
        ev.preventDefault();
        setIsCanvasFullscreen((v) => !v);
      }
      if (proMode && largeGridMode && pdfPagination && pdfPagination.totalTiles > 1) {
        if (matchesShortcutSet(ev, effectiveShortcutConfig.tilePrev)) {
          ev.preventDefault();
          setLargeViewTilePage((cur) => {
            const curPage = cur > 0 ? cur : 1;
            return Math.max(1, curPage - 1);
          });
          return;
        }
        if (matchesShortcutSet(ev, effectiveShortcutConfig.tileNext)) {
          ev.preventDefault();
          setLargeViewTilePage((cur) => {
            const curPage = cur > 0 ? cur : 0;
            return Math.min(pdfPagination.totalTiles, curPage + 1);
          });
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [effectiveShortcutConfig, isCanvasFullscreen, largeGridMode, pdfPagination, proMode, redo, undo]);

  const getExportPreflight = useCallback(
    (kind: 'csv' | 'pdf') => {
      const checks: Array<{ ok: boolean; label: string; detail: string }> = [];
      checks.push({
        ok: !!converted,
        label: '轉換資料',
        detail: converted ? '已完成轉換。' : '尚未轉換圖片，請先點「開始轉換」。'
      });
      checks.push({
        ok: !!converted && converted.cols > 0 && converted.rows > 0 && converted.cells.length > 0,
        label: '格線資料',
        detail: converted ? `目前 ${converted.cols}x${converted.rows}，格子數 ${converted.cells.length}` : '無資料'
      });
      checks.push({
        ok: statsRows.length > 0,
        label: '色號統計',
        detail: statsRows.length ? `共 ${statsRows.length} 色號` : '沒有可匯出的色號統計資料。'
      });
      if (kind === 'pdf' && converted) {
        const expected = converted.cols * converted.rows;
        checks.push({
          ok: converted.cells.length === expected,
          label: 'PDF 頁面資料一致性',
          detail: `${converted.cells.length}/${expected}`
        });
      }
      checks.push({
        ok: kind !== 'pdf' || !isPdfBusy,
        label: '匯出狀態',
        detail: kind === 'pdf' && isPdfBusy ? 'PDF 仍在處理中。' : '可開始匯出。'
      });
      return checks;
    },
    [converted, isPdfBusy, statsRows.length]
  );

  useEffect(() => {
    setPreflightCsv(getExportPreflight('csv'));
    setPreflightPdf(getExportPreflight('pdf'));
  }, [getExportPreflight]);

  const runExportPreflight = (kind: 'csv' | 'pdf') => {
    const checks = getExportPreflight(kind);
    const failed = checks.find((c) => !c.ok);
    return failed ? `${failed.label}：${failed.detail}` : null;
  };

  const exportCsv = () => {
    const preflight = runExportPreflight('csv');
    if (preflight) {
      setStatusText(`匯出前檢查失敗：${preflight}`);
      return;
    }
    const lines = ['color_name,count'];
    statsRows.forEach((r) => {
      lines.push([csvSafe(r.name), r.count].join(','));
    });
    downloadBlob(`${safeFileName(projectName)}-materials.csv`, `\uFEFF${lines.join('\n')}`, 'text/csv;charset=utf-8');
    setStatusText('CSV 匯出完成。');
  };

  const exportPdfLike = async () => {
    const preflight = runExportPreflight('pdf');
    if (preflight) {
      setStatusText(`匯出前檢查失敗：${preflight}`);
      return;
    }

    try {
      setIsPdfBusy(true);
      const { PDFDocument, StandardFonts, rgb } = await getPdfRuntime();
      const beadMm = PDF_BEAD_MM;
      const pdfDoc = await PDFDocument.create();
      pdfDoc.setCreator('PixChi');
      pdfDoc.setProducer('PixChi');
      pdfDoc.setTitle(projectName || 'PixChi Pattern');
      const exportPayload = buildPdfPayload({
        projectName,
        activeGroupName: activeGroup?.name ?? '',
        mode,
        strategy,
        showCode,
        converted
      });
      pdfDoc.setSubject(`${PIXCHI_META_PREFIX}${toBase64Utf8(JSON.stringify(exportPayload))}`);

      const pageW = mmToPt(210);
      const pageH = mmToPt(297);
      const margin = mmToPt(8);
      const gap = mmToPt(4);
      const sideTableWidth = mmToPt(44);
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;

      const latin = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const latinBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const cjk = await loadPdfCjkFont(pdfDoc);
      const font = latin;
      const bold = latinBold;
      const titleSize = 14;
      const subSize = 10;
      const headerH = 30;
      const drawHeader = (page: any, subtitle: string) => {
        drawPdfTextPreferCjk(page, projectName || '未命名專案', margin, pageH - margin - 14, titleSize, latinBold, cjk, {
          color: rgb(0.11, 0.16, 0.14)
        });
        drawPdfTextPreferCjk(page, subtitle, margin, pageH - margin - 30, subSize, latin, cjk, {
          color: rgb(0.2, 0.3, 0.26)
        });
      };

      const drawSideStats = (page: any, tx: number, contentTop: number) => {
        let ty = contentTop - 14;
        const colorColW = sideTableWidth * 0.62;
        const countColW = sideTableWidth - colorColW;
        const centerColor = tx + colorColW / 2;
        const centerCount = tx + colorColW + countColW / 2;
        page.drawRectangle({ x: tx, y: ty - 6, width: sideTableWidth, height: 18, borderWidth: 1, borderColor: rgb(0.8, 0.86, 0.83), color: rgb(0.93, 0.96, 0.94) });
        page.drawLine({ start: { x: tx + colorColW, y: ty - 6 }, end: { x: tx + colorColW, y: ty + 12 }, thickness: 1, color: rgb(0.8, 0.86, 0.83) });
        const h1 = 'Color';
        const h2 = 'Count';
        page.drawText(h1, { x: centerColor - bold.widthOfTextAtSize(h1, 10) / 2, y: ty, size: 10, font: bold });
        page.drawText(h2, { x: centerCount - bold.widthOfTextAtSize(h2, 10) / 2, y: ty, size: 10, font: bold });
        ty -= 22;
        for (const r of statsRows) {
          if (ty < margin + 10) break;
          page.drawRectangle({ x: tx, y: ty - 6, width: sideTableWidth, height: 18, borderWidth: 1, borderColor: rgb(0.88, 0.92, 0.9) });
          page.drawLine({ start: { x: tx + colorColW, y: ty - 6 }, end: { x: tx + colorColW, y: ty + 12 }, thickness: 1, color: rgb(0.88, 0.92, 0.9) });
          const nameW = measurePdfTextMixed(r.name, 10, latin, cjk);
          const beadGap = 11;
          const totalW = beadGap + nameW;
          const startX = centerColor - totalW / 2;
          drawPdfBead(page, startX + 4.5, ty + 2, r.hex, rgb);
          drawPdfTextMixed(page, r.name, startX + beadGap, ty, 10, latin, cjk);
          const countText = String(r.count);
          page.drawText(countText, { x: centerCount - font.widthOfTextAtSize(countText, 10) / 2, y: ty, size: 10, font });
          ty -= 18;
        }
      };

      const patternWidthMm = converted.cols * beadMm;
      const patternHeightMm = converted.rows * beadMm;
      const contentTop = pageH - margin - headerH - 8;
      const maxPatternHPt = usableH - headerH - 8;
      const patternWPt = mmToPt(patternWidthMm);
      const patternHPt = mmToPt(patternHeightMm);
      const hasRightSpace = patternWPt + gap + sideTableWidth <= usableW;
      const fitsSinglePage = patternWPt <= usableW && patternHPt <= maxPatternHPt;

      if (fitsSinglePage) {
        const page = pdfDoc.addPage([pageW, pageH]);
        drawHeader(page, `群組：${activeGroup?.name ?? ''} | 格線：${converted.cols}x${converted.rows}`);
        const fullCanvas = buildExportGridCanvas(converted, showCode, beadMm, {
          exportScale,
          showRuler: proMode && showRuler,
          showGuide: proMode && showGuide,
          guideEvery
        });
        const img = await pdfDoc.embedPng(dataUrlToBytes(fullCanvas.toDataURL('image/png')));
        const patternY = contentTop - patternHPt;
        page.drawImage(img, { x: margin, y: patternY, width: patternWPt, height: patternHPt });
        if (hasRightSpace) {
          drawSideStats(page, margin + patternWPt + gap, contentTop);
        } else {
          const startY = patternY - 12;
          const colW = mmToPt(38);
          const rowH = 16;
          const colsPerRow = Math.max(1, Math.floor(usableW / colW));
          statsRows.forEach((r, idx) => {
            const col = idx % colsPerRow;
            const row = Math.floor(idx / colsPerRow);
            const x = margin + col * colW;
            const y = startY - row * rowH;
            if (y < margin + 8) return;
            page.drawRectangle({ x, y: y - 6, width: colW - 2, height: 14, borderWidth: 1, borderColor: rgb(0.83, 0.88, 0.86) });
            drawPdfBead(page, x + 6, y + 1, r.hex, rgb);
            drawPdfTextMixed(page, r.name, x + 14, y, 9, latin, cjk);
            page.drawText(String(r.count), { x: x + colW - 20, y, size: 9, font: bold });
          });
        }
      } else {
        const tileCols = Math.max(1, Math.floor(ptToMm(usableW) / beadMm));
        const tileRows = Math.max(1, Math.floor(ptToMm(maxPatternHPt) / beadMm));
        const xPages = Math.ceil(converted.cols / tileCols);
        const yPages = Math.ceil(converted.rows / tileRows);
        const totalTiles = xPages * yPages;
        const from = proMode ? clampInt(Math.min(pdfPageFrom, pdfPageTo), 1, totalTiles) : 1;
        const to = proMode ? clampInt(Math.max(pdfPageFrom, pdfPageTo), 1, totalTiles) : totalTiles;
        const exportTiles: PdfTileInfo[] = [];
        let absolutePage = 1;
        for (let py = 0; py < yPages; py++) {
          for (let px = 0; px < xPages; px++) {
            const startCol = px * tileCols;
            const startRow = py * tileRows;
            const colsPart = Math.min(tileCols, converted.cols - startCol);
            const rowsPart = Math.min(tileRows, converted.rows - startRow);
            if (absolutePage >= from && absolutePage <= to) {
              exportTiles.push({ pageNo: absolutePage, px, py, startCol, startRow, colsPart, rowsPart });
            }
            absolutePage += 1;
          }
        }

        // Summary page with stats
        const summary = pdfDoc.addPage([pageW, pageH]);
        drawHeader(
          summary,
          `群組：${activeGroup?.name ?? ''} | 格線：${converted.cols}x${converted.rows} | 自動分頁 ${xPages}x${yPages} | 匯出頁 ${from}-${to}/${totalTiles}`
        );
        drawSideStats(summary, margin, pageH - margin - headerH - 8);

        for (const tile of exportTiles) {
          const slice = sliceConverted(converted, tile.startCol, tile.startRow, tile.colsPart, tile.rowsPart);
          const tileCanvas = buildExportGridCanvas(slice, showCode, beadMm, {
            exportScale,
            showRuler: proMode && showRuler,
            showGuide: proMode && showGuide,
            guideEvery
          });
          const tileImg = await pdfDoc.embedPng(dataUrlToBytes(tileCanvas.toDataURL('image/png')));
          const page = pdfDoc.addPage([pageW, pageH]);
          const partText = `分頁 ${tile.pageNo}/${totalTiles} | X:${tile.startCol + 1}-${tile.startCol + tile.colsPart}  Y:${tile.startRow + 1}-${tile.startRow + tile.rowsPart}`;
          drawHeader(page, partText);
          const drawW = mmToPt(tile.colsPart * beadMm);
          const drawH = mmToPt(tile.rowsPart * beadMm);
          const y = contentTop - drawH;
          page.drawImage(tileImg, { x: margin, y, width: drawW, height: drawH });
        }
      }

      const pdfBytes = await pdfDoc.save();
      downloadBytes(`${safeFileName(projectName)}-pattern.pdf`, pdfBytes, 'application/pdf');
      setStatusText('PDF 匯出完成。');
    } catch (err) {
      setStatusText(`PDF 匯出失敗：${(err as Error).message}`);
    } finally {
      setIsPdfBusy(false);
    }
  };

  const importPdfRestore = async (file: File | null) => {
    if (!file) return;
    if (!proMode) {
      setStatusText('此功能僅 Pro 模式可用。');
      return;
    }
    try {
      setIsPdfBusy(true);
      const { PDFDocument } = await getPdfRuntime();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfDoc = await PDFDocument.load(bytes);
      const subject = pdfDoc.getSubject() ?? '';
      if (!subject.startsWith(PIXCHI_META_PREFIX)) {
        setStatusText('此 PDF 沒有可還原的 PixChi 專案資料。');
        return;
      }
      const encoded = subject.slice(PIXCHI_META_PREFIX.length);
      const json = fromBase64Utf8(encoded);
      const data = JSON.parse(json) as {
        projectName: string;
        activeGroupName: string;
        mode: LayoutMode;
        strategy: MatchStrategy;
        showCode: boolean;
        converted: {
          cols: number;
          rows: number;
          mode: LayoutMode;
          sourceW: number;
          sourceH: number;
          processInfo: string;
          palette: Array<{ name: string; hex: string }>;
          refs: number[];
        };
      };

      const cells = data.converted.refs.map((ref, idx) => {
        const x = idx % data.converted.cols;
        const y = Math.floor(idx / data.converted.cols);
        if (ref < 0) {
          return { x, y, rgb: [255, 255, 255] as [number, number, number], colorName: '', hex: '#FFFFFF', isEmpty: true };
        }
        const p = data.converted.palette[ref] ?? { name: '', hex: '#FFFFFF' };
        return { x, y, rgb: hexToRgb(p.hex), colorName: p.name, hex: p.hex, isEmpty: false };
      });

      const restoredConverted: Converted = {
        cols: data.converted.cols,
        rows: data.converted.rows,
        mode: data.converted.mode,
        sourceW: data.converted.sourceW,
        sourceH: data.converted.sourceH,
        processInfo: data.converted.processInfo,
        cells
      };

      setProjectName(data.projectName || '未命名專案');
      setActiveGroupName(data.activeGroupName || '');
      setMode(data.mode || 'fit');
      setShowCode(data.showCode ?? true);
      setConverted(restoredConverted);
      setCols(restoredConverted.cols);
      setRows(restoredConverted.rows);
      setGridMeta(`格線：${restoredConverted.cols} x ${restoredConverted.rows} (${restoredConverted.mode})`);
      setImageMeta(`PDF 還原：${restoredConverted.sourceW} x ${restoredConverted.sourceH}`);
      setFocusColorName('');
      setUndoStack([]);
      setRedoStack([]);
      setHistoryItems([]);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
      setStatusText('已從 PDF 還原畫布。');
    } catch (err) {
      setStatusText(`PDF 匯入失敗：${(err as Error).message}`);
    } finally {
      setIsPdfBusy(false);
      if (pdfImportRef.current) pdfImportRef.current.value = '';
    }
  };

  const resetAll = () => {
    setImageBitmap(null);
    setImageDataUrl(null);
    setCropRect(null);
    setConverted(null);
    setImageMeta('-');
    setGridMeta('-');
    setFocusColorName('');
    setFocusColorSearch('');
    setFocusColorMenuOpen(false);
    setEditColorMenuOpen(false);
    setUndoStack([]);
    setRedoStack([]);
    setHistoryItems([]);
    setLastPickedOldColor(null);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setOversizePlan(null);
    setLargeGridMode(false);
    setLargeViewTilePage(0);
    setStatusText('已清空結果。');
  };

  const updateShortcutByText = (key: keyof typeof SHORTCUTS, input: string) => {
    const values = input
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    setShortcutConfig((prev) => ({ ...prev, [key]: values.length ? values : [...SHORTCUTS[key]] }));
  };

  const resetShortcutDefaults = () => {
    setShortcutConfig(buildDefaultShortcutConfig());
  };

  const navigatePage = (next: 'main' | 'palette') => {
    setPage(next);
    if (typeof window !== 'undefined') {
      window.location.hash = next === 'palette' ? '#/palette' : '#/';
    }
  };

  const createCustomGroup = (source?: PaletteGroup | null) => {
    const baseName = source ? `${source.name}-自訂` : '新自訂色庫';
    const nextNameBase = (paletteNewGroupName || baseName).trim();
    if (!nextNameBase) return;
    const existingNames = new Set(groups.map((g) => g.name));
    let nextName = nextNameBase;
    let seq = 2;
    while (existingNames.has(nextName)) {
      nextName = `${nextNameBase}-${seq}`;
      seq += 1;
    }
    const nextGroup: CustomPaletteGroup = {
      id: makeCustomPaletteId(),
      name: nextName,
      colors: (source?.colors ?? []).map((c) => ({ name: c.name, hex: c.hex.toUpperCase() }))
    };
    setCustomPaletteGroups((prev) => [...prev, nextGroup]);
    setPaletteEditGroupId(nextGroup.id);
    setPaletteNewGroupName(nextName);
    setPaletteTab('custom');
    setStatusText(`已建立自訂群組：${nextName}`);
  };

  const updateCustomGroupName = () => {
    if (!editablePaletteGroup) return;
    const next = paletteNewGroupName.trim();
    if (!next) {
      setStatusText('群組名稱不可為空。');
      return;
    }
    if (groups.some((g) => g.name === next && g.id !== editablePaletteGroup.id)) {
      setStatusText('群組名稱重複，請更換。');
      return;
    }
    setCustomPaletteGroups((prev) => prev.map((g) => (g.id === editablePaletteGroup.id ? { ...g, name: next } : g)));
    setStatusText('自訂群組名稱已更新。');
  };

  const deleteCustomGroup = () => {
    if (!editablePaletteGroup) return;
    setCustomPaletteGroups((prev) => prev.filter((g) => g.id !== editablePaletteGroup.id));
    if (activeGroupName === editablePaletteGroup.name) setActiveGroupName('');
    setPaletteEditGroupId('');
    setStatusText('已刪除自訂群組。');
  };

  const addColorToCustomGroup = () => {
    if (!editablePaletteGroup) return;
    const name = paletteNewColorName.trim();
    const hex = normalizeColorHex(paletteNewColorHex);
    if (!name) {
      setStatusText('請輸入色號名稱。');
      return;
    }
    if (!/^#[0-9A-F]{6}$/.test(hex)) {
      setStatusText('色彩格式錯誤。');
      return;
    }
    if (editablePaletteGroup.colors.some((c) => c.name === name)) {
      setStatusText('色號名稱重複。');
      return;
    }
    setCustomPaletteGroups((prev) =>
      prev.map((g) => (g.id === editablePaletteGroup.id ? { ...g, colors: [...g.colors, { name, hex }] } : g))
    );
    setPaletteNewColorName('');
    setPaletteNewColorHex('#ffffff');
    setStatusText(`已新增色號 ${name}。`);
  };

  const updateColorInCustomGroup = (colorIndex: number, next: Partial<CustomPaletteColor>) => {
    if (!editablePaletteGroup) return;
    setCustomPaletteGroups((prev) =>
      prev.map((g) => {
        if (g.id !== editablePaletteGroup.id) return g;
        const colors = [...g.colors];
        const cur = colors[colorIndex];
        if (!cur) return g;
        colors[colorIndex] = {
          name: next.name != null ? next.name : cur.name,
          hex: next.hex != null ? normalizeColorHex(next.hex) : cur.hex
        };
        return { ...g, colors };
      })
    );
  };

  const removeColorFromCustomGroup = (colorIndex: number) => {
    if (!editablePaletteGroup) return;
    setCustomPaletteGroups((prev) =>
      prev.map((g) => (g.id === editablePaletteGroup.id ? { ...g, colors: g.colors.filter((_, i) => i !== colorIndex) } : g))
    );
  };

  const applyCustomEditHex = () => {
    if (customEditColorIndex == null) return;
    const hex = normalizeColorHex(customEditColorHex);
    updateColorInCustomGroup(customEditColorIndex, { hex });
    setCustomEditColorHex(hex.toLowerCase());
  };

  const setCustomEditRgbChannel = (channel: 0 | 1 | 2, value: string) => {
    const v = clampByte(Number(value));
    const next: [number, number, number] = [...customEditRgb] as [number, number, number];
    next[channel] = v;
    setCustomEditColorHex(rgbToHex(next[0], next[1], next[2]).toLowerCase());
  };

  const exportCustomPaletteJson = () => {
    if (!proMode) return;
    const payload = {
      version: 1,
      groups: customPaletteGroups
    };
    downloadBlob('pixchi-custom-palette.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    setStatusText('自訂色庫已匯出。');
  };

  const importCustomPaletteJson = async (file: File | null) => {
    if (!proMode || !file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { groups?: Array<{ id?: string; name?: string; colors?: Array<{ name?: string; hex?: string }> }> };
      const next: CustomPaletteGroup[] = [];
      for (const g of parsed.groups ?? []) {
        const name = String(g.name ?? '').trim();
        if (!name) continue;
        const colors: CustomPaletteColor[] = [];
        for (const c of g.colors ?? []) {
          const cn = String(c.name ?? '').trim();
          const ch = String(c.hex ?? '').trim().toUpperCase();
          if (!cn || !/^#[0-9A-F]{6}$/.test(ch)) continue;
          colors.push({ name: cn, hex: ch });
        }
        next.push({
          id: String(g.id ?? '').trim() || makeCustomPaletteId(),
          name,
          colors
        });
      }
      setCustomPaletteGroups(next);
      setPaletteEditGroupId(next[0]?.id ?? '');
      setStatusText('已匯入自訂色庫。');
    } catch (err) {
      setStatusText(`自訂色庫匯入失敗：${(err as Error).message}`);
    }
  };

  const canvasCursor = cropToolEnabled && imageBitmap
    ? cursorByCropMode(isCropDraggingRef.current ? cropDragModeRef.current : cropHoverMode)
    : undefined;

  return (
    <>
      <header className="topbar">
        <div>
          <h1>PixChi</h1>
          <p className="subtitle">拼豆格線圖轉換 MVP</p>
        </div>
        <div className="top-actions">
          <AuthPanel
            authUser={authUser}
            authBusy={authBusy}
            authPanelOpen={authPanelOpen}
            loginUsername={loginUsername}
            loginPassword={loginPassword}
            loginErrorText={loginErrorText}
            onTogglePanel={() => {
              setAuthPanelOpen((v) => !v);
              setLoginErrorText('');
            }}
            onLogin={() => void loginByForm()}
            onLogout={() => void logout()}
            onUsernameChange={setLoginUsername}
            onPasswordChange={setLoginPassword}
            onClosePanel={() => {
              setAuthPanelOpen(false);
              setLoginErrorText('');
            }}
          />
          <button className="ghost" onClick={() => navigatePage(page === 'palette' ? 'main' : 'palette')}>
            {page === 'palette' ? '返回轉換頁' : '前往色庫管理'}
          </button>
          {page === 'main' && (
            <>
              {proMode && (
                <button className="ghost" onClick={() => void loadPalette()}>
                  重新載入色庫
                </button>
              )}
              <button onClick={exportCsv} disabled={isPdfBusy}>
                匯出 Material CSV
              </button>
              {proMode && (
                <>
                  <input
                    ref={pdfImportRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void importPdfRestore(file);
                    }}
                  />
                  <button className="ghost" onClick={() => pdfImportRef.current?.click()} disabled={isPdfBusy}>
                    匯入 PDF 還原
                  </button>
                </>
              )}
              <button className="primary" onClick={() => void exportPdfLike()} disabled={isPdfBusy}>
                {isPdfBusy ? '處理中...' : '匯出 Pattern PDF'}
              </button>
            </>
          )}
        </div>
      </header>
      {page === 'palette' ? (
        <main className="layout palette-layout">
          <section className="panel controls">
            <h2>色庫管理</h2>
            <p className="hint">可複製現有群組建立自訂色庫，並編輯色號。一般版不提供匯入/匯出。</p>
            <div className="row two">
              <button type="button" className={paletteTab === 'builtin' ? 'primary' : 'ghost'} onClick={() => setPaletteTab('builtin')}>
                原有色庫
              </button>
              <button type="button" className={paletteTab === 'custom' ? 'primary' : 'ghost'} onClick={() => setPaletteTab('custom')}>
                自訂色庫
              </button>
            </div>
            {paletteTab === 'builtin' ? (
              <>
                <p className="hint">請在右側卡片點選要預覽的群組，進入後可複製到自訂色庫。</p>
                <label>
                  新群組名稱（可選）
                  <input type="text" value={paletteNewGroupName} onChange={(e) => setPaletteNewGroupName(e.target.value)} placeholder="留空會自動命名" />
                </label>
              </>
            ) : (
              <>
                <div className="row one">
                  <button type="button" className="ghost" onClick={() => createCustomGroup(null)}>
                    新建空白色庫
                  </button>
                </div>
                <p className="hint">請在右側卡片點選要編輯的自訂群組，進入後可直接點色票改色。</p>
                {editablePaletteGroup && (
                  <>
                    <div className="row three">
                      <input type="text" value={paletteNewGroupName} onChange={(e) => setPaletteNewGroupName(e.target.value)} />
                      <button type="button" className="ghost" onClick={updateCustomGroupName}>更新群組名</button>
                      <button type="button" className="ghost" onClick={deleteCustomGroup}>刪除群組</button>
                    </div>
                    <div className="row three">
                      <input type="text" placeholder="色號名稱" value={paletteNewColorName} onChange={(e) => setPaletteNewColorName(e.target.value)} />
                      <input type="color" value={normalizeColorHex(paletteNewColorHex).toLowerCase()} onChange={(e) => setPaletteNewColorHex(e.target.value)} />
                      <button type="button" className="ghost" onClick={addColorToCustomGroup}>新增色號</button>
                    </div>
                  </>
                )}
              </>
            )}
            {proMode && (
              <div className="row two">
                <button type="button" className="ghost" onClick={exportCustomPaletteJson}>
                  匯出自訂色庫
                </button>
                <label>
                  匯入自訂色庫
                  <input
                    type="file"
                    accept="application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void importCustomPaletteJson(file);
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
                      onClick={() => setBuiltinPreviewGroupName(g.name)}
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
                      <button type="button" className="primary" onClick={() => createCustomGroup(builtinPreviewGroup)}>
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
                      onClick={() => setPaletteEditGroupId(g.id)}
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
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') applyCustomEditHex();
                                  }}
                                  placeholder="#RRGGBB"
                                />
                                <button type="button" className="primary" onClick={applyCustomEditHex}>
                                  套用
                                </button>
                              </div>
                              <div className="row three">
                                <input
                                  type="number"
                                  min={0}
                                  max={255}
                                  value={customEditRgb[0]}
                                  onChange={(e) => setCustomEditRgbChannel(0, e.target.value)}
                                  onBlur={applyCustomEditHex}
                                  aria-label="R"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={255}
                                  value={customEditRgb[1]}
                                  onChange={(e) => setCustomEditRgbChannel(1, e.target.value)}
                                  onBlur={applyCustomEditHex}
                                  aria-label="G"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={255}
                                  value={customEditRgb[2]}
                                  onChange={(e) => setCustomEditRgbChannel(2, e.target.value)}
                                  onBlur={applyCustomEditHex}
                                  aria-label="B"
                                />
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
      ) : (
      <main className={`layout ${isCanvasFullscreen ? 'canvas-fullscreen' : ''}`.trim()}>
        <section className="panel controls">
          <h2>轉換設定</h2>

          <label>
            專案名稱
            <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </label>

          <div className="draft-box">
            <div className="draft-box-head">
              <strong>
                {!authUser
                  ? `本地草稿（未登入上限 ${getDraftLimit()}）`
                  : getCloudDraftLimit(authUser) != null
                    ? `雲端草稿（一般版登入上限 ${getCloudDraftLimit(authUser)}）`
                    : '雲端草稿（Pro / Admin）'}
              </strong>
              <span>
                {lastSavedAt ? `最後儲存：${formatLocalTime(lastSavedAt)}` : '尚未儲存'}
                {!authUser ? ` | 佔用：${storageEstimateText}` : ''}
              </span>
            </div>
            <label>
              草稿清單
              <select
                value={activeDraftId}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    setActiveDraftId('');
                    setActiveDraftVersionId('');
                    return;
                  }
                  setActiveDraftId(id);
                  setActiveDraftVersionId('');
                  void loadDraftById(id);
                }}
              >
                <option value="">未選擇草稿</option>
                {drafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}（{formatLocalTime(d.updatedAt)}）
                  </option>
                ))}
              </select>
            </label>
            {proMode && (
              <>
                <div className="row two">
                  <label>
                    草稿名稱
                    <input type="text" value={draftRenameInput} onChange={(e) => setDraftRenameInput(e.target.value)} disabled={!activeDraftId} />
                  </label>
                  <button type="button" className="ghost" onClick={() => void saveDraftRename()} disabled={isDraftBusy || !activeDraftId}>
                    更新名稱
                  </button>
                </div>
                <label>
                  復原點版本
                  <select
                    value={activeDraftVersionId}
                    onChange={(e) => {
                      const versionId = e.target.value;
                      setActiveDraftVersionId(versionId);
                      if (!activeDraftId) return;
                      void loadDraftById(activeDraftId, versionId || undefined);
                    }}
                    disabled={!activeDraftId}
                  >
                    <option value="">最新版本</option>
                    {(activeDraft?.versions ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {formatLocalTime(v.at)}（{v.reason === 'manual' ? '手動' : '自動'}）
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row two">
                  <label>
                    版本備註
                    <input
                      type="text"
                      value={draftVersionNoteInput}
                      onChange={(e) => setDraftVersionNoteInput(e.target.value)}
                      placeholder="例如：完成頭髮修色"
                      disabled={!activeDraftVersionId}
                    />
                  </label>
                  <button type="button" className="ghost" onClick={() => void saveVersionNote()} disabled={isDraftBusy || !activeDraftVersionId}>
                    儲存備註
                  </button>
                </div>
                <div className="row two">
                  <label>
                    比較版本 A
                    <select value={compareVersionA} onChange={(e) => setCompareVersionA(e.target.value)} disabled={!activeDraftId}>
                      <option value="">請選擇</option>
                      {(activeDraft?.versions ?? []).map((v) => (
                        <option key={`a-${v.id}`} value={v.id}>
                          {formatLocalTime(v.at)}（{v.reason === 'manual' ? '手動' : '自動'}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    比較版本 B
                    <select value={compareVersionB} onChange={(e) => setCompareVersionB(e.target.value)} disabled={!activeDraftId}>
                      <option value="">請選擇</option>
                      {(activeDraft?.versions ?? []).map((v) => (
                        <option key={`b-${v.id}`} value={v.id}>
                          {formatLocalTime(v.at)}（{v.reason === 'manual' ? '手動' : '自動'}）
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="row one">
                  <button type="button" className="ghost" onClick={() => void compareDraftVersions()} disabled={isDraftBusy || !activeDraftId}>
                    比較版本差異
                  </button>
                  {compareSummary && <div className="hint">{compareSummary}</div>}
                </div>
              </>
            )}
            <div className="row two">
              <button type="button" className="ghost" onClick={() => void saveDraft({ asNew: true, reason: 'manual' })} disabled={isDraftBusy}>
                新增草稿
              </button>
              <button type="button" className="ghost" onClick={() => void saveDraft({ reason: 'manual' })} disabled={isDraftBusy || !activeDraftId}>
                手動存檔
              </button>
            </div>
            <div className="row one">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  if (!activeDraftId) return;
                  void removeDraftById(activeDraftId);
                }}
                disabled={isDraftBusy || !activeDraftId}
              >
                刪除目前草稿
              </button>
            </div>
          </div>

          <label>
            作用群組
            <select value={activeGroupName} onChange={(e) => setActiveGroupName(e.target.value)}>
              {groups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name} ({g.colors.length})
                </option>
              ))}
            </select>
          </label>

          <label>
            圖片上傳
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                void onImageSelected(file);
              }}
            />
          </label>

          {imageBitmap && (
            <>
              <label className="switch-row">
                裁切工具（在中間畫布拖曳）
                <input type="checkbox" checked={cropToolEnabled} onChange={(e) => setCropToolEnabled(e.target.checked)} />
              </label>
              <div className="row two">
                <div className="hint">
                  裁切範圍：x={cropRect?.x ?? 0}, y={cropRect?.y ?? 0}, w={cropRect?.w ?? imageBitmap.width}, h={cropRect?.h ?? imageBitmap.height}
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setCropRect({ x: 0, y: 0, w: imageBitmap.width, h: imageBitmap.height })}
                >
                  重設裁切
                </button>
              </div>
            </>
          )}

          <div className="row two">
            <label>
              寬(cols)
              <input
                type="number"
                min={1}
                max={MAX_GRID_SIZE}
                value={cols}
                onChange={(e) => setCols(Number(e.target.value))}
              />
            </label>
            <label>
              高(rows)
              <input
                type="number"
                min={1}
                max={MAX_GRID_SIZE}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
              />
            </label>
          </div>

          <label>
            版面模式
            <select value={mode} onChange={(e) => setMode(e.target.value as LayoutMode)}>
              <option value="fit">fit（自動調整比例）</option>
              <option value="lock">lock（鎖定尺寸，裁切）</option>
              <option value="pad">pad（鎖定尺寸，補邊）</option>
            </select>
          </label>

          <label>
            轉換前併色門檻 DeltaE
            <input
              type="number"
              min={0}
              max={PRE_MERGE_DELTAE_MAX}
              step={0.5}
              value={preMergeDeltaE}
              onChange={(e) => setPreMergeDeltaE(Math.max(0, Math.min(PRE_MERGE_DELTAE_MAX, Number(e.target.value) || 0)))}
            />
          </label>
          <div className="hint">
            0 表示關閉；數值越高，越多相近色會在轉換時直接合併成同色（固定使用 lab_nearest / DeltaE2000）。
          </div>

          <label className="switch-row">
            顯示色號文字
            <input type="checkbox" checked={showCode} onChange={(e) => setShowCode(e.target.checked)} />
          </label>
          <label>
            匯出清晰度
            <select value={exportScale} onChange={(e) => setExportScale((Number(e.target.value) as 1 | 2 | 3) || 2)}>
              <option value={1}>1x（較快）</option>
              <option value={2}>2x（建議）</option>
              <option value={3}>3x（最清晰）</option>
            </select>
          </label>
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
                        onChange={(e) => setPdfPageFrom(clampInt(Number(e.target.value) || 1, 1, pdfPagination.totalTiles))}
                      />
                    </label>
                    <label>
                      結束頁
                      <input
                        type="number"
                        min={1}
                        max={pdfPagination.totalTiles}
                        value={pdfPageTo}
                        onChange={(e) => setPdfPageTo(clampInt(Number(e.target.value) || 1, 1, pdfPagination.totalTiles))}
                      />
                    </label>
                    <label>
                      頁碼跳轉
                      <input
                        type="number"
                        min={1}
                        max={pdfPagination.totalTiles}
                        value={pdfJumpPage}
                        onChange={(e) => setPdfJumpPage(clampInt(Number(e.target.value) || 1, 1, pdfPagination.totalTiles))}
                      />
                    </label>
                  </div>
                  <div className="row two">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setPdfPageFrom(pdfJumpPage);
                        setPdfPageTo(pdfJumpPage);
                      }}
                    >
                      只匯出跳轉頁
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setPdfPageFrom(1);
                        setPdfPageTo(pdfPagination.totalTiles);
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
                          onClick={() => setPdfJumpPage(tile.pageNo)}
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
                <button type="button" className={largeViewTilePage === 0 ? 'primary' : 'ghost'} onClick={() => setLargeViewTilePage(0)}>
                  全圖
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setLargeViewTilePage(pdfJumpPage)}
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
                      setLargeViewTilePage(pdfPagination.tiles[0].pageNo);
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
                      onClick={() => setLargeViewTilePage(tile.pageNo)}
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

          <div className="preflight-box">
            <strong>輸出前檢查</strong>
            <div className="hint">CSV 與 PDF 都會先執行一致性檢查</div>
            <div className="preflight-grid">
              <div>
                <div className="hint">CSV</div>
                {preflightCsv.map((item, idx) => (
                  <div key={`csv-${idx}`} className={`preflight-item ${item.ok ? 'ok' : 'fail'}`}>
                    <span>{item.ok ? 'OK' : 'NG'}</span>
                    <small>{item.label}：{item.detail}</small>
                  </div>
                ))}
              </div>
              <div>
                <div className="hint">PDF</div>
                {preflightPdf.map((item, idx) => (
                  <div key={`pdf-${idx}`} className={`preflight-item ${item.ok ? 'ok' : 'fail'}`}>
                    <span>{item.ok ? 'OK' : 'NG'}</span>
                    <small>{item.label}：{item.detail}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {proMode && (
            <>
              <label className="switch-row">
                顯示尺規（Pro）
                <input type="checkbox" checked={showRuler} onChange={(e) => setShowRuler(e.target.checked)} />
              </label>
              <label className="switch-row">
                顯示參考線（Pro）
                <input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} />
              </label>
              <label>
                參考線間距（每幾格）
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={guideEvery}
                  onChange={(e) => setGuideEvery(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                />
              </label>
            </>
          )}

          <div className="row two">
            <button className="primary" onClick={() => void onConvert()}>
              開始轉換
            </button>
            <button className="ghost" onClick={resetAll}>
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
                目前格線 {oversizePlan.cols}x{oversizePlan.rows}（{oversizePlan.total.toLocaleString()} 格）超過建議上限 {GRID_SOFT_LIMIT.toLocaleString()} 格。
              </div>
              <div className="row two">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setCols(oversizePlan.suggestCols);
                    setRows(oversizePlan.suggestRows);
                    void runConvert({
                      overrideCols: oversizePlan.suggestCols,
                      overrideRows: oversizePlan.suggestRows,
                      allowOversize: true,
                      useLargeMode: false
                    });
                  }}
                >
                  自動縮放至 {oversizePlan.suggestCols}x{oversizePlan.suggestRows}
                </button>
                {proMode && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void runConvert({ allowOversize: true, useLargeMode: true })}
                  >
                    以大圖模式繼續
                  </button>
                )}
              </div>
              <div className="row one">
                <button type="button" className="ghost" onClick={() => setOversizePlan(null)}>
                  取消本次超限轉換
                </button>
              </div>
            </div>
          )}

          <hr />

          <h3>手動修色</h3>
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
                    setFocusColorMenuOpen(true);
                    setFocusColorSearch('');
                  }}
                  onChange={(e) => {
                    if (constructionMode) return;
                    setFocusColorSearch(e.target.value);
                    if (!focusColorMenuOpen) setFocusColorMenuOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (constructionMode) return;
                    if (e.key !== 'Enter') return;
                    if (!filteredFocusColors.length) return;
                    setFocusColorName(filteredFocusColors[0].name);
                    setFocusColorMenuOpen(false);
                    setFocusColorSearch('');
                  }}
                />
                <button
                  type="button"
                  className="ghost color-select-toggle"
                  onClick={() => setFocusColorMenuOpen((v) => !v)}
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
                      if (constructionMode) clearConstructionFocus();
                      else setFocusColorName('');
                      setFocusColorMenuOpen(false);
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
                        setFocusColorName(c.name);
                        setFocusColorMenuOpen(false);
                      }}
                    >
                      <span className="color-pill tiny" style={{ color: c.hex }} />
                      <span>
                        {c.name}
                      </span>
                    </button>
                  ))}
                  {constructionMode && <div className="hint" style={{ padding: '8px 10px' }}>施工模式僅可在此清除焦點。</div>}
                </div>
              )}
            </div>
          </label>
          <label className="switch-row">
            焦點鄰近色模式（DeltaE）
            <input
              type="checkbox"
              checked={focusNeighborEnabled}
              disabled={constructionMode}
              onChange={(e) => setFocusNeighborEnabled(e.target.checked)}
            />
          </label>
          {focusNeighborEnabled && !constructionMode && (
            <label>
              鄰近色門檻 DeltaE
              <input
                type="number"
                min={1}
                max={50}
                step={0.5}
                value={focusNeighborDeltaE}
                onChange={(e) => setFocusNeighborDeltaE(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
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
                    setEditColorMenuOpen(true);
                    setPaletteSearch('');
                  }}
                  onChange={(e) => {
                    setPaletteSearch(e.target.value);
                    if (!editColorMenuOpen) setEditColorMenuOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    if (paletteSearch.trim() === '無') {
                      setEditColorName(EMPTY_EDIT_COLOR_NAME);
                      setEditColorMenuOpen(false);
                      setPaletteSearch('');
                      return;
                    }
                    if (filteredEditColors.length) {
                      setEditColorName(filteredEditColors[0].name);
                      setEditColorMenuOpen(false);
                      setPaletteSearch('');
                    }
                  }}
                />
                <button
                  type="button"
                  className="ghost color-select-toggle"
                  onClick={() => setEditColorMenuOpen((v) => !v)}
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
                      setEditColorName(EMPTY_EDIT_COLOR_NAME);
                      setEditColorMenuOpen(false);
                      setPaletteSearch('');
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
                        setEditColorName(c.name);
                        setEditColorMenuOpen(false);
                        setPaletteSearch('');
                      }}
                    >
                      <span className="color-pill tiny" style={{ color: c.hex }} />
                      <span>
                        {c.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>

          <div className="row five">
            <button
              className={editTool === 'pan' ? 'primary active-tool' : 'ghost'}
              onClick={() => setEditTool('pan')}
              type="button"
            >
              手型
            </button>
            <button
              className={editTool === 'paint' ? 'primary active-tool' : 'ghost'}
              onClick={() => setEditTool('paint')}
              type="button"
            >
              上色工具
            </button>
            <button
              className={editTool === 'erase' ? 'primary active-tool' : 'ghost'}
              onClick={() => setEditTool('erase')}
              type="button"
            >
              橡皮擦
            </button>
            <button
              className={editTool === 'bucket' ? 'primary active-tool' : 'ghost'}
              onClick={() => setEditTool('bucket')}
              type="button"
            >
              油漆桶
            </button>
            <button
              className={editTool === 'picker' ? 'primary active-tool' : 'ghost'}
              onClick={() => setEditTool('picker')}
              type="button"
            >
              取色
            </button>
          </div>

          {largeGridMode && (
            <label>
              大圖操作範圍（油漆桶、焦點全替換、外框）
              <select value={largeOperationScope} onChange={(e) => setLargeOperationScope(e.target.value as 'tile' | 'all')}>
                <option value="tile">當前分塊</option>
                <option value="all">全圖</option>
              </select>
            </label>
          )}

          {(editTool === 'paint' || editTool === 'erase') && (
            <div className="row two">
              <label>
                筆刷尺寸
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))}
                />
              </label>
                <label>
                  快捷鍵
                  <input value={`${effectiveShortcutConfig.brushDown.join('/')} / ${effectiveShortcutConfig.brushUp.join('/')} 調整 (${brushSize}x${brushSize})`} readOnly />
                </label>
              </div>
          )}
          {editTool === 'bucket' && (
            <label>
              油漆桶模式
              <select value={bucketMode} onChange={(e) => setBucketMode(e.target.value as 'global' | 'region')}>
                <option value="global">全圖同色替換</option>
                <option value="region">連通區替換</option>
              </select>
            </label>
          )}

          <div className="row four">
            <button className="ghost" onClick={undo}>
              Undo
            </button>
            <button className="ghost" onClick={redo}>
              Redo
            </button>
            <button className="ghost" onClick={replaceAllSameColor}>
              焦點色全替換
            </button>
            <button className="ghost" onClick={addOneCellOutline}>
              加外框(1格)
            </button>
          </div>

          {converted && (
            <div className="construction-box">
              <div className="draft-box-head">
                <strong>拼豆順序模式</strong>
                <span>完成：{constructionCompletionText}</span>
              </div>
              <div className="construction-section">
                <label className="switch-row">
                  1. 啟用施工順序
                  <input type="checkbox" checked={constructionMode} onChange={(e) => setConstructionMode(e.target.checked)} />
                </label>
              </div>
              <div className="construction-section">
                <div className="row two">
                  <label>
                    2. 任務分組
                    <select value={constructionStrategy} onChange={(e) => setConstructionStrategy(e.target.value as 'block' | 'color')}>
                      <option value="block">區塊優先</option>
                      <option value="color">顏色優先</option>
                    </select>
                  </label>
                  <label>
                    排列規則
                    <select
                      value={constructionOrderRule}
                      onChange={(e) => {
                        const next = e.target.value as ConstructionOrderRule;
                        setConstructionOrderRule(next);
                        if (next !== 'manual') setConstructionCustomOrder([]);
                      }}
                    >
                      <option value="count_desc">顆數多到少</option>
                      <option value="count_asc">顆數少到多</option>
                      <option value="title_asc">名稱 A-Z</option>
                      <option value="title_desc">名稱 Z-A</option>
                      {proMode && <option value="manual">手動拖曳</option>}
                    </select>
                  </label>
                </div>
                <label className="switch-row">
                  已完成覆蓋色
                  <input
                    type="checkbox"
                    checked={constructionShowDoneOverlay}
                    onChange={(e) => setConstructionShowDoneOverlay(e.target.checked)}
                  />
                </label>
              </div>
              {proMode && constructionOrderRule === 'manual' && constructionRuleInference && (
                <div className="construction-section">
                  <div className="construction-inline-tip">
                    <span className="hint">
                      建議：{formatConstructionRuleLabel(constructionRuleInference.bestRule)}（{(constructionRuleInference.bestScore * 100).toFixed(1)}%）
                    </span>
                    <button type="button" className="ghost construction-mini-btn" onClick={applyInferredConstructionRule}>
                      套用建議
                    </button>
                  </div>
                </div>
              )}
              {proMode && (
                <div className="construction-section">
                  <div className="row three">
                    <label>
                      3. 模板
                      <select value={constructionTemplateId} onChange={(e) => setConstructionTemplateId(e.target.value)}>
                        <option value="">選擇模板</option>
                        {constructionTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}（{t.strategy === 'block' ? '區塊' : '顏色'} / {t.inferredFromManual ? '手動色序' : formatConstructionRuleLabel(t.rule)}）
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="primary" onClick={applyConstructionTemplate} disabled={!constructionTemplateId}>
                      套用
                    </button>
                    <button type="button" className="ghost" onClick={deleteConstructionTemplate} disabled={!constructionTemplateId}>
                      刪除
                    </button>
                  </div>
                  <div className="row two">
                    <input
                      type="text"
                      value={constructionTemplateName}
                      onChange={(e) => setConstructionTemplateName(e.target.value)}
                      placeholder="儲存目前排序為新模板"
                    />
                    <button type="button" className="ghost" onClick={saveConstructionTemplate}>
                      儲存目前排序
                    </button>
                  </div>
                  <div className="hint">手動拖曳時儲存模板，會自動辨識色序並可跨作品套用。</div>
                </div>
              )}
              <div className="construction-task-list" ref={constructionListRef}>
                {constructionTasks.length === 0 && <div className="hint">尚無可排序的內容。</div>}
                {constructionTasks.map((task, idx) => {
                  const done = !!constructionDoneMap[task.id];
                  const active = constructionCurrentTask?.id === task.id;
                  return (
                    <div
                      key={task.id}
                      ref={(el) => {
                        constructionItemRefs.current[task.id] = el;
                      }}
                      className={`construction-task-item ${active ? 'active' : ''} ${done ? 'done' : ''}`.trim()}
                      draggable={proMode && constructionOrderRule === 'manual'}
                      onDragStart={() => setConstructionDragTaskId(task.id)}
                      onDragOver={(e) => {
                        if (!proMode || constructionOrderRule !== 'manual') return;
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        if (!proMode || constructionOrderRule !== 'manual') return;
                        e.preventDefault();
                        reorderConstructionTask(constructionDragTaskId, task.id);
                        setConstructionDragTaskId('');
                      }}
                      onClick={() => setFocusFromTask(task.id)}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={(e) => toggleConstructionDone(task.id, e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span>
                          #{idx + 1} {task.title}（{task.count}）
                        </span>
                      </label>
                      <small>{task.subtitle}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {proMode && (
            <div className="shortcut-box">
              <div className="draft-box-head">
                <strong>快捷鍵設定（逗號分隔）</strong>
                <button type="button" className="ghost" onClick={resetShortcutDefaults}>
                  還原預設
                </button>
              </div>
              {Object.keys(SHORTCUTS).map((key) => {
                const k = key as keyof typeof SHORTCUTS;
                return (
                  <label key={`shortcut-${k}`}>
                    {SHORTCUT_LABELS[k]}
                    <input
                      type="text"
                      value={(shortcutConfig[k] ?? []).join(', ')}
                      onChange={(e) => updateShortcutByText(k, e.target.value)}
                      placeholder={SHORTCUTS[k].join(', ')}
                    />
                  </label>
                );
              })}
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
            </div>
          )}

          <div className="history-box">
            <strong>最近操作</strong>
            {undoStack.length ? (
              [...undoStack]
                .slice(-6)
                .reverse()
                .map((batch, i) => {
                  const remaining = undoStack.length - (i + 1);
                  return (
                    <button key={`${batch.label}-${i}`} type="button" className="history-item history-jump" onClick={() => rollbackToStep(remaining)}>
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
        </section>

        <section className="panel canvas-panel">
          <h2>格線預覽</h2>
          <div className="canvas-meta">
            <span>{gridMeta}</span>
            <div className="canvas-meta-right">
              <span>{imageMeta}</span>
              <div className="zoom-tools">
                <button type="button" className="ghost" onClick={() => setIsCanvasFullscreen((v) => !v)}>
                  {isCanvasFullscreen ? '退出畫布' : '畫布全螢幕'}
                </button>
                <button type="button" className="ghost" onClick={() => setZoom((v) => Math.max(0.25, Number((v - 0.1).toFixed(2))))}>
                  -
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
                    if (Number.isFinite(p)) setZoom(Math.max(0.25, Math.min(8, p / 100)));
                  }}
                />
                <span>%</span>
                <button type="button" className="ghost" onClick={() => setZoom((v) => Math.min(8, Number((v + 0.1).toFixed(2))))}>
                  +
                </button>
                <button type="button" className="ghost" onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}>
                  重置視圖
                </button>
              </div>
            </div>
          </div>
          <div className="canvas-wrap" ref={canvasWrapRef}>
            <canvas
              ref={canvasRef}
              className={
                cropToolEnabled && imageBitmap
                  ? 'tool-crop'
                  : !converted
                  ? 'tool-pan'
                  : editTool === 'pan'
                  ? 'tool-pan'
                  : editTool === 'erase'
                  ? 'tool-erase'
                  : editTool === 'picker'
                  ? 'tool-picker'
                  : 'tool-paint'
              }
              style={canvasCursor ? { cursor: canvasCursor } : undefined}
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
            {converted
              ? '手型可拖曳視圖，滾輪或右上按鈕可縮放；上色與橡皮擦可編輯格子。若要再裁切，先開啟左側裁切工具。'
              : '上傳後會先顯示原圖；裁切工具支援角/邊微調與框內移動（1px）。Shift 鎖比例、Alt 由中心縮放、Esc 取消本次拖曳。'}
          </p>
          {largeGridMode && (
            <p className="hint">
              大圖檢視：{largeViewTilePage > 0 ? `分塊 #${largeViewTilePage}` : '全圖'}；替換/油漆桶全圖同色可套用「當前分塊 / 全圖」範圍。
            </p>
          )}
          {largeGridMode && <p className="hint">已啟用大圖模式：為了流暢度，畫布會簡化格線與色號文字顯示。</p>}
          {proMode && <p className="hint">Pro 模式已啟用：可使用尺規與參考線（並會套用到 PDF 匯出）。</p>}
        </section>

        <section className="panel stats">
          <h2>完整色號統計</h2>
          <div className={`totals ${proMode ? '' : 'compact'}`.trim()}>
            <div>
              <strong>{totalBeads}</strong>
              <span>總顆數</span>
            </div>
            <div>
              <strong>{statsRows.length}</strong>
              <span>總色號數</span>
            </div>
            {proMode && (
              <div>
                <strong>{materialCost.toFixed(2)}</strong>
                <span>預估材料成本</span>
              </div>
            )}
          </div>

          {proMode ? (
            <>
              <div className="row two">
                <label>
                  單顆成本
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={proUnitCost}
                    onChange={(e) => setProUnitCost(Number(e.target.value) || 0)}
                  />
                </label>
                <label>
                  損耗率 (%)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={proLossRate}
                    onChange={(e) => setProLossRate(Number(e.target.value) || 0)}
                  />
                </label>
              </div>
              <div className="row two">
                <label>
                  時薪
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={proHourlyRate}
                    onChange={(e) => setProHourlyRate(Number(e.target.value) || 0)}
                  />
                </label>
                <label>
                  預估工時
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    value={proWorkHours}
                    onChange={(e) => setProWorkHours(Number(e.target.value) || 0)}
                  />
                </label>
              </div>
              <div className="row two">
                <label>
                  固定成本
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={proFixedCost}
                    onChange={(e) => setProFixedCost(Number(e.target.value) || 0)}
                  />
                </label>
                <label>
                  利潤率 (%)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={proMargin}
                    onChange={(e) => setProMargin(Number(e.target.value) || 0)}
                  />
                </label>
              </div>
              <p className="hint">
                Pro 拆解：材料 {materialCost.toFixed(2)} + 人工 {laborCost.toFixed(2)} + 固定費 {fixedCost.toFixed(2)}，再加上利潤率 {marginRate.toFixed(1)}%
              </p>
            </>
          ) : (
            <></>
          )}
          {converted && (
            <div className="quote-box">
              <span>建議報價</span>
              <strong>{quotePrice}</strong>
            </div>
          )}

          <label>
            統計搜尋（僅過濾顯示，不影響全量匯出）
            <input
              type="text"
              placeholder="搜尋色號..."
              value={statsSearch}
              onChange={(e) => setStatsSearch(e.target.value)}
            />
          </label>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>色號</th>
                  <th>顆數</th>
                  <th>佔比</th>
                  {proMode && <th>成本</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStatsRows.map((r) => (
                  <tr key={r.name}>
                    <td>
                      <span className="color-pill" style={{ color: r.hex }} />
                      {r.name}
                    </td>
                    <td>{r.count}</td>
                    <td>{r.ratio.toFixed(2)}%</td>
                    {proMode && <td>{r.lineCost.toFixed(2)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      )}
    </>
  );
}

function clampInt(value: number, min: number, max: number) {
  const n = Math.floor(Number(value) || 0);
  return Math.min(max, Math.max(min, n));
}

function buildConstructionTasks(converted: Converted, strategy: 'block' | 'color'): ConstructionTask[] {
  if (!converted.cells.length) return [];
  if (strategy === 'color') {
    const map = new Map<string, number[]>();
    for (let i = 0; i < converted.cells.length; i++) {
      const c = converted.cells[i];
      if (!c || c.isEmpty) continue;
      const arr = map.get(c.colorName) ?? [];
      arr.push(i);
      map.set(c.colorName, arr);
    }
    return Array.from(map.entries())
      .map(([name, indices]) => ({
        id: `color:${name}`,
        title: name,
        subtitle: '同色集中施工',
        count: indices.length,
        cellIndices: indices
      }))
      .sort((a, b) => b.count - a.count);
  }

  const blockSize = Math.max(8, Math.min(24, Math.floor(Math.max(converted.cols, converted.rows) / 8)));
  const out: ConstructionTask[] = [];
  let seq = 1;
  for (let by = 0; by < converted.rows; by += blockSize) {
    for (let bx = 0; bx < converted.cols; bx += blockSize) {
      const indices: number[] = [];
      const endX = Math.min(converted.cols, bx + blockSize);
      const endY = Math.min(converted.rows, by + blockSize);
      for (let y = by; y < endY; y++) {
        for (let x = bx; x < endX; x++) {
          const idx = y * converted.cols + x;
          const c = converted.cells[idx];
          if (!c || c.isEmpty) continue;
          indices.push(idx);
        }
      }
      if (!indices.length) continue;
      out.push({
        id: `block:${Math.floor(bx / blockSize)}:${Math.floor(by / blockSize)}`,
        title: `區塊 ${seq}`,
        subtitle: `x${bx + 1}-${endX} / y${by + 1}-${endY}`,
        count: indices.length,
        cellIndices: indices
      });
      seq += 1;
    }
  }
  return out;
}

function sortConstructionTasksByRule(tasks: ConstructionTask[], rule: Exclude<ConstructionOrderRule, 'manual'> | ConstructionOrderRule) {
  const out = [...tasks];
  if (rule === 'count_asc') return out.sort((a, b) => a.count - b.count || a.title.localeCompare(b.title));
  if (rule === 'title_asc') return out.sort((a, b) => a.title.localeCompare(b.title));
  if (rule === 'title_desc') return out.sort((a, b) => b.title.localeCompare(a.title));
  return out.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

function orderTaskIdsByColorPriority(tasks: ConstructionTask[], colorPriority: string[]) {
  const byTitle = new Map(tasks.map((t) => [t.title, t.id]));
  const used = new Set<string>();
  const ids: string[] = [];
  for (const colorName of colorPriority) {
    const id = byTitle.get(colorName);
    if (!id || used.has(id)) continue;
    ids.push(id);
    used.add(id);
  }
  const remaining = [...tasks]
    .filter((t) => !used.has(t.id))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .map((t) => t.id);
  return [...ids, ...remaining];
}

function calcOrderSimilarity(orderA: string[], orderB: string[]) {
  const n = Math.min(orderA.length, orderB.length);
  if (n <= 1) return 1;
  const rankB = new Map<string, number>();
  for (let i = 0; i < orderB.length; i++) rankB.set(orderB[i], i);
  let agree = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const ai = orderA[i];
    const ri = rankB.get(ai);
    if (ri == null) continue;
    for (let j = i + 1; j < n; j++) {
      const aj = orderA[j];
      const rj = rankB.get(aj);
      if (rj == null) continue;
      total += 1;
      if (ri < rj) agree += 1;
    }
  }
  if (!total) return 1;
  return agree / total;
}

function formatConstructionRuleLabel(rule: Exclude<ConstructionOrderRule, 'manual'>) {
  if (rule === 'count_asc') return '顆數少到多';
  if (rule === 'title_asc') return '名稱A-Z';
  if (rule === 'title_desc') return '名稱Z-A';
  return '顆數多到少';
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function fitGridWithinLimit(cols: number, rows: number, limit: number) {
  const total = cols * rows;
  if (total <= limit) return { cols, rows };
  const factor = Math.sqrt(limit / total);
  let nextCols = Math.max(1, Math.floor(cols * factor));
  let nextRows = Math.max(1, Math.floor(rows * factor));
  while (nextCols * nextRows > limit) {
    if (nextCols >= nextRows && nextCols > 1) nextCols -= 1;
    else if (nextRows > 1) nextRows -= 1;
    else break;
  }
  return { cols: nextCols, rows: nextRows };
}

function waitNextFrame() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function getComplexityCap(totalBeads: number) {
  const tier = COMPLEXITY_CAP_TIERS.find((t) => totalBeads <= t.maxBeads);
  return tier?.cap ?? COMPLEXITY_CAP_TIERS[COMPLEXITY_CAP_TIERS.length - 1].cap;
}

function buildExportGridCanvas(
  converted: Converted,
  showCode: boolean,
  beadMm: number,
  options?: { exportScale?: number; showRuler?: boolean; showGuide?: boolean; guideEvery?: number }
) {
  const exportScale = Math.max(1, Math.min(3, Math.floor(options?.exportScale ?? 2)));
  const pxPerMm = (96 / 25.4) * exportScale;
  const cell = Math.max(2, Math.round(beadMm * pxPerMm));
  const pad = 12;
  const showRuler = !!options?.showRuler;
  const showGuide = !!options?.showGuide;
  const guideEvery = Math.max(1, Math.floor(options?.guideEvery ?? 5));
  const rulerBand = showRuler ? 24 : 0;

  const canvas = document.createElement('canvas');
  canvas.width = converted.cols * cell + pad * 2 + rulerBand;
  canvas.height = converted.rows * cell + pad * 2 + rulerBand;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ox = pad + rulerBand;
  const oy = pad + rulerBand;

  for (const c of converted.cells) {
    const x = ox + c.x * cell;
    const y = oy + c.y * cell;
    ctx.fillStyle = c.hex;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = '#dbe5df';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cell, cell);

    if (showCode && !c.isEmpty) {
      ctx.fillStyle = pickTextColor(c.hex);
      const fontSize = Math.max(6, Math.floor(cell * 0.42));
      ctx.font = `700 ${fontSize}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, Math.floor(fontSize * 0.16));
      ctx.strokeStyle = pickTextColor(c.hex) === '#1a1a1a' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)';
      ctx.strokeText(c.colorName, x + cell / 2, y + cell / 2);
      ctx.fillText(c.colorName, x + cell / 2, y + cell / 2);
    }
  }

  if (showGuide) {
    ctx.save();
    ctx.strokeStyle = '#8ea39a';
    ctx.lineWidth = 1.5;
    for (let gx = 0; gx <= converted.cols; gx += guideEvery) {
      const x = ox + gx * cell + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, oy);
      ctx.lineTo(x, oy + converted.rows * cell);
      ctx.stroke();
    }
    for (let gy = 0; gy <= converted.rows; gy += guideEvery) {
      const y = oy + gy * cell + 0.5;
      ctx.beginPath();
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + converted.cols * cell, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (showRuler) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy - rulerBand, converted.cols * cell, rulerBand);
    ctx.fillRect(ox - rulerBand, oy, rulerBand, converted.rows * cell);
    ctx.fillStyle = '#465a52';
    ctx.font = '11px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let gx = 0; gx <= converted.cols; gx += guideEvery) {
      const x = ox + gx * cell;
      ctx.fillText(String(gx), x, oy - Math.floor(rulerBand / 2));
    }
    ctx.textAlign = 'right';
    for (let gy = 0; gy <= converted.rows; gy += guideEvery) {
      const y = oy + gy * cell;
      ctx.fillText(String(gy), ox - 6, y);
    }
    ctx.restore();
  }

  return canvas;
}

function buildPdfPayload(input: {
  projectName: string;
  activeGroupName: string;
  mode: LayoutMode;
  strategy: MatchStrategy;
  showCode: boolean;
  converted: Converted;
}) {
  const paletteMap = new Map<string, { idx: number; name: string; hex: string }>();
  const palette: Array<{ name: string; hex: string }> = [];
  const refs: number[] = [];

  for (const c of input.converted.cells) {
    if (c.isEmpty || !c.colorName) {
      refs.push(-1);
      continue;
    }
    const key = `${c.colorName}|${c.hex}`;
    let item = paletteMap.get(key);
    if (!item) {
      item = { idx: palette.length, name: c.colorName, hex: c.hex };
      paletteMap.set(key, item);
      palette.push({ name: c.colorName, hex: c.hex });
    }
    refs.push(item.idx);
  }

  return {
    v: 1,
    projectName: input.projectName,
    activeGroupName: input.activeGroupName,
    mode: input.mode,
    strategy: input.strategy,
    showCode: input.showCode,
    converted: {
      cols: input.converted.cols,
      rows: input.converted.rows,
      mode: input.converted.mode,
      sourceW: input.converted.sourceW,
      sourceH: input.converted.sourceH,
      processInfo: input.converted.processInfo,
      palette,
      refs
    }
  };
}

function mmToPt(mm: number) {
  return (mm * 72) / 25.4;
}

function ptToMm(pt: number) {
  return (pt * 25.4) / 72;
}

function buildPdfPagination(converted: Converted, beadMm: number): PdfPaginationInfo {
  const pageW = mmToPt(210);
  const pageH = mmToPt(297);
  const margin = mmToPt(8);
  const gap = mmToPt(4);
  const sideTableWidth = mmToPt(44);
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const headerH = 30;
  const maxPatternHPt = usableH - headerH - 8;

  const patternWPt = mmToPt(converted.cols * beadMm);
  const patternHPt = mmToPt(converted.rows * beadMm);
  const hasRightSpace = patternWPt + gap + sideTableWidth <= usableW;
  const fitsSinglePage = patternWPt <= usableW && patternHPt <= maxPatternHPt;

  if (fitsSinglePage) {
    return {
      fitsSinglePage: true,
      hasRightSpace,
      tileCols: converted.cols,
      tileRows: converted.rows,
      xPages: 1,
      yPages: 1,
      totalTiles: 1,
      tiles: [
        {
          pageNo: 1,
          px: 0,
          py: 0,
          startCol: 0,
          startRow: 0,
          colsPart: converted.cols,
          rowsPart: converted.rows
        }
      ]
    };
  }

  const tileCols = Math.max(1, Math.floor(ptToMm(usableW) / beadMm));
  const tileRows = Math.max(1, Math.floor(ptToMm(maxPatternHPt) / beadMm));
  const xPages = Math.ceil(converted.cols / tileCols);
  const yPages = Math.ceil(converted.rows / tileRows);
  const tiles: PdfTileInfo[] = [];
  let pageNo = 1;
  for (let py = 0; py < yPages; py++) {
    for (let px = 0; px < xPages; px++) {
      const startCol = px * tileCols;
      const startRow = py * tileRows;
      tiles.push({
        pageNo,
        px,
        py,
        startCol,
        startRow,
        colsPart: Math.min(tileCols, converted.cols - startCol),
        rowsPart: Math.min(tileRows, converted.rows - startRow)
      });
      pageNo += 1;
    }
  }

  return {
    fitsSinglePage: false,
    hasRightSpace,
    tileCols,
    tileRows,
    xPages,
    yPages,
    totalTiles: tiles.length,
    tiles
  };
}

function dataUrlToBytes(dataUrl: string) {
  const b64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function drawPdfBead(page: any, x: number, y: number, hex: string, rgbFn: (...args: number[]) => any) {
  const [r, g, b] = hexToRgb(hex);
  page.drawCircle({ x, y, size: 4, color: rgbFn(1, 1, 1), borderColor: rgbFn(r / 255, g / 255, b / 255), borderWidth: 4 });
}

function toBase64Utf8(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000);
    bin += String.fromCharCode(...chunk);
  }
  return btoa(bin);
}

function fromBase64Utf8(base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function getPdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')]).then(([pdf, fk]) => ({
      PDFDocument: pdf.PDFDocument,
      StandardFonts: pdf.StandardFonts,
      rgb: pdf.rgb,
      fontkit: fk.default ?? fk
    }));
  }
  return pdfRuntimePromise;
}

async function loadPdfCjkFont(pdfDoc: any) {
  try {
    const runtime = await getPdfRuntime();
    pdfDoc.registerFontkit(runtime.fontkit);
    const res = await fetch(PDF_FONT_URL, { cache: 'force-cache' });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Variable fonts can lose glyphs when subsetting in some PDF viewers.
    return await pdfDoc.embedFont(bytes, { subset: false });
  } catch {
    return null;
  }
}

function toWinAnsiSafe(text: string) {
  return String(text)
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code <= 0x7e ? ch : '?';
    })
    .join('');
}

function isCjkChar(ch: string) {
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

function sliceConverted(
  converted: Converted,
  startCol: number,
  startRow: number,
  colsPart: number,
  rowsPart: number
): Converted {
  const cells: Cell[] = [];
  for (let y = 0; y < rowsPart; y++) {
    for (let x = 0; x < colsPart; x++) {
      const srcX = startCol + x;
      const srcY = startRow + y;
      const srcIdx = srcY * converted.cols + srcX;
      const src = converted.cells[srcIdx];
      cells.push({
        ...src,
        x,
        y
      });
    }
  }
  return {
    cols: colsPart,
    rows: rowsPart,
    mode: converted.mode,
    sourceW: converted.sourceW,
    sourceH: converted.sourceH,
    processInfo: converted.processInfo,
    cells
  };
}

function splitMixedRuns(text: string) {
  const out: Array<{ text: string; cjk: boolean }> = [];
  for (const ch of String(text)) {
    const cjk = isCjkChar(ch);
    const prev = out[out.length - 1];
    if (prev && prev.cjk === cjk) {
      prev.text += ch;
    } else {
      out.push({ text: ch, cjk });
    }
  }
  return out;
}

function hasCjkText(text: string) {
  for (const ch of String(text)) {
    if (isCjkChar(ch)) return true;
  }
  return false;
}

function measurePdfTextMixed(text: string, size: number, latinFont: any, cjkFont: any) {
  return splitMixedRuns(text).reduce((acc, run) => {
    if (run.cjk && cjkFont) return acc + cjkFont.widthOfTextAtSize(run.text, size);
    return acc + latinFont.widthOfTextAtSize(toWinAnsiSafe(run.text), size);
  }, 0);
}

function drawPdfTextMixed(
  page: any,
  text: string,
  x: number,
  y: number,
  size: number,
  latinFont: any,
  cjkFont: any,
  options?: { color?: any }
) {
  let cx = x;
  for (const run of splitMixedRuns(text)) {
    if (run.cjk && cjkFont) {
      page.drawText(run.text, { x: cx, y, size, font: cjkFont, color: options?.color });
      cx += cjkFont.widthOfTextAtSize(run.text, size);
    } else {
      const safe = toWinAnsiSafe(run.text);
      page.drawText(safe, { x: cx, y, size, font: latinFont, color: options?.color });
      cx += latinFont.widthOfTextAtSize(safe, size);
    }
  }
}

function drawPdfTextPreferCjk(
  page: any,
  text: string,
  x: number,
  y: number,
  size: number,
  latinFont: any,
  cjkFont: any,
  options?: { color?: any }
) {
  if (cjkFont && hasCjkText(text)) {
    page.drawText(String(text), { x, y, size, font: cjkFont, color: options?.color });
    return;
  }
  drawPdfTextMixed(page, text, x, y, size, latinFont, cjkFont, options);
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = String(fr.result);
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function dataUrlToImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function dataUrlToBitmap(url: string): Promise<ImageBitmap> {
  const img = await dataUrlToImage(url);
  return createImageBitmap(img);
}

function formatLocalTime(ts: number) {
  if (!Number.isFinite(ts) || ts <= 0) return '-';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

function buildDraftFingerprint(snapshot: DraftSnapshot) {
  return JSON.stringify(snapshot);
}

function adjustGridByMode(cols: number, rows: number, imgW: number, imgH: number, mode: LayoutMode) {
  if (mode !== 'fit') return { cols, rows };
  const ratio = imgW / imgH;
  const opt1 = { cols: Math.max(1, Math.round(rows * ratio)), rows };
  const opt2 = { cols, rows: Math.max(1, Math.round(cols / ratio)) };
  const d1 = Math.abs(opt1.cols - cols) + Math.abs(opt1.rows - rows);
  const d2 = Math.abs(opt2.cols - cols) + Math.abs(opt2.rows - rows);
  return d1 <= d2 ? opt1 : opt2;
}

function buildProcessedCanvas(bitmap: ImageBitmap, cols: number, rows: number, mode: LayoutMode) {
  const targetRatio = cols / rows;
  const srcRatio = bitmap.width / bitmap.height;
  let drawW = bitmap.width;
  let drawH = bitmap.height;
  let sx = 0;
  let sy = 0;

  if (mode === 'lock') {
    if (srcRatio > targetRatio) {
      drawW = Math.round(bitmap.height * targetRatio);
      sx = Math.floor((bitmap.width - drawW) / 2);
    } else {
      drawH = Math.round(bitmap.width / targetRatio);
      sy = Math.floor((bitmap.height - drawH) / 2);
    }
  }

  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  const cctx = c.getContext('2d')!;
  cctx.fillStyle = '#ffffff';
  cctx.fillRect(0, 0, c.width, c.height);

  if (mode === 'pad') {
    const padCanvas = document.createElement('canvas');
    if (srcRatio > targetRatio) {
      padCanvas.width = bitmap.width;
      padCanvas.height = Math.round(bitmap.width / targetRatio);
    } else {
      padCanvas.height = bitmap.height;
      padCanvas.width = Math.round(bitmap.height * targetRatio);
    }
    const pctx = padCanvas.getContext('2d')!;
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(0, 0, padCanvas.width, padCanvas.height);
    const dx = Math.floor((padCanvas.width - bitmap.width) / 2);
    const dy = Math.floor((padCanvas.height - bitmap.height) / 2);
    pctx.drawImage(bitmap, dx, dy);

    c.width = padCanvas.width;
    c.height = padCanvas.height;
    cctx.drawImage(padCanvas, 0, 0);
    return { processedCanvas: c, info: `pad ${padCanvas.width}x${padCanvas.height}` };
  }

  cctx.drawImage(bitmap, sx, sy, drawW, drawH, 0, 0, c.width, c.height);
  return { processedCanvas: c, info: mode === 'lock' ? `crop ${drawW}x${drawH}` : 'original ratio' };
}

function extractCellMedianRgb(imageData: ImageData, cellX: number, cellY: number, cols: number, rows: number): [number, number, number] {
  const { data, width, height } = imageData;
  let x0 = Math.floor((cellX * width) / cols);
  let x1 = Math.floor(((cellX + 1) * width) / cols);
  let y0 = Math.floor((cellY * height) / rows);
  let y1 = Math.floor(((cellY + 1) * height) / rows);

  // Ensure every grid cell samples at least one pixel.
  x0 = Math.max(0, Math.min(width - 1, x0));
  y0 = Math.max(0, Math.min(height - 1, y0));
  x1 = Math.max(x0 + 1, Math.min(width, x1));
  y1 = Math.max(y0 + 1, Math.min(height, y1));

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      // Blend transparent pixels over white background to avoid dark fringes after crop.
      rs.push(Math.round(data[i] * a + 255 * (1 - a)));
      gs.push(Math.round(data[i + 1] * a + 255 * (1 - a)));
      bs.push(Math.round(data[i + 2] * a + 255 * (1 - a)));
    }
  }

  return [median(rs), median(gs), median(bs)];
}

function mapColor(rgb: [number, number, number], palette: PaletteColor[], strategy: MatchStrategy) {
  let best: PaletteColor | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  const lab = strategy === 'lab_nearest' ? rgbToLab(...rgb) : null;

  for (const c of palette) {
    const dist = strategy === 'rgb_nearest' ? euclidean(rgb, c.rgb) : deltaE2000(lab!, c.lab);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best ?? { name: 'N/A', hex: '#000000', rgb: [0, 0, 0], lab: [0, 0, 0] };
}

function mergeMappedCellsByDeltaE(cells: Cell[], palette: PaletteColor[], threshold: number) {
  if (threshold <= 0 || !cells.length) return { cells, mergedColorKinds: 0, changedCells: 0 };
  const usedCount = new Map<string, number>();
  for (const c of cells) {
    if (c.isEmpty) continue;
    usedCount.set(c.colorName, (usedCount.get(c.colorName) ?? 0) + 1);
  }
  const used = palette.filter((p) => usedCount.has(p.name));
  if (used.length <= 1) return { cells, mergedColorKinds: 0, changedCells: 0 };

  const parent = used.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < used.length; i++) {
    for (let j = i + 1; j < used.length; j++) {
      if (deltaE2000(used[i].lab, used[j].lab) <= threshold) unite(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < used.length; i++) {
    const root = find(i);
    const arr = groups.get(root) ?? [];
    arr.push(i);
    groups.set(root, arr);
  }

  const repByName = new Map<string, PaletteColor>();
  for (const members of groups.values()) {
    let rep = used[members[0]];
    let repCount = usedCount.get(rep.name) ?? 0;
    for (const idx of members) {
      const c = used[idx];
      const cnt = usedCount.get(c.name) ?? 0;
      if (cnt > repCount) {
        rep = c;
        repCount = cnt;
      }
    }
    for (const idx of members) repByName.set(used[idx].name, rep);
  }

  let changedCells = 0;
  const nextCells = cells.map((c) => {
    if (c.isEmpty) return c;
    const rep = repByName.get(c.colorName);
    if (!rep || rep.name === c.colorName) return c;
    changedCells += 1;
    return { ...c, colorName: rep.name, hex: rep.hex };
  });
  return { cells: nextCells, mergedColorKinds: used.length - groups.size, changedCells };
}

function median(arr: number[]) {
  if (!arr.length) return 0;
  arr.sort((a, b) => a - b);
  const m = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[m] : Math.round((arr[m - 1] + arr[m]) / 2);
}

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

function pickTextColor(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return y > 145 ? '#1a1a1a' : '#ffffff';
}

function toGrayHex(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const dim = Math.max(45, Math.min(230, y));
  const s = dim.toString(16).padStart(2, '0');
  return `#${s}${s}${s}`;
}

function euclidean(a: [number, number, number], b: [number, number, number]) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  let rr = r / 255;
  let gg = g / 255;
  let bb = b / 255;
  rr = rr > 0.04045 ? ((rr + 0.055) / 1.055) ** 2.4 : rr / 12.92;
  gg = gg > 0.04045 ? ((gg + 0.055) / 1.055) ** 2.4 : gg / 12.92;
  bb = bb > 0.04045 ? ((bb + 0.055) / 1.055) ** 2.4 : bb / 12.92;
  const x = rr * 0.4124 + gg * 0.3576 + bb * 0.1805;
  const y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  const z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505;
  return [x * 100, y * 100, z * 100];
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const refX = 95.047;
  const refY = 100.0;
  const refZ = 108.883;
  let xx = x / refX;
  let yy = y / refY;
  let zz = z / refZ;
  xx = xx > 0.008856 ? xx ** (1 / 3) : 7.787 * xx + 16 / 116;
  yy = yy > 0.008856 ? yy ** (1 / 3) : 7.787 * yy + 16 / 116;
  zz = zz > 0.008856 ? zz ** (1 / 3) : 7.787 * zz + 16 / 116;
  return [116 * yy - 16, 500 * (xx - yy), 200 * (yy - zz)];
}

function deltaE2000(lab1: [number, number, number], lab2: [number, number, number]) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const avgL = (L1 + L2) / 2;
  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (c1 + c2) / 2;
  const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const c1p = Math.sqrt(a1p * a1p + b1 * b1);
  const c2p = Math.sqrt(a2p * a2p + b2 * b2);
  const avgCp = (c1p + c2p) / 2;
  const h1p = hue(a1p, b1);
  const h2p = hue(a2p, b2);
  const dLp = L2 - L1;
  const dCp = c2p - c1p;
  const dhp = deltaHue(c1p, c2p, h1p, h2p);
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(((dhp * Math.PI) / 180) / 2);
  const avgHp = avgHue(c1p, c2p, h1p, h2p);
  const T =
    1 -
    0.17 * Math.cos(((avgHp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * avgHp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * avgHp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * avgHp - 63) * Math.PI) / 180);
  const dRo = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (avgL - 50) ** 2) / Math.sqrt(20 + (avgL - 50) ** 2);
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const Rt = -Math.sin((2 * dRo * Math.PI) / 180) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

function hue(a: number, b: number) {
  if (a === 0 && b === 0) return 0;
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}

function deltaHue(c1p: number, c2p: number, h1p: number, h2p: number) {
  if (c1p * c2p === 0) return 0;
  const d = h2p - h1p;
  if (Math.abs(d) <= 180) return d;
  return d > 180 ? d - 360 : d + 360;
}

function avgHue(c1p: number, c2p: number, h1p: number, h2p: number) {
  if (c1p * c2p === 0) return h1p + h2p;
  if (Math.abs(h1p - h2p) <= 180) return (h1p + h2p) / 2;
  const v = (h1p + h2p + 360) / 2;
  return v < 360 ? v : v - 360;
}

function csvSafe(v: string | number) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function safeFileName(v: string) {
  return String(v || 'project').replace(/[\\/:*?"<>|]+/g, '-');
}

function downloadBlob(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function downloadBytes(fileName: string, bytes: Uint8Array, type: string) {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy as unknown as BlobPart], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}





