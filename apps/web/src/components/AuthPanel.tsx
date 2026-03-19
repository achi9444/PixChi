import type { AuthUser } from '../services/api';

type Props = {
  authUser: AuthUser | null;
  authBusy: boolean;
  authPanelOpen: boolean;
  loginUsername: string;
  loginPassword: string;
  loginErrorText: string;
  onTogglePanel: () => void;
  onLogin: () => void;
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
  onLogout,
  onUsernameChange,
  onPasswordChange,
  onClosePanel,
}: Props) {
  if (authUser) {
    return (
      <>
        <span className="hint">身份：{authUser.username}（{authUser.role}）</span>
        <button className="ghost" onClick={() => void onLogout()}>
          登出
        </button>
      </>
    );
  }

  return (
    <>
      <button
        className="ghost"
        onClick={onTogglePanel}
        disabled={authBusy}
      >
        {authBusy ? '登入中...' : authPanelOpen ? '收合登入' : '登入'}
      </button>
      {authPanelOpen && (
        <form
          className="auth-panel"
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
              placeholder="member / pro / admin"
              autoComplete="username"
            />
          </label>
          <label>
            密碼
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="請輸入密碼"
              autoComplete="current-password"
            />
          </label>
          {loginErrorText ? <p className="status error">{loginErrorText}</p> : null}
          <div className="row two">
            <button type="submit" className="primary" disabled={authBusy}>
              {authBusy ? '登入中...' : '登入'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={onClosePanel}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </>
  );
}
