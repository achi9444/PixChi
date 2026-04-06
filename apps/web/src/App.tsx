import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar, { type AppPage } from './components/TopBar';
import PalettePage from './components/PalettePage';
import MarketPage from './components/MarketPage';
import CreatorPage from './components/CreatorPage';
import UserProfilePage from './components/UserProfilePage';
import CreatorPublicPage from './components/CreatorPublicPage';
import PublishDesignModal from './components/PublishDesignModal';
import ExportModal, { type ExportMode } from './components/ExportModal';
import StatsPanel from './components/StatsPanel';
import CanvasPanel from './components/CanvasPanel';
import FloatingColorPanel from './components/FloatingColorPanel';
import FloatingConstructionPanel from './components/FloatingConstructionPanel';
import LeftSidebar from './components/LeftSidebar';
import { PUBLIC_PRICING_PRESET, COMPLEXITY_CAP_TIERS } from './config/pricing';
import { SHORTCUTS, SHORTCUT_LABELS } from './config/shortcuts';
import { createDraft, deleteDraft, getDraftLimit, getDraftSnapshot, listDrafts, renameDraft, setDraftVersionNote, updateDraft, type DraftSnapshot, type DraftSummary } from './services/draftStore';
import { loadCustomPaletteGroups, makeCustomPaletteId, saveCustomPaletteGroups, type CustomPaletteColor, type CustomPaletteGroup } from './services/customPaletteStore';
import { ApiClient, type AuthUser, type CustomPaletteGroupDto, type DraftSummaryDto, type PaletteApiGroupDetail, type UserSettingsDto } from './services/api';
import { loadAuthAccessToken, loadAuthRefreshToken, loadAuthUser, persistAuthAccessToken, persistAuthRefreshToken, persistAuthUser } from './services/authStorage';

import type { PaletteColor, PaletteGroup } from './types/palette';

type MatchStrategy = 'lab_nearest' | 'rgb_nearest';

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
  mode: string;
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

type CropChange = {
  before: CropRect | null;
  after: CropRect | null;
};

type BulkSnapshot = {
  imageBitmap?: ImageBitmap;
  imageDataUrl?: string;
  cropRect?: CropRect | null;
  converted?: Converted | null;
  cols?: number;
  rows?: number;
  imageMeta?: string;
  gridMeta?: string;
};

