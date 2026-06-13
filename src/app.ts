import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import './shared/requestContext.js';
import { requestId } from './middleware/requestId.js';
import { inputSanitization } from './middleware/inputSanitization.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { tenantRoutes } from './modules/tenants/tenant.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { assetRoutes } from './modules/assets/asset.routes.js';
import { reportRoutes } from './modules/reports/report.routes.js';

export function buildApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));
  app.use(inputSanitization);

  if (env.ENABLE_RATE_LIMIT) {
    app.use(rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false
    }));
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/v1/auth', authRoutes);
  app.use('/v1/tenants', tenantRoutes);
  app.use('/v1/users', userRoutes);
  app.use('/v1/assets', assetRoutes);
  app.use('/v1/reports', reportRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
