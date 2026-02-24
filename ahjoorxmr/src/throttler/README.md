# Rate Limiting Middleware

This module implements comprehensive rate limiting protection using `@nestjs/throttler` with Redis storage for distributed systems.

## Features

- Global rate limiting across all endpoints
- Redis-backed storage for distributed systems
- Different limits for authenticated vs anonymous users
- Custom rate limits for sensitive endpoints
- Proper 429 Too Many Requests responses
- Rate limit headers (X-RateLimit-*) in responses

## Configuration

### Default Limits

- **Anonymous users**: 100 requests per minute
- **Authenticated users**: 200 requests per minute
- **Short burst protection**: 10 requests per second

### Environment Variables

Add to your `.env` file:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here
```

## Usage

### Global Rate Limiting

Rate limiting is automatically applied to all endpoints through the global guard in `main.ts`.

### Custom Rate Limits for Specific Endpoints

Use the `@Throttle()` decorator for custom limits:

```typescript
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  // 5 requests per minute for login
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login() {
    // ...
  }

  // 3 requests per 5 minutes for password reset
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @Post('reset-password')
  async resetPassword() {
    // ...
  }
}
```

### Skip Rate Limiting

Use `@SkipThrottle()` to exclude specific endpoints:

```typescript
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
export class HealthController {
  @SkipThrottle()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
```

## Response Headers

All responses include rate limit headers:

- `X-RateLimit-Limit`: Maximum number of requests allowed
- `X-RateLimit-Remaining`: Number of requests remaining
- `X-RateLimit-Reset`: Timestamp when the limit resets

## 429 Response Format

When rate limit is exceeded:

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests"
}
```

## Redis Storage

Rate limit data is stored in Redis with keys in the format:

```
throttle:user:{userId}
throttle:{ipAddress}
```

Keys automatically expire based on the TTL configuration.

## Testing

Test rate limiting with curl:

```bash
# Test anonymous rate limit
for i in {1..105}; do
  curl http://localhost:3000/api/endpoint
done

# Test authenticated rate limit
for i in {1..205}; do
  curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/endpoint
done
```

## Production Considerations

1. Ensure Redis is properly configured and accessible
2. Monitor Redis memory usage
3. Adjust limits based on your application needs
4. Consider using Redis Cluster for high availability
5. Set up alerts for rate limit violations
