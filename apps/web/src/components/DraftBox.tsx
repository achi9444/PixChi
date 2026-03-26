import { useState } from 'react';
import type { AuthUser } from '../services/api';
import type { DraftSummary } from '../services/draftStore';

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

function getCloudDraftLimit(user: AuthUser | null): number | null {
  if (!user) return null;
  if (user.role === 'member') return 5;
  return null;
}

type DraftBoxProps = {
  authUser: AuthUser | null;
  lastSavedAt: number | null;
  storageEstimateText: string;
  drafts: DraftSummary[];
  activeDraftId: string;
  activeDraft: DraftSummary | null;
  activeVersionMeta: { id: string; at: number; reason: 'manual' | 'autosave'; note?: string } | null;
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
};

export default function DraftBox({
  authUser,
  lastSavedAt,
  storageEstimateText,
  drafts,
  activeDraftId,
  activeDraft,
  isDraftBusy,
  draftRenameInput,
  onDraftRenameInputChange,
  activeDraftVersionId,
  draftVersionNoteInput,
  onDraftVersionNoteInputChange,
  compareVersionA,
  compareVersionB,
  compareSummary,
  onCompareVersionAChange,
  onCompareVersionBChange,
  proMode,
  getDraftLimit,
  onSelectDraft,
  onSelectDraftVersion,
  onSaveDraft,
  onRemoveDraft,
  onSaveDraftRename,
  onSaveVersionNote,
  onCompareDraftVersions,
}: DraftBoxProps) {
  const [versionOpen, setVersionOpen] = useState(false);
  return (
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
            onSelectDraft(id);
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
              <input type="text" value={draftRenameInput} onChange={(e) => onDraftRenameInputChange(e.target.value)} disabled={!activeDraftId} />
            </label>
            <button type="button" className="ghost" onClick={onSaveDraftRename} disabled={isDraftBusy || !activeDraftId}>
              更新名稱
            </button>
          </div>
          <button
            type="button"
            className="ghost"
            style={{ width: '100%', textAlign: 'left', fontSize: 12 }}
            onClick={() => setVersionOpen((v) => !v)}
          >
            {versionOpen ? '▲ 收起版本管理' : '▼ 版本管理'}
          </button>
          {versionOpen && (
            <>
              <label>
                復原點版本
                <select
                  value={activeDraftVersionId}
                  onChange={(e) => {
                    onSelectDraftVersion(e.target.value);
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
                    onChange={(e) => onDraftVersionNoteInputChange(e.target.value)}
                    placeholder="例如：完成頭髮修色"
                    disabled={!activeDraftVersionId}
                  />
                </label>
                <button type="button" className="ghost" onClick={onSaveVersionNote} disabled={isDraftBusy || !activeDraftVersionId}>
                  儲存備註
                </button>
              </div>
              <div className="row two">
                <label>
                  比較版本 A
                  <select value={compareVersionA} onChange={(e) => onCompareVersionAChange(e.target.value)} disabled={!activeDraftId}>
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
                  <select value={compareVersionB} onChange={(e) => onCompareVersionBChange(e.target.value)} disabled={!activeDraftId}>
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
                <button type="button" className="ghost" onClick={onCompareDraftVersions} disabled={isDraftBusy || !activeDraftId}>
                  比較版本差異
                </button>
                {compareSummary && <div className="hint">{compareSummary}</div>}
              </div>
            </>
          )}
        </>
      )}
      <div className="row two">
        <button type="button" className="ghost" onClick={() => onSaveDraft({ asNew: true, reason: 'manual' })} disabled={isDraftBusy}>
          新增草稿
        </button>
        <button type="button" className="ghost" onClick={() => onSaveDraft({ reason: 'manual' })} disabled={isDraftBusy || !activeDraftId}>
          手動存檔
        </button>
      </div>
      <div className="row one">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            if (!activeDraftId) return;
            onRemoveDraft();
          }}
          disabled={isDraftBusy || !activeDraftId}
        >
          刪除目前草稿
        </button>
      </div>
    </div>
  );
}
