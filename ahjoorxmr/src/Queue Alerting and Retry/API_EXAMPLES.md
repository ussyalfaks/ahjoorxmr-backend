# API Request Examples

## Setup
```bash
# Set variables for your environment
BASE_URL="http://localhost:3000"
ADMIN_TOKEN="your-admin-jwt-token"
```

## 1. Get Dead Letter Queue Records

### Get All Dead Letters (Default Pagination)
```bash
curl -X GET "${BASE_URL}/api/v1/queue/dead-letter" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json"
```

### Response (Success - 200)
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "jobId": "job-12345",
        "groupId": "email-processing",
        "queueName": "email-queue",
        "error": "SMTP connection timeout after 30s",
        "payload": {
          "to": "user@example.com",
          "subject": "Welcome",
          "body": "Welcome to our service"
        },
        "status": "PENDING",
        "createdAt": "2024-03-15T10:30:00Z",
        "resolvedAt": null
      },
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "jobId": "job-12346",
        "groupId": "payment-processing",
        "queueName": "payment-queue",
        "error": "Database connection lost",
        "payload": {
          "userId": "user-123",
          "amount": 99.99,
          "currency": "USD"
        },
        "status": "PENDING",
        "createdAt": "2024-03-15T10:28:00Z",
        "resolvedAt": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 127,
      "pages": 3
    }
  }
}
```

### Get Dead Letters with Custom Pagination
```bash
# Get page 2 with 25 items per page
curl -X GET "${BASE_URL}/api/v1/queue/dead-letter?page=2&limit=25" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"

# Get page 3 with 100 items per page (maximum)
curl -X GET "${BASE_URL}/api/v1/queue/dead-letter?page=3&limit=100" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

## 2. Get Dead Letters by Group

### Get Dead Letters for Specific Group
```bash
curl -X GET "${BASE_URL}/api/v1/queue/dead-letter/email-processing" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"

curl -X GET "${BASE_URL}/api/v1/queue/dead-letter/payment-processing?page=1&limit=50" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### Response (Success - 200)
```json
{
  "success": true,
  "data": {
    "groupId": "email-processing",
    "records": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "jobId": "job-12345",
        "groupId": "email-processing",
        "queueName": "email-queue",
        "error": "SMTP connection timeout",
        "payload": { "to": "user@example.com" },
        "status": "PENDING",
        "createdAt": "2024-03-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 15,
      "pages": 1
    }
  }
}
```

## 3. Resolve Dead Letter Record

### Mark Dead Letter as Resolved
```bash
curl -X PATCH "${BASE_URL}/api/v1/queue/dead-letter/550e8400-e29b-41d4-a716-446655440000/resolve" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json"
```

### Response (Success - 200)
```json
{
  "success": true,
  "message": "Dead letter record resolved",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "jobId": "job-12345",
    "groupId": "email-processing",
    "queueName": "email-queue",
    "error": "SMTP connection timeout",
    "status": "RESOLVED",
    "createdAt": "2024-03-15T10:30:00Z",
    "resolvedAt": "2024-03-15T10:45:00Z"
  }
}
```

### Error Response (Not Found - 404)
```json
{
  "statusCode": 404,
  "message": "Dead letter record not found: invalid-id",
  "error": "Not Found"
}
```

## 4. Get Consecutive Failure Count

### Check Current Failure Count for Group
```bash
curl -X GET "${BASE_URL}/api/v1/queue/dead-letter/email-processing/consecutive-failures" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### Response (Success - 200)
```json
{
  "success": true,
  "data": {
    "groupId": "email-processing",
    "consecutiveFailures": 2
  }
}
```

### Response When Circuit Breaker Triggered
```json
{
  "success": true,
  "data": {
    "groupId": "email-processing",
    "consecutiveFailures": 0,
    "circuitBreakerActive": true,
    "queueStatus": "PAUSED"
  }
}
```

## 5. Reset Failure Counter

### Reset Consecutive Failures (After Manual Fix)
```bash
curl -X POST "${BASE_URL}/api/v1/queue/dead-letter/email-processing/reset-failures" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json"
```

### Response (Success - 200)
```json
{
  "success": true,
  "message": "Consecutive failure counter reset for group email-processing",
  "data": {
    "groupId": "email-processing",
    "consecutiveFailures": 0
  }
}
```

## Error Responses

### Invalid Pagination Parameters
```bash
curl -X GET "${BASE_URL}/api/v1/queue/dead-letter?page=0&limit=50" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**Response (Bad Request - 400)**:
```json
{
  "statusCode": 400,
  "message": "Page must be a positive integer",
  "error": "Bad Request"
}
```

### Limit Exceeds Maximum
```bash
curl -X GET "${BASE_URL}/api/v1/queue/dead-letter?page=1&limit=150" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**Response (Bad Request - 400)**:
```json
{
  "statusCode": 400,
  "message": "Limit must be between 1 and 100",
  "error": "Bad Request"
}
```

