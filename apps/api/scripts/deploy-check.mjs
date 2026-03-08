import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRE', 'JWT_REFRESH_EXPIRE_DAYS', 'CORS_ORIGIN'];
let failed = false;

for (const key of required) {
  const value = process.env[key];
  if (!value || !String(value).trim()) {
    failed = true;
    console.error(`[deploy:check] Missing env: ${key}`);
  }
}

const dbUrl = process.env.DATABASE_URL || '';
if (process.env.NODE_ENV === 'production' && dbUrl.startsWith('file:')) {
  console.warn('[deploy:check] Warning: production is using SQLite file DATABASE_URL. Consider PostgreSQL for scale.');
}

if (failed) {
  process.exit(1);
}

console.log('[deploy:check] Env check passed.');
console.log('[deploy:check] Suggested next steps:');
console.log('  1) npm run prisma:migrate:deploy');
console.log('  2) npm run prisma:seed');
console.log('  3) npm run build');
console.log('  4) npm run start');

