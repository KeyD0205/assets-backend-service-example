import type { HelmetOptions } from 'helmet';
import { env } from '../config/env.js';

/**
 * Helmet Configuration for Security Headers
 * Implements comprehensive security headers for API protection
 */
export function getHelmetOptions(): HelmetOptions {
  type ContentSecurityPolicyOptions = Extract<HelmetOptions['contentSecurityPolicy'], object>;
  type ContentSecurityPolicyDirectives = NonNullable<ContentSecurityPolicyOptions['directives']>;

  const directives: ContentSecurityPolicyDirectives = {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"]
  };

  if (env.NODE_ENV === 'production') {
    directives.upgradeInsecureRequests = [];
    directives.reportUri = ['/security/csp-report'];
  }

  return {
    // Content Security Policy - restrict resource loading
    contentSecurityPolicy: {
      directives
    },

    // HTTP Strict Transport Security - force HTTPS
    hsts: {
      maxAge: 63072000, // 2 years
      includeSubDomains: true,
      preload: true
    },

    // Prevent MIME type sniffing
    noSniff: true,

    // X-XSS Protection header
    xssFilter: true,

    // X-Frame-Options - prevent clickjacking
    frameguard: {
      action: 'deny'
    },

    // Referrer Policy - control referrer information
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },

    // Cross-Origin Embedder Policy
    crossOriginEmbedderPolicy: env.NODE_ENV === 'production',

    // Cross-Origin Opener Policy
    crossOriginOpenerPolicy: {
      policy: 'same-origin'
    },

    // Cross-Origin Resource Policy
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  };
}
