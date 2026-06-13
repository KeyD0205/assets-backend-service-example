import type { Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'not_found',
      message: `Route ${req.method} ${req.path} not found`,
      request_id: req.requestId
    }
  });
}
