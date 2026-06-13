import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';

/**
 * HTTPS enforcement middleware for production
 * 
 * In production:
 * - Validates x-forwarded-proto header (from reverse proxy/load balancer)
 * - Redirects HTTP requests to HTTPS with 301 permanent redirect
 * - Prevents protocol downgrade attacks
 * 
 * In development: Passes through without enforcement
 */
export function httpsEnforcement(req: Request, res: Response, next: NextFunction): void {
  // Only enforce in production
  if (env.NODE_ENV !== 'production') {
    return next();
  }

  // Check x-forwarded-proto header (set by reverse proxy/load balancer)
  // This is the protocol the client used to connect to the proxy
  const proto = req.get('x-forwarded-proto');

  if (proto === 'https') {
    // Already HTTPS, proceed
    return next();
  }

  if (proto === 'http') {
    // Client connected via HTTP, redirect to HTTPS
    const originalUrl = req.originalUrl;
    const redirectUrl = `https://${req.get('host')}${originalUrl}`;
    
    logger.info(
      { 
        originalUrl, 
        redirectUrl,
        requestId: req.requestId,
        fromIp: req.ip 
      },
      'Redirecting HTTP request to HTTPS'
    );

    return res.redirect(301, redirectUrl);
  }

  // x-forwarded-proto header missing in production - this is a misconfiguration
  logger.warn(
    { 
      requestId: req.requestId,
      headers: req.headers,
      fromIp: req.ip 
    },
    'x-forwarded-proto header missing in production - ensure reverse proxy is configured'
  );

  // Continue anyway - let the application handle it
  // Some deployments (e.g., direct HTTPS) may not need this header
  return next();
}

/**
 * Strict HTTPS enforcement middleware
 * 
 * More restrictive variant that rejects requests without x-forwarded-proto
 * Useful for environments that MUST go through a reverse proxy
 * 
 * Returns 400 Bad Request if header is missing
 */
export function httpsEnforcementStrict(req: Request, res: Response, next: NextFunction): void {
  // Only enforce in production
  if (env.NODE_ENV !== 'production') {
    return next();
  }

  const proto = req.get('x-forwarded-proto');

  if (proto === 'https') {
    return next();
  }

  if (proto === 'http') {
    const redirectUrl = `https://${req.get('host')}${req.originalUrl}`;
    logger.info(
      { 
        requestId: req.requestId,
        redirectUrl,
        fromIp: req.ip 
      },
      'Redirecting HTTP request to HTTPS'
    );
    return res.redirect(301, redirectUrl);
  }

  // Header missing - reject with 400
  logger.error(
    { 
      requestId: req.requestId,
      headers: req.headers,
      fromIp: req.ip 
    },
    'x-forwarded-proto header required but missing - reverse proxy misconfigured'
  );

  return res.status(400).json({
    error: {
      code: 'missing_proxy_header',
      message: 'Invalid request - reverse proxy configuration required',
      request_id: req.requestId
    }
  });
}
