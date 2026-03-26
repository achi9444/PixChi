import cors from 'cors';
import express from 'express';
import { ZodError } from 'zod';
import { config } from './config.js';
import { attachAuthUser } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { customPalettesRouter } from './routes/customPalettes.js';
import { healthRouter } from './routes/health.js';
import { paletteRouter } from './routes/palette.js';
import { projectsRouter } from './routes/projects.js';
import { userSettingsRouter } from './routes/userSettings.js';
import { marketRouter } from './routes/market.js';
import { creatorRouter } from './routes/creator.js';
import { sendApiError } from './utils/apiError.js';

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (config.corsOriginList.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  })
);
app.use(express.json({ limit: config.jsonBodyLimit }));
app.use(attachAuthUser);

app.get('/', (_req, res) => {
  res.json({ service: 'pixchi-api', ok: true });
});
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/palette', paletteRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/custom-palettes', customPalettesRouter);
app.use('/api/user-settings', userSettingsRouter);
app.use('/api/market', marketRouter);
app.use('/api/creator', creatorRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (err instanceof ZodError) {
    sendApiError(
      res,
      400,
      'INVALID_PAYLOAD',
      'Invalid payload',
      err.issues.map((x) => ({ path: x.path.join('.'), message: x.message }))
    );
    return;
  }
  if (typeof err === 'object' && err && 'type' in err && (err as any).type === 'entity.too.large') {
    sendApiError(res, 413, 'PAYLOAD_TOO_LARGE', 'Payload too large', { limit: config.jsonBodyLimit });
    return;
  }
  if (typeof err === 'object' && err && 'type' in err && (err as any).type === 'entity.parse.failed') {
    sendApiError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
    return;
  }
  sendApiError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal Server Error');
});

app.listen(config.port, () => {
  console.log(`[pixchi-api] listening on http://localhost:${config.port}`);
});
