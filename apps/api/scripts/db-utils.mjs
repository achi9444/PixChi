import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export function resolveSqliteDbPathFromEnv() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) {
    throw new Error(`DATABASE_URL is not SQLite file URL: ${url || '(empty)'}`);
  }
  const raw = url.slice('file:'.length);
  const normalized = raw.replace(/\\/g, '/');
  if (path.isAbsolute(normalized)) return normalized;
  return path.resolve(process.cwd(), 'prisma', normalized);
}

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function timestampString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

