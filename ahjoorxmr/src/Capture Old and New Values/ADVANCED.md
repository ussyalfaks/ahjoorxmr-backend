# Advanced Configuration Guide

This guide covers advanced usage patterns and integration scenarios.

## Integration with Existing NestJS Projects

### 1. Add Audit Module to Existing App

If you have an existing NestJS project, you can add the audit logging system:

```bash
# Copy audit folder to your src directory
cp -r src/audit /path/to/your/project/src/
```

### 2. Update Your App Module

```typescript
import { AuditModule } from "./audit/audit.module";

@Module({
  imports: [
    // ... your existing imports
    AuditModule,
    TypeOrmModule.forFeature([AuditLog]),
  ],
})
export class AppModule {}
```

### 3. Register Interceptor Globally (Optional)

To enable audit logging globally instead of per-controller:

```typescript
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuditLoggingInterceptor } from "./audit/interceptors/audit-logging.interceptor";

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLoggingInterceptor,
    },
  ],
})
export class AppModule {}
```

Then your route handlers will automatically audit logs when decorated with `@AuditLog()`.

## Custom Audit Log Fields

### Extending AuditLog Entity

Add custom fields as needed:

```typescript
import { Entity, Column } from "typeorm";
import { AuditLog } from "./audit-log.entity";

// You can extend the entity
@Entity("audit_logs")
export class CustomAuditLog extends AuditLog {
  @Column({ nullable: true })
  customField1: string;

  @Column("jsonb", { nullable: true })
  metadata: Record<string, any>;
}
```

### Custom Interceptor

Extend the interceptor to capture additional data:

```typescript
import { AuditLoggingInterceptor } from "@audit/interceptors/audit-logging.interceptor";

@Injectable()
export class ExtendedAuditLoggingInterceptor extends AuditLoggingInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();

    // Add custom logic here
    request.auditMetadata = {
      requestId: request.id,
      customData: request.headers["x-custom-header"],
    };

    return super.intercept(context, next);
  }
}
```

## Role-Based Access Control (RBAC)

### Implement Proper Admin Guard

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(" ")[1];

    if (!token) {
      throw new ForbiddenException("No token provided");
    }

    try {
      const decoded = this.jwtService.verify(token);

      if (decoded.role !== "admin") {
        throw new ForbiddenException("Admin role required");
      }

      request.user = decoded;
      return true;
    } catch (error) {
      throw new ForbiddenException("Invalid token");
    }
  }
}
```

### Custom Audit Guard with Specific Permissions

```typescript
@Injectable()
export class CanViewAuditGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Check specific permission
    return user?.permissions?.includes('audit:view') || user?.role === 'admin';
  }
}

// Usage
@Get()
@UseGuards(CanViewAuditGuard)
async findAuditLogs(...) { }
```

## Performance Optimization

### Index Strategy for Large Datasets

For millions of audit logs, consider additional indexes:

```typescript
@Entity("audit_logs")
@Index(["createdAt", "resource"]) // For time-range queries
@Index(["userId", "resource"]) // For user+resource queries
@Index(["action"]) // For action filtering
export class AuditLog {
  // ...
}
```

### Enable PostgreSQL Query Cache

```typescript
// In database configuration
export const AppDataSource = new DataSource({
  // ...
  logging: ["query"], // Enable query logging
});
```

### Pagination Strategy

For efficient pagination with large result sets:

```typescript
// Use keyset pagination for better performance
async function findAuditLogsKeysetPagination(
  lastId?: string,
  limit: number = 50,
) {
  const query = this.auditLogRepository.createQueryBuilder("audit");

  if (lastId) {
    query.andWhere("audit.id > :lastId", { lastId });
  }

  return query
    .orderBy("audit.id", "ASC")
    .take(limit + 1)
    .getMany();
}
```

## Data Retention and Archiving

### Archive Old Audit Logs

```typescript
@Injectable()
export class AuditArchiveService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async archiveOldLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.auditLogRepository.delete({
      createdAt: LessThan(cutoffDate),
    });

    return result.affected;
  }
}

// Add to a cron job
import { Cron } from "@nestjs/schedule";

@Injectable()
export class AuditScheduler {
  constructor(private archiveService: AuditArchiveService) {}

  @Cron("0 2 * * 0") // Every Sunday at 2 AM
  async archiveOldLogs() {
    const deleted = await this.archiveService.archiveOldLogs(90);
    console.log(`Archived ${deleted} audit logs`);
  }
}
```

## Export Audit Logs

### Export to CSV

```typescript
import { Parser } from "json2csv";

