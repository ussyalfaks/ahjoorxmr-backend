# Quick Start Guide

Get the audit logging system running in 5 minutes.

## Prerequisites

- Node.js 16+
- npm or yarn
- PostgreSQL 12+ (or Docker)
- Git

## Option 1: Quick Start with Docker (Recommended)

### 1. Start PostgreSQL

```bash
docker-compose up -d
```

Wait for PostgreSQL to be healthy (check logs).

### 2. Install & Build

```bash
npm install
npm run build
```

### 3. Run Migrations

```bash
npm run migration:run
```

### 4. Start Application

```bash
npm run start:dev
```

✅ Application running on http://localhost:3000

## Option 2: Manual PostgreSQL Setup

### 1. Create Database

```sql
-- In PostgreSQL
CREATE DATABASE audit_db;
```

### 2. Create .env File

```bash
echo 'DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=YOUR_PASSWORD
DB_NAME=audit_db
PORT=3000
NODE_ENV=development' > .env
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Build & Migrate

```bash
npm run build
npm run migration:run
```

### 5. Start

```bash
npm run start:dev
```

## Test Endpoints

### 1. Create a Group

```bash
curl -X POST http://localhost:3000/api/v1/groups \
  -H "Content-Type: application/json" \
  -d '{"name":"Engineering","description":"Eng team"}'
```

Copy the returned `id`.

### 2. View Audit Log

```bash
# Replace UUID with the id from step 1
curl "http://localhost:3000/api/v1/audit/resource/GROUP/YOUR_UUID"
```

✅ You should see:

```json
{
  "data": [
    {
      "action": "CREATE",
      "resource": "GROUP",
      "newValue": {"name":"Engineering","description":"Eng team"},
      "previousValue": null,
      ...
    }
  ],
  "total": 1
}
```

### 3. Update the Group

```bash
curl -X PATCH http://localhost:3000/api/v1/groups/YOUR_UUID \
  -H "Content-Type: application/json" \
  -d '{"description":"Engineering Team v2"}'
```

### 4. Check Audit Again

```bash
curl "http://localhost:3000/api/v1/audit/resource/GROUP/YOUR_UUID"
```

✅ Now shows both CREATE and UPDATE with `previousValue` and `newValue`.

## Project Structure

```
src/
├── audit/              # Audit logging module (reusable)
│   ├── entities/       # AuditLog table
│   ├── decorators/     # @AuditLog() decorator
│   ├── interceptors/   # Automatic value capture
│   ├── services/       # Query logic
│   └── controllers/    # API endpoints
│
├── groups/             # Example entity
│   ├── entities/       # Group table
│   ├── controllers/    # Endpoints with @AuditLog()
│   └── services/       # Business logic
│
└── main.ts            # App entry point
```

## How It Works

### 1. Decorator Marks Endpoints

```typescript
@Post()
@AuditLogDecorator({
  action: 'CREATE',
  resource: 'GROUP',
})
async create(@Body() dto: CreateGroupDto) {
  // Your code
}
```

### 2. Interceptor Captures Data

Automatically captures:

- Request body → `newValue`
- Response data → `resourceId`
- User info → `userId`
- Method & path → `endpoint`

### 3. Stores with JSON Diff

```json
{
  "previousValue": { "name": "Old Name" },
  "newValue": { "name": "New Name" }
}
```

### 4. Query Audit Trail

```bash
GET /api/v1/audit?resource=GROUP&resourceId=uuid
GET /api/v1/audit/user/user-id
GET /api/v1/audit?action=DELETE
```

## Add Audit to Your Entities

### 1. Import Audit Module

```typescript
import { AuditModule } from "@audit"; // or full path
import { AuditLoggingInterceptor } from "@audit";

@Module({
  imports: [AuditModule /* ... */],
})
export class MyModule {}
```

### 2. Add Decorator to Controller

```typescript
import { AuditLogDecorator } from "@audit";

