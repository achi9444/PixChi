import type { AuthRole, AuthUser } from './api';

export const AUTH_ACCESS_TOKEN_STORAGE_KEY = 'pixchi_auth_access_token_v1';
export const AUTH_REFRESH_TOKEN_STORAGE_KEY = 'pixchi_auth_refresh_token_v1';
export const AUTH_USER_STORAGE_KEY = 'pixchi_auth_user_v1';

export function loadAuthAccessToken(): string {
  try {
    return localStorage.getItem(AUTH_ACCESS_TOKEN_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function loadAuthRefreshToken(): string {
  try {
    return localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function loadAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    const id = String(parsed.id ?? '').trim();
    const username = String(parsed.username ?? '').trim();
    const roleRaw = String(parsed.role ?? '').trim() as AuthRole;
    const role: AuthRole = roleRaw === 'member' || roleRaw === 'pro' || roleRaw === 'admin' ? roleRaw : 'guest';
    if (!id || !username) return null;
    return { id, username, role };
  } catch {
    return null;
  }
}

export function persistAuthAccessToken(token: string) {
  try {
    if (token) localStorage.setItem(AUTH_ACCESS_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(AUTH_ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function persistAuthRefreshToken(token: string) {
  try {
    if (token) localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(AUTH_REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function persistAuthUser(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}
