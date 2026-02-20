# Memberships Module

The MembershipsModule manages the relationship between users and ROSCA (Rotating Savings and Credit Association) groups. It tracks which users belong to which groups, their position in the payout queue, their contribution status, and their membership state.

## Features

- Add members to ROSCA groups (before group activation)
- Remove members from groups (before group activation)
- List all members of a group with their status
- Automatic payout order assignment
- Duplicate membership prevention
- Comprehensive validation and error handling
- Full audit logging with Winston

## API Endpoints

### Add Member to Group
```http
POST /api/v1/groups/:id/members
Content-Type: application/json

{
  "userId": "uuid",
  "walletAddress": "string"
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "groupId": "uuid",
  "userId": "uuid",
  "walletAddress": "string",
  "payoutOrder": 0,
  "hasReceivedPayout": false,
  "hasPaidCurrentRound": false,
  "status": "ACTIVE",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request` - Group is already active or invalid data
- `409 Conflict` - User is already a member of the group

### Remove Member from Group
```http
DELETE /api/v1/groups/:id/members/:userId
```

**Response (204 No Content)**

**Error Responses:**
- `400 Bad Request` - Group is already active
- `404 Not Found` - Membership doesn't exist

### List Group Members
```http
GET /api/v1/groups/:id/members
```

**Response (200 OK):**
```json
[
  {
    "id": "uuid",
    "groupId": "uuid",
    "userId": "uuid",
    "walletAddress": "string",
    "payoutOrder": 0,
    "hasReceivedPayout": false,
    "hasPaidCurrentRound": false,
    "status": "ACTIVE",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

## Database Schema

### Membership Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| groupId | UUID | Foreign key to Group entity |
| userId | UUID | Foreign key to User entity |
| walletAddress | String | Blockchain wallet address |
| payoutOrder | Number | Position in payout queue (0-indexed) |
| hasReceivedPayout | Boolean | Whether member has received their payout |
| hasPaidCurrentRound | Boolean | Whether member has paid in current round |
| status | Enum | ACTIVE, SUSPENDED, or REMOVED |
| createdAt | Timestamp | Creation timestamp |
| updatedAt | Timestamp | Last update timestamp |

**Constraints:**
- Unique constraint on (groupId, userId) to prevent duplicate memberships
- Indexes on groupId and userId for query performance

## Business Rules

1. **Membership modifications only before group activation**: Members can only be added or removed before a group's status changes to ACTIVE
2. **Sequential payout order**: New members are automatically assigned the next available payout order (0 for first member, max + 1 for subsequent)
3. **Duplicate prevention**: A user can only be a member of a group once (enforced at database level)
4. **Default values**: New memberships start with status=ACTIVE, hasReceivedPayout=false, hasPaidCurrentRound=false

## Testing

### Run Unit Tests
```bash
npm test -- memberships.service.spec
```

### Run Property-Based Tests
```bash
npm test -- memberships.service.properties.spec
```

### Run All Tests with Coverage
```bash
npm run test:cov
```

## Configuration

The module requires TypeORM to be configured in AppModule. Current configuration uses SQLite in-memory database for development:

```typescript
TypeOrmModule.forRoot({
  type: 'sqlite',
  database: ':memory:',
  entities: [Membership, Group, User],
  synchronize: true,
  logging: false,
})
```

For production, replace with PostgreSQL:

```typescript
TypeOrmModule.forRoot({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [Membership, Group, User],
  synchronize: false, // Disable in production
  logging: true,
})
```

## Dependencies

- `@nestjs/typeorm` - TypeORM integration
- `typeorm` - ORM for database operations
- `sqlite3` - SQLite driver (development)
- `pg` - PostgreSQL driver (production)
- `class-validator` - Request validation
- `class-transformer` - DTO transformation

## Example Usage

```typescript
// In another service
import { MembershipsService } from './memberships/memberships.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly membershipsService: MembershipsService
  ) {}

  async addMemberToGroup(groupId: string, userId: string, walletAddress: string) {
    return this.membershipsService.addMember(groupId, {
      userId,
      walletAddress
    });
  }
}
```

## Error Handling

All errors are logged with Winston and returned with appropriate HTTP status codes:

- `BadRequestException (400)` - Invalid request or business rule violation
- `NotFoundException (404)` - Resource not found
- `ConflictException (409)` - Duplicate membership attempt
- `InternalServerErrorException (500)` - Unexpected errors

## Logging

All operations are logged with context:
- Operation start with parameters
- Success with entity identifiers
- Errors with full stack traces

Example log output:
```
[MembershipsService] Adding member 123e4567-e89b-12d3-a456-426614174002 to group 123e4567-e89b-12d3-a456-426614174001
[MembershipsService] Member 123e4567-e89b-12d3-a456-426614174002 added to group 123e4567-e89b-12d3-a456-426614174001 with membership id 123e4567-e89b-12d3-a456-426614174000
```
