import { useEffect, useState } from 'react';
import type { ApiClient, AuthUser, DesignDto, MarketCreatorDto } from '../services/api';

type Props = {
  username: string;
  apiClient: ApiClient;
  authUser: AuthUser | null;
  onNavigate?: (page: string, username?: string) => void;
};

function DesignCard({ design, onClick }: { design: DesignDto; onClick: () => void }) {
  return (
    <div
      className="creator-public-design-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={design.title}
    >
      <div className="creator-public-design-img-wrap">
        {design.previewImage ? (
          <img src={design.previewImage} alt={design.title} className="creator-public-design-img" />
        ) : (
          <div className="creator-public-design-placeholder">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
        )}
      </div>
      <div className="creator-public-design-info">
        <p className="creator-public-design-title">{design.title}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`badge-license ${design.licenseType === 'commercial' ? 'commercial' : ''}`} style={{ fontSize: 11 }}>
            {design.licenseType === 'commercial' ? '商業' : '個人'}
          </span>
          {design.price != null ? (
            <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>NT$ {design.price.toLocaleString()}</span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>面議</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreatorPublicPage({ username, apiClient, authUser, onNavigate }: Props) {
  const [creator, setCreator] = useState<MarketCreatorDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDesign, setSelectedDesign] = useState<DesignDto | null>(null);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setError('');
    apiClient.getMarketCreatorProfile(username)
      .then((c) => setCreator(c))
      .catch(() => setError('找不到此創作者'))
      .finally(() => setLoading(false));
  }, [username, apiClient]);

  if (loading) {
    return (
      <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <p className="hint">載入中...</p>
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="page-shell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 }}>
        <p style={{ color: 'var(--muted)' }}>{error || '找不到此創作者'}</p>
        <button className="ghost" onClick={() => onNavigate?.('market')}>回到市集</button>
      </div>
    );
  }

  const displayName = creator.displayName || creator.username;
  const designs = creator.designs ?? [];
  const allTags = [...(creator.specialties ?? []), ...(creator.styleTags ?? [])];

  return (
    <div className="page-shell">
      {/* ── Banner ── */}
      <div className="creator-public-banner">
        <div className="creator-public-header">
          {/* 頭像 */}
          {creator.avatarImage ? (
            <img src={creator.avatarImage} alt={displayName} className="creator-public-avatar" />
          ) : (
            <div className="creator-public-avatar-fallback" aria-hidden="true">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          {/* 名稱 + Meta */}
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 700 }}>{displayName}</h2>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)' }}>@{creator.username}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span className={creator.acceptingOrders ? 'badge-accepting' : 'badge-paused'}>
                {creator.acceptingOrders ? '接單中' : '暫停接單'}
              </span>
              {creator.location && (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3, verticalAlign: 'middle' }} aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  {creator.location}
                </span>
              )}
              {creator.priceRange && (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{creator.priceRange}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="page-content-inner" style={{ maxWidth: 860 }}>

          {/* ── 關於我 ── */}
          {(creator.bio || allTags.length > 0 || creator.turnaround) && (
            <div className="creator-public-section">
              <p className="creator-public-section-title">關於我</p>
              {creator.bio && (
                <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.7 }}>{creator.bio}</p>
              )}
              {creator.turnaround && (
                <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: 'middle' }} aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {creator.turnaround}
                </p>
              )}
              {allTags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(creator.specialties ?? []).map((t) => (
                    <span key={t} className="tag" style={{ background: '#e8f4fd', color: '#2980b9' }}>{t}</span>
                  ))}
                  {(creator.styleTags ?? []).map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 聯絡方式（登入可見）── */}
          <div className="creator-public-section">
            <p className="creator-public-section-title">聯絡方式</p>
            {authUser ? (
              creator.externalLinks?.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {creator.externalLinks.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="creator-link-btn"
                    >
                      {link.label}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }} aria-hidden="true">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="hint" style={{ fontSize: 13 }}>此創作者尚未設定聯絡方式</p>
              )
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>登入後即可查看聯絡方式</p>
                <button className="ghost" style={{ fontSize: 13, width: 'auto' }} onClick={() => onNavigate?.('main')}>
                  前往登入
                </button>
              </div>
            )}
          </div>

          {/* ── 設計作品 ── */}
          <div className="creator-public-section">
            <p className="creator-public-section-title">設計作品（{designs.length} 件）</p>
            {designs.length === 0 ? (
              <p className="hint" style={{ fontSize: 13 }}>尚無公開作品</p>
            ) : (
              <div className="creator-public-designs-grid">
                {designs.map((d) => (
                  <DesignCard key={d.id} design={d} onClick={() => setSelectedDesign(d)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 設計圖 Lightbox ── */}
      {selectedDesign && (
        <div
          className="lightbox-backdrop"
          onClick={() => setSelectedDesign(null)}
          role="dialog"
          aria-modal="true"
          aria-label={selectedDesign.title}
        >
          <div
            className="lightbox-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="lightbox-close"
              onClick={() => setSelectedDesign(null)}
              aria-label="關閉"
            >
              ✕
            </button>
            {selectedDesign.previewImage && (
              <img src={selectedDesign.previewImage} alt={selectedDesign.title} className="lightbox-img" />
            )}
            <div className="lightbox-info">
              <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>{selectedDesign.title}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className={`badge-license ${selectedDesign.licenseType === 'commercial' ? 'commercial' : ''}`}>
                  {selectedDesign.licenseType === 'commercial' ? '商業授權' : '個人使用'}
                </span>
                {selectedDesign.price != null ? (
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>NT$ {selectedDesign.price.toLocaleString()}</span>
                ) : (
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>面議</span>
                )}
              </div>
              {selectedDesign.description && (
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{selectedDesign.description}</p>
              )}
              {selectedDesign.tags?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {selectedDesign.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
