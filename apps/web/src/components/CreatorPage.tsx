import { useEffect, useState } from 'react';
import type { ApiClient, CreatorProfileDto, DesignDto, DraftSummaryDto, ExternalLink } from '../services/api';
import { drawWatermark } from './PublishDesignModal';

type Props = {
  apiClient: ApiClient;
};

export default function CreatorPage({ apiClient }: Props) {
  const [tab, setTab] = useState<'profile' | 'designs'>('profile');

  return (
    <div className="creator-page">
      <div className="market-header">
        <h2>創作者後台</h2>
        <p className="hint">管理你的個人資料與設計圖</p>
      </div>

      <div className="market-tabs">
        <button
          className={tab === 'profile' ? 'primary' : 'ghost'}
          onClick={() => setTab('profile')}
        >
          個人資料
        </button>
        <button
          className={tab === 'designs' ? 'primary' : 'ghost'}
          onClick={() => setTab('designs')}
        >
          設計圖管理
        </button>
      </div>

      {tab === 'profile' ? (
        <ProfileEditor apiClient={apiClient} />
      ) : (
        <DesignManager apiClient={apiClient} />
      )}
    </div>
  );
}

// ─── 個人資料編輯 ────────────────────────────────────────────

function ProfileEditor({ apiClient }: { apiClient: ApiClient }) {
  const [profile, setProfile] = useState<CreatorProfileDto | null>(null);
  const [bio, setBio] = useState('');
  const [styleTags, setStyleTags] = useState('');
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [watermarkText, setWatermarkText] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    apiClient.getCreatorProfile().then((p) => {
      setProfile(p);
      setBio(p.bio ?? '');
      setStyleTags((p.styleTags ?? []).join('、'));
      setAcceptingOrders(p.acceptingOrders);
      setLinks(p.externalLinks ?? []);
      setWatermarkText(p.watermarkText ?? '');
    });
  }, [apiClient]);

  function addLink() {
    setLinks((prev) => [...prev, { label: '', url: '' }]);
  }

  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateLink(i: number, field: 'label' | 'url', value: string) {
    setLinks((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      const tags = styleTags.split(/[、\s]+/).map((t) => t.trim()).filter(Boolean);
      const cleanLinks = links.filter((l) => l.label.trim() && l.url.trim());
      await apiClient.putCreatorProfile({
        bio: bio || undefined,
        styleTags: tags,
        externalLinks: cleanLinks,
        acceptingOrders,
        watermarkText: watermarkText || undefined,
      });
      setStatus('已儲存');
    } catch (err: any) {
      setStatus('儲存失敗：' + (err?.message ?? '未知錯誤'));
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="hint" style={{ padding: 24 }}>載入中...</p>;

  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <form onSubmit={handleSave}>
        <label>
          自我介紹
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="簡單介紹你的風格、擅長的拼豆類型..."
            rows={4}
            maxLength={500}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </label>

        <label>
          風格標籤
          <input
            type="text"
            value={styleTags}
            onChange={(e) => setStyleTags(e.target.value)}
            placeholder="遊戲、動漫、可愛風（頓號分隔）"
          />
        </label>

        <label className="inline-check" style={{ margin: '12px 0' }}>
          <input
            type="checkbox"
            checked={acceptingOrders}
            onChange={(e) => setAcceptingOrders(e.target.checked)}
          />
          目前接單中
        </label>

        <label>
          預設浮水印文字
          <input
            type="text"
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="上架設計圖時的浮水印預設值，留空則使用帳號名稱"
            maxLength={50}
          />
        </label>

        <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '12px 16px', marginTop: 12 }}>
          <legend style={{ padding: '0 6px', color: 'var(--muted)', fontSize: 13 }}>外部聯絡連結</legend>
          {links.length === 0 && (
            <p className="hint" style={{ fontSize: 13, margin: '4px 0 8px' }}>尚未新增任何連結</p>
          )}
          {links.map((link, i) => (
            <div key={i} className="link-row">
              <input
                type="text"
                value={link.label}
                onChange={(e) => updateLink(i, 'label', e.target.value)}
                placeholder="名稱（如：賣貨便、LINE）"
                maxLength={30}
                style={{ width: 120, flexShrink: 0 }}
              />
              <input
                type="text"
                value={link.url}
                onChange={(e) => updateLink(i, 'url', e.target.value)}
                placeholder="網址或 ID"
                maxLength={300}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="ghost"
                style={{ padding: '4px 8px', color: 'var(--danger-text)', flexShrink: 0 }}
                onClick={() => removeLink(i)}
                aria-label="刪除此連結"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ghost"
            style={{ marginTop: 8, fontSize: 13 }}
            onClick={addLink}
            disabled={links.length >= 10}
          >
            ＋ 新增連結
          </button>
        </fieldset>

        {status && (
          <p className={`status ${status.startsWith('儲存失敗') ? 'error' : ''}`} style={{ marginTop: 10 }}>
            {status}
          </p>
        )}

        <div style={{ marginTop: 12 }}>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── 設計圖管理 ──────────────────────────────────────────────

function DesignManager({ apiClient }: { apiClient: ApiClient }) {
  const [designs, setDesigns] = useState<DesignDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  function reload() {
    setLoading(true);
    apiClient
      .getCreatorDesigns()
      .then((r) => setDesigns(r.designs))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, [apiClient]);

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除此設計圖？')) return;
    try {
      await apiClient.deleteDesign(id);
      reload();
    } catch (err: any) {
      alert('刪除失敗：' + (err?.message ?? '未知錯誤'));
    }
  }

  async function handleToggleStatus(design: DesignDto) {
    const next = design.status === 'published' ? 'draft' : 'published';
    try {
      await apiClient.updateDesign(design.id, { status: next });
      reload();
    } catch (err: any) {
      alert('更新失敗：' + (err?.message ?? '未知錯誤'));
    }
  }

  if (loading) return <p className="hint" style={{ padding: 24 }}>載入中...</p>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button className="primary" onClick={() => setShowForm(true)}>
          ＋ 新增設計圖
        </button>
        <span className="hint">共 {designs.length} 個</span>
      </div>

      {showForm && (
        <DesignForm
          apiClient={apiClient}
          onSaved={() => { setShowForm(false); reload(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {designs.length === 0 ? (
        <p className="hint">尚未建立任何設計圖</p>
      ) : (
        <div className="design-list">
          {designs.map((d) => (
            <div key={d.id} className="design-item panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong>{d.title}</strong>
                  <span
                    className={d.status === 'published' ? 'badge-accepting' : 'badge-paused'}
                    style={{ marginLeft: 8, fontSize: 12 }}
                  >
                    {d.status === 'published' ? '已公開' : '草稿'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="ghost"
                    style={{ fontSize: 12, padding: '4px 8px' }}
                    onClick={() => handleToggleStatus(d)}
                  >
                    {d.status === 'published' ? '改為草稿' : '公開上架'}
                  </button>
                  <button
                    className="ghost"
                    style={{ fontSize: 12, padding: '4px 8px', color: 'var(--danger-text)' }}
                    onClick={() => handleDelete(d.id)}
                  >
                    刪除
                  </button>
                </div>
              </div>
              {d.description && <p className="hint" style={{ marginTop: 4, fontSize: 13 }}>{d.description}</p>}
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>
                <span>{d.licenseType === 'commercial' ? '商業授權' : '個人使用'}</span>
                {d.price != null ? <span>NT$ {d.price.toLocaleString()}</span> : <span>價格面議</span>}
                <span>⏱ {d.estimatedTime || '由創作者告知'}</span>
                {d.tags.length > 0 && (
                  <span>{d.tags.map((t) => `#${t}`).join(' ')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DesignForm({
  apiClient,
  onSaved,
  onCancel,
}: {
  apiClient: ApiClient;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [licenseType, setLicenseType] = useState<'personal' | 'commercial'>('personal');
  const [price, setPrice] = useState('');
  const [estimatedTime, setEstimatedTime] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 預覽圖（從草稿渲染）
  const [cleanDataUrl, setCleanDataUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [watermarkText, setWatermarkText] = useState('');

  // 草稿選取器
  const [draftPickerOpen, setDraftPickerOpen] = useState(false);
  const [draftList, setDraftList] = useState<DraftSummaryDto[]>([]);
  const [loadingDraft, setLoadingDraft] = useState(false);

  function applyWatermark(text: string, base: string) {
    if (!base) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      if (text.trim()) drawWatermark(ctx, canvas.width, canvas.height, text);
      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = base;
  }

  function handleWatermarkChange(text: string) {
    setWatermarkText(text);
    applyWatermark(text, cleanDataUrl);
  }

  async function openDraftPicker() {
    setDraftPickerOpen(true);
    if (draftList.length > 0) return;
    setLoadingDraft(true);
    try {
      const res = await apiClient.listProjects();
      setDraftList(res.drafts ?? []);
    } finally {
      setLoadingDraft(false);
    }
  }

  async function pickDraft(id: string) {
    setLoadingDraft(true);
    setDraftPickerOpen(false);
    try {
      const res = await apiClient.getProjectSnapshot(id);
      const snap = res.snapshot as any;
      const converted = snap?.converted;
      if (!converted?.cells?.length) {
        setError('此草稿尚無轉換結果，請先在主工具轉換後再取用。');
        return;
      }
      const { cols, rows, cells } = converted as {
        cols: number;
        rows: number;
        cells: Array<{ x: number; y: number; hex: string; isEmpty?: boolean }>;
      };
      const CELL = Math.max(2, Math.min(8, Math.floor(400 / Math.max(cols, rows))));
      const canvas = document.createElement('canvas');
      canvas.width = cols * CELL;
      canvas.height = rows * CELL;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const cell of cells) {
        if (cell.isEmpty) continue;
        ctx.fillStyle = cell.hex;
        ctx.fillRect(cell.x * CELL, cell.y * CELL, CELL, CELL);
      }
      if (!title.trim()) {
        const found = draftList.find((d) => d.id === id);
        if (found) setTitle(found.name);
      }
      const clean = canvas.toDataURL('image/jpeg', 0.85);
      setCleanDataUrl(clean);
      applyWatermark(watermarkText, clean);
    } catch {
      setError('草稿讀取失敗，請稍後再試。');
    } finally {
      setLoadingDraft(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('請輸入標題');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const parsedTags = tags
        .split(/[、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const parsedPrice = price.trim() ? parseInt(price.trim(), 10) : undefined;
      await apiClient.createDesign({
        title: title.trim(),
        description: description.trim() || undefined,
        tags: parsedTags,
        licenseType,
        price: isNaN(parsedPrice as number) ? undefined : parsedPrice,
        estimatedTime: estimatedTime.trim() || undefined,
        previewImage: previewUrl || undefined,
        status,
      });
      onSaved();
    } catch (err: any) {
      setError('建立失敗：' + (err?.message ?? '未知錯誤'));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <h3>新增設計圖</h3>
          <button type="button" className="ghost topbar-icon" onClick={onCancel} aria-label="關閉">✕</button>
        </div>
        <div className="publish-layout">

          {/* 左欄：預覽圖 + 草稿選取 + 浮水印 */}
          <div className="publish-preview-col">
            <div className="design-draft-preview-wrap" onClick={draftPickerOpen ? () => setDraftPickerOpen(false) : openDraftPicker}>
              {previewUrl ? (
                <img src={previewUrl} alt="預覽圖" className="publish-preview-img" />
              ) : (
                <div className="design-draft-placeholder">
                  {loadingDraft ? '渲染中…' : '點擊選取草稿'}
                </div>
              )}
              {!loadingDraft && (
                <div className="design-draft-overlay">
                  {previewUrl ? '更換草稿' : '選取草稿'}
                </div>
              )}
              {draftPickerOpen && (
                <div className="draft-picker-panel" onClick={(e) => e.stopPropagation()}>
                  {loadingDraft ? (
                    <p className="hint" style={{ fontSize: 12, margin: 0 }}>載入中…</p>
                  ) : draftList.length === 0 ? (
                    <p className="hint" style={{ fontSize: 12, margin: 0 }}>沒有雲端草稿</p>
                  ) : (
                    draftList.map((d) => (
                      <button key={d.id} type="button" className="draft-picker-card" onClick={() => pickDraft(d.id)}>
                        <span className="draft-picker-card-name">{d.name}</span>
                        <span className="draft-picker-card-date">{new Date(d.updatedAt).toLocaleDateString('zh-TW')}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <label style={{ marginTop: 8 }}>
              浮水印文字
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => handleWatermarkChange(e.target.value)}
                placeholder="留空不加浮水印"
                maxLength={50}
                disabled={!cleanDataUrl}
              />
            </label>
            {previewUrl && (
              <button
                type="button"
                className="ghost"
                style={{ fontSize: 12, padding: '4px 0', color: 'var(--muted)', textAlign: 'left' }}
                onClick={() => { setCleanDataUrl(''); setPreviewUrl(''); setWatermarkText(''); }}
              >
                移除預覽圖
              </button>
            )}
          </div>

          {/* 右欄：表單 */}
          <form className="publish-form-col" onSubmit={handleSubmit}>
            <label>
              標題 *
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="設計圖名稱" maxLength={100} autoFocus />
            </label>
            <label>
              說明
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="作品描述、尺寸、使用色板..." rows={3} maxLength={1000} style={{ resize: 'vertical' }} />
            </label>
            <label>
              標籤
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="遊戲、動漫、自訂（頓號分隔）" />
            </label>
            <div className="row two">
              <label>
                授權類型
                <select value={licenseType} onChange={(e) => setLicenseType(e.target.value as 'personal' | 'commercial')}>
                  <option value="personal">個人使用</option>
                  <option value="commercial">商業授權</option>
                </select>
              </label>
              <label>
                參考售價（NT$）
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="留空為面議" min={0} max={99999} />
              </label>
            </div>
            <label>
              預計製作時間
              <input type="text" value={estimatedTime} onChange={(e) => setEstimatedTime(e.target.value)} placeholder="留空顯示「由創作者告知」，例：3-5天" maxLength={100} />
            </label>
            <label>
              發布狀態
              <select value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}>
                <option value="draft">草稿（不公開）</option>
                <option value="published">公開上架</option>
              </select>
            </label>
            {error && <p className="status error">{error}</p>}
            <div className="row two" style={{ marginTop: 4 }}>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? '建立中...' : '建立'}
              </button>
              <button type="button" className="ghost" onClick={onCancel}>取消</button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
