import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { issueTokens, loginWithPassword, refreshTokens, registerUser, revokeRefreshToken } from '../services/authService.js';
import { sendApiError } from '../utils/apiError.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const input = z
    .object({
      username: z.string().trim().min(1),
      password: z.string().min(1)
    })
    .safeParse(req.body);

  if (!input.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Invalid payload');
    return;
  }

  const result = await registerUser(input.data.username, input.data.password);
  if (result === 'USERNAME_TAKEN') {
    sendApiError(res, 409, 'USERNAME_TAKEN', '此帳號名稱已被使用');
    return;
  }
  if (result === 'INVALID_USERNAME') {
    sendApiError(res, 400, 'INVALID_USERNAME', '帳號只能使用小寫英文、數字、底線，長度 3-20 字元');
    return;
  }
  if (result === 'WEAK_PASSWORD') {
    sendApiError(res, 400, 'WEAK_PASSWORD', '密碼至少需要 6 個字元');
    return;
  }

  const tokens = await issueTokens(result);
  res.status(201).json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: result });
});

authRouter.post('/login', async (req, res) => {
  const input = z
    .object({
      username: z.string().trim().min(1),
      password: z.string().min(1)
    })
    .safeParse(req.body);

  if (!input.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Invalid payload');
    return;
  }

  const user = await loginWithPassword(input.data.username, input.data.password);
  if (!user) {
    sendApiError(res, 401, 'INVALID_CREDENTIALS', 'Invalid username or password');
    return;
  }

  const tokens = await issueTokens(user);
  res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user });
});

authRouter.post('/refresh', async (req, res) => {
  const input = z
    .object({
      refreshToken: z.string().trim().min(1)
    })
    .safeParse(req.body);

  if (!input.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Invalid payload');
    return;
  }

  const next = await refreshTokens(input.data.refreshToken);
  if (!next) {
    sendApiError(res, 401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    return;
  }

  res.json({
    accessToken: next.tokens.accessToken,
    refreshToken: next.tokens.refreshToken,
    user: next.user
  });
});

authRouter.post('/logout', async (req, res) => {
  const input = z
    .object({
      refreshToken: z.string().trim().min(1)
    })
    .safeParse(req.body);

  if (!input.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Invalid payload');
    return;
  }

  await revokeRefreshToken(input.data.refreshToken);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.authUser!.id },
    select: { id: true, username: true, role: true, createdAt: true },
  });
  if (!user) {
    sendApiError(res, 404, 'USER_NOT_FOUND', 'User not found');
    return;
  }
  res.json({ user: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt.getTime() } });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const input = z
    .object({
      oldPassword: z.string().min(1),
      newPassword: z.string().min(6),
    })
    .safeParse(req.body);

  if (!input.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', '新密碼至少需要 6 個字元');
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.authUser!.id } });
  if (!user) {
    sendApiError(res, 404, 'USER_NOT_FOUND', 'User not found');
    return;
  }

  const ok = await bcrypt.compare(input.data.oldPassword, user.passwordHash);
  if (!ok) {
    sendApiError(res, 401, 'WRONG_PASSWORD', '舊密碼不正確');
    return;
  }

  const newHash = await bcrypt.hash(input.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
  res.json({ ok: true });
});
