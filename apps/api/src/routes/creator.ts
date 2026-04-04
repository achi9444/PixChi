import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendApiError } from '../utils/apiError.js';

export const creatorRouter = Router();

const proOnly = [requireAuth, requireRole(['pro', 'admin'])];

// ─── 創作者個人資料 ───────────────────────────────────────

// GET /api/creator/profile
creatorRouter.get('/profile', ...proOnly, async (req, res) => {
  const userId = req.authUser!.id;

  let profile = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (!profile) {
    profile = await prisma.creatorProfile.create({ data: { userId } });
  }

  res.json({
    displayName: profile.displayName ?? '',
    avatarImage: profile.avatarImage ?? null,
    location: profile.location ?? '',
    priceRange: profile.priceRange ?? '',
    turnaround: profile.turnaround ?? '',
    specialties: profile.specialties ? JSON.parse(profile.specialties) : [],
    bio: profile.bio ?? '',
    styleTags: profile.styleTags ? JSON.parse(profile.styleTags) : [],
    externalLinks: profile.externalLinks ? JSON.parse(profile.externalLinks) : [],
    acceptingOrders: profile.acceptingOrders,
    watermarkText: profile.watermarkText ?? '',
  });
});

// PUT /api/creator/profile
creatorRouter.put('/profile', ...proOnly, async (req, res) => {
  const input = z
    .object({
      displayName: z.string().max(30).optional(),
      avatarImage: z.string().max(150000).nullable().optional(),
      location: z.string().max(30).optional(),
      priceRange: z.string().max(60).optional(),
      turnaround: z.string().max(60).optional(),
      specialties: z.array(z.string().max(20)).max(10).optional(),
      bio: z.string().max(500).optional(),
      styleTags: z.array(z.string().max(20)).max(10).optional(),
      externalLinks: z
        .array(
          z.object({
            label: z.string().trim().max(30),
            url: z.string().trim().max(300),
          })
        )
        .max(10)
        .optional(),
      acceptingOrders: z.boolean().optional(),
      watermarkText: z.string().max(50).optional(),
    })
    .safeParse(req.body);

  if (!input.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Invalid payload');
    return;
  }

  const userId = req.authUser!.id;
  const data: any = {};
  if (input.data.displayName !== undefined) data.displayName = input.data.displayName.trim() || null;
  if (input.data.avatarImage !== undefined) data.avatarImage = input.data.avatarImage;
  if (input.data.location !== undefined) data.location = input.data.location.trim() || null;
  if (input.data.priceRange !== undefined) data.priceRange = input.data.priceRange.trim() || null;
  if (input.data.turnaround !== undefined) data.turnaround = input.data.turnaround.trim() || null;
  if (input.data.specialties !== undefined) data.specialties = JSON.stringify(input.data.specialties);
  if (input.data.bio !== undefined) data.bio = input.data.bio || null;
  if (input.data.styleTags !== undefined) data.styleTags = JSON.stringify(input.data.styleTags);
  if (input.data.externalLinks !== undefined) data.externalLinks = JSON.stringify(input.data.externalLinks);
  if (input.data.acceptingOrders !== undefined) data.acceptingOrders = input.data.acceptingOrders;
  if (input.data.watermarkText !== undefined) data.watermarkText = input.data.watermarkText.trim() || null;

  await prisma.creatorProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  res.json({ ok: true });
});

// ─── 設計圖管理 ───────────────────────────────────────────

// GET /api/creator/designs
creatorRouter.get('/designs', ...proOnly, async (req, res) => {
  const userId = req.authUser!.id;

  const profile = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (!profile) {
    res.json({ designs: [] });
    return;
  }

  const designs = await prisma.design.findMany({
    where: { creatorId: profile.id },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({
    designs: designs.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      tags: d.tags ? JSON.parse(d.tags) : [],
      licenseType: d.licenseType,
      price: d.price,
      estimatedTime: d.estimatedTime,
      previewImage: d.previewImage,
      status: d.status,
      updatedAt: d.updatedAt.getTime(),
    })),
  });
});

