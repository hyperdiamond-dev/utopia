// src/index.ts
import { serve } from '@hono/node-server'
import "@std/dotenv/load"
import { Env, Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './middleware/auth.ts'
import { auth } from './routes/auth.ts'

interface AppContext extends Env {
  Variables: {
    user?: { id: string; name: string }
  }
}

const app = new Hono<AppContext>()

// Global middleware
app.use('*', logger())
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}))

// Auth routes (public)
app.route('/api/auth', auth)

// Protected routes example
app.get('/api/profile', authMiddleware, (c) => {
  const user = c.get('user') as { id: string; name: string }
  return c.json({
    message: 'Protected route accessed',
    user,
  })
})

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

const port = Number(Deno.env.get('PORT')) || 3001
console.log(`🔥 Hono server running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port,
})
