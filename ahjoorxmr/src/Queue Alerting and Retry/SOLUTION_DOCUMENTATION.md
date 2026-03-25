# Dead Letter Queue Alerting & Circuit Breaker Solution

## Overview

This solution implements a comprehensive alerting and circuit-breaker mechanism for the `DeadLetterService`. When jobs fail and enter the dead letter queue, administrators are notified, and if failures continue, the system automatically pauses the affected queue group to prevent cascading failures.

## Features Implemented

### 1. Admin Notifications on Dead Letter Entry
- When a job enters the dead letter queue, a `SYSTEM_ALERT` notification is automatically emitted to all users with `role = 'admin'`
- Notifications include:
  - Job ID
  - Queue group
  - Queue name
  - Error message
  - Timestamp
  - Severity level (warning for individual failures, critical for circuit breaker)

### 2. GET /api/v1/queue/dead-letter Endpoint
- **Admin-only endpoint** to retrieve dead letter records
- Supports **pagination** with configurable `page` and `limit` parameters
- Default: returns last 50 records
- Maximum limit: 100 records per page
- Returns:
  - Array of dead letter records
  - Total count of records
  - Current page
  - Total pages

**Request:**
```bash
GET /api/v1/queue/dead-letter?page=1&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": {
    "records": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 127,
      "pages": 3
    }
  }
}
```

### 3. Group-Specific Dead Letter Retrieval
- Retrieve dead letter records for a specific queue group
- Helps identify patterns in failures for particular groups

**Request:**
```bash
GET /api/v1/queue/dead-letter/:groupId?page=1&limit=50
```

### 4. Circuit Breaker Logic
- **Configurable threshold**: `MAX_CONSECUTIVE_FAILURES` (default: 3)
- **Automatic queue pausing**: After N consecutive failures for the same `groupId`, the queue for that group is automatically paused
- **Critical alerts**: A critical-severity alert is emitted to admins when circuit breaker is triggered
- **Counter reset**: The failure counter is reset after the circuit breaker is triggered
- **Timeout-based reset**: Failure counters automatically reset after 60 seconds of no new failures

### 5. Additional Management Endpoints

#### Get Consecutive Failure Count
```bash
GET /api/v1/queue/dead-letter/:groupId/consecutive-failures
```

Response:
```json
{
  "success": true,
  "data": {
    "groupId": "group-1",
    "consecutiveFailures": 2
  }
}
```

#### Reset Failure Counter
```bash
POST /api/v1/queue/dead-letter/:groupId/reset-failures
```

Use this after manually intervening to fix issues in a paused queue.

#### Resolve Dead Letter Record
```bash
PATCH /api/v1/queue/dead-letter/:id/resolve
```

Mark a failed job as resolved and remove it from active monitoring.

## Configuration

Set the following environment variable to configure the circuit breaker threshold:

```env
MAX_CONSECUTIVE_FAILURES=3
```

Other related configurations:

```env
# Reset failure counters after this duration with no new failures
QUEUE_FAILURE_RESET_TIMEOUT_MS=60000

# Notification service settings
NOTIFICATION_ENABLED=true
NOTIFICATION_RETRY_ATTEMPTS=3
```

## Architecture

### DeadLetterService
- **Main responsibility**: Record failed jobs and manage alerting/circuit-breaker logic
- **Key methods**:
  - `recordDeadLetter()`: Persist dead letter, emit alert, track failures, check circuit breaker
  - `emitAdminAlert()`: Send warning notification to admins
  - `trackConsecutiveFailure()`: Update failure counter for a group
  - `checkAndTriggerCircuitBreaker()`: Pause queue if threshold exceeded
  - `getDeadLetters()`: Retrieve paginated records
  - `getDeadLettersByGroup()`: Retrieve records for specific group
  - `resolveDeadLetter()`: Mark record as resolved

### NotificationService
- **Responsibility**: Manage notifications to users
- **Key methods**:
  - `notifyAdmins()`: Send notification to all admin users
  - `notifyUser()`: Send notification to specific user
  - `getUserNotifications()`: Retrieve user's notifications
  - `markAsRead()`: Mark notification as read

### QueueController
- **Routes**: All dead letter management endpoints
- **Protection**: All endpoints are admin-only via `@Roles('admin')` decorator
- **Validation**: Request parameter validation for pagination

### DeadLetterRecord Entity
- **Fields**:
  - `id`: UUID primary key
  - `jobId`: Identifier of the failed job
  - `groupId`: Queue group identifier (indexed)
  - `queueName`: Name of the queue
  - `error`: Error message from failure
  - `payload`: Original job payload (JSON)
  - `status`: PENDING or RESOLVED
  - `createdAt`: Record creation timestamp
  - `resolvedAt`: When the record was resolved (nullable)
  - `resolvedBy`: User who resolved it (nullable)
  - `resolutionNotes`: Notes on resolution (nullable)

