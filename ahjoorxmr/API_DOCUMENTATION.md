# API Documentation Guide

## Overview

The Ahjoor Backend API provides comprehensive documentation using Swagger/OpenAPI 3.0. This guide explains how to access, use, and maintain the API documentation.

## Accessing API Documentation

### Swagger UI

The interactive Swagger UI is available at:
- **Development**: `http://localhost:3000/api/docs` or `http://localhost:3000/api/docs/v1`
- **Production**: Available only when `SWAGGER_ENABLED=true` environment variable is set

### Features

The Swagger UI includes:
- ✅ **Interactive API Testing**: Try out endpoints directly from the browser
- ✅ **Request/Response Examples**: See sample requests and responses for each endpoint
- ✅ **Schema Definitions**: Detailed data models with validation rules
- ✅ **Authentication**: Built-in JWT token management
- ✅ **Filtering & Search**: Quick endpoint lookup
- ✅ **Request Duration**: See how long each request takes

## Authentication

### JWT Bearer Token

Most endpoints require authentication using JWT Bearer tokens.

**To authenticate in Swagger UI:**

1. Click the **"Authorize"** button at the top of the page
2. Enter your JWT token in the format: `Bearer <your-token-here>`
3. Click **"Authorize"**
4. All subsequent requests will include the token automatically

**Example:**
```
Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### API Key Authentication

Some internal endpoints use API key authentication:
- Header: `X-API-Key: your-api-key-here`

## API Structure

### Versioning

The API uses URI-based versioning:
- **Current version**: `v1`
- **Base URL**: `http://localhost:3000/v1/`

All endpoints are automatically versioned.

### Tags

The API is organized into the following sections:

| Tag | Description |
|-----|-------------|
| **Authentication** | User authentication and authorization endpoints |
| **Users** | User management endpoints |
| **Groups** | ROSCA group management endpoints |
| **Memberships** | Group membership management endpoints |
| **Contributions** | Contribution tracking endpoints |
| **Audit** | Audit log and monitoring endpoints |
| **Health** | Health check and status endpoints |
| **Rate Limiting** | Rate limiting configuration and management |

## Endpoint Examples

### 1. Health Check

**GET** `/health`

Check if the API is running:

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "version": "0.0.1"
}
```

### 2. Create a Group (Authenticated)

**POST** `/v1/groups`

```bash
curl -X POST http://localhost:3000/v1/groups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monthly Savings Group",
    "adminWallet": "GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON",
    "contributionAmount": "100.00",
    "token": "USDC:GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON",
    "roundDuration": 2592000,
    "totalRounds": 12
  }'
```

### 3. List Groups with Pagination

**GET** `/v1/groups?page=1&limit=10`

```bash
curl "http://localhost:3000/v1/groups?page=1&limit=10"
```

**Response:**
```json
{
  "data": [...],
  "total": 50,
  "page": 1,
  "limit": 10
}
```

### 4. Add Member to Group

**POST** `/v1/groups/:id/members`

```bash
curl -X POST http://localhost:3000/v1/groups/GROUP_ID/members \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "walletAddress": "GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON"
  }'
