import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env.js';
import { errorHandler, notFound } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { clientsRouter } from './routes/clients.js';
import { exercisesRouter } from './routes/exercises.js';
import { workoutsRouter } from './routes/workouts.js';
import { dietRouter } from './routes/diet.js';
import { supplementsRouter } from './routes/supplements.js';
import { dailyLogRouter } from './routes/dailyLog.js';
import { analyticsRouter } from './routes/analytics.js';
import { powerbiRouter } from './routes/powerbi.js';
import { pool } from './db/pool.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/exercises', exercisesRouter);
  app.use('/api/workouts', workoutsRouter);
  app.use('/api/diet', dietRouter);
  app.use('/api/supplements', supplementsRouter);
  app.use('/api/daily-log', dailyLogRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/powerbi', powerbiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
