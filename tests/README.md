# Test Suite Documentation

This directory contains comprehensive unit tests, integration tests, and test
utilities for the Utopia Backrooms ethnography API.

## Test Structure

```
tests/
├── test-config.ts          # Test configuration and utilities
├── db/                     # Database repository tests
│   ├── users.test.ts
│   └── modules.test.ts
├── services/               # Service layer tests
│   ├── userService.test.ts
│   └── moduleService.test.ts
├── middleware/             # Middleware tests
│   ├── auth.test.ts
│   └── moduleAccess.test.ts
├── routes/                 # API route tests
│   ├── auth.test.ts
│   └── modules.test.ts
└── integration/            # Integration tests
    └── sequentialAccess.test.ts
```

## Running Tests

### All Tests

```bash
deno task test
```

### Test Categories

```bash
# Unit tests (db, services, middleware)
deno task test:unit

# Route tests
deno task test:routes

# Integration tests
deno task test:integration
```

### Development

```bash
# Watch mode for development
deno task test:watch

# Test coverage
deno task test:coverage
deno task coverage  # View coverage report
```

### Code Quality

```bash
# Format code
deno task fmt

# Lint code
deno task lint

# Type check
deno task check
```

## Test Coverage

The test suite covers:

### Database Layer (95%+ coverage target)

- **UserRepository**: User CRUD operations, status management, pagination
- **ModuleRepository**: Module management, progress tracking, sequential access
  logic
- Error handling and edge cases

### Service Layer (90%+ coverage target)

- **UserService**: User creation, authentication, alias generation
- **ModuleService**: Module progression, access control, completion validation
- Business logic validation

### Middleware (90%+ coverage target)

- **authMiddleware**: JWT validation, token expiration, error scenarios
- **moduleAccessMiddleware**: Sequential access enforcement, permission checks
- **moduleCompletionMiddleware**: Completion validation
- **moduleReviewMiddleware**: Read-only access control

### API Routes (85%+ coverage target)

- **Auth routes**: User creation, login, error handling
- **Module routes**: All CRUD operations, access control, validation
- HTTP status codes and response formats

### Integration Tests (80%+ coverage target)

- **Sequential Access**: End-to-end user journey through module system
- **Data Integrity**: Response persistence, audit logging
- **Concurrent Access**: Race conditions, multi-user scenarios
- **Error Recovery**: Network failures, partial submissions

## Test Configuration

### Environment Setup

Tests use isolated test environment variables:

- Test database URL
- Mock JWT secrets
- Mock Firebase configuration
- Isolated CORS settings

### Mock Strategy

- **Database**: MockSqlClient for unit tests, test database for integration
- **External Services**: Stubbed Firebase Admin SDK calls
- **HTTP Requests**: Hono test client for route testing
- **Time-dependent Logic**: Controlled date/time mocking

### Test Data

Helper functions for creating test data:

- `createTestUser()` - Mock user objects
- `createTestModule()` - Mock module objects
- `createTestModuleProgress()` - Mock progress objects
- `createTestJWT()` - Mock JWT tokens

## Testing Best Practices

### Test Organization

- One test file per source file
- Group related tests in `describe` blocks
- Use descriptive test names that explain the scenario
- Test both success and failure cases

### Test Isolation

- Each test is independent and can run in isolation
- Use `beforeEach`/`afterEach` for setup/cleanup
- Mock external dependencies
- Reset state between tests

### Assertion Strategy

- Test one thing per test
- Use specific assertions (`assertEquals` vs `assertExists`)
- Test error messages and status codes
- Verify side effects (database changes, audit logs)

### Edge Cases

- Empty/null inputs
- Invalid data types
- Boundary conditions
- Race conditions
- Network failures
- Database errors

## Mock Implementation Notes

### Current Limitations

The current test suite uses interface-level mocking due to the architecture. For
production use, consider:

1. **Dependency Injection**: Modify repositories to accept SQL client as
   parameter
2. **Test Database**: Use actual test database for integration tests
3. **HTTP Mocking**: Implement actual HTTP request mocking for route tests
4. **Firebase Mocking**: Use Firebase test utilities for authentication tests

### Recommended Improvements

1. **Real Database Tests**
   ```typescript
   // Use actual test database for integration tests
   const testDb = await setupTestDatabase();
   const userRepo = new UserRepository(testDb);
   ```

2. **HTTP Client Tests**
   ```typescript
   // Use Hono test client for actual HTTP testing
   const app = new Hono();
   const response = await app.request("/api/modules");
   ```

3. **Firebase Test Utilities**
   ```typescript
   // Use Firebase test utilities
   import { initializeTestApp } from "@firebase/rules-unit-testing";
   ```

## Continuous Integration

### Pre-commit Hooks

```bash
# Run before committing
deno task fmt
deno task lint
deno task check
deno task test
```

### CI Pipeline

1. Code formatting check
2. Linting
3. Type checking
4. Unit tests
5. Integration tests
6. Coverage reporting

### Performance Benchmarks

- API response time tests
- Database query performance
- Memory usage monitoring
- Concurrent user simulation

## Troubleshooting

### Common Issues

1. **Environment Variables**
   - Ensure TEST_DATABASE_URL is set
   - Check JWT_SECRET configuration
   - Verify Firebase test credentials

2. **Database Connectivity**
   - Test database must be accessible
   - Migration state should be clean
   - Connection pool limits

3. **Mock Conflicts**
   - Ensure `restore()` is called in `afterEach`
   - Check for stubbing conflicts between tests
   - Verify mock reset between test runs

4. **Async Test Issues**
   - Always await async operations
   - Handle Promise rejections properly
   - Use proper timeout values

### Debug Mode

```bash
# Run tests with debug output
deno test --allow-all --log-level=debug tests/

# Run specific test file
deno test --allow-all tests/db/users.test.ts

# Run with inspector for debugging
deno test --allow-all --inspect-brk tests/db/users.test.ts
```
