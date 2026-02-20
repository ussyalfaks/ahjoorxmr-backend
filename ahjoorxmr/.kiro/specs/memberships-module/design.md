# Design Document: Memberships Module

## Overview

The MembershipsModule is a NestJS module that manages the relationship between users and ROSCA (Rotating Savings and Credit Association) groups. It provides REST API endpoints for creating, removing, and listing group memberships while enforcing business rules around membership lifecycle and data integrity.

### Key Responsibilities

- Persist membership data with all required fields (id, groupId, userId, walletAddress, payoutOrder, status flags, timestamps)
- Provide REST API endpoints for membership management (POST, DELETE, GET)
- Enforce unique constraint on groupId + userId combinations to prevent duplicate memberships
- Validate that membership modifications only occur before groups become active
- Automatically assign payout order positions when adding members
- Log all operations using Winston logger for audit and troubleshooting
- Validate all incoming requests using class-validator decorators

### Design Principles

- Follow NestJS architectural patterns (module, controller, service, entity separation)
- Leverage existing global infrastructure (ValidationPipe, HttpExceptionFilter, LoggingInterceptor)
- Use TypeORM for database persistence with proper entity relationships
- Implement comprehensive error handling with appropriate HTTP status codes
- Maintain testability through dependency injection and service layer abstraction

## Architecture

### Module Structure

```
src/memberships/
├── memberships.module.ts          # Module definition with imports/exports
├── memberships.controller.ts      # REST API endpoints
├── memberships.service.ts         # Business logic layer
├── entities/
│   └── membership.entity.ts       # TypeORM entity definition
├── dto/
│   ├── create-membership.dto.ts   # Request DTO for POST
│   └── membership-response.dto.ts # Response DTO
└── memberships.service.spec.ts    # Unit tests for service layer
```

### Layer Responsibilities

**Controller Layer** (`memberships.controller.ts`)
- Define REST API routes with proper HTTP methods and status codes
- Apply validation pipes to request DTOs
- Delegate business logic to service layer
- Transform service responses to HTTP responses
- Handle route parameters (groupId, userId)

**Service Layer** (`memberships.service.ts`)
- Implement core business logic for membership operations
- Interact with TypeORM repository for database operations
- Enforce business rules (active group validation, duplicate prevention)
- Calculate next available payout order
- Log operations and errors using Winston logger
- Throw appropriate NestJS exceptions for error conditions

**Entity Layer** (`membership.entity.ts`)
- Define database schema using TypeORM decorators
- Establish foreign key relationships to Group and User entities
- Define unique constraints and indexes
- Specify column types and default values

**DTO Layer** (`dto/`)
- Define request validation rules using class-validator
- Transform and sanitize incoming data
- Provide type safety for API contracts
- Define response structure for consistency

### Dependencies

**External Modules**
- TypeORM module for database access (assumed to be configured in AppModule)
- Winston logger (available through global LoggingInterceptor)
- class-validator and class-transformer (configured in global ValidationPipe)

**Internal Dependencies**
- Group entity (foreign key relationship)
- User entity (foreign key relationship)
- Common DTOs and filters (already available in src/common)

### Integration Points

- **Database**: PostgreSQL via TypeORM with membership table
- **Groups Module**: Foreign key reference to groups table, validation of group status
- **Users Module**: Foreign key reference to users table
- **Logging**: Winston logger for operation audit trail
- **Validation**: Global ValidationPipe for request validation
- **Error Handling**: Global HttpExceptionFilter for consistent error responses

## Components and Interfaces

### MembershipsController

**Endpoints**

```typescript
POST   /api/v1/groups/:id/members
DELETE /api/v1/groups/:id/members/:userId
GET    /api/v1/groups/:id/members
```

**Method Signatures**

```typescript
@Controller('api/v1/groups')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() createMembershipDto: CreateMembershipDto,
  ): Promise<MembershipResponseDto>

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void>

  @Get(':id/members')
  async listMembers(
    @Param('id', ParseUUIDPipe) groupId: string,
  ): Promise<MembershipResponseDto[]>
}
```

### MembershipsService

**Method Signatures**

