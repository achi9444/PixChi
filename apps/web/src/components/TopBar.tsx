import { useRef } from 'react';
import AuthPanel from './AuthPanel';
import type { AuthUser } from '../services/api';

export type AppPage = 'main' | 'palette' | 'market' | 'creator';

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
  // page nav
  page: AppPage;
  onNavigate: (page: AppPage) => void;
  // main page actions
  proMode: boolean;
  isPdfBusy: boolean;
  hasConverted: boolean;
  onReloadPalette: () => void;
  onExportCsv: () => void;
  onImportPdfFile: (file: File | null) => void;
  onExportPdf: () => void;
  onPublishToMarket: () => void;
};

export default function TopBar({
  authUser, authBusy, authPanelOpen,
  loginUsername, loginPassword, loginErrorText,
  onToggleAuthPanel, onLogin, onRegister, onLogout,
  onUsernameChange, onPasswordChange, onCloseAuthPanel,
  page, onNavigate,
  proMode, isPdfBusy, hasConverted,
  onReloadPalette, onExportCsv, onImportPdfFile, onExportPdf, onPublishToMarket,
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
        <div>
          <h1>PixChi</h1>
          <p className="subtitle" style={{ marginTop: 0 }}>拼豆圖紙生成</p>
        </div>
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
        {proMode && (
          <button
            className={`topbar-nav-btn ${page === 'creator' ? 'active' : ''}`}
            onClick={() => onNavigate('creator')}
            aria-current={page === 'creator' ? 'page' : undefined}
          >
            後台
          </button>
        )}
      </nav>

      {/* ── Actions (right side) ── */}
      <div className="top-actions">
        {/* Main page tool actions */}
        {page === 'main' && (
          <>
            {proMode && (
              <button
                className="topbar-icon"
                onClick={onReloadPalette}
                title="重新載入色庫"
                aria-label="重新載入色庫"
              >
                {/* refresh icon */}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </button>
            )}
            <button
              className="label-btn ghost"
              onClick={onExportCsv}
              disabled={isPdfBusy}
              title="匯出 Material CSV"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              CSV
            </button>
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
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 14 12 9 17 14"/><line x1="12" y1="9" x2="12" y2="21"/>
                  </svg>
                  匯入
                </button>
              </>
            )}
            <button
              className="label-btn primary"
              onClick={onExportPdf}
              disabled={isPdfBusy}
              title="匯出 Pattern PDF"
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
                  PDF
                </>
              )}
            </button>
            {proMode && hasConverted && (
              <button
                className="label-btn primary"
                onClick={onPublishToMarket}
                title="上架到市集"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
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
        />
      </div>
    </header>
  );
}
