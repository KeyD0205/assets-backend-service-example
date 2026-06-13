import type { CorsOptions } from 'cors';
import { env } from '../config/env.js';

/**
 * CORS Configuration
 * Supports multiple origins and restricts cross-origin requests in production
 */
export function getCorsOptions(): CorsOptions {
  // Parse allowed origins from environment
  const allowedOrigins = env.CORS_ORIGIN === '*'
    ? ['*']
    : env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);

  // In development, allow any origin; in production, restrict
  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Always allow requests with no origin (same-site, mobile apps, etc.)
      if (!origin) {
        return callback(null, true);
      }

      // Allow all origins in development with wildcard
      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Check if origin is in whitelist
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Reject if not in whitelist
      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204
  };

  return corsOptions;
}