// POST /api/creator/designs
creatorRouter.post('/designs', ...proOnly, async (req, res) => {
  const input = z
    .object({
      title: z.string().trim().min(1).max(100),
      description: z.string().max(1000).optional(),
      tags: z.array(z.string().max(20)).max(10).optional(),
      licenseType: z.enum(['personal', 'commercial']).default('personal'),
      price: z.number().int().min(0).max(99999).optional(),
      estimatedTime: z.string().max(100).optional(),
      previewImage: z.string().max(200000).optional(),
      status: z.enum(['draft', 'published']).default('draft'),
    })
    .safeParse(req.body);

  if (!input.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Invalid payload');
    return;
  }

  const userId = req.authUser!.id;
  let profile = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (!profile) {
    profile = await prisma.creatorProfile.create({ data: { userId } });
  }

  const design = await prisma.design.create({
    data: {
      creatorId: profile.id,
      title: input.data.title,
      description: input.data.description || null,
      tags: input.data.tags ? JSON.stringify(input.data.tags) : null,
      licenseType: input.data.licenseType,
      price: input.data.price ?? null,
      estimatedTime: input.data.estimatedTime?.trim() || null,
      previewImage: input.data.previewImage ?? null,
      status: input.data.status,
    },
  });

  res.status(201).json({ id: design.id });
});

// PATCH /api/creator/designs/:id
creatorRouter.patch('/designs/:id', ...proOnly, async (req, res) => {
  const input = z
    .object({
      title: z.string().trim().min(1).max(100).optional(),
      description: z.string().max(1000).optional(),
      tags: z.array(z.string().max(20)).max(10).optional(),
      licenseType: z.enum(['personal', 'commercial']).optional(),
      price: z.number().int().min(0).max(99999).nullable().optional(),
      estimatedTime: z.string().max(100).nullable().optional(),
      previewImage: z.string().max(200000).nullable().optional(),
      status: z.enum(['draft', 'published']).optional(),
    })
    .safeParse(req.body);

  if (!input.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Invalid payload');
    return;
  }

  const userId = req.authUser!.id;
  const designId = req.params.id;

  const profile = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (!profile) {
    sendApiError(res, 404, 'DESIGN_NOT_FOUND', '找不到設計圖');
    return;
  }

  const design = await prisma.design.findFirst({ where: { id: designId, creatorId: profile.id } });
  if (!design) {
    sendApiError(res, 404, 'DESIGN_NOT_FOUND', '找不到設計圖');
    return;
  }

  const data: any = {};
  if (input.data.title !== undefined) data.title = input.data.title;
  if (input.data.description !== undefined) data.description = input.data.description || null;
  if (input.data.tags !== undefined) data.tags = JSON.stringify(input.data.tags);
  if (input.data.licenseType !== undefined) data.licenseType = input.data.licenseType;
  if (input.data.price !== undefined) data.price = input.data.price;
  if (input.data.estimatedTime !== undefined) data.estimatedTime = input.data.estimatedTime?.trim() || null;
  if (input.data.previewImage !== undefined) data.previewImage = input.data.previewImage;
  if (input.data.status !== undefined) data.status = input.data.status;

  await prisma.design.update({ where: { id: designId }, data });
  res.json({ ok: true });
});

// DELETE /api/creator/designs/:id
creatorRouter.delete('/designs/:id', ...proOnly, async (req, res) => {
  const userId = req.authUser!.id;
  const designId = req.params.id;

  const profile = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (!profile) {
    sendApiError(res, 404, 'DESIGN_NOT_FOUND', '找不到設計圖');
    return;
  }

  const design = await prisma.design.findFirst({ where: { id: designId, creatorId: profile.id } });
  if (!design) {
    sendApiError(res, 404, 'DESIGN_NOT_FOUND', '找不到設計圖');
    return;
  }

  await prisma.design.delete({ where: { id: designId } });
  res.json({ ok: true });
});
