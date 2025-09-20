// src/middleware/auth.ts
import { createMiddleware } from 'hono/factory'
import jwt from 'jsonwebtoken'

interface JWTPayload {
  uuid?: string;
  friendlyAlias?: string;
  firebaseUid?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')

  if (!token) {
    return c.json({ error: 'No token provided' }, 401)
  }

  try {
    const decoded = jwt.verify(token, Deno.env.get('JWT_SECRET')!) as JWTPayload
    c.set('user', decoded)
    await next()
  } catch (_error) {
    return c.json({ error: 'Invalid token' }, 401)
  }
})
