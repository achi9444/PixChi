import { useRef } from 'react';
import AuthPanel from './AuthPanel';
import type { AuthUser } from '../services/api';

export type AppPage = 'main' | 'palette' | 'market' | 'creator' | 'profile' | 'creator-public';

type Props = {
  // auth
  authUser: AuthUser | null;
  authBusy: boolean;
  authPanelOpen: boolean;
  loginUsername: string;
  loginPassword: string;
  loginErrorText: string;
  onToggleAuthPanel: () => void;
  onLogin: () => void;
  onRegister: (username: string, password: string) => void;
  onLogout: () => void;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onCloseAuthPanel: () => void;
  // avatar
  avatarImage?: string | null;
  // page nav
  page: AppPage;
  onNavigate: (page: AppPage) => void;
  // main page actions
  proMode: boolean;
  isPdfBusy: boolean;
  hasConverted: boolean;
  onReloadPalette: () => void;
  onImportPdfFile: (file: File | null) => void;
  onOpenExportModal: () => void;
  onPublishToMarket: () => void;
};

export default function TopBar({
  authUser, authBusy, authPanelOpen,
  loginUsername, loginPassword, loginErrorText,
  onToggleAuthPanel, onLogin, onRegister, onLogout,
  onUsernameChange, onPasswordChange, onCloseAuthPanel,
  avatarImage,
  page, onNavigate,
  proMode, isPdfBusy, hasConverted,
  onImportPdfFile, onOpenExportModal, onPublishToMarket,
}: Props) {
  const pdfImportRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="topbar">
      {/* ── Brand ── */}
      <div
        className="topbar-brand"
        onClick={() => onNavigate('main')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onNavigate('main')}
        aria-label="回到首頁"
      >
        <div className="topbar-logo-mark" aria-hidden="true">P</div>
        <h1 className="topbar-brand-name">PixChi</h1>
      </div>

      {/* ── Nav tabs ── */}
      <nav className="topbar-nav" aria-label="主要導航">
        <button
          className={`topbar-nav-btn ${page === 'main' ? 'active' : ''}`}
          onClick={() => onNavigate('main')}
          aria-current={page === 'main' ? 'page' : undefined}
        >
          工具
        </button>
        <button
          className={`topbar-nav-btn ${page === 'palette' ? 'active' : ''}`}
          onClick={() => onNavigate('palette')}
          aria-current={page === 'palette' ? 'page' : undefined}
        >
          色庫
        </button>
        <button
          className={`topbar-nav-btn ${page === 'market' ? 'active' : ''}`}
          onClick={() => onNavigate('market')}
          aria-current={page === 'market' ? 'page' : undefined}
        >
          市集
        </button>
      </nav>

      {/* ── Actions (right side) ── */}
      <div className="top-actions">
        {/* Main page tool actions */}
        {page === 'main' && (
          <>
            {proMode && (
              <>
                <input
                  ref={pdfImportRef}
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    onImportPdfFile(file);
                    e.target.value = '';
                  }}
                />
                <button
                  className="label-btn ghost"
                  onClick={() => pdfImportRef.current?.click()}
                  disabled={isPdfBusy}
                  title="匯入 PDF 還原"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  匯入
                </button>
              </>
            )}
            <button
              className="label-btn primary"
              onClick={onOpenExportModal}
              disabled={isPdfBusy}
              title="匯出圖紙 / 用料清單"
            >
              {isPdfBusy ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  處理中…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  匯出
                </>
              )}
            </button>
            {proMode && hasConverted && (
              <button
                className="label-btn ghost"
                onClick={onPublishToMarket}
                title="上架到市集"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                上架
              </button>
            )}
          </>
        )}

        {/* Auth */}
        <AuthPanel
          authUser={authUser}
          authBusy={authBusy}
          authPanelOpen={authPanelOpen}
          loginUsername={loginUsername}
          loginPassword={loginPassword}
          loginErrorText={loginErrorText}
          onTogglePanel={onToggleAuthPanel}
          onLogin={onLogin}
          onRegister={onRegister}
          onLogout={onLogout}
          onUsernameChange={onUsernameChange}
          onPasswordChange={onPasswordChange}
          onClosePanel={onCloseAuthPanel}
          onAvatarClick={() => onNavigate('profile')}
          avatarImage={avatarImage}
        />
      </div>
    </header>
  );
}
