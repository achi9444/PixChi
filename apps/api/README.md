# PixChi API (Step 1)

## Quick Start

1. `cd apps/api`
2. `npm install`
3. Copy `.env.example` to `.env`
4. `npx prisma generate`
5. `npx prisma migrate dev --name init`
6. `npm run prisma:seed`
7. `npm run dev`

## Endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/palette/groups`
- `GET /api/palette/groups/:code`
- `GET /api/palette/pro/groups` (Pro/Admin)
- `GET /api/palette/pro/groups/:code` (Pro/Admin)

## Default Test Accounts

- `admin / admin123`
- `pro / pro123`
- `member / member123`

Unauthenticated requests are treated as `guest` and can still use basic endpoints.

## Goal of this step

- Keep frontend unchanged.
- Stand up backend API and DB schema first.
- Next step is to let frontend read palette data from API with fallback.
