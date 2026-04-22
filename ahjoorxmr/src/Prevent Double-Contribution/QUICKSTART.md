# Quick Start Guide

## Prerequisites

- **Node.js**: v18 or higher ([Download](https://nodejs.org/))
- **npm**: comes with Node.js
- **PostgreSQL**: v12+ (for development) or **Docker** (recommended)

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Database

#### Option A: Using Docker (Recommended)

```bash
# Start PostgreSQL container
docker-compose up -d

# Verify database is running
docker-compose ps
```

#### Option B: Local PostgreSQL

Update `.env` with your PostgreSQL credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_NAME=contributions
```

### 3. Run Migrations

```bash
npm run migration:run
```

### 4. Start the Application

```bash
# Development mode with auto-reload
npm run start:dev

# Production mode
npm run build
npm start
```

The API will be available at: `http://localhost:3000/api`

## Testing

### Run All Tests

```bash
npm test
```

### Watch Mode (re-run on file changes)

```bash
npm run test:watch
```

### Coverage Report

```bash
npm run test:cov
```

## Key Endpoints

### Create a Contribution

```bash
curl -X POST http://localhost:3000/api/contributions \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "group-123",
    "userId": "user-456",
    "roundNumber": 1,
    "transactionHash": "0xhash123",
    "amount": 100
  }'
```

### Attempt Duplicate Contribution (Returns 409)

```bash
curl -X POST http://localhost:3000/api/contributions \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "group-123",
    "userId": "user-456",
    "roundNumber": 1,
    "transactionHash": "0xhash456",
    "amount": 50
  }'
```

## File Structure Overview

```
├── src/
│   ├── main.ts                    # Application entry point
│   ├── app.module.ts              # Root module (TypeORM config)
│   └── contributions/
│       ├── contribution.entity.ts # Entity with unique constraint
│       ├── contributions.service.ts
│       ├── contributions.controller.ts
│       ├── contributions.module.ts
│       ├── contributions.service.spec.ts         # Unit tests
│       ├── contributions.integration.spec.ts     # Integration tests
│       └── dto/
│           └── create-contribution.dto.ts
├── src/database/
│   └── migrations/
│       └── 1703688000000-CreateContributionTable.ts
├── package.json
├── tsconfig.json
├── jest.config.ts
├── .env
├── docker-compose.yml
└── README.md
```

## Troubleshooting

### Database Connection Error

```
Error: connect ECONNREFUSED
```

**Solution**: Ensure PostgreSQL is running and credentials in `.env` are correct

### Migration Error

```
Error: 23505: duplicate key value violates unique constraint
```

**Solution**: Database already has data. Drop and recreate or start with fresh database.

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution**: Kill process on port 3000 or change PORT in `.env`

## Key Features

✅ **Unique Constraint**: Database enforces one contribution per (groupId, userId, roundNumber)  
✅ **Application Validation**: Service checks before save with descriptive error  
✅ **409 Conflict**: Proper HTTP status for duplicate contributions  
✅ **Full Test Coverage**: Unit and integration tests included  
✅ **TypeORM Migration**: Clean database schema setup  
✅ **REST API**: Complete endpoints for contributions management

## Next Steps

1. Run `npm install`
2. Start PostgreSQL with `docker-compose up -d`
3. Run `npm run migration:run`
4. Start app with `npm run start:dev`
5. Test endpoints using provided curl commands above
6. Run tests with `npm test`

For more details, see [README.md](README.md) and [API.md](API.md)
