# PixChi Backend Migration Progress

## Current Phase

- Phase A - Backend foundation (in progress)

## Done in this commit

- Added standalone backend workspace: `apps/api/`
- Added Express API bootstrap with CORS + JSON middleware
- Added health endpoint: `GET /api/health`
- Added palette endpoints:
  - `GET /api/palette/groups`
  - `GET /api/palette/groups/:code`
- Added Prisma schema (`PaletteGroup`, `PaletteColor`) with SQLite datasource
- Added Prisma seed script with minimal starter data
- Added `.env.example` and backend quick-start README

## Next Step

- Phase A-2: connect frontend palette loader to backend API (with local JSON fallback)
- Phase A-3: move custom palette persistence from local-only to API (keep local fallback)
- Phase A-4: wire frontend login/token flow to new `/api/auth/*` endpoints

## Newly completed

- Added auth endpoints:
  - `POST /api/auth/login`
  - `GET /api/auth/me`
- Added optional bearer auth middleware (no token => `guest`)
- Added role-aware palette response shaping
- Confirmed unauthenticated users can still access basic palette APIs
- Added `User` model in Prisma and created migration `add_user_auth`
- Auth now verifies credentials from DB (no hard-coded in service)
- Seed now imports full palette + creates test users with bcrypt password hash
- Frontend extracted auth/palette API calls into `apps/web/src/services/api.ts`
- Added refresh/logout auth flow with DB-backed `AuthSession`
- Frontend API client now auto-refreshes expired access token
- Added explicit Pro-locked endpoints:
  - `GET /api/palette/pro/groups`
  - `GET /api/palette/pro/groups/:code`
- Extracted auth localStorage helpers to `apps/web/src/services/authStorage.ts`

## Hosting portability notes

- Backend base URL should always come from env, not hard-coded.
- DB connection should always come from `DATABASE_URL`.
- Keep API contract stable so frontend UI refactor does not break backend.
