import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type MatchStrategy = 'lab_nearest' | 'rgb_nearest';
type LayoutMode = 'fit' | 'lock' | 'pad';

type PaletteColor = {
  name: string;
  hex: string;
  rgb: [number, number, number];
  lab: [number, number, number];
};

type PaletteGroup = {
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

type PaletteJson = {
  groups?: Array<{
    name: string;
    colors?: Array<{
      name: string;
      hex: string;
    }>;
  }>;
};

const MAX_GRID_SIZE = 10000;
const PIXCHI_META_PREFIX = 'PIXCHI_META_V1:';
const PDF_FONT_URL = '/fonts/NotoSansTC-VF.ttf';
let pdfRuntimePromise: Promise<{
  PDFDocument: any;
  StandardFonts: any;
  rgb: (...args: number[]) => any;
  fontkit: any;
}> | null = null;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const colorMenuRef = useRef<HTMLDivElement | null>(null);
  const focusColorMenuRef = useRef<HTMLDivElement | null>(null);
  const pdfImportRef = useRef<HTMLInputElement | null>(null);
  const renderMetaRef = useRef({ ox: 0, oy: 0, cell: 1 });
  const isPointerDownRef = useRef(false);
  const lastDragCellIdxRef = useRef<number | null>(null);
  const panLastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [projectName, setProjectName] = useState('未命名專案');
  const [groups, setGroups] = useState<PaletteGroup[]>([]);
  const [activeGroupName, setActiveGroupName] = useState('');
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [imageMeta, setImageMeta] = useState('-');

  const [cols, setCols] = useState(32);
  const [rows, setRows] = useState(32);
  const [mode, setMode] = useState<LayoutMode>('fit');
  const [strategy, setStrategy] = useState<MatchStrategy>('lab_nearest');
  const [showCode, setShowCode] = useState(true);
  const [editTool, setEditTool] = useState<'pan' | 'paint' | 'erase'>('pan');
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [proMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const query = new URLSearchParams(window.location.search).get('pro');
    return query === '1';
  });
  const [showRuler, setShowRuler] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideEvery, setGuideEvery] = useState(5);

  const [paletteSearch, setPaletteSearch] = useState('');
  const [editColorName, setEditColorName] = useState('');
  const [editColorMenuOpen, setEditColorMenuOpen] = useState(false);
  const [focusColorName, setFocusColorName] = useState('');
  const [focusColorSearch, setFocusColorSearch] = useState('');
  const [focusColorMenuOpen, setFocusColorMenuOpen] = useState(false);
  const [statsSearch, setStatsSearch] = useState('');
  const [unitCost, setUnitCost] = useState(0);
  const [labor, setLabor] = useState(0);
  const [margin, setMargin] = useState(0);

  const [converted, setConverted] = useState<Converted | null>(null);
  const [gridMeta, setGridMeta] = useState('-');
  const [statusText, setStatusText] = useState('尚未載入圖片。');
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const [undoStack, setUndoStack] = useState<CellChange[][]>([]);
  const [redoStack, setRedoStack] = useState<CellChange[][]>([]);
  const [lastPickedOldColor, setLastPickedOldColor] = useState<string | null>(null);

  const activeGroup = useMemo(
    () => groups.find((x) => x.name === activeGroupName) ?? null,
    [groups, activeGroupName]
  );

  const filteredEditColors = useMemo(() => {
    const q = paletteSearch.trim().toLowerCase();
    const colors = activeGroup?.colors ?? [];
    return colors.filter((c) => !q || c.name.toLowerCase().includes(q) || c.hex.toLowerCase().includes(q));
  }, [activeGroup, paletteSearch]);

  const selectedEditColor = useMemo(
    () => activeGroup?.colors.find((c) => c.name === editColorName) ?? null,
    [activeGroup, editColorName]
  );

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
        lineCost: r.count * unitCost
      }));
  }, [converted, unitCost]);

  const filteredStatsRows = useMemo(() => {
    const q = statsSearch.trim().toLowerCase();
    return statsRows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.hex.toLowerCase().includes(q));
  }, [statsRows, statsSearch]);

  const filteredFocusColors = useMemo(() => {
    const q = focusColorSearch.trim().toLowerCase();
    return statsRows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.hex.toLowerCase().includes(q));
  }, [statsRows, focusColorSearch]);

  const selectedFocusColor = useMemo(
    () => statsRows.find((r) => r.name === focusColorName) ?? null,
    [statsRows, focusColorName]
  );

  const totalBeads = converted?.cells.filter((c) => !c.isEmpty).length ?? 0;
  const estCost = statsRows.reduce((acc, row) => acc + row.lineCost, 0);
  const quotePrice = (estCost + labor) * (1 + margin / 100);

  const loadPalette = useCallback(async () => {
    try {
      const res = await fetch(`/color-palette.json?t=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PaletteJson;
      const parsed = (data.groups ?? []).map((g) => ({
        name: g.name,
        colors: (g.colors ?? [])
          .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex ?? ''))
          .map((c) => {
            const rgb = hexToRgb(c.hex.toUpperCase());
            return {
              name: c.name,
              hex: c.hex.toUpperCase(),
              rgb,
              lab: rgbToLab(...rgb)
            } as PaletteColor;
          })
      }));

      if (!parsed.length) throw new Error('找不到可用色庫群組');
      setGroups(parsed);
      setActiveGroupName((prev) => {
        if (prev && parsed.some((g) => g.name === prev)) return prev;
        const defaultGroup = parsed.find((g) => g.name.includes('小舞'));
        if (defaultGroup) return defaultGroup.name;
        return parsed[0].name;
      });
      setStatusText(`色庫載入完成，群組數：${parsed.length}`);
    } catch (err) {
      setStatusText(`無法載入 color-palette.json：${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void loadPalette();
  }, [loadPalette]);

  useEffect(() => {
    const colors = activeGroup?.colors ?? [];
    if (!colors.length) {
      setEditColorName('');
      return;
    }
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

    if (!converted) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    const pad = 12;
    const drawW = width - pad * 2;
    const drawH = height - pad * 2;
    const baseCell = Math.max(1, Math.floor(Math.min(drawW / converted.cols, drawH / converted.rows)));
    const cell = Math.max(1, Math.floor(baseCell * zoom));
    const gridW = cell * converted.cols;
    const gridH = cell * converted.rows;
    const ox = Math.floor((width - gridW) / 2 + panOffset.x);
    const oy = Math.floor((height - gridH) / 2 + panOffset.y);

    renderMetaRef.current = { ox, oy, cell };

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    for (const c of converted.cells) {
      const x = ox + c.x * cell;
      const y = oy + c.y * cell;
      const isDimmed = !!focusColorName && !c.isEmpty && c.colorName !== focusColorName;
      const displayHex = isDimmed ? toGrayHex(c.hex) : c.hex;
      ctx.fillStyle = displayHex;
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = '#dbe5df';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cell, cell);

      if (showCode && cell >= 8 && !c.isEmpty) {
        ctx.fillStyle = pickTextColor(displayHex);
        ctx.font = `${Math.max(9, Math.floor(cell * 0.35))}px Segoe UI`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.colorName, x + cell / 2, y + cell / 2);
      }
    }

    const guideStep = Math.max(1, Math.floor(guideEvery));
    if (proMode && showGuide) {
      ctx.save();
      ctx.strokeStyle = '#8ea39a';
      ctx.lineWidth = 1.5;
      for (let gx = 0; gx <= converted.cols; gx += guideStep) {
        const x = ox + gx * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, oy);
        ctx.lineTo(x, oy + converted.rows * cell);
        ctx.stroke();
      }
      for (let gy = 0; gy <= converted.rows; gy += guideStep) {
        const y = oy + gy * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(ox, y);
        ctx.lineTo(ox + converted.cols * cell, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (proMode && showRuler) {
      ctx.save();
      ctx.fillStyle = '#ffffffd9';
      ctx.fillRect(ox, Math.max(0, oy - 20), converted.cols * cell, 20);
      ctx.fillRect(Math.max(0, ox - 28), oy, 28, converted.rows * cell);
      ctx.fillStyle = '#465a52';
      ctx.font = '11px Segoe UI';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let gx = 0; gx <= converted.cols; gx += guideStep) {
        const x = ox + gx * cell;
        ctx.fillText(String(gx), x, Math.max(10, oy - 10));
      }
      ctx.textAlign = 'right';
      for (let gy = 0; gy <= converted.rows; gy += guideStep) {
        const y = oy + gy * cell;
        ctx.fillText(String(gy), Math.max(20, ox - 6), y);
      }
      ctx.restore();
    }
  }, [converted, showCode, focusColorName, zoom, panOffset.x, panOffset.y, proMode, showGuide, showRuler, guideEvery]);

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
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

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
    const bitmap = await createImageBitmap(file);
    setImageBitmap(bitmap);
    setCols(img.width);
    setRows(img.height);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setImageMeta(`來源圖：${img.width} x ${img.height}`);
    setStatusText(`已載入圖片：${file.name}`);
  };

  const onConvert = async () => {
    if (!imageBitmap || !activeGroup) {
      setStatusText('請先確認圖片與色庫群組都已載入。');
      return;
    }

    const safeCols = clampInt(cols, 1, MAX_GRID_SIZE);
    const safeRows = clampInt(rows, 1, MAX_GRID_SIZE);
    const dims = adjustGridByMode(safeCols, safeRows, imageBitmap.width, imageBitmap.height, mode);
    const { processedCanvas, info } = buildProcessedCanvas(imageBitmap, dims.cols, dims.rows, mode);

    const imgData = processedCanvas
      .getContext('2d')!
      .getImageData(0, 0, processedCanvas.width, processedCanvas.height);

    const cells: Cell[] = [];
    for (let y = 0; y < dims.rows; y++) {
      for (let x = 0; x < dims.cols; x++) {
        const rgb = extractCellMedianRgb(imgData, x, y, dims.cols, dims.rows);
        const mapped = mapColor(rgb, activeGroup.colors, strategy);
        cells.push({ x, y, rgb, colorName: mapped.name, hex: mapped.hex });
      }
    }

    setConverted({
      cols: dims.cols,
      rows: dims.rows,
      mode,
      sourceW: imageBitmap.width,
      sourceH: imageBitmap.height,
      processInfo: info,
      cells
    });
    setCols(dims.cols);
    setRows(dims.rows);
    setGridMeta(`格線：${dims.cols} x ${dims.rows} (${mode})`);
    setUndoStack([]);
    setRedoStack([]);
    setLastPickedOldColor(null);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setStatusText('轉換完成，可直接修色與匯出。');
  };

  const pushUndo = (changes: CellChange[]) => {
    setUndoStack((prev) => [...prev, changes]);
    setRedoStack([]);
  };

  const getCellIndexByPointer = (clientX: number, clientY: number) => {
    if (!converted) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const { ox, oy, cell } = renderMetaRef.current;
    const cx = Math.floor((x - ox) / cell);
    const cy = Math.floor((y - oy) / cell);
    if (cx < 0 || cy < 0 || cx >= converted.cols || cy >= converted.rows) return null;
    return cy * converted.cols + cx;
  };

  const applyEditByIndex = (idx: number) => {
    if (!converted) return;
    const chosen =
      editTool === 'paint' && activeGroup && editColorName
        ? activeGroup.colors.find((c) => c.name === editColorName) ?? null
        : null;
    if (editTool === 'paint' && !chosen) return;

    const prev = converted.cells[idx];
    if (!prev) return;

    const before = { ...prev };
    const after =
      editTool === 'erase'
        ? { ...prev, colorName: '', hex: '#FFFFFF', isEmpty: true }
        : { ...prev, colorName: chosen!.name, hex: chosen!.hex, isEmpty: false };
    if (editTool === 'paint' && !before.isEmpty && before.colorName === chosen!.name) return;
    if (editTool === 'erase' && before.isEmpty) return;

    setLastPickedOldColor(editTool === 'paint' && !before.isEmpty ? before.colorName : null);
    pushUndo([{ idx, before, after }]);
    setConverted((old) => {
      if (!old) return old;
      const nextCells = [...old.cells];
      nextCells[idx] = after;
      return { ...old, cells: nextCells };
    });
  };

  const onCanvasClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (editTool === 'pan') return;
    const idx = getCellIndexByPointer(ev.clientX, ev.clientY);
    if (idx == null) return;
    applyEditByIndex(idx);
  };

  const onCanvasMouseDown = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    isPointerDownRef.current = true;
    lastDragCellIdxRef.current = null;
    if (editTool === 'pan') {
      panLastPointRef.current = { x: ev.clientX, y: ev.clientY };
      return;
    }
    if (editTool !== 'erase' && editTool !== 'paint') return;
    const idx = getCellIndexByPointer(ev.clientX, ev.clientY);
    if (idx == null) return;
    lastDragCellIdxRef.current = idx;
    applyEditByIndex(idx);
  };

  const onCanvasMouseMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
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
    if (editTool !== 'erase' && editTool !== 'paint') return;
    const idx = getCellIndexByPointer(ev.clientX, ev.clientY);
    if (idx == null) return;
    if (idx === lastDragCellIdxRef.current) return;
    lastDragCellIdxRef.current = idx;
    applyEditByIndex(idx);
  };

  const onCanvasMouseLeave = () => {
    if (editTool === 'erase' || editTool === 'paint') lastDragCellIdxRef.current = null;
    if (editTool === 'pan') panLastPointRef.current = null;
  };

  const replaceAllSameColor = () => {
    if (!converted || !activeGroup || !editColorName) return;
    const chosen = activeGroup.colors.find((c) => c.name === editColorName);
    if (!chosen) return;
    if (!focusColorName) {
      setStatusText('請先選擇焦點色號，再執行全替換。');
      return;
    }
    if (focusColorName === chosen.name) {
      setStatusText('焦點色與替換色相同，無需替換。');
      return;
    }

    const changes: CellChange[] = [];
    const nextCells = converted.cells.map((cell, idx) => {
      if (cell.isEmpty || cell.colorName !== focusColorName) return cell;
      const before = { ...cell };
      const after = { ...cell, colorName: chosen.name, hex: chosen.hex, isEmpty: false };
      changes.push({ idx, before, after });
      return after;
    });

    if (!changes.length) {
      setStatusText('找不到可替換的舊色。');
      return;
    }

    pushUndo(changes);
    setConverted({ ...converted, cells: nextCells });
    setStatusText(`已將焦點色 ${focusColorName} 全部替換為 ${chosen.name}。`);
  };

  const undo = () => {
    if (!undoStack.length || !converted) return;
    const changes = undoStack[undoStack.length - 1];
    const nextCells = [...converted.cells];
    for (const ch of changes) nextCells[ch.idx] = { ...ch.before };
    setConverted({ ...converted, cells: nextCells });
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, changes]);
  };

  const redo = () => {
    if (!redoStack.length || !converted) return;
    const changes = redoStack[redoStack.length - 1];
    const nextCells = [...converted.cells];
    for (const ch of changes) nextCells[ch.idx] = { ...ch.after };
    setConverted({ ...converted, cells: nextCells });
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, changes]);
  };

  const exportCsv = () => {
    if (!statsRows.length) {
      setStatusText('沒有可匯出的統計資料。');
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
    if (!converted) {
      setStatusText('尚未有可匯出的圖紙。');
      return;
    }

    try {
      setIsPdfBusy(true);
      const { PDFDocument, StandardFonts, rgb } = await getPdfRuntime();
      const beadMm = 2.6;
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
        let pageNo = 1;

        // Summary page with stats
        const summary = pdfDoc.addPage([pageW, pageH]);
        drawHeader(summary, `群組：${activeGroup?.name ?? ''} | 格線：${converted.cols}x${converted.rows} | 自動分頁 ${xPages}x${yPages}`);
        drawSideStats(summary, margin, pageH - margin - headerH - 8);

        for (let py = 0; py < yPages; py++) {
          for (let px = 0; px < xPages; px++) {
            const startCol = px * tileCols;
            const startRow = py * tileRows;
            const colsPart = Math.min(tileCols, converted.cols - startCol);
            const rowsPart = Math.min(tileRows, converted.rows - startRow);
            const slice = sliceConverted(converted, startCol, startRow, colsPart, rowsPart);
            const tileCanvas = buildExportGridCanvas(slice, showCode, beadMm, {
              showRuler: proMode && showRuler,
              showGuide: proMode && showGuide,
              guideEvery
            });
            const tileImg = await pdfDoc.embedPng(dataUrlToBytes(tileCanvas.toDataURL('image/png')));
            const page = pdfDoc.addPage([pageW, pageH]);
            const partText = `分頁 ${pageNo}/${totalTiles} | X:${startCol + 1}-${startCol + colsPart}  Y:${startRow + 1}-${startRow + rowsPart}`;
            drawHeader(page, partText);
            const drawW = mmToPt(colsPart * beadMm);
            const drawH = mmToPt(rowsPart * beadMm);
            const y = contentTop - drawH;
            page.drawImage(tileImg, { x: margin, y, width: drawW, height: drawH });
            pageNo += 1;
          }
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
      setStrategy(data.strategy || 'lab_nearest');
      setShowCode(data.showCode ?? true);
      setConverted(restoredConverted);
      setCols(restoredConverted.cols);
      setRows(restoredConverted.rows);
      setGridMeta(`格線：${restoredConverted.cols} x ${restoredConverted.rows} (${restoredConverted.mode})`);
      setImageMeta(`PDF 還原：${restoredConverted.sourceW} x ${restoredConverted.sourceH}`);
      setFocusColorName('');
      setUndoStack([]);
      setRedoStack([]);
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
    setConverted(null);
    setImageMeta('-');
    setGridMeta('-');
    setFocusColorName('');
    setFocusColorSearch('');
    setFocusColorMenuOpen(false);
    setEditColorMenuOpen(false);
    setUndoStack([]);
    setRedoStack([]);
    setLastPickedOldColor(null);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setStatusText('已清空結果。');
  };

  return (
    <>
      <header className="topbar">
        <div>
          <h1>PixChi</h1>
          <p className="subtitle">拼豆格線圖轉換 MVP</p>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={() => void loadPalette()}>
            重新載入色庫
          </button>
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
        </div>
      </header>

      <main className="layout">
        <section className="panel controls">
          <h2>轉換設定</h2>

          <label>
            專案名稱
            <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </label>

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
            比對策略
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as MatchStrategy)}>
              <option value="lab_nearest">lab_nearest（DeltaE2000）</option>
              <option value="rgb_nearest">rgb_nearest</option>
            </select>
          </label>

          <label className="switch-row">
            顯示色號文字
            <input type="checkbox" checked={showCode} onChange={(e) => setShowCode(e.target.checked)} />
          </label>

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

          <hr />

          <h3>手動修色</h3>
          <label>
            快速搜尋色號（焦點預覽）
            <div className="color-select" ref={focusColorMenuRef}>
              <button
                type="button"
                className="color-select-trigger"
                onClick={() => setFocusColorMenuOpen((v) => !v)}
              >
                {selectedFocusColor ? (
                  <>
                    <span className="color-pill tiny" style={{ color: selectedFocusColor.hex }} />
                    <span>
                      {selectedFocusColor.name} ({selectedFocusColor.hex})
                    </span>
                  </>
                ) : (
                  <span>請選擇要設為焦點的色號</span>
                )}
              </button>
              {focusColorMenuOpen && (
                <div className="color-select-menu">
                  <div className="color-select-search-wrap">
                    <input
                      type="text"
                      className="color-select-search"
                      placeholder="搜尋已辨識焦點色號..."
                      value={focusColorSearch}
                      onChange={(e) => setFocusColorSearch(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="color-select-option clear-option"
                    onClick={() => {
                      setFocusColorName('');
                      setFocusColorMenuOpen(false);
                    }}
                  >
                    清除焦點
                  </button>
                  {filteredFocusColors.map((c) => (
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
                        {c.name} ({c.hex})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>

          <label>
            選擇替換色號
            <div className="color-select" ref={colorMenuRef}>
              <div className="color-select-trigger-input">
                {selectedEditColor && <span className="color-pill tiny" style={{ color: selectedEditColor.hex }} />}
                <input
                  type="text"
                  placeholder="搜尋可替換色號..."
                  value={editColorMenuOpen ? paletteSearch : selectedEditColor ? `${selectedEditColor.name} (${selectedEditColor.hex})` : ''}
                  onFocus={() => {
                    setEditColorMenuOpen(true);
                    setPaletteSearch('');
                  }}
                  onChange={(e) => {
                    setPaletteSearch(e.target.value);
                    if (!editColorMenuOpen) setEditColorMenuOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredEditColors.length) {
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
                        {c.name} ({c.hex})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>

          <div className="row three">
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
          </div>

          <div className="row three">
            <button className="ghost" onClick={undo}>
              Undo
            </button>
            <button className="ghost" onClick={redo}>
              Redo
            </button>
            <button className="ghost" onClick={replaceAllSameColor}>
              焦點色全替換
            </button>
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
              className={editTool === 'pan' ? 'tool-pan' : editTool === 'erase' ? 'tool-erase' : 'tool-paint'}
              width={960}
              height={960}
              onClick={onCanvasClick}
              onMouseDown={onCanvasMouseDown}
              onMouseMove={onCanvasMouseMove}
              onMouseLeave={onCanvasMouseLeave}
            />
          </div>
          <p className="hint">手型可拖曳視圖，滾輪或右上按鈕可縮放；上色與橡皮擦可編輯格子。</p>
          {proMode && <p className="hint">Pro 模式已啟用：可使用尺規與參考線（並會套用到 PDF 匯出）。</p>}
        </section>

        <section className="panel stats">
          <h2>完整色號統計</h2>
          <div className="totals">
            <div>
              <strong>{totalBeads}</strong>
              <span>總顆數</span>
            </div>
            <div>
              <strong>{statsRows.length}</strong>
              <span>總色號數</span>
            </div>
            <div>
              <strong>{estCost.toFixed(2)}</strong>
              <span>預估材料成本</span>
            </div>
          </div>

          <div className="row two">
            <label>
              單顆成本
              <input
                type="number"
                min={0}
                step={0.01}
                value={unitCost}
                onChange={(e) => setUnitCost(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              人工費
              <input type="number" min={0} step={1} value={labor} onChange={(e) => setLabor(Number(e.target.value) || 0)} />
            </label>
          </div>
          <label>
            利潤率 (%)
            <input type="number" min={0} step={1} value={margin} onChange={(e) => setMargin(Number(e.target.value) || 0)} />
          </label>
          <div className="quote-box">
            <span>建議報價</span>
            <strong>{quotePrice.toFixed(2)}</strong>
          </div>

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
                  <th>Hex</th>
                  <th>顆數</th>
                  <th>佔比</th>
                  <th>成本</th>
                </tr>
              </thead>
              <tbody>
                {filteredStatsRows.map((r) => (
                  <tr key={r.name}>
                    <td>
                      <span className="color-pill" style={{ color: r.hex }} />
                      {r.name}
                    </td>
                    <td>
                      <span className="color-pill" style={{ color: r.hex }} />
                      {r.hex}
                    </td>
                    <td>{r.count}</td>
                    <td>{r.ratio.toFixed(2)}%</td>
                    <td>{r.lineCost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

function clampInt(value: number, min: number, max: number) {
  const n = Math.floor(Number(value) || 0);
  return Math.min(max, Math.max(min, n));
}

function buildExportGridCanvas(
  converted: Converted,
  showCode: boolean,
  beadMm: number,
  options?: { showRuler?: boolean; showGuide?: boolean; guideEvery?: number }
) {
  const pxPerMm = 96 / 25.4;
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

    if (showCode && cell >= 14 && !c.isEmpty) {
      ctx.fillStyle = pickTextColor(c.hex);
      ctx.font = `${Math.max(9, Math.floor(cell * 0.35))}px Segoe UI`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
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

function dataUrlToBytes(dataUrl: string) {
  const b64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function drawPdfBead(page: any, x: number, y: number, hex: string, rgbFn: (...args: number[]) => any) {
  const [r, g, b] = hexToRgb(hex);
  page.drawCircle({ x, y, size: 5, color: rgbFn(1, 1, 1), borderColor: rgbFn(r / 255, g / 255, b / 255), borderWidth: 2.2 });
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
  const x0 = Math.floor((cellX * width) / cols);
  const x1 = Math.floor(((cellX + 1) * width) / cols);
  const y0 = Math.floor((cellY * height) / rows);
  const y1 = Math.floor(((cellY + 1) * height) / rows);

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
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

function median(arr: number[]) {
  if (!arr.length) return 0;
  arr.sort((a, b) => a - b);
  const m = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[m] : Math.round((arr[m - 1] + arr[m]) / 2);
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