type ChangeBatch = {
  label: string;
  changes: CellChange[];
  cropChange?: CropChange;
  bulkChange?: { before: BulkSnapshot; after: BulkSnapshot };
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
const PRE_MERGE_DELTAE_MAX = 10;
const PIXCHI_META_PREFIX = 'PIXCHI_META_V1:';
const EMPTY_EDIT_COLOR_NAME = '__EMPTY__';
const EMPTY_EDIT_COLOR = { name: '無', hex: '#FFFFFF' };
const AUTO_SAVE_INTERVAL_MS = 3 * 60 * 1000;
const PDF_BEAD_MM = 2.6;
const SHORTCUTS_STORAGE_KEY = 'pixchi_shortcuts_v1';
const CONSTRUCTION_TEMPLATE_STORAGE_KEY = 'pixchi_construction_templates_v1';
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
  const s = shortcut.toLowerCase();
  // '+' 作為按鍵字元時，split('+') 會產生空字串，改用 lastIndexOf 解析
  let modPart: string;
  let key: string;
  if (s === '+') {
    modPart = '';
    key = '+';
  } else if (s.endsWith('++')) {
    modPart = s.slice(0, -2);
    key = '+';
  } else {
    const idx = s.lastIndexOf('+');
    modPart = idx === -1 ? '' : s.slice(0, idx);
    key = idx === -1 ? s : s.slice(idx + 1);
  }
  if (!!ev.ctrlKey !== modPart.includes('ctrl')) return false;
  if (!!ev.metaKey !== modPart.includes('meta')) return false;
  if (!!ev.shiftKey !== modPart.includes('shift')) return false;
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

function getPageFromHash(): AppPage {
  const hash = (typeof window !== 'undefined' ? window.location.hash : '').toLowerCase();
  if (hash.includes('palette')) return 'palette';
  if (hash.includes('market')) return 'market';
  if (hash.startsWith('#/c/')) return 'creator-public';
  if (hash.includes('creator')) return 'creator';
  if (hash.includes('profile')) return 'profile';
  return 'main';
}

function getCreatorPublicUsernameFromHash(): string {
  const hash = (typeof window !== 'undefined' ? window.location.hash : '');
  const m = hash.match(/^#\/c\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : '';
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const colorMenuRef = useRef<HTMLDivElement | null>(null);
  const focusColorMenuRef = useRef<HTMLDivElement | null>(null);
  const constructionListRef = useRef<HTMLDivElement | null>(null);
  const constructionItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const renderMetaRef = useRef({ ox: 0, oy: 0, cell: 1, viewStartCol: 0, viewStartRow: 0, viewCols: 1, viewRows: 1 });
  const hoverCellRef = useRef<{ col: number; row: number } | null>(null);
  const imagePreviewMetaRef = useRef({ ox: 0, oy: 0, scale: 1, drawW: 0, drawH: 0 });
  const isPointerDownRef = useRef(false);
  const lastDragCellIdxRef = useRef<number | null>(null);
  const panLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const cropDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const cropDragModeRef = useRef<CropDragMode | null>(null);
  const cropStartRectRef = useRef<CropRect | null>(null);
  const isCropDraggingRef = useRef(false);
  const cropRectRef = useRef<CropRect | null>(null);
  const pushCropUndoRef = useRef<((b: CropRect | null, a: CropRect | null) => void) | null>(null);
  const isApplyingDraftRef = useRef(false);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [page, setPage] = useState<AppPage>(() => getPageFromHash());
  const [creatorPublicUsername, setCreatorPublicUsername] = useState<string>(() => getCreatorPublicUsernameFromHash());
  const [paletteTab, setPaletteTab] = useState<'builtin' | 'custom'>('builtin');
  const [builtinPreviewGroupName, setBuiltinPreviewGroupName] = useState('');
  const [paletteNewGroupName, setPaletteNewGroupName] = useState('');
  const [paletteEditGroupId, setPaletteEditGroupId] = useState('');
  const [paletteNewColorName, setPaletteNewColorName] = useState('');
  const [paletteNewColorHex, setPaletteNewColorHex] = useState('#ffffff');
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState('-');
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [gridCropRect, setGridCropRect] = useState<CropRect | null>(null);
  const gridCropDragRef = useRef<{ mode: string; startX: number; startY: number; startRect: CropRect } | null>(null);

  const [cols, setCols] = useState(32);
  const [rows, setRows] = useState(32);
  const strategy: MatchStrategy = 'lab_nearest';
  const [preMergeDeltaE, setPreMergeDeltaE] = useState(0);
  const [showCode, setShowCode] = useState(true);
  const [exportScale, setExportScale] = useState<1 | 2 | 3>(2);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('pdf');
  const [cropToolEnabled, setCropToolEnabled] = useState(true);
  const [cropHoverMode, setCropHoverMode] = useState<CropDragMode | null>(null);
  const [editTool, setEditTool] = useState<'pan' | 'paint' | 'erase' | 'bucket' | 'picker'>('pan');
  const selectEditTool = (tool: 'pan' | 'paint' | 'erase' | 'bucket' | 'picker') => {
    setEditTool(tool);
    // 切換編輯工具時，若格點裁剪啟用，自動取消
    if (cropToolEnabled && converted) {
      setCropToolEnabled(false);
      setGridCropRect(null);
    }
  };
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
  const [creatorAvatarImage, setCreatorAvatarImage] = useState<string | null>(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishPreviewUrl, setPublishPreviewUrl] = useState('');
  const [publishDefaultWatermark, setPublishDefaultWatermark] = useState('');
  const [showRuler, setShowRuler] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideEvery, setGuideEvery] = useState(5);

  const [paletteSearch, setPaletteSearch] = useState('');
  const [editColorName, setEditColorName] = useState('');
  const [editColorMenuOpen, setEditColorMenuOpen] = useState(false);
  const [colorPanelVisible, setColorPanelVisible] = useState(false);
  const [constructionPanelVisible, setConstructionPanelVisible] = useState(false);
  const [panelStack, setPanelStack] = useState<Array<'color' | 'construction'>>([]);
  const bringPanelToFront = useCallback((id: 'color' | 'construction') => {
    setPanelStack(prev => [...prev.filter(p => p !== id), id]);
  }, []);
  const [sidebarCollapseSignal, setSidebarCollapseSignal] = useState(0);
  const [focusMaskEnabled, setFocusMaskEnabled] = useState(false);
  const [beadCircleMode, setBeadCircleMode] = useState(false);
  const [focusColorName, setFocusColorName] = useState('');
  const [focusColorSearch, setFocusColorSearch] = useState('');
  const [focusColorMenuOpen, setFocusColorMenuOpen] = useState(false);
  const [focusNeighborEnabled, setFocusNeighborEnabled] = useState(false);
  const [focusNeighborDeltaE, setFocusNeighborDeltaE] = useState(10);
  const [statsSearch, setStatsSearch] = useState('');
  const [mergeThreshold, setMergeThreshold] = useState(3);
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
  const [constructionTemplateName, setConstructionTemplateName] = useState('');
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
    const onHash = () => {
      setPage(getPageFromHash());
      setCreatorPublicUsername(getCreatorPublicUsernameFromHash());
    };
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

  // 合併相近色預覽：以顆數最多的色為代表，貪婪分組
  const mergeGroups = useMemo(() => {
    if (!mergeThreshold || !statsRows.length) return [];
    const visited = new Set<string>();
    const groups: { rep: { name: string; hex: string; count: number }; merged: { name: string; hex: string; count: number }[] }[] = [];
    for (const rep of statsRows) {
      if (visited.has(rep.name)) continue;
      visited.add(rep.name);
      const repLab = rgbToLab(...hexToRgb(rep.hex));
      const merged: { name: string; hex: string; count: number }[] = [];
      for (const other of statsRows) {
        if (visited.has(other.name)) continue;
        const d = deltaE2000(repLab, rgbToLab(...hexToRgb(other.hex)));
        if (d <= mergeThreshold) {
          visited.add(other.name);
          merged.push({ name: other.name, hex: other.hex, count: other.count });
        }
      }
      if (merged.length > 0) groups.push({ rep: { name: rep.name, hex: rep.hex, count: rep.count }, merged });
    }
    return groups;
  }, [statsRows, mergeThreshold]);

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
    if (constructionStrategy === 'block') return constructionBaseTasks;
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

  // 載入 / 更新創作者大頭貼
  const refreshCreatorAvatar = useCallback(() => {
    if (!proMode) { setCreatorAvatarImage(null); return; }
    apiClient.getCreatorProfile().then((p) => setCreatorAvatarImage(p.avatarImage ?? null)).catch(() => {});
  }, [apiClient, proMode]);

  useEffect(() => {
    refreshCreatorAvatar();
  }, [refreshCreatorAvatar]);

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
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
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
      setStatusText('色庫已就緒。');
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
      setStatusText('色庫已就緒。');
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

  const registerByForm = useCallback(async (username: string, password: string) => {
    if (authBusy) return;
    setAuthBusy(true);
    setLoginErrorText('');
    try {
      const data = await apiClient.register(username, password);
      if (!data.accessToken || !data.refreshToken || !data.user) throw new Error('註冊回應不完整');
      setAuthAccessToken(data.accessToken);
      setAuthRefreshToken(data.refreshToken);
      setAuthUser(data.user);
      setStatusText(`註冊成功，歡迎 ${data.user.username}！`);
      setAuthPanelOpen(false);
    } catch (err) {
      const raw = (err as Error).message ?? '';
      const msgMap: Record<string, string> = {
        'USERNAME_TAKEN:': '此帳號名稱已被使用',
        'INVALID_USERNAME:': '帳號只能使用小寫英文、數字、底線，長度 3-20 字元',
        'WEAK_PASSWORD:': '密碼至少需要 6 個字元',
      };
      const friendly = Object.entries(msgMap).find(([k]) => raw.startsWith(k))?.[1];
      const msg = friendly ?? `註冊失敗：${raw}`;
      setLoginErrorText(msg);
      setStatusText(msg);
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, apiClient]);

  const openPublishModal = useCallback(async () => {
    if (!converted) return;
    // 產生乾淨預覽圖（無格線、無色號）
    const PREVIEW_MAX = 512;
    const cols = converted.cols;
    const rows = converted.rows;
    const cell = Math.max(1, Math.floor(PREVIEW_MAX / Math.max(cols, rows)));
    const offscreen = document.createElement('canvas');
    offscreen.width = cols * cell;
    offscreen.height = rows * cell;
    const ctx = offscreen.getContext('2d')!;
    for (const c of converted.cells) {
      if (!c || c.isEmpty) continue;
      ctx.fillStyle = c.hex;
      ctx.fillRect(c.x * cell, c.y * cell, cell, cell);
    }
    const dataUrl = offscreen.toDataURL('image/jpeg', 0.85);
    // 取得創作者浮水印預設文字
    let defaultWatermark = authUser?.username ?? '';
    try {
      const profile = await apiClient.getCreatorProfile();
      if (profile.watermarkText) defaultWatermark = profile.watermarkText;
    } catch {
      // fallback to username
    }
    setPublishPreviewUrl(dataUrl);
    setPublishDefaultWatermark(defaultWatermark);
    setPublishModalOpen(true);
  }, [converted, authUser, apiClient]);

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
      mode: 'fit',
      strategy,
      preMergeDeltaE,
      showCode,
      exportScale,
      cropToolEnabled,
      cropRect,
      imageDataUrl,
      imageMeta,
      gridMeta,
      converted,
      constructionMode,
      constructionStrategy,
      constructionOrderRule,
      constructionCustomOrder,
      constructionShowDoneOverlay,
      constructionDoneMap,
    };
  }, [projectName, activeGroupName, cols, rows, strategy, preMergeDeltaE, showCode, exportScale, cropToolEnabled, cropRect, imageDataUrl, imageMeta, gridMeta, converted, constructionMode, constructionStrategy, constructionOrderRule, constructionCustomOrder, constructionShowDoneOverlay, constructionDoneMap]);

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
        // mode removed — always 'fit' now
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
        setConstructionMode(!!snapshot.constructionMode);
        setConstructionStrategy((snapshot.constructionStrategy as 'block' | 'color') ?? 'color');
        setConstructionOrderRule((snapshot.constructionOrderRule as ConstructionOrderRule) ?? 'count_desc');
        setConstructionCustomOrder(snapshot.constructionCustomOrder ?? []);
        setConstructionShowDoneOverlay(snapshot.constructionShowDoneOverlay ?? true);
        setConstructionDoneMap(snapshot.constructionDoneMap ?? {});
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
    if (!colors.some((c) => c.name === editColorName)) setEditColorName(EMPTY_EDIT_COLOR_NAME);
  }, [activeGroup, editColorName]);

  useEffect(() => {
    if (!focusColorName) return;
    if (!statsRows.some((r) => r.name === focusColorName)) setFocusColorName('');
  }, [statsRows, focusColorName]);

  useEffect(() => {
    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as Node;
      // Portal dropdowns render outside the ref — skip close if clicking inside one
      const inPortal = (target instanceof HTMLElement || target instanceof SVGElement)
        && target.closest('.color-select-menu-portal');
      if (colorMenuRef.current && !colorMenuRef.current.contains(target) && !inPortal) {
        setEditColorMenuOpen(false);
      }
      if (focusColorMenuRef.current && !focusColorMenuRef.current.contains(target) && !inPortal) {
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

    if (!converted) {
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
        // 超出圖片的區域（裁切框範圍內但在圖片外）用淺灰表示
        const imgLeft = ox;
        const imgTop = oy;
        const imgRight = ox + drawW;
        const imgBottom = oy + drawH;
        ctx.fillStyle = 'rgba(200, 200, 200, 0.4)';
        if (cx < imgLeft) ctx.fillRect(cx, Math.max(cy, imgTop), Math.min(imgLeft - cx, cw), Math.min(ch, imgBottom - Math.max(cy, imgTop)));
        if (cropRight > imgRight) ctx.fillRect(Math.max(cx, imgRight), Math.max(cy, imgTop), cropRight - Math.max(cx, imgRight), Math.min(ch, imgBottom - Math.max(cy, imgTop)));
        if (cy < imgTop) ctx.fillRect(cx, cy, cw, Math.min(imgTop - cy, ch));
        if (cropBottom > imgBottom) ctx.fillRect(cx, Math.max(cy, imgBottom), cw, cropBottom - Math.max(cy, imgBottom));

        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        // Draw 4 masks around crop area (do not clear image pixels).
        const clampCx = Math.max(ox, cx);
        const clampCy = Math.max(oy, cy);
        const clampCRight = Math.min(right, cropRight);
        const clampCBottom = Math.min(bottom, cropBottom);
        ctx.fillRect(ox, oy, drawW, Math.max(0, clampCy - oy)); // top
        ctx.fillRect(ox, clampCy, Math.max(0, clampCx - ox), Math.max(0, clampCBottom - clampCy)); // left
        ctx.fillRect(clampCRight, clampCy, Math.max(0, right - clampCRight), Math.max(0, clampCBottom - clampCy)); // right
        ctx.fillRect(ox, clampCBottom, drawW, Math.max(0, bottom - clampCBottom)); // bottom
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
    const cell = Math.max(1, baseCell * zoom);
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
      const isDimmed = showConstruction && constructionCurrentCellSet.size > 0
        ? !c.isEmpty && !constructionCurrentCellSet.has(srcIdx)
        : focusMaskEnabled && hasFocus && !c.isEmpty && !focusMatch;
      ctx.fillStyle = c.hex;
      if (beadCircleMode) {
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, cell, cell);
      }
      if (isDimmed) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.80)';
        if (beadCircleMode) {
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, cell, cell);
        }
      }
      if (!fastRender && !beadCircleMode) {
        ctx.strokeStyle = '#dbe5df';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cell, cell);
      }

      if (showConstruction) {
        if (constructionShowDoneOverlay && constructionDoneCellSet.has(srcIdx)) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.60)';
          if (beadCircleMode) {
            ctx.beginPath();
            ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, cell, cell);
          }
        }
        if (constructionCurrentCellSet.has(srcIdx)) {
          const dash = Math.max(2, Math.round(cell * 0.18));
          const lw = Math.max(1.5, Math.min(3, cell * 0.14));
          const rx = x + 0.5, ry = y + 0.5, rw = Math.max(0, cell - 1), rh = Math.max(0, cell - 1);
          ctx.save();
          ctx.lineWidth = lw;
          ctx.setLineDash([dash, dash]);
          ctx.lineDashOffset = 0;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.lineDashOffset = dash;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.restore();
        }
      }

      if (focusOutlineEnabled && hasFocus && focusMatch && !c.isEmpty) {
        const dash = Math.max(2, Math.round(cell * 0.18));
        const lw = Math.max(1.5, Math.min(3, cell * 0.14));
        const rx = x + 0.5, ry = y + 0.5, rw = Math.max(0, cell - 1), rh = Math.max(0, cell - 1);
        ctx.save();
        ctx.lineWidth = lw;
        ctx.setLineDash([dash, dash]);
        ctx.lineDashOffset = 0;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.lineDashOffset = dash;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.restore();
      }

      if (!fastRender && showCode && cell >= 8 && !c.isEmpty) {
        const isHighlighted = showConstruction && constructionCurrentCellSet.size > 0
          ? constructionCurrentCellSet.has(srcIdx)
          : hasFocus && focusMatch;
        if (isHighlighted) {
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
        ctx.fillStyle = isDimmed ? 'rgba(180, 180, 180, 0.5)' : pickTextColor(c.hex);
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
    if (showGuide) {
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

    if (showRuler) {
      ctx.save();
      const RULER = Math.max(20, Math.min(32, cell * 1.5));  // 固定帶寬，貼近格線
      const gridPxW = viewCols * cell;
      const gridPxH = viewRows * cell;
      const rightX = ox + gridPxW;
      const bottomY = oy + gridPxH;
      // 尺規背景帶（緊貼格線四邊）
      ctx.fillStyle = '#ffffffd9';
      ctx.fillRect(ox, oy - RULER, gridPxW, RULER);           // top
      ctx.fillRect(ox - RULER, oy, RULER, gridPxH);           // left
      ctx.fillRect(rightX, oy, RULER, gridPxH);               // right
      ctx.fillRect(ox, bottomY, gridPxW, RULER);              // bottom
      // 標籤
      ctx.fillStyle = '#465a52';
      ctx.font = `${Math.max(9, Math.min(12, Math.floor(RULER * 0.5)))}px Segoe UI`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      for (let gx = 0; gx <= viewCols; gx += guideStep) {
        const x = ox + gx * cell;
        const label = String(viewStartCol + gx);
        ctx.fillText(label, x, oy - RULER / 2);               // top
        ctx.fillText(label, x, bottomY + RULER / 2);          // bottom
      }
      for (let gy = 0; gy <= viewRows; gy += guideStep) {
        const y = oy + gy * cell;
        const label = String(viewStartRow + gy);
        ctx.textAlign = 'center';
        ctx.fillText(label, ox - RULER / 2, y);               // left
        ctx.fillText(label, rightX + RULER / 2, y);           // right
      }
      ctx.restore();
    }

    // ── 筆刷預覽（方塊型）──
    const hover = hoverCellRef.current;
    if (hover && converted && (editTool === 'paint' || editTool === 'erase')) {
      const meta = renderMetaRef.current;
      const half = Math.floor((brushSize - 1) / 2);
      const startCol = Math.max(0, hover.col - half);
      const startRow = Math.max(0, hover.row - half);
      const endCol = Math.min(converted.cols - 1, hover.col - half + brushSize - 1);
      const endRow = Math.min(converted.rows - 1, hover.row - half + brushSize - 1);
      const px = meta.ox + (startCol - meta.viewStartCol) * meta.cell;
      const py = meta.oy + (startRow - meta.viewStartRow) * meta.cell;
      const pw = (endCol - startCol + 1) * meta.cell;
      const ph = (endRow - startRow + 1) * meta.cell;

      if (editTool === 'paint' && selectedEditColor) {
        ctx.fillStyle = selectedEditColor.hex + '55';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = selectedEditColor.hex;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = '#888';
      }
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    }

    // ── Grid Crop 覆蓋層 ──
    if (gridCropRect && converted && cropToolEnabled) {
      const meta = renderMetaRef.current;
      const { ox: mox, oy: moy, cell: mcell, viewStartCol: vsc, viewStartRow: vsr, viewCols: vc, viewRows: vr } = meta;
      const gcx = gridCropRect.x;
      const gcy = gridCropRect.y;
      const gcw = gridCropRect.w;
      const gch = gridCropRect.h;
      const cropPx = mox + (gcx - vsc) * mcell;
      const cropPy = moy + (gcy - vsr) * mcell;
      const cropPw = gcw * mcell;
      const cropPh = gch * mcell;

      // ── 超出格線的擴展區域：繪製空白格子 ──
      const gridPx = mox;
      const gridPy = moy;
      const gridPw = vc * mcell;
      const gridPh = vr * mcell;
      const gridRight = gridPx + gridPw;
      const gridBottom = gridPy + gridPh;
      const cropRight = cropPx + cropPw;
      const cropBottom = cropPy + cropPh;
      // 計算超出的範圍並畫空白格子
      const extRegions: { px: number; py: number; cols: number; rows: number }[] = [];
      // 上方擴展
      if (gcy < 0) {
        const extRows = Math.min(-gcy, gch);
        extRegions.push({ px: cropPx, py: cropPy, cols: gcw, rows: extRows });
      }
      // 下方擴展
      if (gcy + gch > converted.rows) {
        const extStart = Math.max(0, converted.rows - gcy);
        const extRows = gch - extStart;
        extRegions.push({ px: cropPx, py: cropPy + extStart * mcell, cols: gcw, rows: extRows });
      }
      // 左方擴展（僅中間行）
      if (gcx < 0) {
        const topClip = Math.max(0, -gcy);
        const bottomClip = Math.max(0, gcy + gch - converted.rows);
        const midRows = gch - topClip - bottomClip;
        if (midRows > 0) {
          const extCols = Math.min(-gcx, gcw);
          extRegions.push({ px: cropPx, py: cropPy + topClip * mcell, cols: extCols, rows: midRows });
        }
      }
      // 右方擴展（僅中間行）
      if (gcx + gcw > converted.cols) {
        const topClip = Math.max(0, -gcy);
        const bottomClip = Math.max(0, gcy + gch - converted.rows);
        const midRows = gch - topClip - bottomClip;
        if (midRows > 0) {
          const extStart = Math.max(0, converted.cols - gcx);
          const extCols = gcw - extStart;
          extRegions.push({ px: cropPx + extStart * mcell, py: cropPy + topClip * mcell, cols: extCols, rows: midRows });
        }
      }
      for (const reg of extRegions) {
        // 白底
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(reg.px, reg.py, reg.cols * mcell, reg.rows * mcell);
        // 格線
        ctx.strokeStyle = '#dbe5df';
        ctx.lineWidth = 1;
        for (let ey = 0; ey < reg.rows; ey++) {
          for (let ex = 0; ex < reg.cols; ex++) {
            ctx.strokeRect(reg.px + ex * mcell, reg.py + ey * mcell, mcell, mcell);
          }
        }
      }

      // ── 被裁掉區域的半透明遮罩 ──
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      if (cropPy > gridPy) ctx.fillRect(gridPx, gridPy, gridPw, Math.min(cropPy - gridPy, gridPh));
      if (cropBottom < gridBottom) ctx.fillRect(gridPx, Math.max(cropBottom, gridPy), gridPw, gridBottom - Math.max(cropBottom, gridPy));
      const midTop = Math.max(cropPy, gridPy);
      const midBot = Math.min(cropBottom, gridBottom);
      if (midBot > midTop) {
        if (cropPx > gridPx) ctx.fillRect(gridPx, midTop, Math.min(cropPx - gridPx, gridPw), midBot - midTop);
        if (cropRight < gridRight) ctx.fillRect(Math.max(cropRight, gridPx), midTop, gridRight - Math.max(cropRight, gridPx), midBot - midTop);
      }

      // ── 裁切框線 ──
      ctx.strokeStyle = '#d66d5b';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(cropPx, cropPy, cropPw, cropPh);
      ctx.setLineDash([]);
      // 角落把手
      const hs = 6;
      ctx.fillStyle = '#d66d5b';
      const corners = [
        [cropPx, cropPy], [cropPx + cropPw, cropPy],
        [cropPx, cropPy + cropPh], [cropPx + cropPw, cropPy + cropPh],
      ];
      for (const [hx, hy] of corners) {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
      const midPoints = [
        [cropPx + cropPw / 2, cropPy], [cropPx + cropPw / 2, cropPy + cropPh],
        [cropPx, cropPy + cropPh / 2], [cropPx + cropPw, cropPy + cropPh / 2],
      ];
      for (const [hx, hy] of midPoints) {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }

      // ── 尺寸標示 ──
      const dimLabel = `${gcw} × ${gch}`;
      ctx.save();
      ctx.font = 'bold 13px sans-serif';
      const tm = ctx.measureText(dimLabel);
      const labelW = tm.width + 12;
      const labelH = 22;
      const labelX = cropPx + cropPw / 2 - labelW / 2;
      const labelY = cropPy + cropPh / 2 - labelH / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelW, labelH, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dimLabel, cropPx + cropPw / 2, cropPy + cropPh / 2);
      ctx.restore();
    }
  }, [converted, imageBitmap, cropRect, cropToolEnabled, cropHoverMode, showCode, focusColorName, focusVisibleNameSet, focusMaskEnabled, zoom, panOffset.x, panOffset.y, proMode, showGuide, showRuler, guideEvery, largeGridMode, selectedLargeTile, constructionMode, constructionTasks.length, constructionShowDoneOverlay, constructionDoneCellSet, constructionCurrentCellSet, editTool, brushSize, selectedEditColor, gridCropRect, beadCircleMode]);

  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  useEffect(() => {
    const onResize = () => drawGrid();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [drawGrid]);

  // 監聽 canvas-wrap 尺寸變化（sidebar panel 展開/收合時 layout 會改變但不觸發 window.resize）
  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => drawGrid());
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [drawGrid]);

  useEffect(() => {
    if (page === 'main') {
      const raf = requestAnimationFrame(() => drawGrid());
      return () => cancelAnimationFrame(raf);
    }
  }, [page, drawGrid]);

  useEffect(() => {
    const onMouseUp = () => {
      if (isCropDraggingRef.current && cropStartRectRef.current) {
        const before = cropStartRectRef.current;
        const after = cropRectRef.current;
        const changed = !after || !before ||
          before.x !== after.x || before.y !== after.y ||
          before.w !== after.w || before.h !== after.h;
        if (changed) pushCropUndoRef.current?.(before, after);
      }
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
  }, [page]);

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
    setSidebarCollapseSignal((s) => s + 1);
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
        const isOverflow = cropRect.x < 0 || cropRect.y < 0 ||
          cropRect.x + cropRect.w > imageBitmap.width ||
          cropRect.y + cropRect.h > imageBitmap.height;
        if (isOverflow) {
          const padCanvas = document.createElement('canvas');
          padCanvas.width = cropRect.w;
          padCanvas.height = cropRect.h;
          const pctx = padCanvas.getContext('2d')!;
          pctx.fillStyle = '#FFFFFF';
          pctx.fillRect(0, 0, cropRect.w, cropRect.h);
          pctx.drawImage(imageBitmap, -cropRect.x, -cropRect.y);
          sourceBitmap = await createImageBitmap(padCanvas);
        } else {
          sourceBitmap = await createImageBitmap(imageBitmap, cropRect.x, cropRect.y, cropRect.w, cropRect.h);
        }
      }

      const fixDim = options?.overrideCols != null ? 'cols' : options?.overrideRows != null ? 'rows' : undefined;
      const dims = adjustGridByMode(safeCols, safeRows, sourceBitmap.width, sourceBitmap.height, fixDim);
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
      const { processedCanvas, info } = buildProcessedCanvas(sourceBitmap, finalCols, finalRows);

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
        mode: 'fit',
        sourceW: sourceBitmap.width,
        sourceH: sourceBitmap.height,
        processInfo: info,
        cells
      });
      setCols(finalCols);
      setRows(finalRows);
      setGridMeta(`格線：${finalCols} x ${finalRows} (fit)`);
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
      setSidebarCollapseSignal((s) => s + 1);
    } finally {
      setTimeout(() => setConvertProgress({ running: false, phase: '', percent: 0 }), 350);
    }
  };

  const createBlankCanvas = (opts?: { cols?: number; rows?: number; name?: string }) => {
    const finalCols = clampInt(opts?.cols ?? cols, 1, MAX_GRID_SIZE);
    const finalRows = clampInt(opts?.rows ?? rows, 1, MAX_GRID_SIZE);
    if (finalCols * finalRows > GRID_SOFT_LIMIT) {
      setStatusText(`格數超過建議上限 ${GRID_SOFT_LIMIT.toLocaleString()}，請縮小尺寸。`);
      return;
    }
    const cells: Cell[] = [];
    for (let y = 0; y < finalRows; y++)
      for (let x = 0; x < finalCols; x++)
        cells.push({ x, y, rgb: [255, 255, 255], colorName: '', hex: '#FFFFFF', isEmpty: true });

    if (opts?.name) setProjectName(opts.name);
    setConverted({ cols: finalCols, rows: finalRows, mode: 'fit', sourceW: 0, sourceH: 0, processInfo: 'blank', cells });
    setCols(finalCols);
    setRows(finalRows);
    setUndoStack([]);
    setRedoStack([]);
    setHistoryItems([]);
    setCropToolEnabled(false);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setLargeGridMode(false);
    setOversizePlan(null);
    setGridMeta(`${finalCols} x ${finalRows}（空白畫布）`);
    setImageMeta('無來源圖');
    setStatusText(`已建立 ${finalCols}×${finalRows} 空白畫布。`);
    setSidebarCollapseSignal((s) => s + 1);
  };

  const resizeCanvas = (newCols: number, newRows: number) => {
    if (!converted) return;
    const clampedCols = clampInt(newCols, 1, MAX_GRID_SIZE);
    const clampedRows = clampInt(newRows, 1, MAX_GRID_SIZE);
    if (clampedCols * clampedRows > GRID_SOFT_LIMIT) return;
    const oldCells = converted.cells;
    const oldCols = converted.cols;
    const oldRows = converted.rows;
    const sizeLabel = converted.processInfo === 'blank' ? '空白畫布' : '已調整尺寸';
    const before: BulkSnapshot = {
      converted,
      cols: oldCols,
      rows: oldRows,
      gridMeta: `${oldCols} x ${oldRows}（${sizeLabel}）`,
    };
    // Nearest-neighbor scaling: sample from old grid proportionally
    const newCells: Cell[] = [];
    for (let y = 0; y < clampedRows; y++) {
      for (let x = 0; x < clampedCols; x++) {
        const srcX = Math.min(Math.round(x * oldCols / clampedCols), oldCols - 1);
        const srcY = Math.min(Math.round(y * oldRows / clampedRows), oldRows - 1);
        newCells.push({ ...oldCells[srcY * oldCols + srcX], x, y });
      }
    }
    const newConverted = { ...converted, cols: clampedCols, rows: clampedRows, cells: newCells };
    const newGridMeta = `${clampedCols} x ${clampedRows}（${sizeLabel}）`;
    const after: BulkSnapshot = { converted: newConverted, cols: clampedCols, rows: clampedRows, gridMeta: newGridMeta };
    setConverted(newConverted);
    setCols(clampedCols);
    setRows(clampedRows);
    setGridMeta(newGridMeta);
    setUndoStack((prev) => [...prev, { changes: [], label: `調整尺寸：${clampedCols} x ${clampedRows}`, bulkChange: { before, after } }]);
    setRedoStack([]);
    addHistory(`調整尺寸：${clampedCols} x ${clampedRows}`);
  };

  const applyImageCrop = async () => {
    if (!imageBitmap || !cropRect) return;
    const { x, y, w, h } = cropRect;
    const isOverflow = x < 0 || y < 0 || x + w > imageBitmap.width || y + h > imageBitmap.height;
    let newBitmap: ImageBitmap;
    let cropCanvas: HTMLCanvasElement | null = null;
    if (isOverflow) {
      cropCanvas = document.createElement('canvas');
      cropCanvas.width = w;
      cropCanvas.height = h;
      const pctx = cropCanvas.getContext('2d')!;
      pctx.fillStyle = '#FFFFFF';
      pctx.fillRect(0, 0, w, h);
      pctx.drawImage(imageBitmap, -x, -y);
      newBitmap = await createImageBitmap(cropCanvas);
    } else {
      newBitmap = await createImageBitmap(imageBitmap, x, y, w, h);
    }
    const offscreen = cropCanvas ?? (() => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(newBitmap, 0, 0);
      return c;
    })();
    const newDataUrl = offscreen.toDataURL('image/webp', 0.9) || offscreen.toDataURL('image/png');
    const before: BulkSnapshot = { imageBitmap, imageDataUrl: imageDataUrl ?? undefined, cropRect, converted, cols, rows, imageMeta, gridMeta };
    const newCropRect: CropRect = { x: 0, y: 0, w, h };
    const after: BulkSnapshot = { imageBitmap: newBitmap, imageDataUrl: newDataUrl, cropRect: newCropRect, converted: null, cols: w, rows: h, imageMeta: `來源圖：${w} x ${h}（已裁切）`, gridMeta: '-' };
    setImageBitmap(newBitmap);
    setImageDataUrl(newDataUrl);
    setCropRect(newCropRect);
    setCols(w);
    setRows(h);
    setConverted(null);
    setGridMeta('-');
    setUndoStack((prev) => [...prev, { changes: [], label: '套用裁切', bulkChange: { before, after } }]);
    setRedoStack([]);
    setImageMeta(`來源圖：${w} x ${h}（已裁切）`);
    setStatusText(`已套用裁切：${w} x ${h}`);
  };

  const applyGridCrop = () => {
    if (!converted || !gridCropRect) return;
    const { x: cx, y: cy, w: cw, h: ch } = gridCropRect;
    const newCols = clampInt(cw, 1, MAX_GRID_SIZE);
    const newRows = clampInt(ch, 1, MAX_GRID_SIZE);
    if (newCols * newRows > GRID_SOFT_LIMIT) {
      setStatusText(`裁切後格數 ${newCols * newRows} 超過上限 ${GRID_SOFT_LIMIT}，請縮小範圍。`);
      return;
    }
    const oldCells = converted.cells;
    const oldCols = converted.cols;
    const oldRows = converted.rows;
    const newCells: Cell[] = [];
    for (let row = 0; row < newRows; row++) {
      for (let col = 0; col < newCols; col++) {
        const srcCol = cx + col;
        const srcRow = cy + row;
        if (srcCol >= 0 && srcCol < oldCols && srcRow >= 0 && srcRow < oldRows) {
          const srcCell = oldCells[srcRow * oldCols + srcCol];
          newCells.push({ ...srcCell, x: col, y: row });
        } else {
          newCells.push({ x: col, y: row, rgb: [255, 255, 255], colorName: '', hex: '#FFFFFF', isEmpty: true });
        }
      }
    }
    const before: BulkSnapshot = { converted, cols, rows, gridMeta };
    const newConverted = { ...converted, cols: newCols, rows: newRows, cells: newCells };
    const after: BulkSnapshot = { converted: newConverted, cols: newCols, rows: newRows, gridMeta: `${newCols} x ${newRows}` };
    setConverted(newConverted);
    setCols(newCols);
    setRows(newRows);
    setGridCropRect(null);
    setCropToolEnabled(false);
    setGridMeta(`${newCols} x ${newRows}`);
    setStatusText(`已套用格線裁切：${newCols} x ${newRows}`);
    setUndoStack((prev) => [...prev, { changes: [], label: '套用格線裁切', bulkChange: { before, after } }]);
    setRedoStack([]);
  };

  // Enter 套用裁切 / Esc 取消裁切
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' && ev.key !== 'Escape') return;
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (isCropDraggingRef.current) return; // 拖曳中由另一個 handler 處理

      // 轉換後格線裁切模式（優先）
      if (gridCropRect && converted && cropToolEnabled) {
        ev.preventDefault();
        if (ev.key === 'Enter') {
          applyGridCrop();
        } else {
          setGridCropRect(null);
        }
        return;
      }

      // 轉換前圖片裁切模式
      if (cropToolEnabled && imageBitmap && !converted) {
        const isTrimmed = cropRect && (
          cropRect.x !== 0 || cropRect.y !== 0 ||
          cropRect.w !== imageBitmap.width || cropRect.h !== imageBitmap.height
        );
        if (!isTrimmed) return;
        ev.preventDefault();
        if (ev.key === 'Enter') {
          void applyImageCrop();
        } else {
          setCropRect({ x: 0, y: 0, w: imageBitmap.width, h: imageBitmap.height });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cropToolEnabled, imageBitmap, cropRect, gridCropRect, converted]);

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

  const pushCropUndo = (before: CropRect | null, after: CropRect | null) => {
    setUndoStack((prev) => [...prev, { changes: [], label: '調整裁切範圍', cropChange: { before, after } }]);
    setRedoStack([]);
    addHistory('調整裁切範圍');
  };
  pushCropUndoRef.current = pushCropUndo;
  cropRectRef.current = cropRect;

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

  const getCellCoordsFromPointer = (clientX: number, clientY: number): { col: number; row: number; canvasX: number; canvasY: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const { ox, oy, cell: mcell, viewStartCol, viewStartRow } = renderMetaRef.current;
    const col = viewStartCol + Math.floor((x - ox) / mcell);
    const row = viewStartRow + Math.floor((y - oy) / mcell);
    return { col, row, canvasX: x, canvasY: y };
  };

  const getGridCropDragMode = (col: number, row: number): CropDragMode | null => {
    if (!gridCropRect) return null;
    const { x: gx, y: gy, w: gw, h: gh } = gridCropRect;
    const right = gx + gw;
    const bottom = gy + gh;
    const edgeTol = 1; // 1 cell tolerance
    const nearL = Math.abs(col - gx) <= edgeTol;
    const nearR = Math.abs(col - right) <= edgeTol;
    const nearT = Math.abs(row - gy) <= edgeTol;
    const nearB = Math.abs(row - bottom) <= edgeTol;
    if (nearT && nearL) return 'nw';
    if (nearT && nearR) return 'ne';
    if (nearB && nearL) return 'sw';
    if (nearB && nearR) return 'se';
    if (nearT && col > gx && col < right) return 'n';
    if (nearB && col > gx && col < right) return 's';
    if (nearL && row > gy && row < bottom) return 'w';
    if (nearR && row > gy && row < bottom) return 'e';
    if (col > gx && col < right && row > gy && row < bottom) return 'move';
    return 'new';
  };

  const getPreviewPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !imageBitmap) return null;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (clientY - rect.top) * (canvas.height / rect.height);
    const meta = imagePreviewMetaRef.current;
    const imageX = Math.floor((canvasX - meta.ox) / meta.scale);
    const imageY = Math.floor((canvasY - meta.oy) / meta.scale);
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
    // 允許超出但限制最大延伸
    const maxExtend = Math.max(bitmap.width, bitmap.height);
    l = Math.max(-maxExtend, l);
    r = Math.min(bitmap.width + maxExtend - 1, r);
    t = Math.max(-maxExtend, t);
    b = Math.min(bitmap.height + maxExtend - 1, b);
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
    if (gridCropRect && converted && cropToolEnabled) return;
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
    if (cropToolEnabled && imageBitmap && !converted) {
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

    // grid crop 拖曳
    if (gridCropRect && converted && cropToolEnabled) {
      const cc = getCellCoordsFromPointer(ev.clientX, ev.clientY);
      if (!cc) return;
      const mode = getGridCropDragMode(cc.col, cc.row) ?? 'new';
      gridCropDragRef.current = { mode, startX: cc.col, startY: cc.row, startRect: { ...gridCropRect } };
      if (mode === 'new') {
        setGridCropRect({ x: cc.col, y: cc.row, w: 1, h: 1 });
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
    if (cropToolEnabled && imageBitmap && !converted) {
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
        left = base.x + dx;
        top = base.y + dy;
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

    // grid crop 拖曳
    if (gridCropRect && converted && cropToolEnabled) {
      const drag = gridCropDragRef.current;
      if (!drag) return;
      const cc = getCellCoordsFromPointer(ev.clientX, ev.clientY);
      if (!cc) return;
      const dx = cc.col - drag.startX;
      const dy = cc.row - drag.startY;
      const base = drag.startRect;
      let left = base.x;
      let top = base.y;
      let right = base.x + base.w;
      let bottom = base.y + base.h;

      if (drag.mode === 'new') {
        left = drag.startX;
        top = drag.startY;
        right = cc.col;
        bottom = cc.row;
        if (right < left) { const t = left; left = right; right = t; }
        if (bottom < top) { const t = top; top = bottom; bottom = t; }
        right += 1;
        bottom += 1;
      } else if (drag.mode === 'move') {
        left = base.x + dx;
        top = base.y + dy;
        right = left + base.w;
        bottom = top + base.h;
      } else {
        if (drag.mode.includes('w')) left = base.x + dx;
        if (drag.mode.includes('e')) right = base.x + base.w + dx;
        if (drag.mode.includes('n')) top = base.y + dy;
        if (drag.mode.includes('s')) bottom = base.y + base.h + dy;
        if (right < left) { const t = left; left = right; right = t; }
        if (bottom < top) { const t = top; top = bottom; bottom = t; }
      }

      const w = Math.max(1, right - left);
      const h = Math.max(1, bottom - top);
      // 允許向外擴展，但不超過 MAX_GRID_SIZE
      const clampedX = Math.max(-converted.cols, left);
      const clampedY = Math.max(-converted.rows, top);
      setGridCropRect({ x: clampedX, y: clampedY, w: Math.min(w, MAX_GRID_SIZE), h: Math.min(h, MAX_GRID_SIZE) });
      return;
    }

    // 追蹤筆刷 hover 位置（用於繪製預覽）
    if (converted && (editTool === 'paint' || editTool === 'erase')) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
        const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
        const meta = renderMetaRef.current;
        const cx = Math.floor((x - meta.ox) / meta.cell);
        const cy = Math.floor((y - meta.oy) / meta.cell);
        const col = meta.viewStartCol + cx;
        const row = meta.viewStartRow + cy;
        if (col >= 0 && row >= 0 && col < converted.cols && row < converted.rows) {
          const prev = hoverCellRef.current;
          if (!prev || prev.col !== col || prev.row !== row) {
            hoverCellRef.current = { col, row };
            drawGrid();
          }
        } else if (hoverCellRef.current) {
          hoverCellRef.current = null;
          drawGrid();
        }
      }
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
    if (cropToolEnabled && imageBitmap && !converted) {
      isCropDraggingRef.current = false;
      cropDragStartRef.current = null;
      cropDragModeRef.current = null;
      cropStartRectRef.current = null;
      setCropHoverMode(null);
      return;
    }
    if (gridCropRect && converted && cropToolEnabled) {
      gridCropDragRef.current = null;
      return;
    }
    if (editTool === 'erase' || editTool === 'paint') lastDragCellIdxRef.current = null;
    if (editTool === 'pan') panLastPointRef.current = null;
    if (hoverCellRef.current) {
      hoverCellRef.current = null;
      drawGrid();
    }
  };

  const onCanvasMouseUp = () => {
    if (cropToolEnabled && imageBitmap && !converted) {
      isCropDraggingRef.current = false;
      cropDragStartRef.current = null;
      cropDragModeRef.current = null;
      cropStartRectRef.current = null;
      return;
    }
    if (gridCropRect && converted && cropToolEnabled) {
      gridCropDragRef.current = null;
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

    // 若開啟相近色，替換範圍擴大至整個 focusVisibleNameSet
    const targetSet = focusNeighborEnabled && focusVisibleNameSet
      ? focusVisibleNameSet
      : new Set([focusColorName]);

    const changes: CellChange[] = [];
    const nextCells = converted.cells.map((cell, idx) => {
      if (scope) {
        const x = idx % converted.cols;
        const y = Math.floor(idx / converted.cols);
        if (x < scope.startCol || x > scope.endCol || y < scope.startRow || y > scope.endRow) return cell;
      }
      if (cell.isEmpty || !targetSet.has(cell.colorName)) return cell;
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

    const colorCount = targetSet.size;
    const colorCountText = colorCount > 1 ? `及相近色（${colorCount} 種）` : '';
    const scopeText = largeGridMode && largeOperationScope === 'tile' && selectedLargeTile ? '（當前分塊）' : '（全圖）';
    pushUndo(changes, colorCount > 1 ? `焦點色及相近色全替換（${colorCount} 種，${changes.length} 格）` : `焦點色全替換（${changes.length} 格）`);
    setConverted({ ...converted, cells: nextCells });
    setStatusText(
      isPaintToEmpty
        ? `已將焦點色${colorCountText}全部清空，共 ${changes.length} 格${scopeText}。`
        : `已將焦點色${colorCountText}全部替換為 ${chosen!.name}，共 ${changes.length} 格${scopeText}。`
    );
  };

  const replaceColorDirect = useCallback((fromName: string, toName: string) => {
    if (!converted) return;
    const toColor = activeGroup?.colors.find((c) => c.name === toName);
    if (!toColor) return;
    const changes: CellChange[] = [];
    const nextCells = converted.cells.map((cell, idx) => {
      if (cell.isEmpty || cell.colorName !== fromName) return cell;
      const after = { ...cell, colorName: toColor.name, hex: toColor.hex, isEmpty: false };
      changes.push({ idx, before: { ...cell }, after });
      return after;
    });
    if (!changes.length) { setStatusText('找不到可替換的色格。'); return; }
    pushUndo(changes, `直接替換：${fromName} → ${toName}（${changes.length} 格）`);
    setConverted({ ...converted, cells: nextCells });
    setStatusText(`已將 ${fromName} 全部替換為 ${toName}，共 ${changes.length} 格。`);
  }, [converted, activeGroup, pushUndo]);

  const findSimilarColorsFor = useCallback((colorName: string, maxCount = 5): { name: string; hex: string; deltaE: number }[] => {
    const target = statsRows.find((r) => r.name === colorName);
    if (!target || !activeGroup) return [];
    const targetLab = rgbToLab(...hexToRgb(target.hex));
    return activeGroup.colors
      .filter((c) => c.name !== colorName)
      .map((c) => ({ name: c.name, hex: c.hex, deltaE: deltaE2000(targetLab, rgbToLab(...hexToRgb(c.hex))) }))
      .sort((a, b) => a.deltaE - b.deltaE)
      .slice(0, maxCount);
  }, [statsRows, activeGroup]);

  const mergeSimilarColors = useCallback(() => {
    if (!converted || !mergeGroups.length) return;
    const replaceMap = new Map<string, { name: string; hex: string }>();
    for (const g of mergeGroups) {
      for (const m of g.merged) replaceMap.set(m.name, { name: g.rep.name, hex: g.rep.hex });
    }
    if (!replaceMap.size) return;
    const changes: CellChange[] = [];
    const nextCells = converted.cells.map((cell, idx) => {
      if (cell.isEmpty) return cell;
      const rep = replaceMap.get(cell.colorName);
      if (!rep) return cell;
      const after = { ...cell, colorName: rep.name, hex: rep.hex };
      changes.push({ idx, before: { ...cell }, after });
      return after;
    });
    if (!changes.length) { setStatusText('無需合併。'); return; }
    const mergeCount = replaceMap.size;
    pushUndo(changes, `合併相近色（閾值 ${mergeThreshold}，合併 ${mergeCount} 色，${changes.length} 格）`);
    setConverted({ ...converted, cells: nextCells });
    setStatusText(`已合併 ${mergeCount} 種相近色，影響 ${changes.length} 格。`);
  }, [converted, mergeGroups, mergeThreshold, pushUndo]);

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

  // 施工模式鍵盤快捷鍵：Enter 完成+跳下一個，↑↓ 切換任務
  useEffect(() => {
    if (!constructionMode || !constructionTasks.length) return;
    const handler = (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' && ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const currentIdx = constructionTasks.findIndex((t) => t.id === constructionCurrentTaskId);
      if (ev.key === 'Enter') {
        if (!constructionCurrentTaskId) return;
        ev.preventDefault();
        toggleConstructionDone(constructionCurrentTaskId, true);
        const next =
          constructionTasks.find((t, i) => i > currentIdx && !constructionDoneMap[t.id]) ??
          constructionTasks.find((t) => !constructionDoneMap[t.id] && t.id !== constructionCurrentTaskId);
        if (next) setFocusFromTask(next.id);
      } else {
        ev.preventDefault();
        const step = ev.key === 'ArrowDown' ? 1 : -1;
        const nextIdx = Math.max(0, Math.min(constructionTasks.length - 1, currentIdx + step));
        const nextTask = constructionTasks[nextIdx];
        if (nextTask && nextTask.id !== constructionCurrentTaskId) setFocusFromTask(nextTask.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [constructionMode, constructionTasks, constructionCurrentTaskId, constructionDoneMap]);

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

  const applyBulkSnapshot = (snap: BulkSnapshot) => {
    if (snap.imageBitmap !== undefined) setImageBitmap(snap.imageBitmap);
    if (snap.imageDataUrl !== undefined) setImageDataUrl(snap.imageDataUrl);
    if ('cropRect' in snap) setCropRect(snap.cropRect ?? null);
    if ('converted' in snap) setConverted(snap.converted ?? null);
    if (snap.cols !== undefined) setCols(snap.cols);
    if (snap.rows !== undefined) setRows(snap.rows);
    if (snap.imageMeta !== undefined) setImageMeta(snap.imageMeta);
    if (snap.gridMeta !== undefined) setGridMeta(snap.gridMeta);
  };

  const undo = () => {
    if (!undoStack.length) return;
    const batch = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, batch]);
    if (batch.bulkChange) {
      applyBulkSnapshot(batch.bulkChange.before);
    } else {
      if (batch.changes.length > 0 && converted) {
        const nextCells = [...converted.cells];
        for (const ch of batch.changes) nextCells[ch.idx] = { ...ch.before };
        setConverted({ ...converted, cells: nextCells });
      }
      if (batch.cropChange !== undefined) setCropRect(batch.cropChange.before);
    }
    addHistory(`Undo：${batch.label}`);
  };

  const redo = () => {
    if (!redoStack.length) return;
    const batch = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, batch]);
    if (batch.bulkChange) {
      applyBulkSnapshot(batch.bulkChange.after);
    } else {
      if (batch.changes.length > 0 && converted) {
        const nextCells = [...converted.cells];
        for (const ch of batch.changes) nextCells[ch.idx] = { ...ch.after };
        setConverted({ ...converted, cells: nextCells });
      }
      if (batch.cropChange !== undefined) setCropRect(batch.cropChange.after);
    }
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
        selectEditTool('pan');
      }
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toolPaint)) selectEditTool('paint');
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toolErase)) selectEditTool('erase');
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toolBucket)) selectEditTool('bucket');
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toolPicker)) selectEditTool('picker');
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
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toggleCropTool)) {
        ev.preventDefault();
        setCropToolEnabled((v) => !v);
      }
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toggleColorPanel)) {
        ev.preventDefault();
        setColorPanelVisible((v) => !v);
        if (!colorPanelVisible) bringPanelToFront('color');
      }
      if (matchesShortcutSet(ev, effectiveShortcutConfig.toggleConstructionPanel)) {
        ev.preventDefault();
        setConstructionPanelVisible((v) => !v);
        if (!constructionPanelVisible) bringPanelToFront('construction');
      }
      if (converted && matchesShortcutSet(ev, effectiveShortcutConfig.mergeSimilarColors)) {
        ev.preventDefault();
        mergeSimilarColors();
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
  }, [effectiveShortcutConfig, isCanvasFullscreen, largeGridMode, pdfPagination, proMode, redo, undo, colorPanelVisible, constructionPanelVisible, converted, mergeSimilarColors, bringPanelToFront]);

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

  const exportJpeg = () => {
    const preflight = runExportPreflight('pdf');
    if (preflight) { setStatusText(`匯出前檢查失敗：${preflight}`); return; }
    const gridCanvas = buildExportGridCanvas(converted!, showCode, PDF_BEAD_MM, {
      exportScale,
      showRuler: showRuler,
      showGuide: showGuide,
      guideEvery,
    });
    const statsCanvas = buildStatsCirclesCanvas(statsRows, exportScale, gridCanvas.width);
    const gapPx = Math.round(32 * exportScale);
    const combined = document.createElement('canvas');
    combined.width = gridCanvas.width;
    combined.height = gridCanvas.height + gapPx + statsCanvas.height + Math.round(16 * exportScale);
    const ctx = combined.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, combined.width, combined.height);
    ctx.drawImage(gridCanvas, 0, 0);
    ctx.drawImage(statsCanvas, 0, gridCanvas.height + gapPx);
    const dataUrl = combined.toDataURL('image/jpeg', 0.92);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${safeFileName(projectName)}-pattern.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatusText('JPEG 匯出完成。');
    setExportModalOpen(false);
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
        mode: 'fit',
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

      const drawGuestWatermark = (page: any) => {
        if (proMode) return;
        const text = 'PixChi';
        const size = 8;
        const tw = latin.widthOfTextAtSize(text, size);
        page.drawText(text, {
          x: pageW - margin - tw,
          y: margin * 0.4,
          size,
          font: latin,
          color: rgb(0.72, 0.72, 0.72),
        });
      };

      const drawStatsCircles = (page: any, tx: number, contentTop: number, availW: number) => {
        const circleR = 16;
        const nameSize = 9;
        const countSize = 8;
        const cellH = circleR * 2 + 5 + countSize + 8;
        const minCellW = circleR * 2 + 14;
        const cols = Math.max(1, Math.floor(availW / minCellW));
        const cellW = availW / cols;
        let i = 0;
        for (const r of statsRows) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cx = tx + col * cellW + cellW / 2;
          const cy = contentTop - circleR - row * cellH;
          if (cy - circleR - 5 - countSize < margin) break;
          const [rr, gg, bb] = hexToRgb(r.hex);
          page.drawCircle({ x: cx, y: cy, size: circleR, color: rgb(rr / 255, gg / 255, bb / 255) });
          const isDark = 0.299 * rr + 0.587 * gg + 0.114 * bb > 145;
          const nameColor = isDark ? rgb(0.1, 0.1, 0.1) : rgb(1, 1, 1);
          const nameW = latin.widthOfTextAtSize(r.name, nameSize);
          page.drawText(r.name, { x: cx - nameW / 2, y: cy - nameSize * 0.38, size: nameSize, font: latin, color: nameColor });
          const countStr = String(r.count);
          const countW = latin.widthOfTextAtSize(countStr, countSize);
          page.drawText(countStr, { x: cx - countW / 2, y: cy - circleR - 4 - countSize, size: countSize, font, color: rgb(0.3, 0.3, 0.3) });
          i++;
        }
      };
      const drawSideStats = (page: any, tx: number, contentTop: number, availW?: number) => {
        drawStatsCircles(page, tx, contentTop, availW ?? sideTableWidth);
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
          drawStatsCircles(page, margin, patternY - 16, usableW);
        }
        drawGuestWatermark(page);
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

        let firstTilePage: any = null;
        let firstTileDrawW = 0;
        let firstTilePatternY = 0;

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
          const tileY = contentTop - drawH;
          page.drawImage(tileImg, { x: margin, y: tileY, width: drawW, height: drawH });
          if (!firstTilePage) { firstTilePage = page; firstTileDrawW = drawW; firstTilePatternY = tileY; }
          drawGuestWatermark(page);
        }

        // Draw stats: prefer right of first tile → below first tile → new page
        if (firstTilePage) {
          if (firstTileDrawW + gap + sideTableWidth <= usableW) {
            drawSideStats(firstTilePage, margin + firstTileDrawW + gap, contentTop);
          } else {
            const spaceBelow = firstTilePatternY - margin - 12;
            if (spaceBelow >= 50) {
              drawStatsCircles(firstTilePage, margin, firstTilePatternY - 12, usableW);
            } else {
              const statsPage = pdfDoc.addPage([pageW, pageH]);
              drawHeader(statsPage, `群組：${activeGroup?.name ?? ''} | 格線：${converted.cols}x${converted.rows} | 用料統計`);
              drawStatsCircles(statsPage, margin, contentTop, usableW);
              drawGuestWatermark(statsPage);
            }
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      downloadBytes(`${safeFileName(projectName)}-pattern.pdf`, pdfBytes, 'application/pdf');
      setStatusText('PDF 匯出完成。');
      setExportModalOpen(false);
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
        mode: string;
        strategy: MatchStrategy;
        showCode: boolean;
        converted: {
          cols: number;
          rows: number;
          mode: string;
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
      // mode removed — always fit
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

  const navigatePage = (next: AppPage, username?: string) => {
    if (next === 'creator-public' && username) {
      setCreatorPublicUsername(username);
      setPage('creator-public');
      if (typeof window !== 'undefined') window.location.hash = `#/c/${encodeURIComponent(username)}`;
      return;
    }
    setPage(next);
    if (typeof window !== 'undefined') {
      const hashMap: Record<AppPage, string> = {
        main: '#/', palette: '#/palette', market: '#/market',
        creator: '#/creator', profile: '#/profile', 'creator-public': '#/',
      };
      window.location.hash = hashMap[next];
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
      <TopBar
        authUser={authUser}
        authBusy={authBusy}
        authPanelOpen={authPanelOpen}
        loginUsername={loginUsername}
        loginPassword={loginPassword}
        loginErrorText={loginErrorText}
        onToggleAuthPanel={() => {
          setAuthPanelOpen((v) => !v);
          setLoginErrorText('');
        }}
        onLogin={() => void loginByForm()}
        onRegister={(u, p) => void registerByForm(u, p)}
        onLogout={() => void logout()}
        onUsernameChange={setLoginUsername}
        onPasswordChange={setLoginPassword}
        onCloseAuthPanel={() => {
          setAuthPanelOpen(false);
          setLoginErrorText('');
        }}
        avatarImage={creatorAvatarImage}
        page={page}
        onNavigate={navigatePage}
        proMode={proMode}
        isPdfBusy={isPdfBusy}
        hasConverted={!!converted}
        onReloadPalette={() => void loadPalette()}
        onImportPdfFile={(file) => void importPdfRestore(file)}
        onOpenExportModal={() => setExportModalOpen(true)}
        onPublishToMarket={() => void openPublishModal()}
      />
      {exportModalOpen && (
        <ExportModal
          proMode={proMode}
          exportMode={exportMode}
          onExportModeChange={setExportMode}
          exportScale={exportScale}
          onExportScaleChange={setExportScale}
          pdfPagination={pdfPagination}
          pdfPageFrom={pdfPageFrom}
          pdfPageTo={pdfPageTo}
          onPdfPageFromChange={setPdfPageFrom}
          onPdfPageToChange={setPdfPageTo}
          isPdfBusy={isPdfBusy}
          onExport={() => { if (exportMode === 'jpeg') exportJpeg(); else void exportPdfLike(); }}
          onExportCsv={exportCsv}
          onClose={() => setExportModalOpen(false)}
        />
      )}
      {publishModalOpen && (
        <PublishDesignModal
          previewDataUrl={publishPreviewUrl}
          defaultWatermark={publishDefaultWatermark}
          apiClient={apiClient}
          onPublished={() => { setPublishModalOpen(false); setStatusText('設計圖已上架到市集！'); }}
          onClose={() => setPublishModalOpen(false)}
        />
      )}
      {page === 'creator-public' ? (
        <CreatorPublicPage
          username={creatorPublicUsername}
          apiClient={apiClient}
          authUser={authUser}
          onNavigate={navigatePage}
        />
      ) : page === 'market' ? (
        <MarketPage apiClient={apiClient} authUser={authUser} onNavigate={navigatePage} />
      ) : page === 'profile' || page === 'creator' ? (
        authUser ? (
          <UserProfilePage
            apiClient={apiClient}
            authUser={authUser}
            initialTab={page === 'creator' ? 'creator' : 'account'}
            onNavigate={navigatePage}
            onProfileSaved={refreshCreatorAvatar}
          />
        ) : null
      ) : page === 'palette' ? (
        <PalettePage
          paletteTab={paletteTab}
          onSetPaletteTab={setPaletteTab}
          builtinGroups={builtinGroups}
          customPaletteGroups={customPaletteGroups}
          builtinPreviewGroupName={builtinPreviewGroupName}
          builtinPreviewGroup={builtinPreviewGroup}
          onSetBuiltinPreviewGroupName={setBuiltinPreviewGroupName}
          paletteNewGroupName={paletteNewGroupName}
          onSetPaletteNewGroupName={setPaletteNewGroupName}
          paletteEditGroupId={paletteEditGroupId}
          onSetPaletteEditGroupId={setPaletteEditGroupId}
          editablePaletteGroup={editablePaletteGroup}
          paletteNewColorName={paletteNewColorName}
          onSetPaletteNewColorName={setPaletteNewColorName}
          paletteNewColorHex={paletteNewColorHex}
          onSetPaletteNewColorHex={setPaletteNewColorHex}
          proMode={proMode}
          statusText={statusText}
          onCreateCustomGroup={createCustomGroup}
          onUpdateCustomGroupName={updateCustomGroupName}
          onDeleteCustomGroup={deleteCustomGroup}
          onAddColorToCustomGroup={addColorToCustomGroup}
          onUpdateColor={updateColorInCustomGroup}
          onExportCustomPaletteJson={exportCustomPaletteJson}
          onImportCustomPaletteJson={(file) => void importCustomPaletteJson(file)}
        />
      
      ) : (
      <main className={`layout ${isCanvasFullscreen ? 'canvas-fullscreen' : ''}`.trim()}>
        <LeftSidebar
          converted={!!converted}
          proMode={proMode}
          statusText={statusText}
          paletteReady={!!activeGroup}
          groups={groups}
          activeGroupName={activeGroupName}
          onActiveGroupNameChange={setActiveGroupName}
          onImageSelected={(file) => void onImageSelected(file)}
          imageBitmap={imageBitmap}
          cropToolEnabled={cropToolEnabled}
          cropRect={cropRect}
          cols={cols}
          rows={rows}
          maxGridSize={MAX_GRID_SIZE}
          preMergeDeltaE={preMergeDeltaE}
          onPreMergeDeltaEChange={setPreMergeDeltaE}
          preMergeDeltaEMax={PRE_MERGE_DELTAE_MAX}
          showCode={showCode}
          onShowCodeChange={setShowCode}
          pdfPagination={pdfPagination}
          pdfJumpPage={pdfJumpPage}
          onPdfJumpPageChange={setPdfJumpPage}
          pdfTileThumbMap={pdfTileThumbMap}
          largeGridMode={largeGridMode}
          largeViewTilePage={largeViewTilePage}
          onLargeViewTilePageChange={setLargeViewTilePage}
          showRuler={showRuler}
          onShowRulerChange={setShowRuler}
          showGuide={showGuide}
          onShowGuideChange={setShowGuide}
          guideEvery={guideEvery}
          onGuideEveryChange={setGuideEvery}
          onConvert={() => void onConvert()}
          onResetAll={resetAll}
          convertProgress={convertProgress}
          oversizePlan={oversizePlan}
          onApplyOversizeSuggest={() => {
            if (!oversizePlan) return;
            setCols(oversizePlan.suggestCols);
            setRows(oversizePlan.suggestRows);
            void runConvert({
              overrideCols: oversizePlan.suggestCols,
              overrideRows: oversizePlan.suggestRows,
              allowOversize: true,
              useLargeMode: false
            });
          }}
          onApplyOversizeLargeMode={() => void runConvert({ allowOversize: true, useLargeMode: true })}
          onDismissOversizePlan={() => setOversizePlan(null)}
          gridSoftLimit={GRID_SOFT_LIMIT}
          onCreateBlankCanvas={(opts) => createBlankCanvas(opts)}
          hasConverted={!!converted}
          projectName={projectName}
          constructionMode={constructionMode}
          onConstructionModeChange={setConstructionMode}
          constructionStrategy={constructionStrategy}
          onConstructionStrategyChange={setConstructionStrategy}
          constructionOrderRule={constructionOrderRule}
          onConstructionOrderRuleChange={(rule) => {
            setConstructionOrderRule(rule);
            if (rule !== 'manual') setConstructionCustomOrder([]);
          }}
          constructionShowDoneOverlay={constructionShowDoneOverlay}
          onConstructionShowDoneOverlayChange={setConstructionShowDoneOverlay}
          constructionRuleInference={constructionRuleInference}
          onApplyInferredRule={applyInferredConstructionRule}
          constructionTemplates={constructionTemplates}
          constructionTemplateId={constructionTemplateId}
          onConstructionTemplateIdChange={setConstructionTemplateId}
          constructionTemplateName={constructionTemplateName}
          onConstructionTemplateNameChange={setConstructionTemplateName}
          onApplyConstructionTemplate={applyConstructionTemplate}
          onDeleteConstructionTemplate={deleteConstructionTemplate}
          onSaveConstructionTemplate={saveConstructionTemplate}
          constructionTasks={constructionTasks}
          constructionDoneMap={constructionDoneMap}
          constructionCurrentTaskId={constructionCurrentTaskId}
          constructionDragTaskId={constructionDragTaskId}
          constructionItemRefs={constructionItemRefs}
          constructionListRef={constructionListRef}
          constructionCompletionText={constructionCompletionText}
          onToggleConstructionDone={toggleConstructionDone}
          onReorderConstructionTask={reorderConstructionTask}
          onConstructionDragTaskIdChange={setConstructionDragTaskId}
          onSetFocusFromTask={setFocusFromTask}
          onProjectNameChange={setProjectName}
          authUser={authUser}
          lastSavedAt={lastSavedAt}
          storageEstimateText={storageEstimateText}
          drafts={drafts}
          activeDraftId={activeDraftId}
          activeDraft={activeDraft}
          activeVersionMeta={activeVersionMeta}
          isDraftBusy={isDraftBusy}
          draftRenameInput={draftRenameInput}
          onDraftRenameInputChange={setDraftRenameInput}
          activeDraftVersionId={activeDraftVersionId}
          draftVersionNoteInput={draftVersionNoteInput}
          onDraftVersionNoteInputChange={setDraftVersionNoteInput}
          compareVersionA={compareVersionA}
          compareVersionB={compareVersionB}
          compareSummary={compareSummary}
          onCompareVersionAChange={setCompareVersionA}
          onCompareVersionBChange={setCompareVersionB}
          getDraftLimit={getDraftLimit}
          onSelectDraft={(id) => {
            if (!id) {
              setActiveDraftId('');
              setActiveDraftVersionId('');
              return;
            }
            setActiveDraftId(id);
            setActiveDraftVersionId('');
            void loadDraftById(id);
          }}
          onSelectDraftVersion={(versionId) => {
            setActiveDraftVersionId(versionId);
            if (!activeDraftId) return;
            void loadDraftById(activeDraftId, versionId || undefined);
          }}
          onSaveDraft={(opts) => void saveDraft(opts)}
          onRemoveDraft={() => void removeDraftById(activeDraftId)}
          onSaveDraftRename={() => void saveDraftRename()}
          onSaveVersionNote={() => void saveVersionNote()}
          onCompareDraftVersions={() => void compareDraftVersions()}
          shortcutConfig={shortcutConfig}
          onUpdateShortcutByText={updateShortcutByText}
          shortcutConflicts={shortcutConflicts}
          onResetShortcutDefaults={resetShortcutDefaults}
          undoStack={undoStack}
          onRollbackToStep={rollbackToStep}
          historyItems={historyItems}
          editTool={editTool}
          onEditToolChange={selectEditTool}
          editColorHex={selectedEditColor?.hex ?? null}
          editColorName={selectedEditColor?.name ?? ''}
          onColorPanelToggle={() => { setColorPanelVisible((v) => !v); bringPanelToFront('color'); }}
          onUndo={undo}
          onRedo={redo}
          hasImageBitmap={!!imageBitmap}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          bucketMode={bucketMode}
          onBucketModeChange={setBucketMode}
          onCropToolEnabledChange={(v) => {
            setCropToolEnabled(v);
            if (v && converted) {
              setGridCropRect({ x: 0, y: 0, w: converted.cols, h: converted.rows });
            } else {
              setGridCropRect(null);
            }
          }}
          hasCropRect={!!cropRect && !!imageBitmap ? (cropRect.x !== 0 || cropRect.y !== 0 || cropRect.w !== imageBitmap.width || cropRect.h !== imageBitmap.height) : false}
          gridCropActive={!!gridCropRect && !!converted && cropToolEnabled}
          onResetCropRect={() => {
            if (!imageBitmap) return;
            setCropRect({ x: 0, y: 0, w: imageBitmap.width, h: imageBitmap.height });
          }}
          onApplyGridCrop={applyGridCrop}
          onApplyCrop={() => void applyImageCrop()}
          collapseSignal={sidebarCollapseSignal}
          isCanvasFullscreen={isCanvasFullscreen}
          constructionPanelVisible={constructionPanelVisible}
          onConstructionPanelToggle={() => { setConstructionPanelVisible((v) => !v); bringPanelToFront('construction'); }}
          colorPanelVisible={colorPanelVisible}
          mergeThreshold={mergeThreshold}
          onMergeThresholdChange={setMergeThreshold}
          mergeGroups={mergeGroups}
          onMergeSimilarColors={mergeSimilarColors}
        />

        <CanvasPanel
          imageMeta={imageMeta}
          cols={cols}
          rows={rows}
          onColsChange={(v) => {
            if (!converted) return;
            // 等比計算新 rows（以原始比例縮放）
            const newRows = Math.max(1, Math.round(converted.rows * v / converted.cols));
            setCols(v);
            setRows(newRows);
            if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
            resizeTimerRef.current = window.setTimeout(() => {
              resizeCanvas(v, newRows);
            }, 400);
          }}
          onRowsChange={(v) => {
            if (!converted) return;
            // 等比計算新 cols（以原始比例縮放）
            const newCols = Math.max(1, Math.round(converted.cols * v / converted.rows));
            setRows(v);
            setCols(newCols);
            if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
            resizeTimerRef.current = window.setTimeout(() => {
              resizeCanvas(newCols, v);
            }, 400);
          }}
          maxGridSize={MAX_GRID_SIZE}
          isCanvasFullscreen={isCanvasFullscreen}
          onToggleFullscreen={() => setIsCanvasFullscreen((v) => !v)}
          zoom={zoom}
          onZoomChange={setZoom}
          onResetView={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
          canvasRef={canvasRef}
          canvasWrapRef={canvasWrapRef}
          hasConverted={!!converted}
          hasImageBitmap={!!imageBitmap}
          editTool={editTool}
          onEditToolChange={selectEditTool}
          onUndo={undo}
          onRedo={redo}
          largeOperationScope={largeOperationScope}
          onLargeOperationScopeChange={setLargeOperationScope}
          editColorHex={selectedEditColor?.hex ?? null}
          editColorName={selectedEditColor?.name ?? ''}
          canvasCursor={canvasCursor}
          cropToolEnabled={cropToolEnabled}
          onCropToolEnabledChange={(v) => {
            setCropToolEnabled(v);
            if (v && converted) {
              setGridCropRect({ x: 0, y: 0, w: converted.cols, h: converted.rows });
            } else {
              setGridCropRect(null);
            }
          }}
          onResetCropRect={() => {
            if (!imageBitmap) return;
            setCropRect({ x: 0, y: 0, w: imageBitmap.width, h: imageBitmap.height });
          }}
          hasCropRect={!!cropRect && imageBitmap ? (cropRect.x !== 0 || cropRect.y !== 0 || cropRect.w !== imageBitmap.width || cropRect.h !== imageBitmap.height) : false}
          gridCropActive={!!gridCropRect && !!converted && cropToolEnabled}
          onApplyGridCrop={applyGridCrop}
          onColorPanelToggle={() => { setColorPanelVisible((v) => !v); bringPanelToFront('color'); }}
          largeGridMode={largeGridMode}
          largeViewTilePage={largeViewTilePage}
          proMode={proMode}
          projectName={projectName}
          showCode={showCode}
          onShowCodeChange={setShowCode}
          showRuler={showRuler}
          onShowRulerChange={setShowRuler}
          showGuide={showGuide}
          onShowGuideChange={setShowGuide}
          guideEvery={guideEvery}
          onGuideEveryChange={setGuideEvery}
          beadCircleMode={beadCircleMode}
          onBeadCircleModeChange={setBeadCircleMode}
          onCanvasClick={onCanvasClick}
          onCanvasMouseDown={onCanvasMouseDown}
          onCanvasMouseMove={onCanvasMouseMove}
          onCanvasMouseUp={onCanvasMouseUp}
          onCanvasMouseLeave={onCanvasMouseLeave}
        />

        <StatsPanel
          proMode={proMode}
          totalBeads={totalBeads}
          statsRowCount={statsRows.length}
          materialCost={materialCost}
          laborCost={laborCost}
          fixedCost={fixedCost}
          marginRate={marginRate}
          quotePrice={quotePrice}
          hasConverted={!!converted}
          statsSearch={statsSearch}
          filteredStatsRows={filteredStatsRows}
          onStatsSearchChange={setStatsSearch}
          proUnitCost={proUnitCost}
          proLossRate={proLossRate}
          proHourlyRate={proHourlyRate}
          proWorkHours={proWorkHours}
          proFixedCost={proFixedCost}
          proMargin={proMargin}
          onProUnitCostChange={setProUnitCost}
          onProLossRateChange={setProLossRate}
          onProHourlyRateChange={setProHourlyRate}
          onProWorkHoursChange={setProWorkHours}
          onProFixedCostChange={setProFixedCost}
          onProMarginChange={setProMargin}
          onFindSimilarColors={findSimilarColorsFor}
          onReplaceColorDirect={replaceColorDirect}
        />
      </main>
      )}

      <FloatingColorPanel
        visible={colorPanelVisible}
        onClose={() => setColorPanelVisible(false)}
        focusColorName={focusColorName}
        focusColorSearch={focusColorSearch}
        focusColorMenuOpen={focusColorMenuOpen}
        focusColorMenuRef={focusColorMenuRef}
        selectedFocusColor={selectedFocusColor}
        filteredFocusColors={filteredFocusColors}
        constructionMode={constructionMode}
        focusNeighborEnabled={focusNeighborEnabled}
        focusNeighborDeltaE={focusNeighborDeltaE}
        focusMaskEnabled={focusMaskEnabled}
        onFocusMaskEnabledChange={setFocusMaskEnabled}
        onFocusColorNameChange={setFocusColorName}
        onFocusColorSearchChange={setFocusColorSearch}
        onFocusColorMenuOpenChange={setFocusColorMenuOpen}
        onClearConstructionFocus={clearConstructionFocus}
        onFocusNeighborEnabledChange={setFocusNeighborEnabled}
        onFocusNeighborDeltaEChange={setFocusNeighborDeltaE}
        editColorName={editColorName}
        editColorMenuOpen={editColorMenuOpen}
        colorMenuRef={colorMenuRef}
        selectedEditColor={selectedEditColor}
        paletteSearch={paletteSearch}
        filteredEditColors={filteredEditColors}
        onEditColorNameChange={setEditColorName}
        onEditColorMenuOpenChange={setEditColorMenuOpen}
        onPaletteSearchChange={setPaletteSearch}
        onReplaceAllSameColor={replaceAllSameColor}
        onAddOneCellOutline={addOneCellOutline}
        zIndex={500 + panelStack.indexOf('color')}
        onBringToFront={() => bringPanelToFront('color')}
      />
      <FloatingConstructionPanel
        visible={constructionPanelVisible}
        onClose={() => setConstructionPanelVisible(false)}
        zIndex={500 + panelStack.indexOf('construction')}
        onBringToFront={() => bringPanelToFront('construction')}
        proMode={proMode}
        constructionMode={constructionMode}
        onConstructionModeChange={setConstructionMode}
        constructionStrategy={constructionStrategy}
        onConstructionStrategyChange={setConstructionStrategy}
        constructionOrderRule={constructionOrderRule}
        onConstructionOrderRuleChange={setConstructionOrderRule}
        constructionShowDoneOverlay={constructionShowDoneOverlay}
        onConstructionShowDoneOverlayChange={setConstructionShowDoneOverlay}
        constructionRuleInference={constructionRuleInference}
        onApplyInferredRule={applyInferredConstructionRule}
        constructionTemplates={constructionTemplates}
        constructionTemplateId={constructionTemplateId}
        onConstructionTemplateIdChange={setConstructionTemplateId}
        constructionTemplateName={constructionTemplateName}
        onConstructionTemplateNameChange={setConstructionTemplateName}
        onApplyConstructionTemplate={applyConstructionTemplate}
        onDeleteConstructionTemplate={deleteConstructionTemplate}
        onSaveConstructionTemplate={saveConstructionTemplate}
        constructionTasks={constructionTasks}
        constructionDoneMap={constructionDoneMap}
        constructionCurrentTaskId={constructionCurrentTaskId}
        constructionDragTaskId={constructionDragTaskId}
        constructionItemRefs={constructionItemRefs}
        constructionListRef={constructionListRef}
        constructionCompletionText={constructionCompletionText}
        onToggleConstructionDone={toggleConstructionDone}
        onReorderConstructionTask={reorderConstructionTask}
        onConstructionDragTaskIdChange={setConstructionDragTaskId}
        onSetFocusFromTask={setFocusFromTask}
      />
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

function buildStatsCirclesCanvas(
  rows: Array<{ name: string; hex: string; count: number }>,
  scale: number,
  targetWidth?: number
): HTMLCanvasElement {
  const diam = Math.round(54 * scale);
  const cellGapY = Math.round(10 * scale);
  const countFontSize = Math.max(9, Math.round(13 * scale));
  const pad = Math.round(20 * scale);

  let cols: number;
  let cellW: number;
  const canvasWidth: number = targetWidth ?? 0;

  if (targetWidth && targetWidth > 0) {
    const availW = targetWidth - pad * 2;
    const minCellW = diam + Math.round(4 * scale);
    cols = Math.max(1, Math.floor(availW / minCellW));
    cellW = availW / cols;
  } else {
    cols = Math.min(8, Math.max(4, Math.round(Math.sqrt(rows.length) * 1.3)));
    cellW = diam + Math.round(12 * scale);
  }

  const cellH = diam + Math.round(4 * scale) + countFontSize + cellGapY;
  const numRows = Math.ceil(rows.length / cols);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth > 0 ? canvasWidth : (cols * cellW + pad * 2);
  canvas.height = numRows * cellH + pad * 2 - cellGapY;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  rows.forEach((r, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = pad + col * cellW + diam / 2;
    const cy = pad + row * cellH + diam / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, diam / 2, 0, Math.PI * 2);
    ctx.fillStyle = r.hex;
    ctx.fill();

    const textColor = pickTextColor(r.hex);
    const nameFontSize = Math.max(8, Math.floor(diam * 0.30));
    ctx.font = `700 ${nameFontSize}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    ctx.fillText(r.name, cx, cy);

    ctx.font = `${countFontSize}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = '#444444';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(r.count), cx, cy + diam / 2 + Math.round(4 * scale));
  });

  return canvas;
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
  const rulerBand = showRuler ? Math.round(32 * exportScale) : 0;

  const canvas = document.createElement('canvas');
  canvas.width = converted.cols * cell + pad * 2 + rulerBand * 2;
  canvas.height = converted.rows * cell + pad * 2 + rulerBand * 2;

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
    const gridW = converted.cols * cell;
    const gridH = converted.rows * cell;
    const rightX = ox + gridW;
    const bottomY = oy + gridH;
    ctx.fillStyle = '#465a52';
    const rulerFontSize = Math.max(11, Math.round(14 * exportScale));
    ctx.font = `${rulerFontSize}px "Segoe UI", Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    const midBand = Math.floor(rulerBand / 2);
    ctx.textAlign = 'center';
    for (let gx = 0; gx <= converted.cols; gx += guideEvery) {
      const x = ox + gx * cell;
      const label = String(gx);
      ctx.fillText(label, x, oy - midBand);       // top
      ctx.fillText(label, x, bottomY + midBand);  // bottom
    }
    for (let gy = 0; gy <= converted.rows; gy += guideEvery) {
      const y = oy + gy * cell;
      const label = String(gy);
      ctx.textAlign = 'right';
      ctx.fillText(label, ox - Math.round(6 * exportScale), y);         // left
      ctx.textAlign = 'left';
      ctx.fillText(label, rightX + Math.round(6 * exportScale), y);     // right
    }
    ctx.restore();
  }

  return canvas;
}

function buildPdfPayload(input: {
  projectName: string;
  activeGroupName: string;
  mode: string;
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

function adjustGridByMode(cols: number, rows: number, imgW: number, imgH: number, fix?: 'cols' | 'rows') {
  const ratio = imgW / imgH;
  const opt1 = { cols: Math.max(1, Math.round(rows * ratio)), rows };
  const opt2 = { cols, rows: Math.max(1, Math.round(cols / ratio)) };
  if (fix === 'cols') return opt2;
  if (fix === 'rows') return opt1;
  const d1 = Math.abs(opt1.cols - cols) + Math.abs(opt1.rows - rows);
  const d2 = Math.abs(opt2.cols - cols) + Math.abs(opt2.rows - rows);
  return d1 <= d2 ? opt1 : opt2;
}

function buildProcessedCanvas(bitmap: ImageBitmap, cols: number, rows: number) {
  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  const cctx = c.getContext('2d')!;
  cctx.fillStyle = '#ffffff';
  cctx.fillRect(0, 0, c.width, c.height);
  cctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, c.width, c.height);
  return { processedCanvas: c, info: 'original ratio' };
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





