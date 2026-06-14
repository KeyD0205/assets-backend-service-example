import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { pgPool } from './db/postgres.js';
import { pingMongo } from './db/mongo.js';
import './shared/requestContext.js';
import { asyncHandler } from './shared/asyncHandler.js';
import { requestId } from './middleware/requestId.js';
import { inputSanitization } from './middleware/inputSanitization.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { getCorsOptions } from './middleware/corsConfig.js';
import { getHelmetOptions } from './middleware/helmetConfig.js';
import { cspReportHandler } from './middleware/cspReportHandler.js';
import { dynamicBodyLimiter } from './middleware/bodySizeLimit.js';
import { httpsEnforcement } from './middleware/httpsEnforcement.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { tenantRoutes } from './modules/tenants/tenant.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { assetRoutes } from './modules/assets/asset.routes.js';
import { reportRoutes } from './modules/reports/report.routes.js';

export function buildApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet(getHelmetOptions()));
  app.use(cors(getCorsOptions()));
  app.use(httpsEnforcement);
  // Apply dynamic body size limits based on request path
  app.use(dynamicBodyLimiter);
  app.use(inputSanitization);

  if (env.ENABLE_RATE_LIMIT) {
    app.use(rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false
    }));
  }

  const cspReportLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.get('/health', asyncHandler(async (_req, res) => {
    const [pg, mongo] = await Promise.allSettled([
      pgPool.query('SELECT 1'),
      pingMongo()
    ]);
    const ok = pg.status === 'fulfilled' && mongo.status === 'fulfilled';
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      checks: {
        postgres: pg.status === 'fulfilled' ? 'ok' : 'error',
        mongodb: mongo.status === 'fulfilled' ? 'ok' : 'error'
      }
    });
  }));

  app.post('/security/csp-report', cspReportLimiter, express.json({ type: 'application/csp-report' }), cspReportHandler);

  // Routes with size limits configured in dynamicBodyLimiter
  app.use('/v1/auth', authRoutes);
  app.use('/v1/assets', assetRoutes);
  
  // Standard routes
  app.use('/v1/tenants', tenantRoutes);
  app.use('/v1/users', userRoutes);
  app.use('/v1/reports', reportRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
