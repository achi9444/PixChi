import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../db.js';
import { sendApiError } from '../utils/apiError.js';

const MAX_VERSIONS = 20;
const MEMBER_MAX_PROJECTS = 5;

export const projectsRouter = Router();

projectsRouter.use(requireAuth);
projectsRouter.use(requireRole(['member', 'pro', 'admin']));

projectsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        versions: {
          orderBy: { at: 'asc' },
          select: { id: true, at: true, reason: true, note: true }
        }
      }
    });
    res.json({
      drafts: projects.map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt.getTime(),
        updatedAt: p.updatedAt.getTime(),
        versionCount: p.versions.length,
        versions: p.versions.map((v) => ({
          id: v.id,
          at: v.at.getTime(),
          reason: v.reason,
          note: v.note ?? undefined
        }))
      }))
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/:id', async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const versionId = String(req.query.versionId ?? '').trim();
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId },
      include: {
        versions: versionId
          ? {
              where: { id: versionId },
              take: 1
            }
          : undefined
      }
    });
    if (!project) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      return;
    }
    if (!versionId) {
      res.json({ snapshot: JSON.parse(project.latestSnapshot) });
      return;
    }
    const version = project.versions[0];
    if (!version) {
      sendApiError(res, 404, 'PROJECT_VERSION_NOT_FOUND', 'Version not found');
      return;
    }
    res.json({ snapshot: JSON.parse(version.snapshot) });
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/', async (req, res, next) => {
  try {
    const input = z
      .object({
        name: z.string().trim().min(1),
        snapshot: z.unknown()
      })
      .parse(req.body);
    const userId = req.authUser!.id;
    const userRole = req.authUser!.role;
    if (userRole === 'member') {
      const projectCount = await prisma.project.count({ where: { userId } });
      if (projectCount >= MEMBER_MAX_PROJECTS) {
        sendApiError(
          res,
          409,
          'MEMBER_DRAFT_LIMIT_REACHED',
          `Member cloud draft limit reached (${MEMBER_MAX_PROJECTS})`,
          { limit: MEMBER_MAX_PROJECTS }
        );
        return;
      }
    }
    const now = new Date();
    const snapshotText = JSON.stringify(input.snapshot);
    const project = await prisma.project.create({
      data: {
        userId,
        name: input.name,
        latestSnapshot: snapshotText,
        createdAt: now,
        updatedAt: now,
        versions: {
          create: {
            at: now,
            reason: 'manual',
            note: '初始化',
            snapshot: snapshotText
          }
        }
      }
    });
    res.json({ id: project.id });
  } catch (err) {
    next(err);
  }
});

projectsRouter.put('/:id/save', async (req, res, next) => {
  try {
    const input = z
      .object({
        snapshot: z.unknown(),
        reason: z.enum(['manual', 'autosave']),
        nextName: z.string().optional(),
        note: z.string().optional()
      })
      .parse(req.body);
    const userId = req.authUser!.id;
    const found = await prisma.project.findFirst({
      where: { id: req.params.id, userId }
    });
    if (!found) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      return;
    }
    const at = new Date();
    const snapshotText = JSON.stringify(input.snapshot);
    const version = await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: found.id },
        data: {
          name: input.nextName?.trim() ? input.nextName.trim() : found.name,
          latestSnapshot: snapshotText,
          updatedAt: at
        }
      });
      // 自動存檔只保留最後一筆，存入前先刪除舊的 autosave
      if (input.reason === 'autosave') {
        await tx.projectVersion.deleteMany({
          where: { projectId: found.id, reason: 'autosave' }
        });
      }
      const v = await tx.projectVersion.create({
        data: {
          projectId: found.id,
          at,
          reason: input.reason,
          note: input.note?.trim() || undefined,
          snapshot: snapshotText
        }
      });
      const all = await tx.projectVersion.findMany({
        where: { projectId: found.id },
        orderBy: { at: 'desc' },
        select: { id: true }
      });
      if (all.length > MAX_VERSIONS) {
        const removeIds = all.slice(MAX_VERSIONS).map((x) => x.id);
        await tx.projectVersion.deleteMany({
          where: { id: { in: removeIds } }
        });
      }
      return v;
    });
    res.json({ versionId: version.id });
  } catch (err) {
    next(err);
  }
});

projectsRouter.patch('/:id/name', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1) }).parse(req.body);
    const userId = req.authUser!.id;
    const found = await prisma.project.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true }
    });
    if (!found) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      return;
    }
    await prisma.project.update({
      where: { id: found.id },
      data: { name: input.name.trim(), updatedAt: new Date() }
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

projectsRouter.patch('/:id/version-note', async (req, res, next) => {
  try {
    const input = z
      .object({
        versionId: z.string().trim().min(1),
        note: z.string().optional().default('')
      })
      .parse(req.body);
    const userId = req.authUser!.id;
    const found = await prisma.project.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true }
    });
    if (!found) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      return;
    }
    await prisma.projectVersion.updateMany({
      where: { id: input.versionId, projectId: found.id },
      data: { note: input.note ?? '' }
    });
    await prisma.project.update({
      where: { id: found.id },
      data: { updatedAt: new Date() }
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

projectsRouter.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const found = await prisma.project.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true }
    });
    if (!found) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      return;
    }
    await prisma.project.delete({ where: { id: found.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
