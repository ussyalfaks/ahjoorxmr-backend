# Prevent Double Contribution

This NestJS application prevents members from submitting multiple contributions for the same round. It enforces a unique constraint on the combination of `groupId`, `userId`, and `roundNumber`.

## Overview

### Problem

A member could submit multiple contributions for the same round (`groupId + userId + roundNumber`) as long as each had a unique `transactionHash`. This allowed gaming the system and corrupted round accounting.

### Solution

- **Database Constraint**: A unique constraint on `(groupId, userId, roundNumber)` in the `Contribution` entity prevents duplicate contributions at the database level.
- **Application Validation**: The `ContributionsService.createContribution()` method explicitly checks for existing contributions before attempting to save, returning a `409 Conflict` error with a descriptive message.
- **Database Migration**: TypeORM migration sets up the table and constraint.

## Project Structure

```
src/
├── main.ts                                 # Application entry point
├── app.module.ts                          # Root module with TypeORM configuration
├── contributions/
│   ├── contribution.entity.ts             # Contribution entity with unique constraint
│   ├── contributions.service.ts           # Service with validation logic
│   ├── contributions.controller.ts        # REST API endpoints
│   ├── contributions.module.ts            # Feature module
│   ├── contributions.service.spec.ts      # Unit tests
│   ├── contributions.integration.spec.ts  # Integration tests
│   └── dto/
│       └── create-contribution.dto.ts     # Data transfer object
└── database/
    └── migrations/
        └── 1703688000000-CreateContributionTable.ts  # Database migration
```

## Key Features

### 1. Contribution Entity

Located in [src/contributions/contribution.entity.ts](src/contributions/contribution.entity.ts)

```typescript
@Entity("contributions")
@Unique(["groupId", "userId", "roundNumber"])
@Index(["groupId", "userId", "roundNumber"])
export class Contribution {
  // ... fields
}
```

**Features:**

- `@Unique` decorator enforces database-level constraint
- `@Index` decorator improves query performance
- Composite key: `(groupId, userId, roundNumber)`

### 2. ContributionsService Validation

Located in [src/contributions/contributions.service.ts](src/contributions/contributions.service.ts)

The `createContribution()` method:

1. Checks if a contribution already exists for the same `(groupId, userId, roundNumber)`
2. Throws `409 Conflict` if one exists
3. Creates and saves the contribution if validation passes

```typescript
async createContribution(createContributionDto: CreateContributionDto): Promise<Contribution> {
  const { groupId, userId, roundNumber } = createContributionDto;

  // Explicit check for existing contribution
  const existingContribution = await this.contributionRepository.findOne({
    where: { groupId, userId, roundNumber },
  });

  if (existingContribution) {
    throw new ConflictException(
      `You have already contributed for round ${roundNumber} in this group`,
    );
  }

  const contribution = this.contributionRepository.create(createContributionDto);
  return this.contributionRepository.save(contribution);
}
```

### 3. Database Migration

Located in [src/database/migrations/1703688000000-CreateContributionTable.ts](src/database/migrations/1703688000000-CreateContributionTable.ts)

Creates the `contributions` table with:

- UUID primary key
- Unique constraint on `(groupId, userId, roundNumber)`
- Composite index for query performance
- Timestamps (`createdAt`, `updatedAt`)

### 4. REST API Endpoints

Located in [src/contributions/contributions.controller.ts](src/contributions/contributions.controller.ts)

| Method | Endpoint                                            | Description                                            |
| ------ | --------------------------------------------------- | ------------------------------------------------------ |
| POST   | `/api/contributions`                                | Create a new contribution (enforces unique constraint) |
| GET    | `/api/contributions`                                | Get all contributions                                  |
| GET    | `/api/contributions/:id`                            | Get a specific contribution                            |
| GET    | `/api/contributions/by-group/:groupId/:userId`      | Get contributions for a user in a group                |
| GET    | `/api/contributions/by-round/:groupId/:roundNumber` | Get contributions for a specific round                 |

## Testing

### Unit Tests

Located in [src/contributions/contributions.service.spec.ts](src/contributions/contributions.service.spec.ts)

Tests mock the repository and verify:

- ✅ First contribution for a round succeeds
- ✅ Second contribution for the same round throws `409 Conflict`
- ✅ Contribution from a different round succeeds
- ✅ Error message is descriptive

### Integration Tests

Located in [src/contributions/contributions.integration.spec.ts](src/contributions/contributions.integration.spec.ts)

Uses in-memory SQLite database to verify:

- ✅ First contribution succeeds
- ✅ Second contribution returns `409 Conflict` with correct error message
- ✅ Different round contributions allowed for same user
- ✅ Same round, different users allowed
- ✅ Same user, different groups allowed
- ✅ Query methods work correctly

## Setup & Installation

### Prerequisites

- Node.js 18+
- PostgreSQL (for production) or SQLite (for testing)
- npm or yarn

### Installation

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env`:

```env
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=contributions
```

3. Run database migrations:

```bash
npm run migration:run
```

## Running the Application

### Development Mode

```bash
npm run start:dev
```

### Production Mode

```bash
npm run build
npm start
```

## Running Tests

### Unit Tests

```bash
npm test
```

### With Coverage

```bash
npm run test:cov
```

### Watch Mode

```bash
npm run test:watch
```

## Acceptance Criteria Compliance

| Criteria                                                  | Status | Evidence                                                                                                                                            |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Second contribution for same round returns `409 Conflict` | ✅     | [Integration test](src/contributions/contributions.integration.spec.ts#L78)                                                                         |
| Unique DB constraint enforces at database level           | ✅     | [Entity decorator](src/contributions/contribution.entity.ts#L4) & [Migration](src/database/migrations/1703688000000-CreateContributionTable.ts#L51) |
| Contribution from different round succeeds                | ✅     | [Integration test](src/contributions/contributions.integration.spec.ts#L88)                                                                         |
| Tests cover all three scenarios                           | ✅     | [Unit tests](src/contributions/contributions.service.spec.ts) & [Integration tests](src/contributions/contributions.integration.spec.ts)            |

## Error Handling

### 409 Conflict

When attempting to create a duplicate contribution:

**Request:**

```bash
POST /api/contributions
Content-Type: application/json

{
  "groupId": "group-1",
  "userId": "user-1",
  "roundNumber": 1,
  "transactionHash": "hash-002",
  "amount": 50
}
```

**Response:**

```json
{
  "statusCode": 409,
  "message": "You have already contributed for round 1 in this group",
  "error": "Conflict"
}
```

## Architecture Notes

### Defense in Depth

1. **Application Layer**: Service validates before save
2. **Database Layer**: Unique constraint prevents violation

### Performance

- Composite index on `(groupId, userId, roundNumber)` ensures fast lookups
- `findOne()` query is efficient for duplicate checking

### Data Integrity

- Unique constraint enforced at database level ensures no race conditions
- Transaction atomicity guarantees consistency

## License

This project is unlicensed.
