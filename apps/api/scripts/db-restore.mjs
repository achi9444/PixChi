import fs from 'node:fs';
import path from 'node:path';
import { resolveSqliteDbPathFromEnv } from './db-utils.mjs';

const backupArg = process.argv[2] || '';
const backupDir = path.resolve(process.cwd(), 'backups');

function pickLatestBackup() {
  if (!fs.existsSync(backupDir)) return '';
  const files = fs
    .readdirSync(backupDir)
    .map((name) => path.join(backupDir, name))
    .filter((full) => fs.statSync(full).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || '';
}

const sourcePath = backupArg ? path.resolve(process.cwd(), backupArg) : pickLatestBackup();
if (!sourcePath || !fs.existsSync(sourcePath)) {
  console.error('[db:restore] Backup file not found. Pass a file path, or place backups under apps/api/backups.');
  process.exit(1);
}

const dbPath = resolveSqliteDbPathFromEnv();
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

fs.copyFileSync(sourcePath, dbPath);
console.log(`[db:restore] OK <- ${sourcePath}`);
console.log(`[db:restore] Target: ${dbPath}`);

