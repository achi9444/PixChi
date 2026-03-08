export type AuthRole = 'guest' | 'member' | 'pro' | 'admin';

export type AuthUser = {
  id: string;
  username: string;
  role: AuthRole;
};

export type AuthLoginResponse = {
  accessToken?: string;
  refreshToken?: string;
  user?: AuthUser;
};

export type PaletteApiGroupSummary = {
  code: string;
  name: string;
};

export type PaletteApiGroupDetail = {
  code: string;
  name: string;
  colors?: Array<{
    name?: string;
    hex?: string;
  }>;
};

export type DraftSummaryDto = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  versionCount: number;
  versions: Array<{
    id: string;
    at: number;
    reason: 'manual' | 'autosave';
    note?: string;
  }>;
};

export type CustomPaletteGroupDto = {
  id: string;
  name: string;
  colors: Array<{ name: string; hex: string }>;
};

export type UserSettingsDto = {
  shortcutConfig?: Record<string, string[]>;
  constructionTemplates?: unknown[];
};

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => string;
  getRefreshToken: () => string;
  onAuthUpdate: (next: { accessToken: string; refreshToken: string; user: AuthUser | null }) => void;
  onTokenRefreshed?: () => void;
  onUnauthorized?: () => void;
};

type FetchJsonResult<T> = {
  status: number;
  data?: T;
  error?: string;
  errorCode?: string;
};

function normalizeBaseUrl(url: string) {
  return (url.trim() || 'http://localhost:8787').replace(/\/+$/, '');
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string;
  private readonly getRefreshToken: () => string;
  private readonly onAuthUpdate: (next: { accessToken: string; refreshToken: string; user: AuthUser | null }) => void;
  private readonly onTokenRefreshed?: () => void;
  private readonly onUnauthorized?: () => void;

  constructor(options: ApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.getAccessToken = options.getAccessToken;
    this.getRefreshToken = options.getRefreshToken;
    this.onAuthUpdate = options.onAuthUpdate;
    this.onTokenRefreshed = options.onTokenRefreshed;
    this.onUnauthorized = options.onUnauthorized;
  }

  private async fetchJson<T>(path: string, init?: RequestInit, withAuth = true): Promise<FetchJsonResult<T>> {
    const headers = new Headers(init?.headers ?? {});
    if (withAuth) {
      const accessToken = this.getAccessToken();
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    }
    try {
      const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
      let payload: any = undefined;
      const text = await res.text();
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = undefined;
        }
      }
      if (!res.ok) {
        return {
          status: res.status,
          error: payload?.message ? String(payload.message) : payload?.error ? String(payload.error) : undefined,
          errorCode: payload?.code ? String(payload.code) : undefined
        };
      }
      return { status: res.status, data: payload as T };
    } catch {
      return { status: 0, error: 'NETWORK_ERROR' };
    }
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;
    const refreshed = await this.fetchJson<AuthLoginResponse>(
      '/api/auth/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      },
      false
    );
    if (refreshed.status !== 200 || !refreshed.data?.accessToken || !refreshed.data?.refreshToken) {
      this.onAuthUpdate({ accessToken: '', refreshToken: '', user: null });
      return false;
    }
    this.onAuthUpdate({
      accessToken: refreshed.data.accessToken,
      refreshToken: refreshed.data.refreshToken,
      user: refreshed.data.user ?? null
    });
    this.onTokenRefreshed?.();
    return true;
  }

  async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const first = await this.fetchJson<T>(path, init, true);
    if (first.status === 200 && first.data !== undefined) return first.data;
    if (first.status === 401) {
      const ok = await this.tryRefresh();
      if (ok) {
        const second = await this.fetchJson<T>(path, init, true);
        if (second.status === 200 && second.data !== undefined) return second.data;
        throw new Error(second.error || `HTTP ${second.status}`);
      }
      this.onUnauthorized?.();
      throw new Error(first.errorCode ? `${first.errorCode}: ${first.error || ''}` : first.error || `HTTP ${first.status}`);
    }
    throw new Error(first.errorCode ? `${first.errorCode}: ${first.error || ''}` : first.error || `HTTP ${first.status}`);
  }

  login(username: string, password: string) {
    return this.fetchJson<AuthLoginResponse>(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      },
      false
    ).then((res) => {
      if (res.status !== 200 || !res.data) {
        throw new Error(res.errorCode ? `${res.errorCode}: ${res.error || ''}` : res.error || `HTTP ${res.status}`);
      }
      return res.data;
    });
  }

  getMe() {
    return this.requestJson<{ user?: AuthUser }>('/api/auth/me', { cache: 'no-cache' });
  }

  async logout() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return;
    await this.fetchJson<{ ok?: boolean }>(
      '/api/auth/logout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      },
      false
    );
  }

  getPaletteGroups() {
    return this.requestJson<{ groups?: PaletteApiGroupSummary[] }>('/api/palette/groups', { cache: 'no-cache' });
  }

  getPaletteGroup(code: string) {
    return this.requestJson<{ group?: PaletteApiGroupDetail }>(`/api/palette/groups/${encodeURIComponent(code)}`, { cache: 'no-cache' });
  }

  listProjects() {
    return this.requestJson<{ drafts?: DraftSummaryDto[] }>('/api/projects', { cache: 'no-cache' });
  }

  getProjectSnapshot(projectId: string, versionId?: string) {
    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
    return this.requestJson<{ snapshot?: unknown }>(`/api/projects/${encodeURIComponent(projectId)}${query}`, { cache: 'no-cache' });
  }

  createProject(name: string, snapshot: unknown) {
    return this.requestJson<{ id?: string }>('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, snapshot })
    });
  }

  saveProject(projectId: string, payload: { snapshot: unknown; reason: 'manual' | 'autosave'; nextName?: string; note?: string }) {
    return this.requestJson<{ versionId?: string }>(`/api/projects/${encodeURIComponent(projectId)}/save`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  renameProject(projectId: string, name: string) {
    return this.requestJson<{ ok?: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
  }

  setProjectVersionNote(projectId: string, versionId: string, note: string) {
    return this.requestJson<{ ok?: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/version-note`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId, note })
    });
  }

  deleteProject(projectId: string) {
    return this.requestJson<{ ok?: boolean }>(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE'
    });
  }

  getCustomPalettes() {
    return this.requestJson<{ groups?: CustomPaletteGroupDto[] }>('/api/custom-palettes', { cache: 'no-cache' });
  }

  putCustomPalettes(groups: CustomPaletteGroupDto[]) {
    return this.requestJson<{ ok?: boolean }>('/api/custom-palettes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups })
    });
  }

  getUserSettings() {
    return this.requestJson<{ settings?: UserSettingsDto }>('/api/user-settings', { cache: 'no-cache' });
  }

  putUserSettings(settings: UserSettingsDto) {
    return this.requestJson<{ ok?: boolean }>('/api/user-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  }
}
