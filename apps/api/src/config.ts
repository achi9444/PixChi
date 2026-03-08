import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  corsOriginList: String(
    process.env.CORS_ORIGIN ??
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173'
  )
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? 'pixchi-dev-secret-change-me',
  jwtExpire: process.env.JWT_EXPIRE ?? '30m',
  jwtRefreshExpireDays: Number(process.env.JWT_REFRESH_EXPIRE_DAYS ?? 14),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? '15mb'
} as const;
