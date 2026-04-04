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
      sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
      tags: z.string().trim().max(200).optional(),
    })
    .safeParse(req.query);

  if (!query.success) {
    sendApiError(res, 400, 'INVALID_PAYLOAD', 'Invalid query');
    return;
  }

  const { page, limit, q, license, sort, tags } = query.data;
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
  if (tags) {
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      where.AND = tagList.map((t) => ({ tags: { contains: t } }));
    }
  }

  let orderBy: any = { updatedAt: 'desc' };
  if (sort === 'price_asc') orderBy = { price: 'asc' };
  else if (sort === 'price_desc') orderBy = { price: 'desc' };

  const [designs, total] = await Promise.all([
    prisma.design.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            avatarImage: true,
            location: true,
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
        displayName: d.creator.displayName ?? null,
        avatarImage: d.creator.avatarImage ?? null,
        location: d.creator.location ?? null,
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

  const where: any = { user: { role: { in: ['pro', 'admin'] }, isActive: true } };
  if (accepting !== undefined) where.acceptingOrders = accepting === 'true';
  if (q) {
    where.OR = [
      { bio: { contains: q } },
      { styleTags: { contains: q } },
      { displayName: { contains: q } },
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
      displayName: p.displayName ?? null,
      avatarImage: p.avatarImage ?? null,
      location: p.location ?? null,
      priceRange: p.priceRange ?? null,
      bio: p.bio ?? null,
      styleTags: p.styleTags ? JSON.parse(p.styleTags) : [],
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
    where: { user: { username, role: { in: ['pro', 'admin'] }, isActive: true } },
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
    displayName: profile.displayName ?? null,
    avatarImage: profile.avatarImage ?? null,
    location: profile.location ?? null,
    priceRange: profile.priceRange ?? null,
    turnaround: profile.turnaround ?? null,
    specialties: profile.specialties ? JSON.parse(profile.specialties) : [],
    bio: profile.bio ?? null,
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
