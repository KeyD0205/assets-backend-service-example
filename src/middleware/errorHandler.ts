import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Invalid request',
        details: err.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })),
        request_id: req.requestId
      }
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.expose ? err.message : 'Internal server error',
        ...(err.details ? { details: err.details } : {}),
        request_id: req.requestId
      }
    });
    return;
  }

  logger.error({ err, requestId: req.requestId }, 'Unhandled request error');
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Internal server error',
      request_id: req.requestId
    }
  });
}
