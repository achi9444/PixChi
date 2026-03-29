import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ConstructionPanel, { type ConstructionTask, type ConstructionOrderRule, type ConstructionTemplate } from './ConstructionPanel';

type FloatingConstructionPanelProps = {
  visible: boolean;
  onClose: () => void;
  proMode: boolean;
  showCode: boolean;
  onShowCodeChange: (v: boolean) => void;
  showRuler: boolean;
  onShowRulerChange: (v: boolean) => void;
  showGuide: boolean;
  onShowGuideChange: (v: boolean) => void;
  guideEvery: number;
  onGuideEveryChange: (v: number) => void;
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
};

const DEFAULT_POS = { x: 80, y: 80 };
const DEFAULT_SIZE = { w: 360, h: 480 };
const MIN_W = 260, MAX_W = 560, MIN_H = 240;

export default function FloatingConstructionPanel({
  visible,
  onClose,
  ...panelProps
}: FloatingConstructionPanelProps) {
  const [pos, setPos] = useState(DEFAULT_POS);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const handleClose = useCallback(() => {
    onClose();
    setPos(DEFAULT_POS);
    setSize(DEFAULT_SIZE);
    setMinimized(false);
  }, [onClose]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = ev.clientX - resizeRef.current.startX;
      const dh = ev.clientY - resizeRef.current.startY;
      const maxH = window.innerHeight * 0.9;
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

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.startPosX + ev.clientX - dragRef.current.startX,
        y: dragRef.current.startPosY + ev.clientY - dragRef.current.startY,
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  // Keep within viewport
  useEffect(() => {
    if (!visible || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    let nx = pos.x, ny = pos.y;
    if (rect.right > window.innerWidth) nx = Math.max(0, window.innerWidth - rect.width - 8);
    if (rect.bottom > window.innerHeight) ny = Math.max(0, window.innerHeight - rect.height - 8);
    if (nx < 0) nx = 8;
    if (ny < 0) ny = 8;
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
  }, [visible, pos]);

  if (!visible) return null;

  const completionText = panelProps.constructionCompletionText;

  if (minimized) {
    return createPortal(
      <div
        className="floating-panel-mini"
        style={{ left: pos.x, top: pos.y }}
        onClick={() => setMinimized(false)}
        onMouseDown={onDragStart}
        title={`施工面板 — ${completionText}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
        <span style={{ fontSize: 11 }}>{completionText}</span>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="floating-panel"
      ref={panelRef}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, display: 'flex', flexDirection: 'column' }}
    >
      <div className="floating-panel-titlebar" onMouseDown={onDragStart}>
        <span className="floating-panel-title">施工面板</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{completionText}</span>
        <div className="floating-panel-actions">
          <button type="button" className="floating-panel-btn" onClick={() => setMinimized(true)} title="縮小">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button type="button" className="floating-panel-btn" onClick={handleClose} title="關閉">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div className="floating-panel-body" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
        <ConstructionPanel {...panelProps} />
      </div>

      <div className="floating-panel-resize" onMouseDown={onResizeStart} />
    </div>,
    document.body,
  );
}
