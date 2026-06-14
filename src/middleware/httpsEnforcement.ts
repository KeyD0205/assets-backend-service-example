import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';

export function httpsEnforcement(req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV !== 'production') {
    return next();
  }

  const proto = req.get('x-forwarded-proto');

  if (proto === 'https') {
    return next();
  }

  // Redirect HTTP and header-absent requests to HTTPS. A missing header in
  // production means the request bypassed the reverse proxy entirely; letting
  // it through would allow cleartext traffic from direct pod access.
  const redirectUrl = `https://${req.get('host')}${req.originalUrl}`;

  if (!proto) {
    logger.warn(
      { requestId: req.requestId, fromIp: req.ip },
      'x-forwarded-proto missing in production — redirecting to HTTPS'
    );
  }

  res.redirect(301, redirectUrl);
}
