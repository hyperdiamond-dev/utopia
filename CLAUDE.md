# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

**Development Server:**

```bash
deno task start
```

Runs the Hono server on port 3001 (or PORT env var) with all necessary permissions.

**Code Quality:**

```bash
deno fmt                    # Format code
deno check main.ts          # Type check
deno lint                   # Lint code
```

## Architecture Overview

**Runtime & Framework:**
- **Deno** runtime with TypeScript
- **Hono** web framework for HTTP server
- **Firebase Admin SDK** for user authentication and management
- **Neon Postgres** for persistent data storage
- **JWT** tokens for session management (30-day expiration)

**Project Structure:**

```
├── main.ts              # Server entry point with middleware setup
├── routes/              # HTTP route handlers
├── services/            # Business logic layer
├── middleware/          # Authentication, rate limiting, etc.
├── db/                  # Database repositories and schema
├── config/              # Firebase and other configuration
├── types/               # TypeScript type definitions
└── utils/               # Shared utilities
```

**Data Flow Pattern:**

Routes → Services → Repositories → Database

## Core Features

**Anonymous User System:**

- Users get friendly aliases (e.g., "BraveTiger", "CleverWolf")
- Temporary passwords generated automatically
- 30-day account expiration with Firebase custom claims storage
- UUID-based user identifiers with "user_" prefix

**Authentication Flow:**

1. POST `/api/auth/create-anonymous` - Creates user with friendly alias + password
2. POST `/api/auth/login` - Authenticates with alias/password, returns JWT
3. Protected routes use `authMiddleware` to validate JWT tokens

**Database Schema:**

- `users` table with UUID, friendly alias, status tracking
- `consents` table for user consent management
- `audits` table for event logging and compliance
- Repository pattern with typed interfaces

## Environment Variables

Required environment variables:

- `DATABASE_URL` - Neon Postgres connection string
- `JWT_SECRET` - Secret for JWT token signing
- `FIREBASE_*` variables for Firebase Admin SDK
- `ALLOWED_ORIGINS` - CORS configuration (comma-separated)
- `PORT` - Server port (defaults to 3001)

## Development Notes

**Firebase Integration:**

- Users stored in Firebase Auth with custom claims containing metadata
- Password hashes stored in custom claims (not recommended for production)
- User lookup done via Firebase Admin SDK `listUsers()` method

**Database Migrations:**

- Migration system exists in `db/migrationRunner.ts`
- Manual migration execution required

**Rate Limiting:**

- Global rate limiting applied via `hono-rate-limiter`
- Configured in `middleware/rateLimit.ts`

**Security:**

- CORS enabled with environment-based origins
- Secure headers middleware enabled
- bcrypt password hashing with 12 rounds
- JWT tokens with 30-day expiration

## Sequential Module System

**Module Flow:**

- Users progress through modules sequentially: Consent → Module 1 → Module 2 → Module 3 → Module 4
- Each module must be completed before the next unlocks
- Completed modules remain accessible for review (read-only)
- Module progress tracked in `user_module_progress` table

**Key API Endpoints:**

```
GET  /api/modules              # User's module overview
GET  /api/modules/current      # Current module to work on
GET  /api/modules/:name        # Specific module data
POST /api/modules/:name/start  # Start a module
POST /api/modules/:name/save   # Save partial progress
POST /api/modules/:name/complete # Complete module
```

**Module Access Control:**

- `moduleAccessMiddleware` - Checks sequential access requirements
- `moduleCompletionMiddleware` - Validates completion attempts
- `moduleReviewMiddleware` - Allows read-only access to completed modules
- Automatic audit logging for access attempts and completions

**Database Schema:**

- `modules` table defines available modules and sequence
- `user_module_progress` tracks individual progress
- `ModuleStatus` enum: 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'
- Triggers maintain `updated_at` timestamps

**Setup Commands:**

```bash
deno run --allow-net --allow-read --allow-env db/init.ts migrate
```

## API Documentation

Complete API documentation available in `swagger.yaml` with:

- OpenAPI 3.1 specification
- Authentication endpoints
- Module progression endpoints
- Request/response schemas
- Error handling patterns