import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, resolveSqliteDbPathFromEnv, timestampString } from './db-utils.mjs';

const dbPath = resolveSqliteDbPathFromEnv();
if (!fs.existsSync(dbPath)) {
  console.error(`[db:backup] SQLite file not found: ${dbPath}`);
  process.exit(1);
}

const backupDir = path.resolve(process.cwd(), 'backups');
ensureDir(backupDir);

const dbName = path.basename(dbPath, path.extname(dbPath));
const ext = path.extname(dbPath) || '.db';
const outPath = path.join(backupDir, `${dbName}_${timestampString()}${ext}.bak`);

fs.copyFileSync(dbPath, outPath);
console.log(`[db:backup] OK -> ${outPath}`);