```typescript
@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly logger: WinstonLogger,
  ) {}

  async addMember(
    groupId: string,
    createMembershipDto: CreateMembershipDto,
  ): Promise<Membership>

  async removeMember(groupId: string, userId: string): Promise<void>

  async listMembers(groupId: string): Promise<Membership[]>

  private async validateGroupNotActive(groupId: string): Promise<void>

  private async getNextPayoutOrder(groupId: string): Promise<number>
}
```

**Business Logic Details**

`addMember`:
1. Log operation start with groupId and userId
2. Validate group exists and is not active (throw BadRequestException if active)
3. Check for duplicate membership (throw ConflictException if exists)
4. Calculate next available payoutOrder (max + 1, or 0 if first member)
5. Create Membership entity with status=ACTIVE, hasReceivedPayout=false, hasPaidCurrentRound=false
6. Save to database
7. Log success with membership id
8. Return created membership

`removeMember`:
1. Log operation start with groupId and userId
2. Validate group exists and is not active (throw BadRequestException if active)
3. Find membership by groupId and userId
4. If not found, throw NotFoundException
5. Delete membership from database
6. Log success with membership id

`listMembers`:
1. Log operation start with groupId
2. Query all memberships for groupId ordered by payoutOrder ASC
3. Return array (empty if no members or group doesn't exist)
4. Log success with member count

### Membership Entity

**Schema Definition**

```typescript
@Entity('memberships')
@Unique(['groupId', 'userId'])
export class Membership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  groupId: string;

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column('uuid')
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('varchar', { length: 255 })
  walletAddress: string;

  @Column('int')
  payoutOrder: number;

  @Column('boolean', { default: false })
  hasReceivedPayout: boolean;

  @Column('boolean', { default: false })
  hasPaidCurrentRound: boolean;

  @Column({
    type: 'enum',
    enum: MembershipStatus,
    default: MembershipStatus.ACTIVE,
  })
  status: MembershipStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REMOVED = 'REMOVED',
}
```

**Indexes**
- Primary key on `id`
- Unique constraint on `(groupId, userId)` combination
- Index on `groupId` for efficient member listing
- Index on `userId` for user-based queries

## Data Models

### CreateMembershipDto

```typescript
export class CreateMembershipDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  walletAddress: string;
}
```

**Validation Rules**
- `userId`: Required, must be valid UUID format
- `walletAddress`: Required, non-empty string with minimum length 1

### MembershipResponseDto

```typescript
export class MembershipResponseDto {
  id: string;
  groupId: string;
  userId: string;
  walletAddress: string;
  payoutOrder: number;
  hasReceivedPayout: boolean;
  hasPaidCurrentRound: boolean;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}
```

**Transformation**
- Dates converted to ISO 8601 strings
- All fields from entity included in response
- No sensitive data filtering required

### Error Response Format

Following the existing HttpExceptionFilter pattern:

```typescript
{
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
}
```

**HTTP Status Codes**
- `201 Created`: Successful member addition
- `204 No Content`: Successful member removal
- `200 OK`: Successful member listing
- `400 Bad Request`: Invalid request data or group is active
- `404 Not Found`: Membership or group not found
- `409 Conflict`: Duplicate membership attempt
- `500 Internal Server Error`: Unexpected errors


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: New membership initialization

*For any* valid add member request to a non-active group, the created membership should have status set to ACTIVE, hasReceivedPayout set to false, and hasPaidCurrentRound set to false.

**Validates: Requirements 2.2, 2.4, 2.5**

### Property 2: Sequential payout order assignment

*For any* group with N existing members, adding a new member should result in that member being assigned payoutOrder equal to N (the next sequential position).

**Validates: Requirements 2.3**

### Property 3: Successful member addition response

*For any* valid add member request to a non-active group, the response should have HTTP status 201 and contain all membership fields including the generated id.

**Validates: Requirements 2.6**

### Property 4: Active group modification rejection

*For any* group with status ACTIVE, both add member and remove member requests should be rejected with HTTP status 400.

**Validates: Requirements 2.7, 3.4**

### Property 5: Invalid request rejection

*For any* request with missing required fields, invalid field types, empty walletAddress, or invalid UUID format for userId/groupId, the system should reject the request with HTTP status 400 and descriptive validation error messages.

**Validates: Requirements 2.1, 2.8, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**

### Property 6: Membership deletion completeness

*For any* existing membership in a non-active group, a valid remove request should result in the membership no longer existing in the database and return HTTP status 204.

**Validates: Requirements 3.2, 3.3**

### Property 7: Non-existent membership removal

*For any* non-existent combination of groupId and userId, a remove member request should return HTTP status 404.

**Validates: Requirements 3.5**

### Property 8: Complete member list retrieval

*For any* group with N members, listing members should return exactly N membership entities with all required fields (id, groupId, userId, walletAddress, payoutOrder, hasReceivedPayout, hasPaidCurrentRound, status, createdAt, updatedAt).

**Validates: Requirements 4.1, 4.3**

### Property 9: Member list ordering

*For any* group with multiple members, the list members response should return members sorted by payoutOrder in ascending order.

**Validates: Requirements 4.2**

### Property 10: Successful list response status

*For any* valid list members request, the response should have HTTP status 200.

**Validates: Requirements 4.4**

### Property 11: Duplicate membership prevention

*For any* existing membership with a specific groupId and userId combination, attempting to add a member with the same combination should be rejected with HTTP status 409 and an error message indicating the user is already a member.

**Validates: Requirements 5.2, 5.3**

### Property 12: Add-then-list consistency

*For any* group, after adding a member with specific userId and walletAddress, listing the group's members should include a membership with that userId and walletAddress.

**Validates: Requirements 2.2, 4.1** (Round-trip property)

### Property 13: Remove-then-list consistency

*For any* existing membership, after removing that member, listing the group's members should not include that membership.

**Validates: Requirements 3.2, 4.1** (Round-trip property)

## Error Handling

### Exception Mapping

The service layer throws NestJS exceptions that are automatically handled by the global HttpExceptionFilter:

**BadRequestException (400)**
- Thrown when attempting to modify memberships in an active group
- Thrown when validation fails (handled by ValidationPipe)
- Message: Descriptive error explaining the constraint violation

**NotFoundException (404)**
- Thrown when attempting to remove a non-existent membership
- Thrown when group doesn't exist during validation
- Message: "Membership not found" or "Group not found"

**ConflictException (409)**
- Thrown when attempting to create a duplicate membership
- Message: "User is already a member of this group"

**InternalServerErrorException (500)**
- Thrown for unexpected database errors or system failures
- Message: Generic error message (details logged but not exposed to client)

### Error Logging Strategy

All errors are logged with context information using Winston logger:

```typescript
// Operation start
this.logger.log(`Adding member to group ${groupId}`, 'MembershipsService');

// Success
this.logger.log(`Member ${userId} added to group ${groupId} with membership id ${membership.id}`, 'MembershipsService');

// Error
this.logger.error(`Failed to add member to group ${groupId}: ${error.message}`, error.stack, 'MembershipsService');
```

**Log Levels**
- `info`: Operation start and success
- `error`: All failures with full stack traces
- `warn`: Business rule violations (active group, duplicates)

### Database Error Handling

**Unique Constraint Violation**
- Catch TypeORM QueryFailedError with code '23505' (PostgreSQL unique violation)
- Transform to ConflictException with user-friendly message
- Log the database error details for debugging

**Foreign Key Violation**
- Catch TypeORM QueryFailedError with code '23503' (PostgreSQL foreign key violation)
- Transform to BadRequestException indicating invalid groupId or userId
- Log the database error details

**Connection Errors**
- Allow to propagate as InternalServerErrorException
- Log full error details including connection information
- Global filter handles 500 response

## Testing Strategy

### Unit Testing Approach

The service layer will be tested using Jest with mocked repositories. Unit tests focus on business logic, error conditions, and edge cases.

**Test Structure**
```typescript
describe('MembershipsService', () => {
  let service: MembershipsService;
  let membershipRepository: MockRepository<Membership>;
  let groupRepository: MockRepository<Group>;
  let logger: MockLogger;

  beforeEach(async () => {
    // Setup mocks and test module
  });

  describe('addMember', () => {
    // Unit tests for add member logic
  });

  describe('removeMember', () => {
    // Unit tests for remove member logic
  });

  describe('listMembers', () => {
    // Unit tests for list members logic
  });
});
```

**Unit Test Coverage**
- Successful operations with valid inputs
- Active group validation rejection
- Duplicate membership detection
- Non-existent resource handling
- Database error transformation
- Logging verification
- Payout order calculation edge cases (first member, multiple members)

**Target**: Minimum 80% code coverage for service layer

### Property-Based Testing Approach

Property-based tests will be implemented using **fast-check** library for TypeScript. Each correctness property will be implemented as a property-based test with minimum 100 iterations.

**Property Test Configuration**
```typescript
import * as fc from 'fast-check';

describe('MembershipsService Properties', () => {
  // Property tests with fc.assert and fc.property
});
```

**Arbitrary Generators**

Custom arbitraries will be created for domain objects:

```typescript
// UUID generator
const uuidArb = fc.uuid();

// Wallet address generator (non-empty string)
const walletAddressArb = fc.string({ minLength: 1, maxLength: 255 });

// Membership status generator
const membershipStatusArb = fc.constantFrom('ACTIVE', 'SUSPENDED', 'REMOVED');

// Group generator with status
const groupArb = fc.record({
  id: uuidArb,
  status: fc.constantFrom('PENDING', 'ACTIVE', 'COMPLETED'),
  // other fields as needed
});

// Membership generator
const membershipArb = fc.record({
  id: uuidArb,
  groupId: uuidArb,
  userId: uuidArb,
  walletAddress: walletAddressArb,
  payoutOrder: fc.nat(),
  hasReceivedPayout: fc.boolean(),
  hasPaidCurrentRound: fc.boolean(),
  status: membershipStatusArb,
});
```

**Property Test Examples**

```typescript
// Property 1: New membership initialization
it('should initialize new memberships with correct default values', () => {
  fc.assert(
    fc.property(
      uuidArb,
      uuidArb,
      walletAddressArb,
      async (groupId, userId, walletAddress) => {
        // Feature: memberships-module, Property 1: New membership initialization
        const membership = await service.addMember(groupId, { userId, walletAddress });
        expect(membership.status).toBe('ACTIVE');
        expect(membership.hasReceivedPayout).toBe(false);
        expect(membership.hasPaidCurrentRound).toBe(false);
      }
    ),
    { numRuns: 100 }
  );
});

// Property 2: Sequential payout order assignment
it('should assign sequential payout orders', () => {
  fc.assert(
    fc.property(
      uuidArb,
      fc.array(membershipArb, { minLength: 0, maxLength: 10 }),
      async (groupId, existingMembers) => {
        // Feature: memberships-module, Property 2: Sequential payout order assignment
        // Setup: mock repository to return existingMembers
        const newMember = await service.addMember(groupId, { userId: fc.sample(uuidArb, 1)[0], walletAddress: 'addr' });
        expect(newMember.payoutOrder).toBe(existingMembers.length);
      }
    ),
    { numRuns: 100 }
  );
});

// Property 11: Duplicate membership prevention
it('should prevent duplicate memberships', () => {
  fc.assert(
    fc.property(
      membershipArb,
      async (existingMembership) => {
        // Feature: memberships-module, Property 11: Duplicate membership prevention
        // Setup: mock repository to return existingMembership
        await expect(
          service.addMember(existingMembership.groupId, {
            userId: existingMembership.userId,
            walletAddress: 'any-address'
          })
        ).rejects.toThrow(ConflictException);
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property Test Tag Format**

Each property test must include a comment tag:
```typescript
// Feature: memberships-module, Property {number}: {property title}
```

### Integration Testing

Integration tests will verify the complete request-response cycle including:
- Database persistence and retrieval
- Validation pipe behavior
- Exception filter responses
- Logging output

**Test Database**
- Use in-memory SQLite or test PostgreSQL instance
- Reset database state between tests
- Seed test data for realistic scenarios

### Test Organization

```
src/memberships/
├── __tests__/
│   ├── memberships.service.spec.ts           # Unit tests
│   ├── memberships.service.properties.spec.ts # Property-based tests
│   └── memberships.integration.spec.ts        # Integration tests
```

### Mocking Strategy

**Unit Tests**
- Mock TypeORM repositories using jest.fn()
- Mock Winston logger to verify log calls
- Mock Group entity for validation checks

**Property Tests**
- Use fast-check arbitraries for input generation
- Mock repositories with property-aware behavior
- Focus on service layer logic, not database

**Integration Tests**
- Real database with test data
- Real validation pipes and filters
- Minimal mocking (only external services if any)
