import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const userSettingsRouter = Router();

userSettingsRouter.use(requireAuth);
userSettingsRouter.use(requireRole(['member', 'pro', 'admin']));

userSettingsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const row = await prisma.userSetting.findUnique({ where: { userId } });
    if (!row) {
      res.json({ settings: {} });
      return;
    }
    const settings: Record<string, unknown> = {};
    if (row.shortcutConfig) {
      try {
        settings.shortcutConfig = JSON.parse(row.shortcutConfig);
      } catch {
        // ignore invalid persisted value
      }
    }
    if (row.constructionTemplates) {
      try {
        settings.constructionTemplates = JSON.parse(row.constructionTemplates);
      } catch {
        // ignore invalid persisted value
      }
    }
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

userSettingsRouter.put('/', async (req, res, next) => {
  try {
    const input = z
      .object({
        shortcutConfig: z.record(z.array(z.string())).optional(),
        constructionTemplates: z.array(z.unknown()).optional()
      })
      .parse(req.body);
    const userId = req.authUser!.id;
    await prisma.userSetting.upsert({
      where: { userId },
      create: {
        userId,
        shortcutConfig: input.shortcutConfig ? JSON.stringify(input.shortcutConfig) : null,
        constructionTemplates: input.constructionTemplates ? JSON.stringify(input.constructionTemplates) : null
      },
      update: {
        shortcutConfig: input.shortcutConfig ? JSON.stringify(input.shortcutConfig) : null,
        constructionTemplates: input.constructionTemplates ? JSON.stringify(input.constructionTemplates) : null
      }
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

