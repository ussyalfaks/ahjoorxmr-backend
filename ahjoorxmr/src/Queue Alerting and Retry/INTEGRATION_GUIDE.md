# Integration Guide: Dead Letter Queue Alerting & Circuit Breaker

## Step-by-Step Implementation

### Phase 1: Setup (1-2 hours)

#### 1.1 Install Dependencies
```bash
npm install @nestjs/typeorm typeorm @nestjs/config class-validator class-transformer
```

#### 1.2 Create Directory Structure
```
src/
├── dead-letter/
│   ├── entities/
│   │   └── dead-letter-record.entity.ts
│   ├── dead-letter.service.ts
│   ├── dead-letter.service.spec.ts
│   ├── queue.controller.ts
│   └── dead-letter.module.ts
├── notifications/
│   ├── notification.entity.ts
│   ├── notification.types.ts
│   ├── notification.service.ts
│   ├── notification.module.ts
│   └── notification.service.spec.ts
├── queue/
│   ├── queue.service.ts
│   ├── queue.module.ts
│   └── ...
└── auth/
    ├── guards/
    │   └── role.guard.ts
    └── decorators/
        └── roles.decorator.ts
```

#### 1.3 Copy Files
```bash
# Copy all provided TypeScript files to appropriate directories
cp DeadLetterService.ts src/dead-letter/dead-letter.service.ts
cp dead-letter-record.entity.ts src/dead-letter/entities/
cp QueueController.ts src/dead-letter/queue.controller.ts
cp dead-letter.module.ts src/dead-letter/
cp NotificationService.ts src/notifications/notification.service.ts
cp notification.entity.ts src/notifications/
cp notification.types.ts src/notifications/
```

#### 1.4 Environment Configuration
```bash
# Copy .env.example to .env
cp .env.example .env

# Edit .env with your settings
MAX_CONSECUTIVE_FAILURES=3
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=queue_db
```

### Phase 2: Database Setup (30 minutes)

#### 2.1 Create Migration
```bash
npm run typeorm migration:create -- src/migrations/CreateDeadLetterTables
```

#### 2.2 Add Migration Content
Copy the migration template from `migration.sql` to your newly created migration file.

#### 2.3 Run Migrations
```bash
npm run typeorm migration:run
```

#### 2.4 Verify Tables
```sql
-- Check tables were created
\dt notifications;
\dt dead_letters;

-- Verify indexes
\di
```

### Phase 3: Module Integration (1 hour)

#### 3.1 Update App Module
```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { DeadLetterModule } from './dead-letter/dead-letter.module';
import { NotificationModule } from './notifications/notification.module';

@Module({
  imports: [
    // ... existing imports
    DeadLetterModule,
    NotificationModule,
  ],
})
export class AppModule {}
```

#### 3.2 Ensure QueueService Has pauseQueue Method
```typescript
// src/queue/queue.service.ts
export class QueueService {
  async pauseQueue(groupId: string): Promise<void> {
    // Implement pause logic - mark group as paused in database
    // or use your queue provider's pause functionality (e.g., Bull, RabbitMQ)
    // Example:
    const queue = this.getQueueByGroup(groupId);
    await queue.pause();
  }

  async resumeQueue(groupId: string): Promise<void> {
    const queue = this.getQueueByGroup(groupId);
    await queue.resume();
  }
}
```

#### 3.3 Create RoleGuard if Not Exists
```typescript
// src/auth/guards/role.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles || roles.length === 0) {
      return true; // No role restriction
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('User role not found');
    }

    const hasRole = roles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(`Access denied. Required role: ${roles.join(', ')}`);
    }

    return true;
  }
}
```

#### 3.4 Create Roles Decorator if Not Exists
```typescript
// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
```

### Phase 4: Integration with Queue Processor (1-2 hours)

#### 4.1 Update Queue Processor
```typescript
// src/queue/processors/your-queue.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { DeadLetterService } from '../../dead-letter/dead-letter.service';

@Processor('your-queue-name')
export class YourQueueProcessor {
  constructor(private deadLetterService: DeadLetterService) {}

  @Process()
  async handleJob(job: Job<any>): Promise<any> {
    try {
      // Your job processing logic
      const result = await this.processJob(job.data);
      return result;
    } catch (error) {
      // On failure, record in dead letter queue
      await this.deadLetterService.recordDeadLetter({
        jobId: job.id.toString(),
        groupId: job.data.groupId || 'default',
        queueName: 'your-queue-name',
        error: error.message,
        payload: job.data,
        timestamp: new Date(),
      });
      
      // Re-throw to let Bull handle retry/fail logic
      throw error;
    }
  }

  private async processJob(data: any): Promise<any> {
    // Your processing logic here
  }
}
```

#### 4.2 Example: Email Queue Integration
```typescript
@Processor('email-queue')
export class EmailQueueProcessor {
  constructor(
    private deadLetterService: DeadLetterService,
    private emailService: EmailService,
  ) {}

  @Process()
  async handleEmailJob(job: Job<EmailJobData>): Promise<void> {
    try {
      const { to, subject, body } = job.data;
      await this.emailService.send({ to, subject, body });
    } catch (error) {
      await this.deadLetterService.recordDeadLetter({
        jobId: job.id.toString(),
        groupId: job.data.groupId || 'email-group',
        queueName: 'email-queue',
        error: error.message,
        payload: job.data,
        timestamp: new Date(),
      });
      throw error;
    }
  }
}
```

