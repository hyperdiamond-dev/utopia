# Utopia - Research Module System

A comprehensive research study platform built with Deno, Hono, and TypeScript. This system provides sequential module access, user authentication, and progress tracking for research participants.

## 🚀 Quick Start

### Prerequisites

- [Deno](https://deno.land/) (v1.40+)
- PostgreSQL database (we use [Neon](https://neon.tech/))
- Firebase project for authentication

### Installation & Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd utopia
   ```

2. **Environment Setup**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:
   - `FIREBASE_PROJECT_ID`: Your Firebase project ID
   - `FIREBASE_CLIENT_EMAIL`: Firebase service account email
   - `FIREBASE_PRIVATE_KEY`: Firebase service account private key
   - `JWT_SECRET`: Secret key for JWT token signing
   - `DATABASE_URL`: PostgreSQL connection string
   - `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

3. **Start the development server**

   ```bash
   deno task start
   ```

The server will start on `http://localhost:8000`

## 📋 Available Commands

### Development

```bash
# Start the development server
deno task start

# Check TypeScript types
deno task check

# Format code
deno task fmt

# Lint code (zero errors ✅)
deno task lint
```

### Testing

```bash
# Run all tests
deno task test

# Run unit tests only (db, services, middleware)
deno task test:unit

# Run route tests only
deno task test:routes

# Run integration tests only
deno task test:integration

# Run tests in watch mode
deno task test:watch

# Run tests with coverage
deno task test:coverage

# Generate coverage report
deno task coverage
```

## 🏗️ Project Structure

```text
.
├── main.ts                 # Application entry point
├── middleware/             # Custom middleware
│   ├── auth.ts            # JWT authentication
│   ├── moduleAccess.ts    # Module access control
│   └── rateLimit.ts       # Rate limiting
├── routes/                # API route handlers
│   ├── auth.ts           # Authentication endpoints
│   └── modules.ts        # Module management endpoints
├── services/              # Business logic
│   ├── userService.ts    # User management
│   └── moduleService.ts  # Module operations
├── db/                   # Database layer
│   ├── connection.ts     # Database connection
│   ├── users.ts         # User repository
│   ├── modules.ts       # Module repository
│   ├── consents.ts      # Consent management
│   └── audits.ts        # Audit logging
├── tests/               # Test files
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── routes/        # Route tests
└── utils/              # Utility functions
```

## 🔗 API Endpoints

### Authentication

- `POST /api/auth/create-anonymous` - Create anonymous user
- `POST /api/auth/login` - Login with credentials

### Modules

- `GET /api/modules/list` - Get all available modules (public)
- `GET /api/modules` - Get user's module overview (protected)
- `GET /api/modules/current` - Get user's current module (protected)
- `GET /api/modules/:moduleName` - Get specific module data (protected)
- `POST /api/modules/:moduleName/start` - Start a module (protected)
- `POST /api/modules/:moduleName/save` - Save module progress (protected)
- `POST /api/modules/:moduleName/complete` - Complete a module (protected)
- `GET /api/modules/:moduleName/responses` - Get module responses (protected)
- `GET /api/modules/progress/stats` - Get progress statistics (protected)

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Global and endpoint-specific rate limiting
- **CORS Protection**: Configurable cross-origin resource sharing
- **Sequential Access**: Enforced module progression
- **Secure Headers**: Security headers via Hono middleware
- **Input Validation**: Zod schema validation

## 📊 Module System

The platform implements a sequential module system where:

1. **Anonymous User Creation**: Users get unique aliases and temporary passwords
2. **Sequential Progression**: Users must complete modules in order
3. **Progress Tracking**: Real-time tracking of module completion
4. **Access Control**: Middleware ensures proper module access
5. **Audit Trail**: Complete logging of user actions

### Module Flow

1. User creates anonymous account
2. Starts with consent module
3. Progresses through modules sequentially
4. Cannot skip or access future modules
5. Can review completed modules

## 🧪 Testing

The project maintains comprehensive test coverage:

- **Unit Tests**: Database repositories, services, middleware
- **Integration Tests**: Full user journey scenarios
- **Route Tests**: API endpoint functionality
- **Edge Cases**: Error handling, concurrent access, validation

All tests pass with **zero lint errors** ✅

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `FIREBASE_PROJECT_ID` | Firebase project identifier | Yes |
| `FIREBASE_CLIENT_EMAIL` | Service account email | Yes |
| `FIREBASE_PRIVATE_KEY` | Service account private key | Yes |
| `JWT_SECRET` | Secret for JWT signing | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `ALLOWED_ORIGINS` | CORS allowed origins | Yes |

### Database Schema

The system uses PostgreSQL with the following main tables:

- `users` - User accounts and status
- `modules` - Module definitions
- `user_module_progress` - Progress tracking
- `consents` - Consent management
- `audits` - Action logging

## 🚀 Deployment

The application is designed to run on any Deno-compatible platform:

1. **Deno Deploy**: Native Deno hosting
2. **Docker**: Container deployment
3. **Cloud Platforms**: AWS, GCP, Azure with Deno runtime

## 📝 Development Guidelines

- **TypeScript**: Strict typing throughout
- **ESLint/Deno Lint**: Zero errors policy
- **Testing**: Comprehensive coverage required
- **Security**: Authentication on all protected routes
- **Error Handling**: Graceful error responses
- **Logging**: Structured logging for debugging

## 🤝 Contributing

1. Ensure all tests pass: `deno task test`
2. Verify no lint errors: `deno task lint`
3. Check types: `deno task check`
4. Format code: `deno task fmt`

## 📄 License

### Academic and Non-Profit Use Only

This software is licensed for academic and non-profit use only. Any commercial use, including but not limited to:

- Using this software in commercial products or services
- Selling access to this software or derivatives
- Using this software for revenue-generating activities
- Incorporating this software into proprietary commercial systems

is strictly prohibited without explicit written permission from the copyright holders.

### Permitted Uses

✅ **Academic research and education**
✅ **Non-profit organizations and initiatives**
✅ **Open source projects with compatible licenses**
✅ **Personal learning and experimentation**

### Prohibited Uses

❌ **Commercial products or services**
❌ **Revenue-generating activities**
❌ **Proprietary software integration**
❌ **Selling or licensing derivatives**

For commercial licensing inquiries, please contact the project maintainers.

**Copyright Notice:** This project contains confidential and proprietary information. Unauthorized reproduction, distribution, or commercial use is strictly prohibited.

---

Built with ❤️ using Deno, Hono, and TypeScript
