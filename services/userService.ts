// src/services/userService.ts
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { auth } from '../config/firebase.ts'
import { AliasGenerator } from './aliasGenerator.ts'
import { PasswordGenerator } from './passwordGenerator.ts'

export interface AnonymousUser {
  uuid: string
  friendlyAlias: string
  firebaseUid: string
  password: string
  createdAt: Date
  expiresAt: Date
}

export class UserService {
  private static users = new Map<string, AnonymousUser>() // In-memory store for demo
  
  static async createAnonymousUser(): Promise<{
    friendlyAlias: string
    password: string
    uuid: string
  }> {
    // Generate unique friendly alias
    const friendlyAlias = await AliasGenerator.generateUnique(
      async (alias) => this.aliasExists(alias)
    )
    
    // Generate secure password
    const password = PasswordGenerator.generate()
    
    // Create UUID-based identifier
    const uuid = `user_${uuidv4()}`
    
    // Create Firebase user
    const firebaseUser = await auth.createUser({
      uid: uuid,
    })

    // Set custom claims for the user
    await auth.setCustomUserClaims(firebaseUser.uid, {
      isAnonymous: true,
      friendlyAlias,
    })
    
    // Hash password for storage
    const hashedPassword = await bcrypt.hash(password, 12)
    
    // Store user data
    const user: AnonymousUser = {
      uuid,
      friendlyAlias,
      firebaseUid: firebaseUser.uid,
      password: hashedPassword,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    }
    
    this.users.set(friendlyAlias, user)
    
    return {
      friendlyAlias,
      password, // Return plain password for user
      uuid,
    }
  }
  
  static async authenticateUser(
    friendlyAlias: string, 
    password: string
  ): Promise<AnonymousUser | null> {
    const user = this.users.get(friendlyAlias)
    if (!user) return null
    
    const isValid = await bcrypt.compare(password, user.password)
    return isValid ? user : null
  }
  
  private static aliasExists(alias: string): boolean {
    return this.users.has(alias)
  }
}
