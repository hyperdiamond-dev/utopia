// src/middleware/rateLimit.ts
import { rateLimiter } from 'hono-rate-limiter'

// Global rate limiter configuration using default memory store
export const globalRateLimit = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60, // 15 minutes in seconds
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  // @ts-ignore - TypeScript compatibility issue with hono-rate-limiter
  keyGenerator: (c) => {
    // Use IP address as the key for rate limiting
    return c.req.header('x-forwarded-for') ?? 
           c.req.header('x-real-ip') ?? 
           c.req.header('cf-connecting-ip') ?? // Cloudflare
           'anonymous'
  },
  // @ts-ignore - TypeScript compatibility issue with hono-rate-limiter
  handler: (c) => {
    // Custom response when rate limit is exceeded
    return c.json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP address',
      retryAfter: 15 * 60, // 15 minutes in seconds
      timestamp: new Date().toISOString(),
    }, 429)
  },
  // @ts-ignore - TypeScript compatibility issue with hono-rate-limiter
  skip: (c) => {
    // Skip rate limiting for health checks
    return c.req.path === '/health'
  },
})

// Auth-specific rate limiter (more restrictive)
export const authRateLimit = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 auth requests per windowMs
  message: {
    error: 'Too many authentication attempts from this IP, please try again later.',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  // @ts-ignore - TypeScript compatibility issue
  keyGenerator: (c) => {
    return c.req.header('x-forwarded-for') ?? 
           c.req.header('x-real-ip') ?? 
           'anonymous'
  },
})

// Strict rate limiter for sensitive operations like user creation
export const strictRateLimit = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5, // Limit each IP to 5 requests per hour
  message: {
    error: 'Too many attempts for this operation, please try again later.',
    retryAfter: 60 * 60,
  },
  standardHeaders: true,
  // @ts-ignore - TypeScript compatibility issue
  keyGenerator: (c) => {
    return c.req.header('x-forwarded-for') ?? 
           c.req.header('x-real-ip') ?? 
           'anonymous'
  },
})