### Phase 5: Testing (1-2 hours)

#### 5.1 Run Unit Tests
```bash
npm test dead-letter.service.spec.ts
```

#### 5.2 Expected Test Output
```
PASS  src/dead-letter/dead-letter.service.spec.ts
  DeadLetterService
    recordDeadLetter
      ✓ should persist a dead letter record
      ✓ should emit an admin alert notification when recording a dead letter
      ✓ should track consecutive failures
      ✓ should not trigger circuit breaker if failures are below threshold
    Circuit Breaker Logic
      ✓ should pause the queue after N consecutive failures
      ✓ should emit a critical alert when triggering circuit breaker
      ✓ should reset failure counter after triggering circuit breaker
    getDeadLetters
      ✓ should retrieve paginated dead letter records
      ✓ should calculate correct skip value for pagination
    ... (more tests)

Test Suites: 1 passed, 1 total
Tests:       24 passed, 24 total
```

#### 5.3 Manual API Testing
```bash
# Create a test user with admin role
curl -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com", "role": "admin"}'

# Test getting dead letters (should be empty initially)
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:3000/api/v1/queue/dead-letter

# Test getting consecutive failure count
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:3000/api/v1/queue/dead-letter/group-1/consecutive-failures
```

### Phase 6: Deployment (30 minutes)

#### 6.1 Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Environment variables set correctly
- [ ] Database migrations applied
- [ ] RoleGuard implemented
- [ ] QueueService.pauseQueue() implemented
- [ ] Notification module initialized
- [ ] Admin users created in database

#### 6.2 Deploy to Staging
```bash
# Build
npm run build

# Run on staging
npm start

# Verify endpoints are accessible
curl -H "Authorization: Bearer TOKEN" \
  http://staging.example.com/api/v1/queue/dead-letter
```

#### 6.3 Deploy to Production
```bash
# Similar steps with production environment
# - Use production database
# - Use production admin credentials
# - Configure production notifications (email, Slack, etc.)
```

### Phase 7: Monitoring & Verification (Ongoing)

#### 7.1 Verify Notifications
1. Log in as admin
2. Check notifications dashboard for new alerts
3. Verify notification contains all required metadata

#### 7.2 Test Circuit Breaker
```bash
# Programmatically trigger 3+ failures in same group
# Verify:
# - Critical alert is emitted
# - Queue is paused
# - Endpoint returns correct failure count
```

#### 7.3 Verify Pagination
```bash
# Add multiple dead letter records
# Test pagination:
curl "http://localhost:3000/api/v1/queue/dead-letter?page=1&limit=10"
curl "http://localhost:3000/api/v1/queue/dead-letter?page=2&limit=10"

# Verify correct records are returned
```

## Troubleshooting

### Issue: Migration Fails
**Solution**: Check database connection settings in .env
```bash
# Test connection
psql -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE
```

### Issue: Notifications Not Being Sent
**Verify**:
1. Admin users exist in database: `SELECT * FROM users WHERE role = 'admin';`
2. NotificationModule is imported in AppModule
3. NotificationService.notifyAdmins() is being called (check logs)

### Issue: Circuit Breaker Not Triggering
**Debug Steps**:
1. Check MAX_CONSECUTIVE_FAILURES in .env
2. Verify QueueService.pauseQueue() is implemented
3. Check consecutive failure counter: 
   ```bash
   GET /api/v1/queue/dead-letter/:groupId/consecutive-failures
   ```

### Issue: Pagination Returns Fewer Records Than Expected
**Check**:
1. Limit is not exceeding 100
2. Page number is valid
3. Total records exist in database:
   ```sql
   SELECT COUNT(*) FROM dead_letters;
   ```

## Performance Considerations

### Database Indexes
Ensure indexes exist for optimal performance:
```sql
-- Query to verify indexes
\di dead_letters*
\di notifications*
```

### Query Optimization Tips
- Use pagination (never fetch all records at once)
- Add date range filters for large datasets
- Consider archiving old records after 30+ days

### Scaling Considerations
- For high-volume systems, consider:
  - Separate read replicas for reporting
  - Archive old dead letters to cold storage
  - Batch process notifications
  - Use caching for frequently accessed data

## Rollback Plan

If issues arise in production:

### 1. Disable Circuit Breaker (Quick Fix)
```typescript
// Temporarily disable in DeadLetterService
if (false && tracker.count >= this.MAX_CONSECUTIVE_FAILURES) {
  // Circuit breaker code disabled
}
```

### 2. Stop Sending Notifications
```env
NOTIFICATION_ENABLED=false
```

### 3. Rollback Database
```bash
npm run typeorm migration:revert
```

### 4. Rollback Code
```bash
git revert <commit-hash>
npm install
npm start
```

## Support & Documentation

- **API Documentation**: See SOLUTION_DOCUMENTATION.md
- **Unit Tests**: dead-letter.service.spec.ts
- **Database Schema**: migration.sql
- **Configuration**: .env.example

---

**Integration Time Estimate**: 4-6 hours total
**Complexity**: Medium
**Risk Level**: Low (isolated module with good test coverage)
