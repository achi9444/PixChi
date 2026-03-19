import { useRef } from 'react';
import AuthPanel from './AuthPanel';
import type { AuthUser } from '../services/api';

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
  onLogout: () => void;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onCloseAuthPanel: () => void;
  // page nav
  page: 'main' | 'palette';
  onNavigate: (page: 'main' | 'palette') => void;
  // main page actions
  proMode: boolean;
  isPdfBusy: boolean;
  onReloadPalette: () => void;
  onExportCsv: () => void;
  onImportPdfFile: (file: File | null) => void;
  onExportPdf: () => void;
};

export default function TopBar({
  authUser, authBusy, authPanelOpen,
  loginUsername, loginPassword, loginErrorText,
  onToggleAuthPanel, onLogin, onLogout,
  onUsernameChange, onPasswordChange, onCloseAuthPanel,
  page, onNavigate,
  proMode, isPdfBusy,
  onReloadPalette, onExportCsv, onImportPdfFile, onExportPdf,
}: Props) {
  const pdfImportRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="topbar">
      <div>
        <h1>PixChi</h1>
        <p className="subtitle">拼豆格線圖轉換 MVP</p>
      </div>
      <div className="top-actions">
        <AuthPanel
          authUser={authUser}
          authBusy={authBusy}
          authPanelOpen={authPanelOpen}
          loginUsername={loginUsername}
          loginPassword={loginPassword}
          loginErrorText={loginErrorText}
          onTogglePanel={onToggleAuthPanel}
          onLogin={onLogin}
          onLogout={onLogout}
          onUsernameChange={onUsernameChange}
          onPasswordChange={onPasswordChange}
          onClosePanel={onCloseAuthPanel}
        />
        <button className="ghost" onClick={() => onNavigate(page === 'palette' ? 'main' : 'palette')}>
          {page === 'palette' ? '返回轉換頁' : '前往色庫管理'}
        </button>
        {page === 'main' && (
          <>
            {proMode && (
              <button className="ghost" onClick={onReloadPalette}>
                重新載入色庫
              </button>
            )}
            <button onClick={onExportCsv} disabled={isPdfBusy}>
              匯出 Material CSV
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
                <button className="ghost" onClick={() => pdfImportRef.current?.click()} disabled={isPdfBusy}>
                  匯入 PDF 還原
                </button>
              </>
            )}
            <button className="primary" onClick={onExportPdf} disabled={isPdfBusy}>
              {isPdfBusy ? '處理中...' : '匯出 Pattern PDF'}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