### Unauthorized (Missing Admin Role)
```bash
curl -X GET "${BASE_URL}/api/v1/queue/dead-letter" \
  -H "Authorization: Bearer ${USER_TOKEN}"
```

**Response (Forbidden - 403)**:
```json
{
  "statusCode": 403,
  "message": "Access denied. Required role: admin",
  "error": "Forbidden"
}
```

### Unauthorized (Missing Token)
```bash
curl -X GET "${BASE_URL}/api/v1/queue/dead-letter"
```

**Response (Unauthorized - 401)**:
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

## Testing Scenarios

### Scenario 1: Monitor Queue Health
```bash
#!/bin/bash

# Check dead letter count
echo "=== Checking Dead Letter Queue ==="
curl -s -X GET "${BASE_URL}/api/v1/queue/dead-letter?limit=10" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.data.pagination'

# Check failure count for critical group
echo "=== Checking email-processing Group ==="
curl -s -X GET "${BASE_URL}/api/v1/queue/dead-letter/email-processing/consecutive-failures" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.data'

# If failures >= 3, alert admin
FAILURES=$(curl -s -X GET "${BASE_URL}/api/v1/queue/dead-letter/email-processing/consecutive-failures" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.data.consecutiveFailures')

if [ "$FAILURES" -ge 3 ]; then
  echo "⚠️  ALERT: Queue has been paused due to $FAILURES consecutive failures!"
fi
```

### Scenario 2: Bulk Resolve Dead Letters
```bash
#!/bin/bash

# Get all dead letters for a group
DEAD_LETTERS=$(curl -s -X GET "${BASE_URL}/api/v1/queue/dead-letter/email-processing?limit=100" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.data.records[].id')

# Resolve each one
for DL_ID in $DEAD_LETTERS; do
  echo "Resolving $DL_ID..."
  curl -X PATCH "${BASE_URL}/api/v1/queue/dead-letter/${DL_ID}/resolve" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json"
done

# Reset failure counter
curl -X POST "${BASE_URL}/api/v1/queue/dead-letter/email-processing/reset-failures" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"

echo "Done! Queue is ready to resume."
```

### Scenario 3: Generate Test Load
```bash
#!/bin/bash

# Simulate multiple job failures in sequence
for i in {1..5}; do
  echo "Recording failure $i..."
  
  # This would be done by your queue processor, but here's the concept:
  # POST /jobs/process
  # With payload containing jobId, groupId, etc.
  
  sleep 2
done

# Check if circuit breaker was triggered
curl -X GET "${BASE_URL}/api/v1/queue/dead-letter/test-group/consecutive-failures" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

## Using in JavaScript/Node.js

### Fetch Dead Letters
```javascript
const ADMIN_TOKEN = 'your-admin-token';
const BASE_URL = 'http://localhost:3000';

async function getDeadLetters(page = 1, limit = 50) {
  const response = await fetch(
    `${BASE_URL}/api/v1/queue/dead-letter?page=${page}&limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch dead letters: ${response.statusText}`);
  }
  
  return response.json();
}

// Usage
getDeadLetters(1, 50).then(data => {
  console.log(`Total dead letters: ${data.data.pagination.total}`);
  console.log(`Pages: ${data.data.pagination.pages}`);
  data.data.records.forEach(record => {
    console.log(`- Job ${record.jobId}: ${record.error}`);
  });
});
```

### Resolve Dead Letter
```javascript
async function resolveDeadLetter(deadLetterId) {
  const response = await fetch(
    `${BASE_URL}/api/v1/queue/dead-letter/${deadLetterId}/resolve`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to resolve dead letter: ${response.statusText}`);
  }
  
  return response.json();
}

// Usage
resolveDeadLetter('550e8400-e29b-41d4-a716-446655440000')
  .then(data => console.log('Resolved:', data.message))
  .catch(error => console.error('Error:', error));
```

### Check Failure Count
```javascript
async function getFailureCount(groupId) {
  const response = await fetch(
    `${BASE_URL}/api/v1/queue/dead-letter/${groupId}/consecutive-failures`,
    {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
      },
    }
  );
  
  const data = await response.json();
  return data.data.consecutiveFailures;
}

// Usage
getFailureCount('email-processing').then(count => {
  console.log(`Consecutive failures: ${count}`);
  if (count >= 3) {
    console.log('⚠️  Queue is paused!');
  }
});
```

## Rate Limiting Notes

- No rate limits on admin endpoints
- Consider implementing rate limits in production
- Monitor request patterns for anomalies

## Performance Tips

1. **Use pagination**: Always specify limit ≤ 100
2. **Filter by group**: Use group-specific endpoints for faster queries
3. **Implement caching**: Cache failure counts for 30 seconds
4. **Batch operations**: Resolve multiple dead letters in parallel

---

**Last Updated**: March 2024
**API Version**: 1.0.0
