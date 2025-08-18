// src/middleware/auth.ts
import { createMiddleware } from 'hono/factory'
import jwt from 'jsonwebtoken'

export const authMiddleware = createMiddleware(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  
  if (!token) {
    return c.json({ error: 'No token provided' }, 401)
  }
  
  try {
    const decoded = jwt.verify(token, Deno.env.get('JWT_SECRET')!) as any
    c.set('user', decoded)
    await next()
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401)
  }
})
