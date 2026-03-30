import { useEffect, useState } from 'react';
import type { ApiClient, DesignDto, MarketCreatorDto } from '../services/api';
import type { AuthUser } from '../services/api';

type Tab = 'designs' | 'creators';

type Props = {
  apiClient: ApiClient | null;
  authUser: AuthUser | null;
};

export default function MarketPage({ apiClient, authUser }: Props) {
  const [tab, setTab] = useState<Tab>('designs');
  const [searchQ, setSearchQ] = useState('');
  const [inputQ, setInputQ] = useState('');
  const [onlyAccepting, setOnlyAccepting] = useState(false);
  const [licenseFilter, setLicenseFilter] = useState<'all' | 'personal' | 'commercial'>('all');

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

  // Modal state
  const [selectedDesign, setSelectedDesign] = useState<DesignDto | null>(null);
  const [creatorModalOpen, setCreatorModalOpen] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<MarketCreatorDto | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(false);

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
  }, [apiClient, tab, searchQ, designsPage, creatorsPage, licenseFilter, onlyAccepting]);

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

  async function openCreatorProfile(username: string) {
    setSelectedDesign(null);
    setCreatorModalOpen(true);
    setCreatorLoading(true);
    setSelectedCreator(null);
    try {
      if (!apiClient) return;
      const data = await apiClient.getMarketCreatorProfile(username);
      setSelectedCreator(data);
    } catch {
      setCreatorModalOpen(false);
    } finally {
      setCreatorLoading(false);
    }
  }

  function closeCreatorModal() {
    setCreatorModalOpen(false);
    setSelectedCreator(null);
    setCreatorLoading(false);
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
                >
                  <option value="all">全部授權</option>
                  <option value="personal">個人使用</option>
                  <option value="commercial">商業授權</option>
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
                    <DesignCard
                      key={d.id}
                      design={d}
                      onSelect={setSelectedDesign}
                    />
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
                      onSelect={(c) => openCreatorProfile(c.username)}
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
          authUser={authUser}
          onClose={() => setSelectedDesign(null)}
          onViewCreator={openCreatorProfile}
        />
      )}

      {creatorModalOpen && (
        <CreatorProfileModal
          creator={selectedCreator}
          loading={creatorLoading}
          authUser={authUser}
          onClose={closeCreatorModal}
          onViewDesign={(design) => {
            setCreatorModalOpen(false);
            setSelectedCreator(null);
            setSelectedDesign(design);
          }}
        />
      )}
    </div>
  );
}

function DesignCard({
  design,
  onSelect,
}: {
  design: DesignDto;
  onSelect: (d: DesignDto) => void;
}) {
  const licenseLabel = design.licenseType === 'commercial' ? '商業授權' : '個人使用';
  return (
    <div
      className="design-card panel"
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(design)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(design)}
    >
      {design.previewImage && (
        <img src={design.previewImage} alt={design.title} className="design-card-preview" />
      )}
      <div className="design-card-header">
        <h3 className="design-title">{design.title}</h3>
        <span className="design-license-badge">{licenseLabel}</span>
      </div>
      {design.description && <p className="design-desc hint">{design.description}</p>}
      {design.tags.length > 0 && (
        <div className="design-tags">
          {design.tags.map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      )}
      <div className="design-card-footer">
        {design.price != null ? (
          <span className="design-price">NT$ {design.price.toLocaleString()}</span>
        ) : (
          <span className="hint">價格面議</span>
        )}
        {design.creator && (
          <span className="design-creator hint">by {design.creator.username}</span>
        )}
        {design.creator && (
          design.creator.acceptingOrders ? (
            <span className="badge-accepting">接單中</span>
          ) : (
            <span className="badge-paused">暫停接單</span>
          )
        )}
      </div>
    </div>
  );
}

function CreatorCard({
  creator,
  onSelect,
}: {
  creator: MarketCreatorDto;
  onSelect: (c: MarketCreatorDto) => void;
}) {
  return (
    <div
      className="creator-card panel"
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(creator)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(creator)}
    >
      <div className="creator-card-header">
        <h3 className="creator-name">{creator.username}</h3>
        <span className={creator.acceptingOrders ? 'badge-accepting' : 'badge-paused'}>
          {creator.acceptingOrders ? '接單中' : '暫停接單'}
        </span>
      </div>
      {creator.bio && <p className="creator-bio">{creator.bio}</p>}
      {creator.styleTags.length > 0 && (
        <div className="design-tags">
          {creator.styleTags.map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      )}
      <p className="hint" style={{ marginTop: 6, fontSize: 13 }}>設計圖：{creator.designCount ?? 0} 個</p>
      <p className="hint" style={{ fontSize: 12, color: 'var(--primary)' }}>點擊查看詳細資訊</p>
    </div>
  );
}

