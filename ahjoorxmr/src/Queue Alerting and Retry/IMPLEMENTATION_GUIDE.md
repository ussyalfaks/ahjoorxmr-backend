# Dead Letter Queue Alerting System - Implementation Guide

## Overview

This implementation provides a comprehensive dead letter queue (DLQ) management system with automatic alerting, circuit-breaker logic, and admin-only APIs for monitoring and managing failed jobs.

## Features Implemented

### 1. **Automatic Admin Notifications** ✅
- When a job enters the DLQ, an automatic `NotificationType.SYSTEM_ALERT` notification is sent to all users with `role = 'admin'`
- Notifications include metadata: jobId, groupId, jobType, error message, and attempt count
- Notification failures do not block dead letter recording

### 2. **Admin-Only REST Endpoints** ✅

#### GET `/api/v1/queue/dead-letter`
Returns paginated dead letter records (last 50 by default)
- **Query Parameters:**
  - `page`: Page number (default: 1)
  - `limit`: Records per page (default: 50, max: 100)
- **Response:**
  ```json
  {
    "success": true,
    "data": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 150,
      "totalPages": 3
    }
  }
  ```

#### GET `/api/v1/queue/dead-letter/group/:groupId`
Returns dead letters for a specific job group with pagination
- **Parameters:**
  - `groupId`: The job group ID
  - `page`, `limit`: Pagination parameters

#### GET `/api/v1/queue/dead-letter/status/:groupId`
Returns circuit breaker status for a group
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "groupId": "group-1",
      "isPaused": false,
      "consecutiveFailures": 2,
      "lastFailure": "2024-01-15T10:30:00Z"
    }
  }
  ```

#### POST `/api/v1/queue/dead-letter/:recordId/resolve`
Mark a dead letter as resolved with optional notes
- **Body:** `{ "notes": "Fixed upstream service" }`

#### POST `/api/v1/queue/dead-letter/group/:groupId/resume`
Resume a paused queue and allow job processing to resume

#### GET `/api/v1/queue/dead-letter/export`
Export all dead letter records as CSV file

### 3. **Circuit Breaker Logic** ✅

- **Threshold:** Configurable via `MAX_CONSECUTIVE_FAILURES` environment variable (default: 3)
- **Mechanism:**
  - Tracks consecutive failures per job group within a 1-hour time window
  - Automatically pauses the queue when threshold is reached
  - Emits a critical alert notification to admins
  - Updates all pending records for the group to `PAUSED` status
- **Recovery:** Admins can manually resume paused queues via the `/resume` endpoint

**Status Values:**
- `PENDING`: Unresolved dead letter record
- `PAUSED`: Queue is paused due to circuit breaker trigger
- `RESOLVED`: Issue has been fixed and handled
- `IGNORED`: Record marked as non-actionable

### 4. **Comprehensive Unit Tests** ✅

All tests use mocked services and include:

#### recordDeadLetter Tests
- ✅ Records a dead letter and notifies admins
- ✅ Includes metadata in notifications
- ✅ Continues recording even if notification fails

#### Circuit Breaker Tests
- ✅ Pauses queue after N consecutive failures
- ✅ Does not pause before reaching MAX_CONSECUTIVE_FAILURES
- ✅ Sends alert with consecutive failure count

#### Pagination Tests
- ✅ Returns paginated dead letters
- ✅ Handles pagination correctly with proper skip/take values

#### Resolution Tests
- ✅ Marks records as resolved with notes

#### Queue Management Tests
- ✅ Resumes paused queues
- ✅ Returns accurate group circuit breaker status

## File Structure

```
src/
├── dead-letter/
│   ├── dead-letter.service.ts          # Core service logic
│   ├── dead-letter.service.spec.ts     # Comprehensive unit tests
│   ├── dead-letter.controller.ts       # REST API endpoints
│   ├── dead-letter.module.ts           # NestJS module
│   └── entities/
│       └── dead-letter.entity.ts       # TypeORM entity
├── notifications/
│   ├── notification.service.ts         # (existing)
│   └── enum/
│       └── notification-type.enum.ts   # Notification types
├── auth/
│   ├── guards/
│   │   └── role.guard.ts               # Role-based access control
│   └── decorators/
│       ├── roles.decorator.ts          # @Roles() decorator
│       └── get-user.decorator.ts       # @GetUser() decorator
└── users/
    └── entities/
        └── user.entity.ts              # (existing)
```

## Configuration

### Environment Variables

```env
# Dead Letter Queue Configuration
MAX_CONSECUTIVE_FAILURES=3          # Threshold for circuit breaker
NODE_ENV=production

# Database Configuration
DATABASE_URL=postgres://...
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=app_db
DATABASE_USER=postgres
DATABASE_PASSWORD=password

# Notification Configuration
NOTIFICATION_SERVICE_URL=http://localhost:3001
```

## Integration Steps

### 1. Update AppModule

```typescript
import { DeadLetterModule } from './dead-letter/dead-letter.module';

@Module({
  imports: [
    // ... other imports
    DeadLetterModule,
  ],
})
export class AppModule {}
```

### 2. Initialize Database Migration

```bash
# Create migration for dead_letters table
npx typeorm migration:create src/migrations/CreateDeadLetterRecord

# In migration file:
export class CreateDeadLetterRecord1704067200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'dead_letters',
        columns: [
          // ... (see entity definition)
        ],
        indices: [
          { columnNames: ['groupId', 'recordedAt'] },
          { columnNames: ['status', 'recordedAt'] },
          { columnNames: ['jobType', 'recordedAt'] },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('dead_letters');
  }
}

