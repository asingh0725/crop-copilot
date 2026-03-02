# Backend Integration Tests

## Overview

This directory contains integration tests for the Crop Copilot API v1 endpoints.

## Test Setup

### Prerequisites

```bash
cd apps/web
pnpm install
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test inputs.test.ts

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage
```

## Test Structure

```
__tests__/
└── api/
    └── v1/
        ├── inputs.test.ts          # Input creation & listing tests
        ├── recommendations.test.ts # Recommendation CRUD tests
        ├── products.test.ts        # Product search & comparison tests
        ├── profile.test.ts         # Profile management tests
        └── auth.test.ts            # Authentication tests
```

## Writing Tests

### Example Test

```typescript
import { describe, it, expect } from 'vitest'
import { createInput } from '@/lib/services'

describe('Inputs API', () => {
  it('should create input successfully', async () => {
    const result = await createInput({
      userId: 'test-user-id',
      type: 'PHOTO',
      imageUrl: 'https://example.com/image.jpg',
    })

    expect(result).toHaveProperty('input')
    expect(result).toHaveProperty('recommendationId')
  })
})
```

### Mocking

- **Database**: Use test database with API SQL migrations
- **Supabase Auth**: Mock with `vi.mock('@/lib/supabase/server')`
- **External APIs**: Mock Claude API, Supabase Storage, etc.

## Test Database

For full integration tests, you'll need:

1. Test database URL in `.env.test`
2. Run migrations from `apps/api/sql/` in order with `psql`
3. Seed test data using SQL fixtures or API test helpers

## Current Status

**Phase 1**: Basic service layer tests created as examples.

**TODO for Phase 1 completion**:
- [ ] Add Vitest configuration
- [ ] Set up test database
- [ ] Mock Supabase auth
- [ ] Add remaining endpoint tests
- [ ] Add error case tests
- [ ] Add authentication tests

## Notes

- Current tests are unit tests for service layer functions
- Full integration tests require HTTP request mocking and test database
- Phase 1 includes basic test structure; comprehensive tests in later phases
