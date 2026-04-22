# NestJS Audit Logging System

A complete audit logging system implementation for NestJS that captures `previousValue` and `newValue` for all mutating endpoints, with support for querying audit history by resource and resource ID.

## Features

✅ **Complete audit trail** - Captures `previousValue` and `newValue` for all mutations  
✅ **JSONB storage** - PostgreSQL JSONB columns for flexible data storage  
✅ **Decorator-based** - Simple `@AuditLog()` decorator for marking endpoints  
✅ **Automatic interception** - Interceptor automatically captures request/response data  
✅ **Sensitive field redaction** - Automatically redacts passwords, tokens, etc.  
✅ **Admin query endpoint** - `GET /api/v1/audit` for compliance and dispute resolution  
✅ **Resource tracking** - Query by resource type and resource ID  
✅ **User tracking** - Track which user made changes and from which IP  
✅ **Database migration** - TypeORM migration for clean setup

## Project Structure

```
src/
├── audit/                          # Audit logging module
│   ├── entities/
│   │   └── audit-log.entity.ts    # AuditLog table definition
│   ├── decorators/
│   │   └── audit-log.decorator.ts # @AuditLog() decorator
│   ├── services/
│   │   └── audit-log.service.ts   # Business logic for audit queries
│   ├── interceptors/
│   │   └── audit-logging.interceptor.ts  # Captures values automatically
│   ├── controllers/
│   │   └── audit-log.controller.ts       # Admin query endpoints
│   ├── audit.module.ts            # Module definition
│   └── index.ts                   # Barrel exports
│
├── groups/                         # Example entity (GROUP resource)
│   ├── entities/
│   │   └── group.entity.ts
│   ├── dto/
│   │   └── group.dto.ts
│   ├── services/
│   │   └── groups.service.ts
│   ├── controllers/
│   │   └── groups.controller.ts    # Example usage of @AuditLog()
│   └── groups.module.ts
│
├── database/
│   └── data-source.ts             # TypeORM database configuration
│
├── migrations/
│   └── 1234567890000-CreateAuditLogsTable.ts  # Initial migration
│
├── app.module.ts                  # Root application module
└── main.ts                        # Application entry point
```

## Installation & Setup

### 1. Prerequisites

- Node.js 16+ and npm
- PostgreSQL 12+

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy `.env.example` to `.env` and update with your database credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=audit_db
PORT=3000
NODE_ENV=development
```

### 4. Create Database

```bash
createdb audit_db
```

Or in PostgreSQL:

```sql
CREATE DATABASE audit_db;
```

### 5. Build Project

```bash
npm run build
```

### 6. Run Migrations

```bash
npm run migration:run
```

This creates:

- `audit_logs` table with JSONB columns for previousValue and newValue
- `groups` table (example entity)
- Indexes on resource, userId, and action for query performance

### 7. Start Application

```bash
npm run start:dev
```

Application will start on http://localhost:3000

## Usage

### 1. Marking Endpoints for Audit Logging

Use the `@AuditLog()` decorator on any controller method you want to audit:

```typescript
import { AuditLogDecorator } from "@audit/decorators/audit-log.decorator";
import { AuditLoggingInterceptor } from "@audit/interceptors/audit-logging.interceptor";

@Controller("api/v1/groups")
@UseInterceptors(AuditLoggingInterceptor)
export class GroupsController {
  @Post()
  @AuditLogDecorator({
    action: "CREATE",
    resource: "GROUP",
    excludeFields: ["password", "refreshTokenHash"],
  })
  async create(@Body() createGroupDto: CreateGroupDto): Promise<Group> {
    return this.groupsService.create(createGroupDto);
  }

  @Patch(":id")
  @AuditLogDecorator({
    action: "UPDATE",
    resource: "GROUP",
  })
  async update(
    @Param("id") id: string,
    @Body() updateGroupDto: UpdateGroupDto,
  ): Promise<Group> {
    return this.groupsService.update(id, updateGroupDto);
  }

