// src/config/firebase.ts
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

// Initialize Firebase Admin SDK
const firebaseConfig = {
  credential: cert({
    projectId: Deno.env.get('FIREBASE_PROJECT_ID'),
    privateKey: Deno.env.get('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    clientEmail: Deno.env.get('FIREBASE_CLIENT_EMAIL'),
  }),
}

export const firebaseApp = getApps().length === 0 
  ? initializeApp(firebaseConfig) 
  : getApps()[0]

export const auth = getAuth(firebaseApp)
