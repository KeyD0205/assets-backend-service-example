import type { HelmetOptions } from 'helmet';
import { env } from '../config/env.js';

/**
 * Helmet Configuration for Security Headers
 * Implements comprehensive security headers for API protection
 */
export function getHelmetOptions(): HelmetOptions {
  return {
    // Content Security Policy - restrict resource loading
    contentSecurityPolicy: {
      directives: {
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
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : undefined
      },
      reportUri: env.NODE_ENV === 'production' ? '/security/csp-report' : undefined
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

    // Permissions Policy - control browser features
    permissionsPolicy: {
      features: {
        geolocation: ["'none'"],
        microphone: ["'none'"],
        camera: ["'none'"],
        payment: ["'none'"],
        usb: ["'none'"],
        magnetometer: ["'none'"],
        gyroscope: ["'none'"],
        accelerometer: ["'none'"]
      }
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
