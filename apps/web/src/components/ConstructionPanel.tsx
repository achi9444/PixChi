import React from 'react';

export type ConstructionTask = {
  id: string;
  title: string;
  subtitle: string;
  count: number;
  cellIndices: number[];
};

export type ConstructionOrderRule = 'count_desc' | 'count_asc' | 'title_asc' | 'title_desc' | 'manual';

export type ConstructionTemplate = {
  id: string;
  name: string;
  strategy: 'block' | 'color';
  rule: Exclude<ConstructionOrderRule, 'manual'>;
  colorPriority?: string[];
  inferredFromManual?: boolean;
};

function formatConstructionRuleLabel(rule: Exclude<ConstructionOrderRule, 'manual'>) {
  if (rule === 'count_asc') return '顆數少到多';
  if (rule === 'title_asc') return '名稱A-Z';
  if (rule === 'title_desc') return '名稱Z-A';
  return '顆數多到少';
}

type ConstructionPanelProps = {
  proMode: boolean;
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

export default function ConstructionPanel({
  proMode,
  constructionMode,
  onConstructionModeChange,
  constructionStrategy,
  onConstructionStrategyChange,
  constructionOrderRule,
  onConstructionOrderRuleChange,
  constructionShowDoneOverlay,
  onConstructionShowDoneOverlayChange,
  constructionRuleInference,
  onApplyInferredRule,
  constructionTemplates,
  constructionTemplateId,
  onConstructionTemplateIdChange,
  constructionTemplateName,
  onConstructionTemplateNameChange,
  onApplyConstructionTemplate,
  onDeleteConstructionTemplate,
  onSaveConstructionTemplate,
  constructionTasks,
  constructionDoneMap,
  constructionCurrentTaskId,
  constructionDragTaskId,
  constructionItemRefs,
  constructionListRef,
  constructionCompletionText,
  onToggleConstructionDone,
  onReorderConstructionTask,
  onConstructionDragTaskIdChange,
  onSetFocusFromTask,
}: ConstructionPanelProps) {
  return (
    <div className="construction-box">
      <div className="draft-box-head">
        <strong>拼豆順序模式</strong>
        <span>完成：{constructionCompletionText}</span>
      </div>
      <div className="construction-section">
        <label className="switch-row">
          1. 啟用施工順序
          <input type="checkbox" checked={constructionMode} onChange={(e) => onConstructionModeChange(e.target.checked)} />
        </label>
      </div>
      <div className="construction-section">
        <div className="row two">
          <label>
            2. 任務分組
            <select value={constructionStrategy} onChange={(e) => onConstructionStrategyChange(e.target.value as 'block' | 'color')}>
              <option value="block">區塊優先</option>
              <option value="color">顏色優先</option>
            </select>
          </label>
          <label>
            排列規則
            <select
              value={constructionOrderRule}
              onChange={(e) => {
                onConstructionOrderRuleChange(e.target.value as ConstructionOrderRule);
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
            onChange={(e) => onConstructionShowDoneOverlayChange(e.target.checked)}
          />
        </label>
      </div>
      {proMode && constructionOrderRule === 'manual' && constructionRuleInference && (
        <div className="construction-section">
          <div className="construction-inline-tip">
            <span className="hint">
              建議：{formatConstructionRuleLabel(constructionRuleInference.bestRule as Exclude<ConstructionOrderRule, 'manual'>)}（{(constructionRuleInference.bestScore * 100).toFixed(1)}%）
            </span>
            <button type="button" className="ghost construction-mini-btn" onClick={onApplyInferredRule}>
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
              <select value={constructionTemplateId} onChange={(e) => onConstructionTemplateIdChange(e.target.value)}>
                <option value="">選擇模板</option>
                {constructionTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}（{t.strategy === 'block' ? '區塊' : '顏色'} / {t.inferredFromManual ? '手動色序' : formatConstructionRuleLabel(t.rule)}）
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="primary" onClick={onApplyConstructionTemplate} disabled={!constructionTemplateId}>
              套用
            </button>
            <button type="button" className="ghost" onClick={onDeleteConstructionTemplate} disabled={!constructionTemplateId}>
              刪除
            </button>
          </div>
          <div className="row two">
            <input
              type="text"
              value={constructionTemplateName}
              onChange={(e) => onConstructionTemplateNameChange(e.target.value)}
              placeholder="儲存目前排序為新模板"
            />
            <button type="button" className="ghost" onClick={onSaveConstructionTemplate}>
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
          const active = constructionCurrentTaskId === task.id;
          return (
            <div
              key={task.id}
              ref={(el) => {
                constructionItemRefs.current[task.id] = el;
              }}
              className={`construction-task-item ${active ? 'active' : ''} ${done ? 'done' : ''}`.trim()}
              draggable={proMode && constructionOrderRule === 'manual'}
              onDragStart={() => onConstructionDragTaskIdChange(task.id)}
              onDragOver={(e) => {
                if (!proMode || constructionOrderRule !== 'manual') return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                if (!proMode || constructionOrderRule !== 'manual') return;
                e.preventDefault();
                onReorderConstructionTask(constructionDragTaskId, task.id);
                onConstructionDragTaskIdChange('');
              }}
              onClick={() => onSetFocusFromTask(task.id)}
            >
              <label>
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => onToggleConstructionDone(task.id, e.target.checked)}
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
  );
}