@Injectable()
export class AuditExportService {
  async exportToCsv(options?: FindAuditOptions): Promise<string> {
    const logs = await this.auditLogService.findAll(options);

    const parser = new Parser({
      fields: ["id", "userId", "action", "resource", "resourceId", "createdAt"],
    });

    return parser.parse(logs.data);
  }
}
```

### Export to JSON

```typescript
@Get('export')
async exportAuditLogs(
  @Query('format') format: 'csv' | 'json' = 'json',
  @Query('resource') resource?: string,
): Promise<any> {
  const logs = await this.auditLogService.findAll({ resource });

  if (format === 'csv') {
    return this.exportService.exportToCsv({ resource });
  }

  return logs;
}
```

## Compliance Reporting

### GDPR Compliance

```typescript
@Injectable()
export class ComplianceService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Get all audit logs for a user (GDPR right to access)
   */
  async getUserAuditReport(userId: string): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Delete all audit logs for a user (GDPR right to be forgotten)
   * Note: Consider archiving instead of hard deleting for compliance
   */
  async deleteUserAuditLogs(userId: string): Promise<number> {
    const result = await this.auditLogRepository.delete({ userId });
    return result.affected;
  }
}
```

### SOC 2 / ISO 27001 Compliance

```typescript
@Injectable()
export class ComplianceReportService {
  /**
   * Generate compliance report for failed login attempts
   */
  async getFailedAuthAttempts(
    startDate: Date,
    endDate: Date,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: {
        action: "AUTH_FAILED",
        createdAt: Between(startDate, endDate),
        statusCode: GreaterThan(399),
      },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Generate report of administrative actions
   */
  async getAdminActions(startDate: Date, endDate: Date): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: {
        userId: In(adminUserIds),
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: "DESC" },
    });
  }
}
```

## Webhook Notifications

### Alert on Specific Actions

```typescript
@Injectable()
export class AuditAlertService {
  constructor(
    private httpClient: HttpClient,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Send webhook on DELETE actions
   */
  async notifyOnDelete(auditLog: AuditLog): Promise<void> {
    if (auditLog.action === "DELETE") {
      await this.httpClient
        .post(process.env.WEBHOOK_URL, {
          event: "resource_deleted",
          resource: auditLog.resource,
          resourceId: auditLog.resourceId,
          userId: auditLog.userId,
          timestamp: auditLog.createdAt,
        })
        .toPromise();
    }
  }
}
```

## Audit Trail Verification

### Cryptographic Signing

```typescript
import * as crypto from "crypto";

@Injectable()
export class AuditVerificationService {
  /**
   * Sign an audit log entry for tamper detection
   */
  sign(auditLog: AuditLog, secret: string): string {
    const data = JSON.stringify({
      id: auditLog.id,
      action: auditLog.action,
      resource: auditLog.resource,
      createdAt: auditLog.createdAt,
    });

    return crypto.createHmac("sha256", secret).update(data).digest("hex");
  }

  /**
   * Verify audit log signature
   */
  verify(auditLog: AuditLog, signature: string, secret: string): boolean {
    const computedSignature = this.sign(auditLog, secret);
    return computedSignature === signature;
  }
}
```

## Multi-Tenant Audit Logging

```typescript
@Entity('audit_logs')
export class TenantAuditLog extends AuditLog {
  @Column()
  tenantId: string;

  @Index()
  @Column()
  organizationId: string;
}

// In service
async create(dto: CreateAuditLogDto, tenantId: string): Promise<AuditLog> {
  const auditLog = this.auditLogRepository.create({
    ...dto,
    tenantId,
    organizationId: this.getTenantOrganization(tenantId),
  });
  return this.auditLogRepository.save(auditLog);
}
```

## Testing

### Unit Test Example

```typescript
describe("AuditLoggingInterceptor", () => {
  let interceptor: AuditLoggingInterceptor;
  let auditLogService: AuditLogService;
  let reflector: Reflector;

  beforeEach(() => {
    auditLogService = { create: jest.fn() };
    reflector = { get: jest.fn() };
    interceptor = new AuditLoggingInterceptor(reflector, auditLogService);
  });

  it("should create audit log for decorated endpoint", async () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: "user-1" },
          method: "POST",
          path: "/groups",
          body: { name: "Test Group" },
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
      getHandler: () => () => {},
    };

    reflector.get.mockReturnValue({
      action: "CREATE",
      resource: "GROUP",
    });

    await interceptor.intercept(mockContext, { handle: () => of({}) });

    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        resource: "GROUP",
      }),
    );
  });
});
```

## Monitoring and Alerting

### With Prometheus Metrics

```typescript
import { Counter, Histogram } from "prom-client";

@Injectable()
export class AuditMetricsService {
  private auditCounter = new Counter({
    name: "audit_logs_total",
    help: "Total audit log entries",
    labelNames: ["action", "resource"],
  });

  private auditDuration = new Histogram({
    name: "audit_logging_duration_seconds",
    help: "Time to create audit log",
  });

  recordAuditLog(action: string, resource: string): void {
    this.auditCounter.inc({ action, resource });
  }
}
```

## Cost Optimization

### Asynchronous Logging

```typescript
@Injectable()
export class AsyncAuditService {
  constructor(
    private queue: BullQueue,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Queue audit log for async processing
   */
  async logAsync(dto: CreateAuditLogDto): Promise<void> {
    await this.queue.add(dto, {
      delay: 1000, // Allow batching
      attempts: 3,
    });
  }

  /**
   * Process audit log queue
   */
  @OnQueueProcess()
  async processAuditLog(job: Job<CreateAuditLogDto>) {
    await this.auditLogService.create(job.data);
  }
}
```

## Troubleshooting Common Issues

### Issue: Audit logs not being created

**Solution:**

1. Verify `@UseInterceptors(AuditLoggingInterceptor)` on controller
2. Verify `@AuditLogDecorator()` on endpoint
3. Check `request.user?.id` is being set
4. Check database connection

### Issue: Sensitive fields not being redacted

**Solution:**
Add field to `SENSITIVE_FIELDS` in interceptor or use `excludeFields` in decorator:

```typescript
@AuditLogDecorator({
  action: 'CREATE',
  resource: 'USER',
  excludeFields: ['password', 'customSecret'],
})
```

### Issue: Poor query performance

**Solution:**

1. Add appropriate indexes (see Index Strategy section)
2. Use pagination with reasonable limits
3. Consider archiving old logs
4. Add database statistics: `ANALYZE audit_logs;`
