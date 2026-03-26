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

  return (
    <div className="market-page">
      <div className="market-header">
        <h2>拼豆市集</h2>
        <p className="hint">瀏覽創作者設計圖，或尋找接訂單的創作者</p>
      </div>

      <div className="market-tabs">
        <button
          className={tab === 'designs' ? 'primary' : 'ghost'}
          onClick={() => switchTab('designs')}
        >
          設計圖
        </button>
        <button
          className={tab === 'creators' ? 'primary' : 'ghost'}
          onClick={() => switchTab('creators')}
        >
          創作者
        </button>
      </div>

      <div className="market-toolbar">
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
                <DesignCard key={d.id} design={d} authUser={authUser} />
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
                <CreatorCard key={c.username} creator={c} authUser={authUser} />
              ))}
            </div>
          )}
          <Pagination page={creatorsPage} totalPages={creatorsTotalPages} onChange={setCreatorsPage} />
        </>
      )}
    </div>
  );
}

function DesignCard({ design, authUser }: { design: DesignDto; authUser: AuthUser | null }) {
  const licenseLabel = design.licenseType === 'commercial' ? '商業授權' : '個人使用';
  return (
    <div className="design-card panel">
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
        <span className="hint">⏱ {design.estimatedTime || '由創作者告知'}</span>
        {design.creator && (
          <span className="design-creator hint">by {design.creator.username}</span>
        )}
        {authUser && design.creator ? (
          design.creator.acceptingOrders ? (
            <span className="badge-accepting">接單中</span>
          ) : (
            <span className="hint">暫停接單</span>
          )
        ) : null}
      </div>
    </div>
  );
}

function CreatorCard({ creator, authUser }: { creator: MarketCreatorDto; authUser: AuthUser | null }) {
  const links = creator.externalLinks ?? [];
  const canContact = authUser && (authUser.role === 'member' || authUser.role === 'pro' || authUser.role === 'admin');

  return (
    <div className="creator-card panel">
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
      <p className="hint" style={{ marginTop: 6 }}>設計圖：{creator.designCount ?? 0} 個</p>
      {canContact && links.length > 0 ? (
        <div className="creator-links">
          {links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="link-btn">
              {l.label}
            </a>
          ))}
        </div>
      ) : canContact ? (
        <p className="hint" style={{ fontSize: 12 }}>此創作者尚未設定聯絡方式</p>
      ) : (
        <p className="hint" style={{ fontSize: 12 }}>登入後可聯絡創作者</p>
      )}
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