# Run migration
npx typeorm migration:run
```

### 3. Integration with Job Queue

When a job fails and reaches max retries:

```typescript
// In your job processing service
import { DeadLetterService } from './dead-letter/dead-letter.service';

export class JobProcessorService {
  constructor(
    private deadLetterService: DeadLetterService,
  ) {}

  async handleJobFailure(job: Job, error: Error): Promise<void> {
    if (job.attemptsMade >= job.opts.attempts) {
      // Move to dead letter queue
      await this.deadLetterService.recordDeadLetter({
        jobId: job.id,
        groupId: job.opts.groupId || 'default',
        jobType: job.name,
        payload: job.data,
        error: error.message,
        stackTrace: error.stack,
        attemptCount: job.attemptsMade,
      });
    }
  }
}
```

### 4. NotificationService Implementation (if not exists)

```typescript
@Injectable()
export class NotificationService {
  async notifyAdmins(notification: {
    type: NotificationType;
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'high' | 'critical';
    metadata?: Record<string, any>;
  }): Promise<void> {
    // Send notification to all admins
    // This could be email, Slack, webhook, etc.
    const admins = await this.userRepository.find({
      where: { role: 'admin' },
    });

    for (const admin of admins) {
      // Send notification (email, Slack, etc.)
      await this.emailService.send({
        to: admin.email,
        subject: notification.title,
        body: notification.message,
      });
    }
  }
}
```

## Testing

### Run Tests
```bash
# Run all tests
npm run test

# Run with coverage
npm run test:cov

# Watch mode
npm run test:watch

# Specific test file
npm run test -- dead-letter.service.spec.ts
```

### Test Coverage
```
DeadLetterService:
✓ recordDeadLetter
  ✓ records a dead letter and notifies admins
  ✓ includes metadata in notification
  ✓ continues recording even if notification fails
✓ Circuit Breaker Logic
  ✓ pauses queue after N consecutive failures
  ✓ does not pause before reaching MAX_CONSECUTIVE_FAILURES
  ✓ sends alert with consecutive failure count
✓ getDeadLetters
  ✓ returns paginated dead letters
  ✓ handles pagination correctly
✓ getDeadLettersByGroup
  ✓ returns dead letters filtered by group
✓ resolveDeadLetter
  ✓ marks a record as resolved
✓ resumeQueue
  ✓ resumes a paused queue
✓ getGroupStatus
  ✓ returns group circuit breaker status
  ✓ reports paused status
```

## API Usage Examples

### Example 1: Get All Dead Letters
```bash
curl -X GET 'http://localhost:3000/api/v1/queue/dead-letter?page=1&limit=25' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json'
```

### Example 2: Get Dead Letters for Specific Group
```bash
curl -X GET 'http://localhost:3000/api/v1/queue/dead-letter/group/email-processing?page=1' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

### Example 3: Check Circuit Breaker Status
```bash
curl -X GET 'http://localhost:3000/api/v1/queue/dead-letter/status/email-processing' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

### Example 4: Resolve a Dead Letter
```bash
curl -X POST 'http://localhost:3000/api/v1/queue/dead-letter/record-uuid/resolve' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"notes": "Fixed email service configuration"}'
```

### Example 5: Resume a Paused Queue
```bash
curl -X POST 'http://localhost:3000/api/v1/queue/dead-letter/group/email-processing/resume' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json'
```

### Example 6: Export Dead Letters as CSV
```bash
curl -X GET 'http://localhost:3000/api/v1/queue/dead-letter/export' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -o dead-letters.csv
```

## Acceptance Criteria Checklist

- ✅ **Admins receive notifications** when a job enters the DLQ
- ✅ **GET /queue/dead-letter returns** paginated results
- ✅ **Queue is paused** after N consecutive failures for the same group
- ✅ **Tests mock notification service** and assert it was called
- ✅ **Circuit breaker status** can be queried per group
- ✅ **Queue can be resumed** by admins after resolution
- ✅ **Dead letters can be marked** as resolved with notes
- ✅ **CSV export** available for reporting

## Future Enhancements

1. **Automatic Recovery**
   - Implement automatic retry logic with exponential backoff
   - Configurable recovery strategies per job type

2. **Advanced Filtering**
   - Filter by date range, job type, error pattern
   - Search by job ID or payload content

3. **Analytics**
   - Failure rate trending
   - Most common failure types
   - Time-to-resolution metrics

4. **Webhooks**
   - Custom webhook notifications
   - Integration with external monitoring tools (PagerDuty, Opsgenie)

5. **Batch Operations**
   - Bulk resolve/retry operations
   - Bulk resume multiple paused queues

6. **DLQ Reprocessing**
   - Safe replay of dead letters
   - With configurable retry parameters

## Troubleshooting

### Issue: Notifications not being sent
- Check `NotificationService` implementation
- Verify admin user records exist with `role = 'admin'`
- Check application logs for notification service errors

### Issue: Circuit breaker not triggering
- Verify `MAX_CONSECUTIVE_FAILURES` configuration
- Check that failures are within 1-hour time window
- Ensure `groupId` is correctly set in job payload

### Issue: Database migration errors
- Check TypeORM configuration
- Ensure all database indices are created
- Verify TypeORM version compatibility

## Support

For issues or questions, please refer to the test files for usage examples or contact the development team.
