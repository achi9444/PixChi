import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { getPaletteGroupByCode, listPaletteGroups } from '../services/paletteService.js';
import type { UserRole } from '../types/auth.js';
import { sendApiError } from '../utils/apiError.js';

export const paletteRouter = Router();

paletteRouter.get('/groups', async (_req, res, next) => {
  try {
    const role: UserRole = _req.authUser?.role ?? 'guest';
    const groups = await listPaletteGroups(role);
    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

paletteRouter.get('/groups/:code', async (req, res, next) => {
  try {
    const code = z.string().trim().min(1).parse(req.params.code);
    const role: UserRole = req.authUser?.role ?? 'guest';
    const group = await getPaletteGroupByCode(code);
    if (!group) {
      sendApiError(res, 404, 'PALETTE_GROUP_NOT_FOUND', 'Palette group not found');
      return;
    }
    const privileged = role === 'pro' || role === 'admin';
    if (!privileged && !group.isSystem) {
      sendApiError(res, 404, 'PALETTE_GROUP_NOT_FOUND', 'Palette group not found');
      return;
    }
    res.json({
      group: {
        id: privileged ? group.id : undefined,
        code: group.code,
        name: group.name,
        description: privileged ? group.description : undefined,
        brand: privileged ? group.brand : undefined,
        isSystem: privileged ? group.isSystem : undefined,
        colors: group.colors.map((c) => ({
          name: c.name,
          hex: c.hex
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

paletteRouter.get('/pro/groups', requireRole(['pro', 'admin']), async (req, res, next) => {
  try {
    const role: UserRole = req.authUser?.role ?? 'guest';
    const groups = await listPaletteGroups(role);
    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

paletteRouter.get('/pro/groups/:code', requireRole(['pro', 'admin']), async (req, res, next) => {
  try {
    const code = z.string().trim().min(1).parse(req.params.code);
    const group = await getPaletteGroupByCode(code);
    if (!group) {
      sendApiError(res, 404, 'PALETTE_GROUP_NOT_FOUND', 'Palette group not found');
      return;
    }
    res.json({ group });
  } catch (err) {
    next(err);
  }
});
