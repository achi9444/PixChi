import { useState } from 'react';

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
}: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regError, setRegError] = useState('');
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [showRegPwd, setShowRegPwd] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

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
    return (
      <>
        <span className="hint">
          {authUser.username}（{ROLE_LABEL[authUser.role] ?? authUser.role}）
        </span>
        <button className="ghost" onClick={onLogout}>
          登出
        </button>
      </>
    );
  }

  return (
    <>
      <button className="ghost" onClick={onTogglePanel} disabled={authBusy}>
        {authBusy ? '處理中...' : authPanelOpen ? '收合' : '登入 / 註冊'}
      </button>
      {authPanelOpen && (
        <div className="auth-panel">
          <div className="row two" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className={mode === 'login' ? 'primary' : 'ghost'}
              onClick={() => switchMode('login')}
            >
              登入
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'primary' : 'ghost'}
              onClick={() => switchMode('register')}
            >
              註冊
            </button>
          </div>

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
                />
              </label>
              <label>
                密碼
                <div style={{ position: 'relative' }}>
                  <input
                    type={showLoginPwd ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    placeholder="輸入密碼"
                    autoComplete="current-password"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPwd(v => !v)}
                    aria-label={showLoginPwd ? '隱藏密碼' : '顯示密碼'}
                    style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 32, height: 28, padding: 0, background: 'transparent', border: 'none', color: 'var(--faint)', cursor: 'pointer' }}
                  >
                    <EyeIcon open={showLoginPwd} />
                  </button>
                </div>
              </label>
              {loginErrorText ? <p className="status error">{loginErrorText}</p> : null}
              <div className="row two">
                <button type="submit" className="primary" disabled={authBusy}>
                  {authBusy ? '登入中...' : '登入'}
                </button>
                <button type="button" className="ghost" onClick={onClosePanel}>
                  取消
                </button>
              </div>
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
                />
              </label>
              <label>
                密碼
                <div style={{ position: 'relative' }}>
                  <input
                    type={showRegPwd ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="至少 6 個字元"
                    autoComplete="new-password"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPwd(v => !v)}
                    aria-label={showRegPwd ? '隱藏密碼' : '顯示密碼'}
                    style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 32, height: 28, padding: 0, background: 'transparent', border: 'none', color: 'var(--faint)', cursor: 'pointer' }}
                  >
                    <EyeIcon open={showRegPwd} />
                  </button>
                </div>
              </label>
              <label>
                確認密碼
                <div style={{ position: 'relative' }}>
                  <input
                    type={showRegConfirm ? 'text' : 'password'}
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    placeholder="再次輸入密碼"
                    autoComplete="new-password"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegConfirm(v => !v)}
                    aria-label={showRegConfirm ? '隱藏密碼' : '顯示密碼'}
                    style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 32, height: 28, padding: 0, background: 'transparent', border: 'none', color: 'var(--faint)', cursor: 'pointer' }}
                  >
                    <EyeIcon open={showRegConfirm} />
                  </button>
                </div>
              </label>
              {(regError || loginErrorText) ? (
                <p className="status error">{regError || loginErrorText}</p>
              ) : null}
              <div className="row two">
                <button type="submit" className="primary" disabled={authBusy}>
                  {authBusy ? '處理中...' : '建立帳號'}
                </button>
                <button type="button" className="ghost" onClick={onClosePanel}>
                  取消
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
