import { prisma } from '../db.js';
import type { UserRole } from '../types/auth.js';

export async function listPaletteGroups(role: UserRole = 'guest') {
  const privileged = role === 'pro' || role === 'admin';
  const groups = await prisma.paletteGroup.findMany({
    where: privileged ? undefined : { isSystem: true },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      brand: true,
      isSystem: true,
      _count: {
        select: { colors: true }
      }
    }
  });

  return groups.map((g: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    brand: string | null;
    isSystem: boolean;
    _count: { colors: number };
  }) => ({
    id: privileged ? g.id : undefined,
    code: g.code,
    name: g.name,
    description: privileged ? g.description : undefined,
    brand: privileged ? g.brand : undefined,
    isSystem: privileged ? g.isSystem : undefined,
    colorCount: g._count.colors
  }));
}

export async function getPaletteGroupByCode(code: string) {
  return prisma.paletteGroup.findUnique({
    where: { code },
    include: {
      colors: {
        orderBy: [{ code: 'asc' }]
      }
    }
  });
}
