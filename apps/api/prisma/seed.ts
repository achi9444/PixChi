import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';

type PaletteJson = {
  groups?: Array<{
    name?: string;
    colors?: Array<{
      name?: string;
      hex?: string;
    }>;
  }>;
};

const prisma = new PrismaClient();

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeHex(hex: string): string | null {
  const s = hex.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(s) ? s : null;
}

async function loadPaletteFromRoot(): Promise<PaletteJson> {
  const filePath = path.resolve(process.cwd(), '..', '..', 'color-palette.json');
  const text = await fs.readFile(filePath, 'utf8');
  const cleaned = text.replace(/^\uFEFF/, '');
  return JSON.parse(cleaned) as PaletteJson;
}

async function resetSystemPaletteGroups() {
  const systemGroups = await prisma.paletteGroup.findMany({
    where: { isSystem: true },
    select: { id: true }
  });
  const ids = systemGroups.map((g) => g.id);
  if (!ids.length) return;
  await prisma.paletteColor.deleteMany({
    where: { groupId: { in: ids } }
  });
  await prisma.paletteGroup.deleteMany({
    where: { id: { in: ids } }
  });
}

async function seedUsers() {
  const accounts = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'pro', password: 'pro123', role: 'pro' },
    { username: 'member', password: 'member123', role: 'member' }
  ] as const;

  let seededUsers = 0;
  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 10);
    await prisma.user.upsert({
      where: { username: account.username },
      update: {
        role: account.role,
        isActive: true,
        passwordHash
      },
      create: {
        username: account.username,
        role: account.role,
        isActive: true,
        passwordHash
      }
    });
    seededUsers += 1;
  }
  return seededUsers;
}

async function seedPalette() {
  const json = await loadPaletteFromRoot();
  const groups = json.groups ?? [];
  if (!groups.length) {
    throw new Error('color-palette.json 無可用群組');
  }

  await resetSystemPaletteGroups();

  let groupIndex = 0;
  let colorCount = 0;
  for (const group of groups) {
    const groupName = String(group.name ?? '').trim();
    if (!groupName) continue;
    groupIndex += 1;
    const slug = slugify(groupName) || 'group';
    const groupCode = `${String(groupIndex).padStart(2, '0')}-${slug}`;

    const created = await prisma.paletteGroup.create({
      data: {
        code: groupCode,
        name: groupName,
        description: '匯入自 color-palette.json',
        brand: 'PixChi',
        isSystem: true
      }
    });

    const seenCode = new Set<string>();
    const colors = group.colors ?? [];
    for (const color of colors) {
      const name = String(color.name ?? '').trim();
      const hex = normalizeHex(String(color.hex ?? ''));
      if (!name || !hex) continue;
      if (seenCode.has(name)) continue;
      seenCode.add(name);

      await prisma.paletteColor.create({
        data: {
          groupId: created.id,
          code: name,
          name,
          hex
        }
      });
      colorCount += 1;
    }
  }
  return { groupCount: groupIndex, colorCount };
}

async function main() {
  const paletteSummary = await seedPalette();
  const userCount = await seedUsers();
  console.log(
    `[seed] done: groups=${paletteSummary.groupCount}, colors=${paletteSummary.colorCount}, users=${userCount}`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
