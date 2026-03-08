export type UserRole = 'guest' | 'member' | 'pro' | 'admin';

export type AuthUser = {
  id: string;
  username: string;
  role: UserRole;
};

export type JwtClaims = {
  sub: string;
  username: string;
  role: UserRole;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};