```

## Response Formats

### Success Responses

All successful responses follow consistent patterns:

**Single Resource:**
```json
{
  "id": "uuid",
  "name": "Resource Name",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Paginated Collection:**
```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

### Error Responses

All error responses follow this format:

```json
{
  "statusCode": 400,
  "message": "Error description" || ["Error 1", "Error 2"],
  "error": "Bad Request",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/endpoint"
}
```

**Common Status Codes:**
- `200` - Success
- `201` - Created
- `204` - No Content (successful deletion)
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## Rate Limiting

The API implements rate limiting to prevent abuse:

### Default Limits

- **Authentication endpoints**: 5 requests per minute
- **Registration**: 3 requests per 5 minutes
- **Password reset**: 3 requests per 5 minutes
- **Internal contributions**: 10 requests per minute
- **General endpoints**: 100 requests per 15 minutes

### Rate Limit Headers

Every response includes rate limit information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

### Rate Limit Exceeded

When you exceed the rate limit, you'll receive a 429 response:

```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "ThrottlerException"
}
```

## Exporting OpenAPI Specification

You can export the complete API specification in JSON and YAML formats:

### Using the Export Script

```bash
npm run export:spec
```

This will generate:
- `openapi.json` - OpenAPI specification in JSON format
- `openapi.yaml` - OpenAPI specification in YAML format

### Generated Files Location

Files are exported to the project root directory:
```
ahjoorxmr/
├── openapi.json
├── openapi.yaml
└── ...
```

### Using the Specification

These files can be used with:
- **API Clients**: Generate client SDKs using OpenAPI Generator
- **Testing Tools**: Import into Postman, Insomnia, etc.
- **Documentation Generators**: Create static documentation
- **Contract Testing**: Validate API responses against the spec

## Data Types & Validation

### Common Data Types

| Type | Description | Example |
|------|-------------|---------|
| `uuid` | UUID v4 string | `123e4567-e89b-12d3-a456-426614174000` |
| `email` | Valid email address | `user@example.com` |
| `date-time` | ISO 8601 timestamp | `2024-01-01T00:00:00.000Z` |
| `wallet` | Stellar wallet address | `GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON` |
| `amount` | String (decimal) | `"100.50"` |

### Validation Rules

- **Required fields**: Marked with `*` in Swagger UI
- **String lengths**: Minimum/maximum character counts
- **Numeric ranges**: Minimum/maximum values
- **Format validation**: Email, UUID, date-time, etc.
- **Enum values**: Predefined list of allowed values

## Best Practices

### 1. Use Pagination

Always use pagination parameters for list endpoints:
```
GET /v1/groups?page=1&limit=20
```

### 2. Handle Errors Gracefully

Always check response status codes and handle errors appropriately:

```javascript
try {
  const response = await fetch('/v1/groups', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('API Error:', error.message);
  }
  
  const data = await response.json();
  return data;
} catch (error) {
  console.error('Network Error:', error);
}
```

### 3. Respect Rate Limits

- Monitor rate limit headers
- Implement exponential backoff for retries
- Cache responses when appropriate

### 4. Validate Input

Always validate data before sending to the API:
- Ensure UUIDs are valid
- Check string lengths
- Verify numeric ranges
- Format dates correctly

### 5. Use Audit Logs

For security-sensitive operations, review audit logs:
```
GET /v1/audit/logs?userId=xxx&action=CREATE&resource=GROUP
```

## Troubleshooting

### Common Issues

#### 1. Unauthorized (401)

**Problem**: Missing or invalid JWT token

**Solution**:
- Ensure token is included in `Authorization` header
- Verify token format: `Bearer <token>`
- Check if token has expired
- Request a new token if needed

#### 2. Forbidden (403)

**Problem**: Insufficient permissions

**Solution**:
- Verify user role has required permissions
- Check if user is the resource owner (e.g., group admin)
- Review endpoint access requirements

#### 3. Validation Errors (400)

**Problem**: Invalid request data

**Solution**:
- Check the `message` field in error response for details
- Verify all required fields are present
- Ensure data types match specification
- Review validation rules in Swagger UI

#### 4. Rate Limited (429)

**Problem**: Too many requests

**Solution**:
- Wait for rate limit reset time
- Implement request throttling
- Use caching to reduce API calls
- Consider requesting higher rate limits

## Maintaining Documentation

### For Developers

When adding new endpoints or modifying existing ones:

1. **Add Swagger Decorators**:
   ```typescript
   @ApiOperation({ summary: 'Endpoint description' })
   @ApiResponse({ status: 200, type: ResponseDto })
   @ApiParam({ name: 'id', description: 'Resource ID' })
   ```

2. **Document DTOs**:
   ```typescript
   export class MyDto {
     @ApiProperty({
       description: 'Field description',
       example: 'example value',
       required: true
     })
     myField: string;
   }
   ```

3. **Add Examples**:
   - Include realistic example values
   - Show edge cases where relevant
   - Document error scenarios

4. **Update Exports**:
   ```bash
   npm run export:spec
   ```

5. **Test in Swagger UI**:
   - Verify all endpoints are documented
   - Test example requests
   - Check response schemas

### Documentation Checklist

- [ ] All endpoints have `@ApiOperation`
- [ ] All DTOs have `@ApiProperty` decorators
- [ ] Examples provided for request/response
- [ ] Authentication documented with `@ApiBearerAuth`
- [ ] Error responses documented
- [ ] Rate limits specified with `@Throttle`
- [ ] OpenAPI spec exported and validated

## Additional Resources

### Tools

- **Swagger Editor**: [editor.swagger.io](https://editor.swagger.io/)
- **OpenAPI Generator**: [openapi-generator.tech](https://openapi-generator.tech/)
- **Postman**: Import OpenAPI spec to generate collection
- **Insomnia**: Load OpenAPI spec for testing

### Links

- **OpenAPI Specification**: [spec.openapis.org](https://spec.openapis.org/)
- **NestJS Swagger Documentation**: [docs.nestjs.com/openapi](https://docs.nestjs.com/openapi/introduction)
- **Swagger UI**: [swagger.io/tools/swagger-ui](https://swagger.io/tools/swagger-ui/)

## Support

For API issues or questions:
- Check this documentation first
- Review Swagger UI for endpoint details
- Check audit logs for debugging
- Contact the development team

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Maintained by**: Ahjoor Development Team
