import type { NextFunction, Request, Response } from 'express';
import { logger } from '../shared/logger.js';

export type CspViolation = {
  'document-uri': string;
  'blocked-uri'?: string;
  'original-policy'?: string;
  'violated-directive'?: string;
  'effective-directive'?: string;
  'disposition': 'enforce' | 'report';
  'source-file'?: string;
  'line-number'?: number;
  'column-number'?: number;
};

/**
 * CSP violation report handler
 * Logs Content Security Policy violations for security monitoring
 */
export function cspReportHandler(req: Request, res: Response, _next: NextFunction): void {
  const violation = req.body as CspViolation;

  if (violation) {
    logger.warn({
      type: 'csp_violation',
      'blocked-uri': violation['blocked-uri'],
      'violated-directive': violation['violated-directive'],
      'effective-directive': violation['effective-directive'],
      'source-file': violation['source-file'],
      'line-number': violation['line-number'],
      'disposition': violation['disposition']
    }, 'Content Security Policy violation reported');
  }

  // Always respond with 204 (No Content)
  res.status(204).send();
}
