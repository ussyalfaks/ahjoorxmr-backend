# Testing the Audit Logging System

This document provides examples of how to test the audit logging system.

## Quick Start Using Docker

### 1. Start PostgreSQL

```bash
docker-compose up -d
```

This starts PostgreSQL and pgAdmin for easy database inspection.

### 2. Install Dependencies

```bash
npm install
```

### 3. Build and Run

```bash
npm run build
npm run migration:run
npm run start:dev
```

## Testing Workflow

### Test 1: Create a Group (CREATE audit)

```bash
curl -X POST http://localhost:3000/api/v1/groups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Marketing Team",
    "description": "Marketing department",
    "permissions": ["read", "write", "approve"]
  }'
```

**Expected Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Marketing Team",
  "description": "Marketing department",
  "status": "active",
  "permissions": "[\"read\",\"write\",\"approve\"]",
  "createdAt": "2026-03-25T10:30:00.000Z",
  "updatedAt": "2026-03-25T10:30:00.000Z"
}
```

**Save the ID** - you'll need it for the next steps.

### Test 2: Verify CREATE audit log

```bash
curl "http://localhost:3000/api/v1/audit?resource=GROUP&action=CREATE"
```

**Expected Response:**

```json
{
  "data": [
    {
      "id": "audit-log-uuid",
      "userId": "system",
      "action": "CREATE",
      "resource": "GROUP",
      "resourceId": "550e8400-e29b-41d4-a716-446655440000",
      "previousValue": null,
      "newValue": {
        "name": "Marketing Team",
        "description": "Marketing department",
        "permissions": ["read", "write", "approve"]
      },
      "endpoint": "POST /api/v1/groups",
      "method": "POST",
      "ipAddress": "127.0.0.1",
      "statusCode": 200,
      "errorMessage": null,
      "createdAt": "2026-03-25T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

**Verify:**

- ✅ `previousValue` is null (new resource)
- ✅ `newValue` contains the submitted data
- ✅ `action` is CREATE
- ✅ `resource` is GROUP
- ✅ `resourceId` matches the created group

### Test 3: Update the Group (UPDATE audit)

```bash
# Replace {GROUP_ID} with the ID from Test 1
curl -X PATCH http://localhost:3000/api/v1/groups/{GROUP_ID} \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Marketing department (updated)",
    "status": "inactive"
  }'
```

**Expected Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Marketing Team",
  "description": "Marketing department (updated)",
  "status": "inactive",
  "permissions": "[\"read\",\"write\",\"approve\"]",
  "createdAt": "2026-03-25T10:30:00.000Z",
  "updatedAt": "2026-03-25T10:35:00.000Z"
}
```

### Test 4: Verify UPDATE audit log

```bash
curl "http://localhost:3000/api/v1/audit/resource/GROUP/{GROUP_ID}"
```

**Expected Response:**

```json
{
  "data": [
    {
      "id": "audit-log-uuid-2",
      "userId": "system",
      "action": "UPDATE",
      "resource": "GROUP",
      "resourceId": "550e8400-e29b-41d4-a716-446655440000",
      "previousValue": {
        "description": "Marketing department",
        "status": "inactive"
      },
      "newValue": {
        "description": "Marketing department (updated)",
        "status": "inactive"
      },
      "endpoint": "PATCH /api/v1/groups/550e8400-e29b-41d4-a716-446655440000",
      "method": "PATCH",
      "ipAddress": "127.0.0.1",
      "statusCode": 200,
      "errorMessage": null,
      "createdAt": "2026-03-25T10:35:00.000Z"
    },
    {
      "id": "audit-log-uuid-1",
      "userId": "system",
      "action": "CREATE",
      "resource": "GROUP",
      "resourceId": "550e8400-e29b-41d4-a716-446655440000",
      ...
    }
  ],
  "total": 2
}
```

**Verify:**

- ✅ `previousValue` contains old state
- ✅ `newValue` contains new state
- ✅ Audit history shows both CREATE and UPDATE
- ✅ Both logged to same `resourceId`

### Test 5: Delete the Group (DELETE audit)

```bash
curl -X DELETE http://localhost:3000/api/v1/groups/{GROUP_ID}
```

**Expected Response:** 200 OK (no body)

### Test 6: Verify DELETE audit log

```bash
curl "http://localhost:3000/api/v1/audit/resource/GROUP/{GROUP_ID}"
```

**Expected Response:** Now shows 3 entries (CREATE, UPDATE, DELETE)

```json
{
  "data": [
    {
      "id": "audit-log-uuid-3",
      "userId": "system",
      "action": "DELETE",
      "resource": "GROUP",
      "resourceId": "550e8400-e29b-41d4-a716-446655440000",
      "previousValue": null,
      "newValue": null,
      "endpoint": "DELETE /api/v1/groups/550e8400-e29b-41d4-a716-446655440000",
      "method": "DELETE",
      "statusCode": 200,
      "createdAt": "2026-03-25T10:40:00.000Z"
    },
    ...
  ],
  "total": 3
}
```

## Test 7: Pagination

```bash
# Get 10 records, skip first 5
curl "http://localhost:3000/api/v1/audit?resource=GROUP&limit=10&offset=5"
```

## Test 8: Filter by Action

```bash
# Get only UPDATE actions
curl "http://localhost:3000/api/v1/audit?action=UPDATE&limit=50"
```

## Test 9: Sensitive Field Redaction

To test this, modify the Groups entity to include a sensitive field:

```typescript
@Column()
password: string; // Add this temporarily

// In dto
export class CreateGroupDto {
  @IsString()
  name: string;

  @IsString()
  password: string; // Add this temporarily
}
```

Then create a group with a password:

```bash
curl -X POST http://localhost:3000/api/v1/groups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HR Team",
    "password": "secret123",
    "description": "HR department"
  }'
```

Check the audit log - the password should appear as `"[REDACTED]"`:

```json
{
  "newValue": {
    "name": "HR Team",
    "password": "[REDACTED]",
    "description": "HR department"
  }
}
```

## Database Inspection

### Using pgAdmin (GUI)

1. Open browser: http://localhost:5050
2. Login with admin@admin.com / admin
3. Add server:
   - Host: postgres
   - Username: postgres
   - Password: postgres
4. Query tables:

```sql
SELECT * FROM audit_logs ORDER BY "createdAt" DESC;
SELECT * FROM groups;
```

### Using psql (CLI)

```bash
psql -h localhost -U postgres -d audit_db

# List tables
\dt

# View audit logs
SELECT id, action, resource, "resourceId", "previousValue", "newValue"
FROM audit_logs
ORDER BY "createdAt" DESC
LIMIT 10;

# View groups
SELECT * FROM groups;

# Exit
\q
```

## Performance Testing

### Insert test data

```typescript
// In a test service, create bulk entries
for (let i = 0; i < 100; i++) {
  await groupsService.create({
    name: `Group ${i}`,
    description: `Description ${i}`,
  });
}
```

### Query performance

```bash
# Should return quickly due to indexes
curl "http://localhost:3000/api/v1/audit?resource=GROUP&limit=100"

time curl "http://localhost:3000/api/v1/audit?resource=GROUP&userId=user-123&limit=50"
```

Check query plans in psql:

```sql
EXPLAIN ANALYZE
SELECT * FROM audit_logs
WHERE resource = 'GROUP' AND "resourceId" = 'uuid'
ORDER BY "createdAt" DESC;
```

## Acceptance Criteria Verification

- [x] **previousValue and newValue stored**: Create, update, verify both fields populated
- [x] **Admin can query by resource and ID**: Test `/api/v1/audit/resource/GROUP/:id`
- [x] **Sensitive fields excluded**: Add password field, verify `[REDACTED]` appears in logs
- [x] **Migration runs cleanly**: `npm run migration:run` succeeds without errors

## Cleanup

To reset the database:

```bash
# Drop database
psql -h localhost -U postgres -c "DROP DATABASE audit_db;"

# Recreate database
psql -h localhost -U postgres -c "CREATE DATABASE audit_db;"

# Run migrations
npm run migration:run
```

To stop Docker containers:

```bash
docker-compose down
```

To stop Docker and remove volumes:

```bash
docker-compose down -v
```
