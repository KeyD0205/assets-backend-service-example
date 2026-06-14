import type { NextFunction, Request, Response } from 'express';
import { logger } from '../shared/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      request_id: req.requestId
    }, 'request completed');
  });

  next();
}
