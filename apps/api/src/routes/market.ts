import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { sendApiError } from '../utils/apiError.js';

export const marketRouter = Router();

// GET /api/market/designs - 公開設計圖列表
marketRouter.get('/designs', async (req, res) => {
  const query = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      q: z.string().trim().max(100).optional(),
      license: z.enum(['personal', 'commercial']).optional(),
    })
    .safeParse(req.query);

  if (!query.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Invalid query');
    return;
  }

  const { page, limit, q, license } = query.data;
  const skip = (page - 1) * limit;

  const where: any = { status: 'published' };
  if (license) where.licenseType = license;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { tags: { contains: q } },
    ];
  }

  const [designs, total] = await Promise.all([
    prisma.design.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            acceptingOrders: true,
            user: { select: { username: true } },
          },
        },
      },
    }),
    prisma.design.count({ where }),
  ]);

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
      updatedAt: d.updatedAt.getTime(),
      creator: {
        username: d.creator.user.username,
        acceptingOrders: d.creator.acceptingOrders,
      },
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/market/creators - 公開創作者列表
marketRouter.get('/creators', async (req, res) => {
  const query = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      q: z.string().trim().max(100).optional(),
      accepting: z.enum(['true', 'false']).optional(),
    })
    .safeParse(req.query);

  if (!query.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Invalid query');
    return;
  }

  const { page, limit, q, accepting } = query.data;
  const skip = (page - 1) * limit;

  const where: any = { user: { role: 'pro', isActive: true } };
  if (accepting !== undefined) where.acceptingOrders = accepting === 'true';
  if (q) {
    where.OR = [
      { bio: { contains: q } },
      { styleTags: { contains: q } },
      { user: { username: { contains: q } } },
    ];
  }

  const [profiles, total] = await Promise.all([
    prisma.creatorProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { username: true } },
        _count: { select: { designs: { where: { status: 'published' } } } },
      },
    }),
    prisma.creatorProfile.count({ where }),
  ]);

  res.json({
    creators: profiles.map((p) => ({
      username: p.user.username,
      bio: p.bio,
      styleTags: p.styleTags ? JSON.parse(p.styleTags) : [],
      externalLinks: p.externalLinks ? JSON.parse(p.externalLinks) : [],
      acceptingOrders: p.acceptingOrders,
      designCount: p._count.designs,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/market/creators/:username - 單一創作者公開主頁
marketRouter.get('/creators/:username', async (req, res) => {
  const username = req.params.username?.trim().toLowerCase();
  if (!username) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Missing username');
    return;
  }

  const profile = await prisma.creatorProfile.findFirst({
    where: { user: { username, role: 'pro', isActive: true } },
    include: {
      user: { select: { username: true } },
      designs: {
        where: { status: 'published' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!profile) {
    sendApiError(res, 404, 'CREATOR_NOT_FOUND', '找不到此創作者');
    return;
  }

  res.json({
    username: profile.user.username,
    bio: profile.bio,
    styleTags: profile.styleTags ? JSON.parse(profile.styleTags) : [],
    externalLinks: profile.externalLinks ? JSON.parse(profile.externalLinks) : [],
    acceptingOrders: profile.acceptingOrders,
    designs: profile.designs.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      tags: d.tags ? JSON.parse(d.tags) : [],
      licenseType: d.licenseType,
      price: d.price,
      estimatedTime: d.estimatedTime,
      previewImage: d.previewImage,
      updatedAt: d.updatedAt.getTime(),
    })),
  });
});
