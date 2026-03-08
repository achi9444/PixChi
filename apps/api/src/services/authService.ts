import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { prisma } from '../db.js';
import type { AuthTokens, AuthUser, JwtClaims, UserRole } from '../types/auth.js';

const VALID_ROLES: UserRole[] = ['guest', 'member', 'pro', 'admin'];

function parseRole(input: string): UserRole {
  return VALID_ROLES.includes(input as UserRole) ? (input as UserRole) : 'member';
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createRefreshTokenRaw(): string {
  return crypto.randomBytes(48).toString('base64url');
}

function createAccessToken(user: AuthUser): string {
  const claims: JwtClaims = {
    sub: user.id,
    username: user.username,
    role: user.role
  };
  const options: SignOptions = { expiresIn: config.jwtExpire as SignOptions['expiresIn'] };
  return jwt.sign(claims, config.jwtSecret, options);
}

export async function loginWithPassword(username: string, password: string): Promise<AuthUser | null> {
  const normalized = username.trim().toLowerCase();
  if (!normalized || !password) return null;
  const user = await prisma.user.findUnique({
    where: { username: normalized }
  });
  if (!user || !user.isActive) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return {
    id: user.id,
    username: user.username,
    role: parseRole(user.role)
  };
}

export async function issueTokens(user: AuthUser): Promise<AuthTokens> {
  const refreshToken = createRefreshTokenRaw();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + Math.max(1, config.jwtRefreshExpireDays) * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      expiresAt
    }
  });
  const accessToken = createAccessToken(user);
  return { accessToken, refreshToken };
}

export async function refreshTokens(refreshToken: string): Promise<{ user: AuthUser; tokens: AuthTokens } | null> {
  const hash = hashRefreshToken(refreshToken);
  const session = await prisma.authSession.findUnique({
    where: { refreshTokenHash: hash },
    include: { user: true }
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || !session.user.isActive) {
    return null;
  }

  const user: AuthUser = {
    id: session.user.id,
    username: session.user.username,
    role: parseRole(session.user.role)
  };

  const nextRefreshToken = createRefreshTokenRaw();
  const nextRefreshHash = hashRefreshToken(nextRefreshToken);
  const nextExpiresAt = new Date(Date.now() + Math.max(1, config.jwtRefreshExpireDays) * 24 * 60 * 60 * 1000);
  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: nextRefreshHash,
      expiresAt: nextExpiresAt
    }
  });

  return {
    user,
    tokens: {
      accessToken: createAccessToken(user),
      refreshToken: nextRefreshToken
    }
  };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const hash = hashRefreshToken(refreshToken);
  await prisma.authSession.updateMany({
    where: {
      refreshTokenHash: hash,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
}

export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const claims = jwt.verify(token, config.jwtSecret) as JwtClaims;
    return {
      id: claims.sub,
      username: claims.username,
      role: parseRole(claims.role)
    };
  } catch {
    return null;
  }
}
