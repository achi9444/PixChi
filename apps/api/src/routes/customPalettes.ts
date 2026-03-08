import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../db.js';

const colorSchema = z.object({
  name: z.string().trim().min(1),
  hex: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/)
});

const groupSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1),
  colors: z.array(colorSchema).default([])
});

export const customPalettesRouter = Router();

customPalettesRouter.use(requireAuth);
customPalettesRouter.use(requireRole(['member', 'pro', 'admin']));

customPalettesRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const groups = await prisma.customPaletteGroup.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        colors: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    res.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        colors: g.colors.map((c) => ({ name: c.code, hex: c.hex }))
      }))
    });
  } catch (err) {
    next(err);
  }
});

customPalettesRouter.put('/', async (req, res, next) => {
  try {
    const input = z.object({ groups: z.array(groupSchema).default([]) }).parse(req.body);
    const userId = req.authUser!.id;
    await prisma.$transaction(async (tx) => {
      await tx.customPaletteColor.deleteMany({
        where: {
          group: { userId }
        }
      });
      await tx.customPaletteGroup.deleteMany({
        where: { userId }
      });
      for (const g of input.groups) {
        const created = await tx.customPaletteGroup.create({
          data: {
            userId,
            name: g.name.trim()
          }
        });
        for (const c of g.colors) {
          await tx.customPaletteColor.create({
            data: {
              groupId: created.id,
              code: c.name.trim(),
              hex: c.hex.trim().toUpperCase()
            }
          });
        }
      }
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