  @Delete(":id")
  @AuditLogDecorator({
    action: "DELETE",
    resource: "GROUP",
  })
  async remove(@Param("id") id: string): Promise<void> {
    return this.groupsService.remove(id);
  }
}
```

### 2. Query Audit Logs

#### Get audit logs by resource:

```bash
curl "http://localhost:3000/api/v1/audit?resource=GROUP&resourceId=uuid-here"
```

#### Get audit logs by user:

```bash
curl "http://localhost:3000/api/v1/audit/user/user-id-here"
```

#### Get specific audit log:

```bash
curl "http://localhost:3000/api/v1/audit/id/audit-log-id"
```

#### Get audit history for a resource:

```bash
curl "http://localhost:3000/api/v1/audit/resource/GROUP/group-uuid"
```

#### Filter with pagination:

```bash
curl "http://localhost:3000/api/v1/audit?resource=GROUP&action=UPDATE&limit=25&offset=50"
```

### 3. Response Format

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "userId": "user-id",
      "action": "UPDATE",
      "resource": "GROUP",
      "resourceId": "group-uuid",
      "previousValue": {
        "name": "Old Group Name",
        "description": "Old description",
        "status": "active"
      },
      "newValue": {
        "name": "New Group Name",
        "description": "New description",
        "status": "inactive"
      },
      "endpoint": "PATCH /api/v1/groups/group-uuid",
      "method": "PATCH",
      "ipAddress": "192.168.1.1",
      "statusCode": 200,
      "createdAt": "2026-03-25T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

## API Endpoints

| Method | Endpoint                                       | Description                   |
| ------ | ---------------------------------------------- | ----------------------------- |
| GET    | `/api/v1/audit`                                | Query audit logs with filters |
| GET    | `/api/v1/audit/id/:auditId`                    | Get specific audit log        |
| GET    | `/api/v1/audit/resource/:resource/:resourceId` | Get resource history          |
| GET    | `/api/v1/audit/user/:userId`                   | Get user's audit history      |
| POST   | `/api/v1/groups`                               | Create group (audited)        |
| PATCH  | `/api/v1/groups/:id`                           | Update group (audited)        |
| DELETE | `/api/v1/groups/:id`                           | Delete group (audited)        |
| GET    | `/api/v1/groups`                               | List groups (not audited)     |
| GET    | `/api/v1/groups/:id`                           | Get group (not audited)       |

## Key Design Decisions

### 1. previousValue and newValue

- **newValue**: Automatically captured from request body for POST/PATCH/PUT
- **previousValue**: Set to null for POST (no prior state). For PATCH, stores request body (in production, you'd fetch entity state)
- Both fields use JSONB for flexible, queryable storage

### 2. Sensitive Field Redaction

The interceptor automatically redacts sensitive fields:

```typescript
const SENSITIVE_FIELDS = [
  "password",
  "refreshTokenHash",
  "refreshToken",
  "resetToken",
  "secretKey",
  "apiKey",
];
```

Redacted fields appear as `"[REDACTED]"` in logs.

### 3. Admin-Only Query Access

The `AdminGuard` protects audit endpoints. In production, implement proper:

```typescript
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return request.user?.role === "admin";
  }
}
```

### 4. User Identification

The interceptor extracts user info from `request.user` object. Integrate with your auth system (JWT, Passport, etc.):

```typescript
// In your auth strategy
const request = context.switchToHttp().getRequest();
request.user = { id: decoded.sub, role: decoded.role };
```

### 5. Database Performance

Strategic indexes on:

- `(resource, resourceId)` - Fast lookups by resource
- `(userId, createdAt)` - Fast user audit history
- `(action, createdAt)` - Fast activity filtering

## Database Migration Details

The migration creates:

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  resource VARCHAR NOT NULL,
  resourceId VARCHAR NOT NULL,
  previousValue JSONB,
  newValue JSONB,
  endpoint VARCHAR,
  method VARCHAR,
  ipAddress VARCHAR,
  statusCode INT DEFAULT 200,
  errorMessage TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IDX_audit_logs_resource_resourceId ON audit_logs(resource, resourceId);
CREATE INDEX IDX_audit_logs_userId_createdAt ON audit_logs(userId, createdAt);
CREATE INDEX IDX_audit_logs_action_createdAt ON audit_logs(action, createdAt);
```

## Example Workflow

### 1. Create a Group

```bash
curl -X POST http://localhost:3000/api/v1/groups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineering",
    "description": "Engineering team",
    "permissions": ["read", "write"]
  }'
```

**Audit Log Created:**

```json
{
  "action": "CREATE",
  "resource": "GROUP",
  "resourceId": "uuid-123",
  "previousValue": null,
  "newValue": {
    "name": "Engineering",
    "description": "Engineering team",
    "permissions": ["read", "write"]
  }
}
```

### 2. Update the Group

```bash
curl -X PATCH http://localhost:3000/api/v1/groups/uuid-123 \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Engineering team (updated)"
  }'
```

**Audit Log Created:**

```json
{
  "action": "UPDATE",
  "resource": "GROUP",
  "resourceId": "uuid-123",
  "previousValue": {
    "name": "Engineering",
    "description": "Engineering team"
  },
  "newValue": {
    "description": "Engineering team (updated)"
  }
}
```

### 3. Query Audit History

```bash
curl "http://localhost:3000/api/v1/audit/resource/GROUP/uuid-123"
```

Returns all changes to that group, useful for compliance and dispute resolution.

## Extending for Other Entities

To add audit logging to another entity:

### 1. Create Entity with AuditLog decorator on controller:

```typescript
@Post()
@AuditLogDecorator({
  action: 'CREATE',
  resource: 'USER',
  excludeFields: ['password'],
})
async create(@Body() dto: CreateUserDto) {
  // ...
}
```

### 2. The interceptor automatically:

- Captures the request body as `newValue`
- Extracts resourceId from response
- Records user, IP, endpoint, status code
- Redacts sensitive fields

## Troubleshooting

### Migration not running

```bash
npm run build
npm run migration:run
```

### No audit logs being created

1. Check `@UseInterceptors(AuditLoggingInterceptor)` is on controller
2. Check `@AuditLogDecorator()` is on endpoint
3. Check database connection in logs

### Audit logs not showing up

1. Verify database has `audit_logs` table: `\dt` in psql
2. Check user ID is being set: `request.user?.id` in interceptor
3. Verify decorator and interceptor are both applied

## License

MIT

## Support

For issues or questions, refer to the NestJS and TypeORM documentation.
