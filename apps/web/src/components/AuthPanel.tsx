import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}
import type { AuthUser } from '../services/api';
import { ROLE_LABEL } from '../services/api';

type Props = {
  authUser: AuthUser | null;
  authBusy: boolean;
  authPanelOpen: boolean;
  loginUsername: string;
  loginPassword: string;
  loginErrorText: string;
  onTogglePanel: () => void;
  onLogin: () => void;
  onRegister: (username: string, password: string) => void;
  onLogout: () => void;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onClosePanel: () => void;
  onAvatarClick?: () => void;
  avatarImage?: string | null;
};

export default function AuthPanel({
  authUser,
  authBusy,
  authPanelOpen,
  loginUsername,
  loginPassword,
  loginErrorText,
  onTogglePanel,
  onLogin,
  onRegister,
  onLogout,
  onUsernameChange,
  onPasswordChange,
  onClosePanel,
  onAvatarClick,
  avatarImage,
}: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regError, setRegError] = useState('');
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [showRegPwd, setShowRegPwd] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

  // Escape 鍵關閉
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && authPanelOpen) onClosePanel();
  }, [authPanelOpen, onClosePanel]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRegError('');
    if (regPassword !== regConfirm) {
      setRegError('兩次密碼不一致');
      return;
    }
    if (regPassword.length < 6) {
      setRegError('密碼至少需要 6 個字元');
      return;
    }
    onRegister(regUsername.trim(), regPassword);
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setRegError('');
    setRegUsername('');
    setRegPassword('');
    setRegConfirm('');
  }

  if (authUser) {
    const avatarLetter = authUser.username.charAt(0).toUpperCase();
    const roleLabel = ROLE_LABEL[authUser.role] ?? authUser.role;
    return (
      <>
        <button
          className="user-avatar"
          onClick={onAvatarClick}
          title={`${authUser.username}（${roleLabel}）— 我的帳號`}
          aria-label={`用戶 ${authUser.username}，點擊進入帳號頁面`}
        >
          {avatarImage
            ? <img src={avatarImage} alt={authUser.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : avatarLetter}
        </button>
        <button className="ghost logout-separator" onClick={onLogout}>
          登出
        </button>
      </>
    );
  }

  const modal = authPanelOpen ? createPortal(
    <div
      className="auth-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClosePanel(); }}
      aria-modal="true"
      role="dialog"
      aria-label="登入 / 註冊"
    >
      <div className="auth-modal">
        {/* 標題列 */}
        <div className="auth-modal-header">
          <div className="auth-modal-brand">
            <span className="auth-modal-brand-mark">P</span>
            <div>
              <div className="auth-modal-brand-name">PixChi</div>
              <div className="auth-modal-brand-sub">{mode === 'login' ? 'Log In' : 'Sign Up'}</div>
            </div>
          </div>
          <button
            type="button"
            className="auth-modal-close"
            onClick={onClosePanel}
            aria-label="關閉"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* 頁籤 */}
        <div className="auth-modal-tabs">
          <button
            type="button"
            className={`auth-modal-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => switchMode('login')}
          >
            登入
          </button>
          <button
            type="button"
            className={`auth-modal-tab${mode === 'register' ? ' active' : ''}`}
            onClick={() => switchMode('register')}
          >
            註冊
          </button>
        </div>

        {/* 表單主體 */}
        <div className="auth-modal-body">
          {mode === 'login' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onLogin();
              }}
            >
              <label>
                帳號
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => onUsernameChange(e.target.value)}
                  placeholder="輸入帳號"
                  autoComplete="username"
                  autoFocus
                />
              </label>
              <label>
                密碼
                <div className="password-input-wrap">
                  <input
                    type={showLoginPwd ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    placeholder="輸入密碼"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPwd(v => !v)}
                    aria-label={showLoginPwd ? '隱藏密碼' : '顯示密碼'}
                    className="password-toggle-btn"
                  >
                    <EyeIcon open={showLoginPwd} />
                  </button>
                </div>
              </label>
              {loginErrorText ? <p className="status error">{loginErrorText}</p> : null}
              <button type="submit" className="primary auth-modal-submit" disabled={authBusy}>
                {authBusy ? '登入中...' : '登入'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit}>
              <label>
                帳號
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="3-20 字元，小寫英數字、底線"
                  autoComplete="username"
                  autoFocus
                />
              </label>
              <label>
                密碼
                <div className="password-input-wrap">
                  <input
                    type={showRegPwd ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="至少 6 個字元"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPwd(v => !v)}
                    aria-label={showRegPwd ? '隱藏密碼' : '顯示密碼'}
                    className="password-toggle-btn"
                  >
                    <EyeIcon open={showRegPwd} />
                  </button>
                </div>
              </label>
              <label>
                確認密碼
                <div className="password-input-wrap">
                  <input
                    type={showRegConfirm ? 'text' : 'password'}
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    placeholder="再次輸入密碼"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegConfirm(v => !v)}
                    aria-label={showRegConfirm ? '隱藏密碼' : '顯示密碼'}
                    className="password-toggle-btn"
                  >
                    <EyeIcon open={showRegConfirm} />
                  </button>
                </div>
              </label>
              {(regError || loginErrorText) ? (
                <p className="status error">{regError || loginErrorText}</p>
              ) : null}
              <button type="submit" className="primary auth-modal-submit" disabled={authBusy}>
                {authBusy ? '處理中...' : '建立帳號'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button className="ghost" onClick={onTogglePanel} disabled={authBusy}>
        {authBusy ? '...' : 'LogIn'}
      </button>
      {modal}
    </>
  );
}
