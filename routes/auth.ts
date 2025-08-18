// src/routes/auth.ts
import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { UserService } from '../services/userService.ts'

const auth = new Hono()

// Create anonymous user endpoint
auth.post('/create-anonymous', async (c) => {
  try {
    const user = await UserService.createAnonymousUser()
    
    return c.json({
      success: true,
      credentials: {
        username: user.friendlyAlias,
        password: user.password,
      },
      message: 'Anonymous account created successfully',
    })
  } catch (error) {
    return c.json({ error: 'Failed to create user' }, 500)
  }
})

// Login endpoint
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

auth.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = loginSchema.parse(body)
    
    const user = await UserService.authenticateUser(username, password)
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    
    // Create JWT token
    const token = jwt.sign(
      {
        uuid: user.uuid,
        friendlyAlias: user.friendlyAlias,
        firebaseUid: user.firebaseUid,
      },
      Deno.env.get('JWT_SECRET')!,
      { expiresIn: '30d' }
    )
    
    return c.json({
      success: true,
      token,
      user: {
        uuid: user.uuid,
        username: user.friendlyAlias,
      },
    })
  } catch (error) {
    return c.json({ error: 'Login failed' }, 400)
  }
})

export { auth }