function DesignDetailModal({
  design,
  authUser,
  onClose,
  onViewCreator,
}: {
  design: DesignDto;
  authUser: AuthUser | null;
  onClose: () => void;
  onViewCreator: (username: string) => void;
}) {
  const licenseLabel = design.licenseType === 'commercial' ? '商業授權' : '個人使用';
  const canContact = authUser && (authUser.role === 'member' || authUser.role === 'pro' || authUser.role === 'admin');

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-box market-detail-modal-box">
        <div className="modal-header">
          <h3>{design.title}</h3>
          <button type="button" className="ghost icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        <div className="market-detail-layout">
          {design.previewImage ? (
            <div className="market-detail-preview-col">
              <img
                src={design.previewImage}
                alt={design.title}
                className="market-detail-preview"
              />
            </div>
          ) : (
            <div className="market-detail-preview-col market-detail-no-preview">
              <span className="hint">無預覽圖</span>
            </div>
          )}

          <div className="market-detail-info-col">
            <div className="market-detail-badges">
              <span className="design-license-badge">{licenseLabel}</span>
              {design.creator && (
                design.creator.acceptingOrders ? (
                  <span className="badge-accepting">接單中</span>
                ) : (
                  <span className="badge-paused">暫停接單</span>
                )
              )}
            </div>

            {design.price != null ? (
              <p className="market-detail-price">NT$ {design.price.toLocaleString()}</p>
            ) : (
              <p className="hint">價格面議</p>
            )}

            {design.estimatedTime && (
              <p className="hint" style={{ fontSize: 13 }}>預計製作時間：{design.estimatedTime}</p>
            )}

            {design.description && (
              <p className="market-detail-desc">{design.description}</p>
            )}

            {design.tags.length > 0 && (
              <div className="design-tags" style={{ marginTop: 4 }}>
                {design.tags.map((t) => (
                  <span key={t} className="tag">{t}</span>
                ))}
              </div>
            )}

            {design.creator && (
              <div className="market-detail-creator-section">
                <div className="market-detail-creator-row">
                  <span className="market-detail-creator-name">by {design.creator.username}</span>
                </div>
                {canContact ? (
                  <button
                    type="button"
                    className="primary market-detail-creator-btn"
                    onClick={() => onViewCreator(design.creator!.username)}
                  >
                    查看創作者主頁
                  </button>
                ) : (
                  <p className="hint" style={{ fontSize: 12 }}>
                    <button
                      type="button"
                      className="ghost market-detail-creator-btn"
                      onClick={() => onViewCreator(design.creator!.username)}
                    >
                      查看創作者主頁
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreatorProfileModal({
  creator,
  loading,
  authUser,
  onClose,
  onViewDesign,
}: {
  creator: MarketCreatorDto | null;
  loading: boolean;
  authUser: AuthUser | null;
  onClose: () => void;
  onViewDesign: (design: DesignDto) => void;
}) {
  const canContact = authUser && (authUser.role === 'member' || authUser.role === 'pro' || authUser.role === 'admin');
  const links = creator?.externalLinks ?? [];

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-box market-creator-modal-box">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0 }}>{creator?.username ?? '創作者主頁'}</h3>
            {creator && (
              <span className={creator.acceptingOrders ? 'badge-accepting' : 'badge-paused'}>
                {creator.acceptingOrders ? '接單中' : '暫停接單'}
              </span>
            )}
          </div>
          <button type="button" className="ghost icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        {loading ? (
          <div className="market-creator-modal-loading">
            <p className="hint">載入中...</p>
          </div>
        ) : creator ? (
          <div className="market-creator-modal-body">
            {creator.bio && (
              <div className="market-creator-section">
                <p className="market-creator-bio-full">{creator.bio}</p>
              </div>
            )}

            {creator.styleTags.length > 0 && (
              <div className="market-creator-section">
                <p className="market-creator-section-label">風格標籤</p>
                <div className="design-tags">
                  {creator.styleTags.map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="market-creator-section">
              <p className="market-creator-section-label">聯絡方式</p>
              {canContact ? (
                links.length > 0 ? (
                  <div className="creator-links">
                    {links.map((l, i) => (
                      <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="link-btn">
                        {l.label}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="hint" style={{ fontSize: 13 }}>此創作者尚未設定聯絡方式</p>
                )
              ) : (
                <p className="hint" style={{ fontSize: 13 }}>登入後可查看聯絡方式</p>
              )}
            </div>

            {creator.designs && creator.designs.length > 0 && (
              <div className="market-creator-section">
                <p className="market-creator-section-label">
                  設計圖（{creator.designs.length} 個）
                </p>
                <div className="market-creator-designs-grid">
                  {creator.designs.map((d) => (
                    <div
                      key={d.id}
                      className="market-creator-design-thumb"
                      onClick={() => onViewDesign({ ...d, creator: { username: creator.username, acceptingOrders: creator.acceptingOrders } })}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && onViewDesign({ ...d, creator: { username: creator.username, acceptingOrders: creator.acceptingOrders } })}
                    >
                      {d.previewImage ? (
                        <img
                          src={d.previewImage}
                          alt={d.title}
                          className="market-creator-design-thumb-img"
                        />
                      ) : (
                        <div className="market-creator-design-thumb-placeholder">
                          <span className="hint" style={{ fontSize: 11 }}>無預覽</span>
                        </div>
                      )}
                      <p className="market-creator-design-thumb-title">{d.title}</p>
                      {d.price != null ? (
                        <p className="market-creator-design-thumb-price">NT$ {d.price.toLocaleString()}</p>
                      ) : (
                        <p className="market-creator-design-thumb-price hint">面議</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {creator.designs && creator.designs.length === 0 && (
              <div className="market-creator-section">
                <p className="hint" style={{ fontSize: 13 }}>此創作者目前尚未上架任何設計圖</p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button className="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← 上一頁
      </button>
      <span className="hint">
        {page} / {totalPages}
      </span>
      <button className="ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        下一頁 →
      </button>
    </div>
  );
}
