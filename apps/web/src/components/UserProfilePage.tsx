import { useEffect, useState } from 'react';
import type { ApiClient, AuthUser, DraftSummaryDto } from '../services/api';
import { ROLE_LABEL } from '../services/api';
import CreatorPage from './CreatorPage';

type ProfileTab = 'account' | 'creator-profile' | 'designs';

type Props = {
  apiClient: ApiClient;
  authUser: AuthUser;
  initialTab?: ProfileTab | 'creator'; // 'creator' 向下相容舊 hash
  onNavigate?: (page: string) => void;
  onProfileSaved?: () => void;
};

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatRelative(ms: number) {
  const diff = Date.now() - ms;
  const d = Math.floor(diff / 86400000);
  if (d === 0) return '今天';
  if (d === 1) return '昨天';
  if (d < 30) return `${d} 天前`;
  return new Date(ms).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
}

export default function UserProfilePage({ apiClient, authUser, initialTab = 'account', onNavigate, onProfileSaved }: Props) {
  // initialTab='creator' → 預設選「創作者資料」（向下相容 #/creator）
  const resolvedInitial: ProfileTab = initialTab === 'creator' ? 'creator-profile' : (initialTab as ProfileTab);
  const [tab, setTab] = useState<ProfileTab>(resolvedInitial);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [avatarImage, setAvatarImage] = useState<string | null>(null);

  // Account tab state
  const [drafts, setDrafts] = useState<DraftSummaryDto[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);

  // Change password
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdStatus, setPwdStatus] = useState('');
  const [pwdError, setPwdError] = useState('');

  const isProOrAdmin = authUser.role === 'pro' || authUser.role === 'admin';
  const avatarLetter = authUser.username.charAt(0).toUpperCase();
  const roleLabel = ROLE_LABEL[authUser.role] ?? authUser.role;

  useEffect(() => {
    // Fetch createdAt and avatar
    apiClient.getAuthMe().then((r) => {
      if (r.user?.createdAt) setCreatedAt(r.user.createdAt);
    }).catch(() => {});

    if (isProOrAdmin) {
      apiClient.getCreatorProfile().then((p) => {
        setAvatarImage(p.avatarImage ?? null);
      }).catch(() => {});
    }

    // Load recent drafts
    apiClient.listProjects().then((r) => {
      const sorted = (r.drafts ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
      setDrafts(sorted.slice(0, 3));
    }).finally(() => setDraftsLoading(false));
  }, [apiClient, isProOrAdmin]);

  function switchTab(next: ProfileTab) {
    setTab(next);
    if (next === 'creator-profile') {
      window.location.hash = '#/creator';
    } else if (next === 'designs') {
      window.location.hash = '#/creator/designs';
    } else {
      window.location.hash = '#/profile';
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError('');
    setPwdStatus('');
    if (newPwd !== confirmPwd) {
      setPwdError('兩次新密碼不一致');
      return;
    }
    if (newPwd.length < 6) {
      setPwdError('新密碼至少需要 6 個字元');
      return;
    }
    setPwdBusy(true);
    try {
      await apiClient.changePassword(oldPwd, newPwd);
      setPwdStatus('密碼已更新');
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err: any) {
      setPwdError('更新失敗：' + (err?.message ?? '未知錯誤'));
    } finally {
      setPwdBusy(false);
    }
  }

  return (
    <div className="page-shell profile-page">
      {/* ── 緊湊頁首（固定 64px）── */}
      <div className="profile-compact-header">
        <div className={`profile-avatar profile-avatar--sm`}>
          {isProOrAdmin && avatarImage ? (
            <img src={avatarImage} alt={authUser.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span>{avatarLetter}</span>
          )}
        </div>
        <div className="profile-compact-header-info">
          <span className="profile-compact-username">{authUser.username}</span>
          <div className="profile-compact-header-meta">
            <span className="badge-role">{roleLabel}</span>
            {createdAt && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>加入於 {formatDate(createdAt)}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── 主體（sidebar + 內容）── */}
      <div className="profile-body">
        {/* 左側 sidebar 導覽 */}
        <nav className="profile-sidebar" aria-label="帳號導覽">
          <button
            type="button"
            className={`profile-nav-btn${tab === 'account' ? ' active' : ''}`}
            onClick={() => switchTab('account')}
          >
            帳號
          </button>
          {isProOrAdmin && (
            <>
              <button
                type="button"
                className={`profile-nav-btn${tab === 'creator-profile' ? ' active' : ''}`}
                onClick={() => switchTab('creator-profile')}
              >
                創作者資料
              </button>
              <button
                type="button"
                className={`profile-nav-btn${tab === 'designs' ? ' active' : ''}`}
                onClick={() => switchTab('designs')}
              >
                設計圖管理
              </button>
            </>
          )}
        </nav>

        {/* 主內容區 */}
        <main className="profile-main">
          {tab === 'creator-profile' ? (
            <CreatorPage apiClient={apiClient} embedded section="profile" onProfileSaved={onProfileSaved} />
          ) : tab === 'designs' ? (
            <CreatorPage apiClient={apiClient} embedded section="designs" onProfileSaved={onProfileSaved} />
          ) : (
            <div className="profile-account-layout">
              {/* 左欄：雲端草稿 */}
              <div className="profile-account-drafts">
                <div className="profile-section">
                  <p className="profile-section-title">雲端草稿</p>
                  {draftsLoading ? (
                    <p className="hint" style={{ padding: '8px 0' }}>載入中...</p>
                  ) : drafts.length === 0 ? (
                    <p className="hint" style={{ padding: '8px 0' }}>尚無雲端草稿</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {drafts.map((d) => (
                        <div key={d.id} className="profile-draft-row">
                          <div>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>{d.name || '未命名'}</span>
                            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>{d.versionCount} 個版本</span>
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{formatRelative(d.updatedAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 右欄：帳號設定 + 升級 CTA */}
              <div className="profile-account-settings">
                <div className="profile-section">
                  <p className="profile-section-title">帳號設定</p>
                  <form onSubmit={handleChangePassword}>
                    <label>
                      舊密碼
                      <input
                        type="password"
                        value={oldPwd}
                        onChange={(e) => setOldPwd(e.target.value)}
                        placeholder="輸入目前密碼"
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <label>
                      新密碼
                      <input
                        type="password"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        placeholder="至少 6 個字元"
                        autoComplete="new-password"
                        required
                      />
                    </label>
                    <label>
                      確認新密碼
                      <input
                        type="password"
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        placeholder="再次輸入新密碼"
                        autoComplete="new-password"
                        required
                      />
                    </label>
                    {pwdError && <p className="status error">{pwdError}</p>}
                    {pwdStatus && <p className="status">{pwdStatus}</p>}
                    <button type="submit" className="primary" style={{ marginTop: 8, width: 'auto' }} disabled={pwdBusy}>
                      {pwdBusy ? '更新中...' : '更改密碼'}
                    </button>
                  </form>
                </div>

                {authUser.role === 'member' && (
                  <div className="profile-section profile-creator-card">
                    <p className="profile-section-title" style={{ color: 'var(--primary)' }}>成為創作者</p>
                    <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                      創作者可上架設計圖至市集，擁有個人公開主頁，接受委製訂單。
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                      若有興趣成為創作者，請聯絡管理員申請升級。
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