## Workflow Diagram

```
Job Failure
    ↓
recordDeadLetter()
    ├─ Save to database
    ├─ Emit warning notification to admins
    ├─ Track consecutive failures for group
    └─ Check circuit breaker
         ├─ If failures < MAX (3): continue
         └─ If failures >= MAX (3):
            ├─ Pause queue for group
            ├─ Emit critical alert to admins
            └─ Reset failure counter
```

## Testing

The solution includes comprehensive unit tests covering:

### Notification Tests
- ✅ Admin notifications are emitted on dead letter entry
- ✅ Notifications include correct metadata
- ✅ Notification service errors are handled gracefully

### Circuit Breaker Tests
- ✅ Circuit breaker triggers after N consecutive failures
- ✅ Queue is paused when threshold is reached
- ✅ Critical alert is emitted on circuit breaker trigger
- ✅ Failure counter is reset after circuit breaker trigger

### Pagination Tests
- ✅ Dead letters are retrieved with correct pagination
- ✅ Skip value is calculated correctly for different pages
- ✅ Results are ordered by creation time (descending)

### Failure Tracking Tests
- ✅ Consecutive failures are tracked per group
- ✅ Different groups have independent counters
- ✅ Manual counter reset works correctly

### Data Retrieval Tests
- ✅ Get all dead letters
- ✅ Get dead letters by group
- ✅ Resolve dead letter records

**Run tests:**
```bash
npm run test dead-letter.service.spec.ts
npm run test:cov dead-letter.service.spec.ts
```

## Database Schema

```sql
CREATE TABLE dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL,
  group_id VARCHAR NOT NULL,
  queue_name VARCHAR NOT NULL,
  error TEXT NOT NULL,
  payload JSONB,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by VARCHAR,
  resolution_notes TEXT
);

CREATE INDEX idx_dead_letters_group_created ON dead_letters(group_id, created_at DESC);
CREATE INDEX idx_dead_letters_status_created ON dead_letters(status, created_at DESC);
```

## Error Handling

### Graceful Degradation
- If notification service fails, dead letter recording continues (logging only)
- If queue pausing fails, alert is still emitted
- Errors are logged but don't break the request

### Validation
- Pagination parameters are validated (positive integers, limits enforced)
- Dead letter lookups return 404 if not found
- Invalid group IDs return appropriate error responses

## Security

- **Admin-only access**: All dead letter endpoints require admin role
- **Role-based guards**: `@Roles('admin')` decorator enforces authorization
- **Input validation**: Pagination parameters are sanitized
- **No sensitive data exposure**: Error messages are descriptive but safe

## Integration Steps

1. **Install the module** in your main app module:
```typescript
import { DeadLetterModule } from './dead-letter/dead-letter.module';

@Module({
  imports: [
    DeadLetterModule,
    // ... other modules
  ],
})
export class AppModule {}
```

2. **Set environment variables**:
```bash
MAX_CONSECUTIVE_FAILURES=3
NOTIFICATION_ENABLED=true
```

3. **Run migrations**:
```bash
npm run typeorm migration:run
```

4. **Start using the service**:
```typescript
constructor(private deadLetterService: DeadLetterService) {}

// In your queue processor
async handleJobFailure(error: Error, jobData: any) {
  await this.deadLetterService.recordDeadLetter({
    jobId: jobData.id,
    groupId: jobData.group,
    queueName: 'my-queue',
    error: error.message,
    payload: jobData,
    timestamp: new Date(),
  });
}
```

## Monitoring & Alerting

### Key Metrics to Monitor
- **Dead letter rate**: Number of entries per minute
- **Circuit breaker triggers**: How often groups are paused
- **Resolution rate**: How many dead letters are resolved vs accumulating

### Recommended Alerts
- Alert if dead letter rate exceeds threshold
- Alert if same group triggers circuit breaker multiple times
- Alert if dead letters are unresolved for > 24 hours

## Future Enhancements

- [ ] Automatic retry logic for dead letter items
- [ ] Dead letter batch export (CSV/JSON)
- [ ] Advanced filtering (by date range, error type, etc.)
- [ ] Dead letter statistics dashboard
- [ ] Email notifications for critical alerts
- [ ] Webhook support for external systems
- [ ] Dead letter archival after configurable retention period

## Support

For issues or questions:
1. Check the test file for usage examples
2. Review error logs for detailed error messages
3. Verify admin users exist in the system
4. Ensure database migrations have been run

---

**Last Updated**: March 2024
**Version**: 1.0.0