@Controller("api/v1/users")
@UseInterceptors(AuditLoggingInterceptor)
export class UsersController {
  @Post()
  @AuditLogDecorator({
    action: "CREATE",
    resource: "USER",
    excludeFields: ["password"], // Redact sensitive fields
  })
  create(@Body() dto: CreateUserDto) {
    // ...
  }

  @Patch(":id")
  @AuditLogDecorator({
    action: "UPDATE",
    resource: "USER",
    excludeFields: ["password"],
  })
  update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    // ...
  }
}
```

That's it! Now all CREATE, UPDATE, DELETE on Users are audited.

## Query Audit Logs

### Get logs for a resource:

```bash
curl "http://localhost:3000/api/v1/audit/resource/USER/user-uuid"
```

### Get logs by user:

```bash
curl "http://localhost:3000/api/v1/audit/user/user-id"
```

### Get logs by action:

```bash
curl "http://localhost:3000/api/v1/audit?action=DELETE"
```

### With pagination:

```bash
curl "http://localhost:3000/api/v1/audit?resource=USER&limit=10&offset=20"
```

## Database Schema

The migration automatically creates:

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  userId VARCHAR,
  action VARCHAR,           -- CREATE, UPDATE, DELETE
  resource VARCHAR,         -- USER, GROUP, etc
  resourceId VARCHAR,       -- ID of affected resource
  previousValue JSONB,      -- Before state
  newValue JSONB,           -- After state
  endpoint VARCHAR,         -- HTTP method+path
  method VARCHAR,           -- POST, PATCH, DELETE
  ipAddress VARCHAR,        -- Request IP
  statusCode INT,           -- HTTP response code
  errorMessage TEXT,        -- Error if failed
  createdAt TIMESTAMP       -- When logged
);

CREATE INDEX IDX_audit_logs_resource_resourceId
  ON audit_logs(resource, resourceId);
```

## Sensitive Field Redaction

Automatically redacted fields:

- password
- refreshTokenHash
- refreshToken
- resetToken
- secretKey
- apiKey

Custom redaction:

```typescript
@AuditLogDecorator({
  action: 'CREATE',
  resource: 'USER',
  excludeFields: ['password', 'ssn', 'creditCard'],
})
```

In logs: `"ssn": "[REDACTED]"`

## Access Control

Query endpoints are protected by `AdminGuard`. To customize:

```typescript
// In audit-log.controller.ts
@UseGuards(YourCustomAdminGuard)
@Get()
async findAuditLogs(...) { }
```

## Common Commands

```bash
# Start development server
npm run start:dev

# Build for production
npm run build

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# View logs in database
psql -h localhost -U postgres -d audit_db
SELECT * FROM audit_logs ORDER BY "createdAt" DESC LIMIT 10;
```

## Troubleshooting

### Migration fails

```bash
npm run build
npm run migration:run
```

### No audit logs created

1. Check controller has both:
   - `@UseInterceptors(AuditLoggingInterceptor)`
   - `@AuditLogDecorator({...})`

2. Check database connection in .env

3. View logs:
   ```bash
   docker-compose logs postgres
   ```

### Can't connect to PostgreSQL

```bash
# Check container is running
docker-compose ps

# Check PostgreSQL logs
docker-compose logs postgres

# Restart
docker-compose down
docker-compose up -d
```

## Next Steps

1. ✅ Quick test complete
2. 📖 Read [README.md](README.md) for full reference
3. 🧪 Check [TESTING.md](TESTING.md) for more examples
4. 🚀 See [ADVANCED.md](ADVANCED.md) for production patterns

## Get Help

- View detailed docs: [README.md](README.md)
- Testing guide: [TESTING.md](TESTING.md)
- Advanced patterns: [ADVANCED.md](ADVANCED.md)
- NestJS docs: https://docs.nestjs.com
- TypeORM docs: https://typeorm.io
