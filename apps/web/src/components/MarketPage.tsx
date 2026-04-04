import { useEffect, useState } from 'react';
import type { ApiClient, DesignDto, MarketCreatorDto } from '../services/api';
import type { AuthUser } from '../services/api';
import type { AppPage } from './TopBar';

type Tab = 'designs' | 'creators';

type Props = {
  apiClient: ApiClient | null;
  authUser: AuthUser | null;
  onNavigate?: (page: AppPage, username?: string) => void;
};

export default function MarketPage({ apiClient, authUser, onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>('designs');
  const [searchQ, setSearchQ] = useState('');
  const [inputQ, setInputQ] = useState('');
  const [onlyAccepting, setOnlyAccepting] = useState(false);
  const [licenseFilter, setLicenseFilter] = useState<'all' | 'personal' | 'commercial'>('all');
  const [sortFilter, setSortFilter] = useState<'newest' | 'price_asc' | 'price_desc'>('newest');

  const [designs, setDesigns] = useState<DesignDto[]>([]);
  const [designsTotal, setDesignsTotal] = useState(0);
  const [designsPage, setDesignsPage] = useState(1);
  const [designsTotalPages, setDesignsTotalPages] = useState(1);

  const [creators, setCreators] = useState<MarketCreatorDto[]>([]);
  const [creatorsTotal, setCreatorsTotal] = useState(0);
  const [creatorsPage, setCreatorsPage] = useState(1);
  const [creatorsTotalPages, setCreatorsTotalPages] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Design detail modal
  const [selectedDesign, setSelectedDesign] = useState<DesignDto | null>(null);
  const [selectedDesignIdx, setSelectedDesignIdx] = useState<number>(-1);

  useEffect(() => {
    if (!apiClient) return;
    if (tab === 'designs') {
      setLoading(true);
      setError('');
      apiClient
        .getMarketDesigns({
          page: designsPage,
          q: searchQ || undefined,
          license: licenseFilter === 'all' ? undefined : licenseFilter,
          sort: sortFilter !== 'newest' ? sortFilter : undefined,
        })
        .then((r) => {
          setDesigns(r.designs);
          setDesignsTotal(r.total);
          setDesignsTotalPages(r.totalPages);
        })
        .catch(() => setError('載入失敗，請稍後再試'))
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      setError('');
      apiClient
        .getMarketCreators({
          page: creatorsPage,
          q: searchQ || undefined,
          accepting: onlyAccepting ? true : undefined,
        })
        .then((r) => {
          setCreators(r.creators);
          setCreatorsTotal(r.total);
          setCreatorsTotalPages(r.totalPages);
        })
        .catch(() => setError('載入失敗，請稍後再試'))
        .finally(() => setLoading(false));
    }
  }, [apiClient, tab, searchQ, designsPage, creatorsPage, licenseFilter, sortFilter, onlyAccepting]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQ(inputQ.trim());
    setDesignsPage(1);
    setCreatorsPage(1);
  }

  function switchTab(next: Tab) {
    setTab(next);
    setDesignsPage(1);
    setCreatorsPage(1);
  }

  function openDesign(design: DesignDto) {
    const idx = designs.findIndex((d) => d.id === design.id);
    setSelectedDesign(design);
    setSelectedDesignIdx(idx);
  }

  function navigateDesign(dir: -1 | 1) {
    const next = selectedDesignIdx + dir;
    if (next >= 0 && next < designs.length) {
      setSelectedDesign(designs[next]);
      setSelectedDesignIdx(next);
    }
  }

  return (
    <div className="page-shell market-page">
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h2>拼豆市集</h2>
            <p className="hint">瀏覽創作者設計圖，或尋找接訂單的創作者</p>
          </div>
        </div>
      </div>

      <div className="page-sticky-bar">
        <div className="page-sticky-bar-inner market-sticky-inner">
          <div className="page-tabs">
            <button
              type="button"
              className={`page-tab-btn${tab === 'designs' ? ' active' : ''}`}
              onClick={() => switchTab('designs')}
            >
              設計圖
            </button>
            <button
              type="button"
              className={`page-tab-btn${tab === 'creators' ? ' active' : ''}`}
              onClick={() => switchTab('creators')}
            >
              創作者
            </button>
          </div>

          <div className="market-toolbar-inline">
            <form className="market-search" onSubmit={handleSearch}>
              <input
                type="text"
                value={inputQ}
                onChange={(e) => setInputQ(e.target.value)}
                placeholder={tab === 'designs' ? '搜尋設計圖標題、說明...' : '搜尋創作者名稱、風格...'}
              />
              <button type="submit" className="primary">搜尋</button>
              {searchQ && (
                <button type="button" className="ghost" onClick={() => { setSearchQ(''); setInputQ(''); }}>
                  清除
                </button>
              )}
            </form>

            {tab === 'designs' && (
              <div className="market-filters">
                <select
                  value={licenseFilter}
                  onChange={(e) => {
                    setLicenseFilter(e.target.value as 'all' | 'personal' | 'commercial');
                    setDesignsPage(1);
                  }}
                  aria-label="授權類型"
                >
                  <option value="all">全部授權</option>
                  <option value="personal">個人使用</option>
                  <option value="commercial">商業授權</option>
                </select>
                <select
                  value={sortFilter}
                  onChange={(e) => {
                    setSortFilter(e.target.value as 'newest' | 'price_asc' | 'price_desc');
                    setDesignsPage(1);
                  }}
                  aria-label="排序方式"
                >
                  <option value="newest">最新上架</option>
                  <option value="price_asc">價格低到高</option>
                  <option value="price_desc">價格高到低</option>
                </select>
              </div>
            )}

            {tab === 'creators' && (
              <div className="market-filters">
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={onlyAccepting}
                    onChange={(e) => { setOnlyAccepting(e.target.checked); setCreatorsPage(1); }}
                  />
                  只顯示接單中
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="page-content-inner">
          {error && <p className="status error">{error}</p>}

          {loading ? (
            <p className="hint" style={{ padding: 24, textAlign: 'center' }}>載入中...</p>
          ) : tab === 'designs' ? (
            <>
              <p className="hint market-count">共 {designsTotal} 個設計圖</p>
              {designs.length === 0 ? (
                <div className="market-empty">
                  <p>目前還沒有公開的設計圖</p>
                  <p className="hint">創作者上架後就會出現在這裡，也可以切換到「創作者」頁面找人接訂單</p>
                  {!authUser && <p className="hint">登入後可直接聯絡創作者</p>}
                </div>
              ) : (
                <div className="market-grid">
                  {designs.map((d) => (
                    <DesignCard key={d.id} design={d} onSelect={openDesign} />
                  ))}
                </div>
              )}
              <Pagination page={designsPage} totalPages={designsTotalPages} onChange={setDesignsPage} />
            </>
          ) : (
            <>
              <p className="hint market-count">共 {creatorsTotal} 位創作者</p>
              {creators.length === 0 ? (
                <div className="market-empty">
                  <p>目前還沒有創作者</p>
                  <p className="hint">訂閱 Pro 方案後即可建立創作者主頁並在此曝光</p>
                </div>
              ) : (
                <div className="market-creator-list">
                  {creators.map((c) => (
                    <CreatorCard
                      key={c.username}
                      creator={c}
                      onSelect={() => onNavigate?.('creator-public', c.username)}
                    />
                  ))}
                </div>
              )}
              <Pagination page={creatorsPage} totalPages={creatorsTotalPages} onChange={setCreatorsPage} />
            </>
          )}
        </div>
      </div>

      {selectedDesign && (
        <DesignDetailModal
          design={selectedDesign}
          designs={designs}
          selectedIdx={selectedDesignIdx}
          authUser={authUser}
          onClose={() => setSelectedDesign(null)}
          onNavigate={navigateDesign}
          onViewCreator={(username) => onNavigate?.('creator-public', username)}
        />
      )}
    </div>
  );
}

// ─── Design Card ─────────────────────────────────────────────

function DesignCard({ design, onSelect }: { design: DesignDto; onSelect: (d: DesignDto) => void }) {
  const displayName = design.creator?.displayName || design.creator?.username;
  return (
    <div
      className="design-card panel"
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(design)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(design)}
    >
      {design.previewImage ? (
        <img src={design.previewImage} alt={design.title} className="design-card-preview" />
      ) : (
        <div className="design-card-preview design-card-no-preview" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>
      )}
      <div className="design-card-header">
        <h3 className="design-title">{design.title}</h3>
        <span className={`badge-license${design.licenseType === 'commercial' ? ' commercial' : ''}`}>
          {design.licenseType === 'commercial' ? '商業' : '個人'}
        </span>
      </div>
      {design.description && <p className="design-desc hint">{design.description}</p>}
      {design.tags.length > 0 && (
        <div className="design-tags">
          {design.tags.map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
      )}
      <div className="design-card-footer">
        {design.price != null ? (
          <span className="design-price">NT$ {design.price.toLocaleString()}</span>
        ) : (
          <span className="hint">價格面議</span>
        )}
        {displayName && <span className="design-creator hint">by {displayName}</span>}
        {design.creator && (
          design.creator.acceptingOrders
            ? <span className="badge-accepting">接單中</span>
            : <span className="badge-paused">暫停接單</span>
        )}
      </div>
    </div>
  );
}

// ─── Creator Card ─────────────────────────────────────────────

function CreatorCard({ creator, onSelect }: { creator: MarketCreatorDto; onSelect: () => void }) {
  const displayName = creator.displayName || creator.username;
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <div
      className="creator-card panel"
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      <div className="creator-card-header">
        {/* 頭像 */}
        {creator.avatarImage ? (
          <img src={creator.avatarImage} alt={displayName} className="creator-card-avatar" />
        ) : (
          <div className="creator-card-avatar-fallback" aria-hidden="true">{avatarLetter}</div>
        )}
        {/* 名稱 + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <h3 className="creator-name" style={{ margin: 0 }}>{displayName}</h3>
            <span className={creator.acceptingOrders ? 'badge-accepting' : 'badge-paused'}>
              {creator.acceptingOrders ? '接單中' : '暫停接單'}
            </span>
          </div>
          {creator.location && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>{creator.location}</p>
          )}
          {creator.priceRange && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>{creator.priceRange}</p>
          )}
        </div>
      </div>
      {creator.bio && <p className="creator-bio">{creator.bio}</p>}
      {creator.styleTags.length > 0 && (
        <div className="design-tags">
          {creator.styleTags.map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
      )}
      <p className="hint" style={{ marginTop: 6, fontSize: 13 }}>設計圖：{creator.designCount ?? 0} 個</p>
    </div>
  );
}

// ─── Design Detail Modal (3-column) ──────────────────────────

function DesignDetailModal({
  design,
  designs,
  selectedIdx,
  authUser,
  onClose,
  onNavigate,
  onViewCreator,
}: {
  design: DesignDto;
  designs: DesignDto[];
  selectedIdx: number;
  authUser: AuthUser | null;
  onClose: () => void;
  onNavigate: (dir: -1 | 1) => void;
  onViewCreator: (username: string) => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < designs.length - 1;
  const creator = design.creator;
  const creatorDisplayName = creator?.displayName || creator?.username;

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lightboxOpen) {
        if (e.key === 'Escape') setLightboxOpen(false);
        return;
      }
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && canPrev) onNavigate(-1);
      if (e.key === 'ArrowRight' && canNext) onNavigate(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate, canPrev, canNext, lightboxOpen]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-box market-detail-modal-box">
        {/* ── Modal header ── */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {/* Prev / next arrows */}
            <button
              type="button"
              className="ghost icon-btn"
              onClick={() => onNavigate(-1)}
              disabled={!canPrev}
              aria-label="上一個設計圖"
              style={{ opacity: canPrev ? 1 : 0.3 }}
            >
              ←
            </button>
            <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {design.title}
            </h3>
            <button
              type="button"
              className="ghost icon-btn"
              onClick={() => onNavigate(1)}
              disabled={!canNext}
              aria-label="下一個設計圖"
              style={{ opacity: canNext ? 1 : 0.3 }}
            >
              →
            </button>
          </div>
          <button type="button" className="ghost icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        {/* ── 3-column body ── */}
        <div className="market-detail-three-col">
          {/* Col 1: Preview image */}
          <div className="market-detail-preview-col">
            {design.previewImage ? (
              <div
                className="market-detail-preview-btn"
                onClick={() => setLightboxOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setLightboxOpen(true)}
                aria-label="點擊放大預覽"
                title="點擊放大"
              >
                <img src={design.previewImage} alt={design.title} className="market-detail-preview" />
                <span className="market-detail-preview-zoom-hint">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                  </svg>
                </span>
              </div>
            ) : (
              <div className="market-detail-preview-col market-detail-no-preview">
                <span className="hint">無預覽圖</span>
              </div>
            )}
          </div>

          {/* Col 2: Info */}
          <div className="market-detail-info-col">
            <div className="market-detail-badges">
              <span className={`badge-license${design.licenseType === 'commercial' ? ' commercial' : ''}`}>
                {design.licenseType === 'commercial' ? '商業授權' : '個人使用'}
              </span>
              {creator && (
                creator.acceptingOrders
                  ? <span className="badge-accepting">接單中</span>
                  : <span className="badge-paused">暫停接單</span>
              )}
            </div>

            {design.price != null ? (
              <p className="market-detail-price">NT$ {design.price.toLocaleString()}</p>
            ) : (
              <p className="hint">價格面議</p>
            )}

            {design.estimatedTime && (
              <p className="hint" style={{ fontSize: 13 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: 'middle' }} aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                {design.estimatedTime}
              </p>
            )}

            {design.description && (
              <p className="market-detail-desc">{design.description}</p>
            )}

            {design.tags.length > 0 && (
              <div className="design-tags" style={{ marginTop: 4 }}>
                {design.tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            )}
          </div>

          {/* Col 3: Creator mini */}
          {creator && (
            <div className="market-detail-creator-mini">
              {/* 頭像 */}
              {creator.avatarImage ? (
                <img src={creator.avatarImage} alt={creatorDisplayName ?? ''} className="market-detail-creator-avatar" />
              ) : (
                <div className="market-detail-creator-avatar market-detail-creator-avatar-fallback" aria-hidden="true">
                  {(creatorDisplayName ?? '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 14 }}>{creatorDisplayName}</p>
                {creator.location && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{creator.location}</p>
                )}
              </div>
              {creator.acceptingOrders
                ? <span className="badge-accepting" style={{ fontSize: 12 }}>接單中</span>
                : <span className="badge-paused" style={{ fontSize: 12 }}>暫停接單</span>
              }

              <button
                type="button"
                className="primary"
                style={{ fontSize: 13, marginTop: 4 }}
                onClick={() => { onClose(); onViewCreator(creator.username); }}
              >
                查看完整主頁
              </button>

              {!authUser && (
                <p className="hint" style={{ fontSize: 12 }}>登入後可查看聯絡方式</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Lightbox ── */}
      {lightboxOpen && design.previewImage && (
        <div
          className="lightbox-backdrop"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="預覽圖放大"
          style={{ zIndex: 1100 }}
        >
          <img
            src={design.previewImage}
            alt={design.title}
            className="lightbox-fullimg"
            onClick={(e) => e.stopPropagation()}
          />
          <button className="lightbox-close" onClick={() => setLightboxOpen(false)} aria-label="關閉放大">✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button className="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>← 上一頁</button>
      <span className="hint">{page} / {totalPages}</span>
      <button className="ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>下一頁 →</button>
    </div>
  );
}
