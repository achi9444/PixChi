import { useEffect, useRef, useState } from 'react';
import type { ApiClient, CreatorProfileDto, DesignDto, DraftSummaryDto, ExternalLink } from '../services/api';
import { drawWatermark } from './PublishDesignModal';

type Props = {
  apiClient: ApiClient;
  embedded?: boolean;
  section?: 'profile' | 'designs';
  onProfileSaved?: () => void;
};

export default function CreatorPage({ apiClient, embedded = false, section, onProfileSaved }: Props) {
  const [tab, setTab] = useState<'profile' | 'designs'>('profile');

  const tabs = (
    <div className="page-tabs">
      <button
        type="button"
        className={`page-tab-btn${tab === 'profile' ? ' active' : ''}`}
        onClick={() => setTab('profile')}
      >
        個人資料
      </button>
      <button
        type="button"
        className={`page-tab-btn${tab === 'designs' ? ' active' : ''}`}
        onClick={() => setTab('designs')}
      >
        設計圖管理
      </button>
    </div>
  );

  const content = (
    <>
      {tab === 'profile' ? (
        <ProfileEditor apiClient={apiClient} onSaved={onProfileSaved} />
      ) : (
        <DesignManager apiClient={apiClient} />
      )}
    </>
  );

  // embedded + section：由外層 UserProfilePage 控制導覽，不顯示內部 tab bar
  if (embedded && section) {
    return (
      <div className="creator-embedded">
        {section === 'designs' && (
          <div className="creator-embedded-actions">
            <div className="creator-tab-actions" id="creator-tab-actions-portal" />
          </div>
        )}
        <div className="creator-embedded-content">
          {section === 'profile' ? (
            <ProfileEditor apiClient={apiClient} onSaved={onProfileSaved} />
          ) : (
            <DesignManager apiClient={apiClient} />
          )}
        </div>
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="creator-embedded">
        <div className="creator-embedded-tabs">
          {tabs}
          {tab === 'designs' && <div className="creator-tab-actions" id="creator-tab-actions-portal" />}
        </div>
        <div className="creator-embedded-content">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell creator-page">
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h2>創作者後台</h2>
            <p className="hint">管理你的個人資料與設計圖</p>
          </div>
        </div>
      </div>

      <div className="page-sticky-bar">
        <div className="page-sticky-bar-inner creator-sticky-inner">
          {tabs}
          {tab === 'designs' && (
            <div className="creator-tab-actions" id="creator-tab-actions-portal" />
          )}
        </div>
      </div>

      <div className="page-content">
        <div className="page-content-inner">
          {content}
        </div>
      </div>
    </div>
  );
}

// ─── 個人資料編輯 ────────────────────────────────────────────

function compressImageToBase64(file: File, maxBytes = 100000): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const scale = Math.min(1, Math.sqrt(maxBytes / (width * height * 0.15)));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      const data = canvas.toDataURL('image/jpeg', 0.82);
      resolve(data);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function ProfileEditor({ apiClient, onSaved }: { apiClient: ApiClient; onSaved?: () => void }) {
  const [profile, setProfile] = useState<CreatorProfileDto | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [location, setLocation] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [turnaround, setTurnaround] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [bio, setBio] = useState('');
  const [styleTags, setStyleTags] = useState('');
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [watermarkText, setWatermarkText] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    apiClient.getCreatorProfile().then((p) => {
      setProfile(p);
      setDisplayName(p.displayName ?? '');
      setAvatarImage(p.avatarImage ?? null);
      setLocation(p.location ?? '');
      setPriceRange(p.priceRange ?? '');
      setTurnaround(p.turnaround ?? '');
      setSpecialties((p.specialties ?? []).join('、'));
      setBio(p.bio ?? '');
      setStyleTags((p.styleTags ?? []).join('、'));
      setAcceptingOrders(p.acceptingOrders);
      setLinks(p.externalLinks ?? []);
      setWatermarkText(p.watermarkText ?? '');
    });
  }, [apiClient]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    try {
      const data = await compressImageToBase64(file, 100000);
      setAvatarImage(data);
    } catch {
      alert('圖片處理失敗');
    } finally {
      setAvatarBusy(false);
      e.target.value = '';
    }
  }

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
      const specs = specialties.split(/[、\s]+/).map((t) => t.trim()).filter(Boolean);
      const cleanLinks = links.filter((l) => l.label.trim() && l.url.trim());
      await apiClient.putCreatorProfile({
        displayName: displayName.trim() || undefined,
        avatarImage: avatarImage || undefined,
        location: location.trim() || undefined,
        priceRange: priceRange.trim() || undefined,
        turnaround: turnaround.trim() || undefined,
        specialties: specs.length ? specs : undefined,
        bio: bio || undefined,
        styleTags: tags,
        externalLinks: cleanLinks,
        acceptingOrders,
        watermarkText: watermarkText || undefined,
      });
      setStatus('已儲存');
      onSaved?.();
    } catch (err: any) {
      setStatus('儲存失敗：' + (err?.message ?? '未知錯誤'));
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="hint" style={{ padding: 24 }}>載入中...</p>;

  return (
    <div className="creator-profile-layout">
      <div className="panel creator-profile-form-col">
        <form onSubmit={handleSave}>

        {/* ── 頭像 ── */}
        <div className="avatar-upload-row">
          <div
            className="avatar-upload-preview"
            onClick={() => avatarInputRef.current?.click()}
            title="點擊更換大頭貼"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && avatarInputRef.current?.click()}
            aria-label="上傳大頭貼"
          >
            {avatarImage ? (
              <img src={avatarImage} alt="大頭貼預覽" className="avatar-upload-img" />
            ) : (
              <span className="avatar-upload-placeholder">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
            )}
            {avatarBusy && <div className="avatar-upload-overlay">處理中...</div>}
          </div>
          <div className="avatar-upload-info">
            <button
              type="button"
              className="ghost"
              style={{ fontSize: 13 }}
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarBusy}
            >
              {avatarImage ? '更換大頭貼' : '上傳大頭貼'}
            </button>
            {avatarImage && (
              <button
                type="button"
                className="ghost"
                style={{ fontSize: 13, color: 'var(--danger-text)' }}
                onClick={() => setAvatarImage(null)}
              >
                移除
              </button>
            )}
            <span className="hint" style={{ fontSize: 12 }}>JPG / PNG，壓縮至 100KB</span>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
        </div>

        <label>
          顯示名稱
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="公開顯示的名稱（留空則顯示帳號名）"
            maxLength={30}
          />
        </label>

        <div className="row two">
          <label>
            地區
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="如：台北、高雄"
              maxLength={30}
            />
          </label>
          <label>
            接單狀態
            <label className="switch-row" style={{ marginTop: 8 }}>
              目前接單中
              <input
                type="checkbox"
                checked={acceptingOrders}
                onChange={(e) => setAcceptingOrders(e.target.checked)}
              />
            </label>
          </label>
        </div>

        <label>
          接單價格說明
          <input
            type="text"
            value={priceRange}
            onChange={(e) => setPriceRange(e.target.value)}
            placeholder="如：NT$200–800 / 件"
            maxLength={60}
          />
        </label>

        <label>
          交件時間說明
          <input
            type="text"
            value={turnaround}
            onChange={(e) => setTurnaround(e.target.value)}
            placeholder="如：通常 2–4 週"
            maxLength={60}
          />
        </label>

        <label>
          專長技術
          <input
            type="text"
            value={specialties}
            onChange={(e) => setSpecialties(e.target.value)}
            placeholder="如：漸層技法、大圖（頓號分隔）"
          />
        </label>

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

      <div className="creator-profile-aside">
        <div className="panel">
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>公開頁面預覽</p>
          {/* 頭像 + 名稱 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {avatarImage ? (
              <img src={avatarImage} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
                ?
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName || '（顯示名稱）'}</div>
              {location && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{location}</div>}
            </div>
          </div>
          {/* 接單狀態 */}
          <div style={{ marginBottom: 8 }}>
            <span className={acceptingOrders ? 'badge-accepting' : 'badge-paused'} style={{ fontSize: 12 }}>
              {acceptingOrders ? '接單中' : '暫停接單'}
            </span>
            {priceRange && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>{priceRange}</span>}
          </div>
          {turnaround && <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--muted)' }}>⏱ {turnaround}</p>}
          {bio && <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{bio}</p>}
          {/* 標籤群 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {specialties.split(/[、\s]+/).filter(Boolean).map((t) => (
              <span key={t} className="tag" style={{ background: '#e8f4fd', color: '#2980b9' }}>{t}</span>
            ))}
            {styleTags.split(/[、\s]+/).filter(Boolean).map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
          {!bio && !styleTags && !specialties && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--faint)' }}>尚無內容</p>
          )}
        </div>
        <div className="panel">
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            完整填寫個人資料與標籤，可提升在市集的曝光度。
            外部聯絡連結僅登入會員可見。
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── 設計圖管理 ──────────────────────────────────────────────

function DesignManager({ apiClient }: { apiClient: ApiClient }) {
  const [designs, setDesigns] = useState<DesignDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDesign, setEditingDesign] = useState<DesignDto | null>(null);

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

  function closeForm() {
    setShowForm(false);
    setEditingDesign(null);
  }

  if (loading) return <p className="hint" style={{ padding: 24 }}>載入中...</p>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <button className="primary" style={{ width: 'auto' }} onClick={() => { setEditingDesign(null); setShowForm(true); }}>
          ＋ 新增設計圖
        </button>
        <span className="hint">共 {designs.length} 個</span>
      </div>

      {(showForm || editingDesign) && (
        <DesignForm
          apiClient={apiClient}
          editingDesign={editingDesign}
          onSaved={() => { closeForm(); reload(); }}
          onCancel={closeForm}
        />
      )}

      {designs.length === 0 ? (
        <p className="hint">尚未建立任何設計圖</p>
      ) : (
        <div className="design-mgmt-grid">
          {designs.map((d) => (
            <div key={d.id} className="design-item panel design-mgmt-card">
              {/* 左：正方形縮圖 */}
              <div className="design-mgmt-thumb-wrap">
                {d.previewImage ? (
                  <img src={d.previewImage} alt={d.title} className="design-mgmt-thumb" />
                ) : (
                  <div className="design-mgmt-thumb-placeholder">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                )}
              </div>

              {/* 右：資訊 + 操作 */}
              <div className="design-mgmt-info">
                <div className="design-mgmt-info-top">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{d.title}</strong>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className={d.status === 'published' ? 'badge-accepting' : 'badge-paused'} style={{ fontSize: 11 }}>
                        {d.status === 'published' ? '已公開' : '草稿'}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {d.licenseType === 'commercial' ? '商業授權' : '個人使用'}
                      </span>
                      {d.price != null
                        ? <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>NT$ {d.price.toLocaleString()}</span>
                        : <span style={{ fontSize: 12, color: 'var(--muted)' }}>面議</span>
                      }
                    </div>
                  </div>
                </div>
                {d.description && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {d.description}
                  </p>
                )}
                <div className="design-mgmt-actions">
                  <button className="ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => { setEditingDesign(d); setShowForm(false); }}>編輯</button>
                  <button className="ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => handleToggleStatus(d)}>
                    {d.status === 'published' ? '下架' : '上架'}
                  </button>
                  <button className="ghost" style={{ fontSize: 12, padding: '3px 10px', color: 'var(--danger-text)' }} onClick={() => handleDelete(d.id)}>刪除</button>
                </div>
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
  editingDesign,
  onSaved,
  onCancel,
}: {
  apiClient: ApiClient;
  editingDesign?: DesignDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!editingDesign;
  const [title, setTitle] = useState(editingDesign?.title ?? '');
  const [description, setDescription] = useState(editingDesign?.description ?? '');
  const [tags, setTags] = useState((editingDesign?.tags ?? []).join('、'));
  const [licenseType, setLicenseType] = useState<'personal' | 'commercial'>(editingDesign?.licenseType ?? 'personal');
  const [price, setPrice] = useState(editingDesign?.price != null ? String(editingDesign.price) : '');
  const [estimatedTime, setEstimatedTime] = useState(editingDesign?.estimatedTime ?? '');
  const [status, setStatus] = useState<'draft' | 'published'>(editingDesign?.status ?? 'draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 預覽圖（從草稿渲染）
  const [cleanDataUrl, setCleanDataUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState(editingDesign?.previewImage ?? '');
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
      const parsedTags = tags.split(/[、\s]+/).map((t) => t.trim()).filter(Boolean);
      const parsedPrice = price.trim() ? parseInt(price.trim(), 10) : undefined;
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        tags: parsedTags,
        licenseType,
        price: isNaN(parsedPrice as number) ? undefined : parsedPrice,
        estimatedTime: estimatedTime.trim() || undefined,
        previewImage: previewUrl || undefined,
        status,
      };
      if (isEdit) {
        await apiClient.updateDesign(editingDesign!.id, payload);
      } else {
        await apiClient.createDesign(payload);
      }
      onSaved();
    } catch (err: any) {
      setError((isEdit ? '儲存失敗：' : '建立失敗：') + (err?.message ?? '未知錯誤'));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <h3>{isEdit ? '編輯設計圖' : '新增設計圖'}</h3>
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
                {saving ? (isEdit ? '儲存中...' : '建立中...') : (isEdit ? '儲存變更' : '建立')}
              </button>
              <button type="button" className="ghost" onClick={onCancel}>取消</button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
