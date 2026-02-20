# Swagger/OpenAPI Documentation Implementation

This document describes the comprehensive Swagger/OpenAPI documentation implementation for the Ahjoor Backend API.

## Features Implemented

### ✅ Core Requirements
- **@nestjs/swagger and swagger-ui-express installed** - Added to dependencies
- **SwaggerModule.setup configured** - Available at `/api/docs` with environment-based guards
- **Complete API documentation** - All endpoints, DTOs, and responses documented
- **Environment-based access control** - Disabled in production by default, can be enabled with `SWAGGER_ENABLED=true`
- **Bearer token authentication** - All authenticated endpoints show JWT requirement
- **OpenAPI spec export** - Available via `npm run export:spec` command

### 📋 API Documentation Structure

#### API Information
- **Title**: Ahjoor Backend API
- **Version**: 0.0.1 (from package.json)
- **Description**: A comprehensive backend API for the Ahjoor application

#### Authentication
- **Bearer Auth**: JWT-based authentication with `@ApiBearerAuth('JWT-auth')` decorator
- **Persistent Authorization**: Swagger UI remembers auth tokens across sessions

#### Operation IDs
- **Clean Operation IDs**: Generated using `operationIdFactory` with format `{ControllerName}_{MethodName}`

## Endpoints Documentation

### Application Endpoints
- `GET /` - Welcome message endpoint
  - **Tags**: Application
  - **Summary**: Get welcome message
  - **Responses**: 200 (success), 500 (server error)

### Health Check Endpoints
- `GET /health` - Application health status
  - **Tags**: Health
  - **Summary**: Get application health status
  - **Response DTO**: `HealthResponseDto`
  - **Responses**: 200 (success), 500 (server error)

- `GET /health/ready` - Application readiness status
  - **Tags**: Health
  - **Summary**: Get application readiness status
  - **Response DTO**: `ReadinessResponseDto`
  - **Responses**: 200 (success), 500 (server error)

### Authentication Endpoints (Example)
- `GET /auth/profile` - Get user profile (Protected)
  - **Tags**: Authentication
  - **Summary**: Get user profile
  - **Auth Required**: Bearer JWT
  - **Response DTO**: `UserProfileDto`
  - **Responses**: 200 (success), 401 (unauthorized), 404 (not found), 500 (server error)

### Users Endpoints (Example)
- `GET /users` - Get paginated users list (Protected)
  - **Tags**: Users
  - **Summary**: Get paginated list of users
  - **Auth Required**: Bearer JWT
  - **Query Parameters**: Supports pagination, search, sorting, and filtering
  - **Response DTO**: `PaginatedUsersResponseDto`
  - **Responses**: 200 (success), 400 (validation error), 401 (unauthorized), 500 (server error)

## DTOs and Schemas

### Base DTOs
- **PaginationDto**: Common pagination parameters with Swagger decorators
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 10)
  - `search`: Search term
  - `sortBy`: Sort field
  - `sortOrder`: Sort direction (asc/desc)

### Response DTOs
- **HealthResponseDto**: Health check response structure
- **ReadinessResponseDto**: Readiness check response structure
- **UserProfileDto**: User profile information
- **PaginatedUsersResponseDto**: Paginated users response

### Error Response DTOs
- **ErrorResponseDto**: Base error response structure
- **ValidationErrorResponseDto**: Validation error responses
- **NotFoundErrorResponseDto**: 404 error responses
- **InternalServerErrorResponseDto**: 500 error responses

## Usage Instructions

### Development Environment
1. Start the development server:
   ```bash
   npm run start:dev
   ```

2. Access Swagger UI:
   ```
   http://localhost:3000/api/docs
   ```

### Production Environment
- Swagger is **disabled by default** in production
- To enable in production, set environment variable:
  ```bash
  SWAGGER_ENABLED=true
  ```

### Export OpenAPI Specification
Generate the OpenAPI JSON specification:
```bash
npm run export:spec
```

This creates `openapi.json` in the project root with the complete API specification.

## Environment Configuration

### Environment Variables
- `NODE_ENV`: Controls default Swagger availability
- `SWAGGER_ENABLED`: Override to enable Swagger in production
- `PORT`: Application port (default: 3000)

### Swagger Access Logic
```typescript
const isSwaggerEnabled = 
  process.env.NODE_ENV !== 'production' || 
  process.env.SWAGGER_ENABLED === 'true';
```

## Implementation Details

### Swagger Configuration
```typescript
const config = new DocumentBuilder()
  .setTitle('Ahjoor Backend API')
  .setDescription('A comprehensive backend API for the Ahjoor application')
  .setVersion('0.0.1')
  .addBearerAuth({
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    name: 'JWT',
    description: 'Enter JWT token',
    in: 'header',
  }, 'JWT-auth')
  .build();
```

### Operation ID Factory
```typescript
operationIdFactory: (controllerKey: string, methodKey: string) => 
  `${controllerKey}_${methodKey}`
```

### Swagger UI Options
```typescript
SwaggerModule.setup('api/docs', app, document, {
  swaggerOptions: {
    persistAuthorization: true,
  },
});
```

## Best Practices Implemented

1. **Comprehensive Documentation**: Every endpoint has detailed descriptions
2. **Consistent Response Structures**: Standardized error and success responses
3. **Type Safety**: All DTOs properly typed with validation decorators
4. **Security Documentation**: Clear authentication requirements
5. **Example Values**: Realistic examples for all properties
6. **Environment Awareness**: Production-safe configuration
7. **Export Capability**: Easy OpenAPI spec generation for external tools

## File Structure
```
src/
├── common/
│   └── dto/
│       ├── base.dto.ts              # Pagination DTO with Swagger decorators
│       └── error-response.dto.ts    # Error response DTOs
├── health/
│   ├── dto/
│   │   └── health-response.dto.ts   # Health check response DTOs
│   └── health.controller.ts         # Health endpoints with Swagger docs
├── auth/
│   ├── dto/
│   │   └── auth-response.dto.ts     # Auth response DTOs
│   └── auth.controller.ts           # Auth endpoints with Bearer auth
├── users/
│   ├── dto/
│   │   └── user.dto.ts              # User DTOs with pagination
│   └── users.controller.ts          # Users endpoints with full docs
└── main.ts                          # Swagger setup and configuration

scripts/
└── export-openapi-spec.ts           # OpenAPI spec export script
```

## Testing the Implementation

1. **Start Development Server**:
   ```bash
   npm run start:dev
   ```

2. **Access Swagger UI**:
   Navigate to `http://localhost:3000/api/docs`

3. **Test Authentication**:
   - Click "Authorize" button in Swagger UI
   - Enter a JWT token (format: `Bearer your-jwt-token`)
   - Test protected endpoints

4. **Export Specification**:
   ```bash
   npm run export:spec
   ```
   Check the generated `openapi.json` file

5. **Production Test**:
   ```bash
   NODE_ENV=production npm start
   # Swagger should be disabled
   
   SWAGGER_ENABLED=true NODE_ENV=production npm start
   # Swagger should be enabled
   ```

This implementation provides a complete, production-ready Swagger/OpenAPI documentation solution that meets all the specified acceptance criteria.