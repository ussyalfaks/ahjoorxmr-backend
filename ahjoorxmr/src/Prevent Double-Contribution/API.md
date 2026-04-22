# API Documentation

## Base URL

```
http://localhost:3000/api
```

## Endpoints

### 1. Create Contribution

**POST** `/contributions`

Creates a new contribution for a user in a group for a specific round.

#### Request Body

```json
{
  "groupId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "550e8400-e29b-41d4-a716-446655440001",
  "roundNumber": 1,
  "transactionHash": "0xabc123def456",
  "amount": 100.5
}
```

#### Success Response (201 Created)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "groupId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "550e8400-e29b-41d4-a716-446655440001",
  "roundNumber": 1,
  "transactionHash": "0xabc123def456",
  "amount": "100.50",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

#### Error Response (409 Conflict)

```json
{
  "statusCode": 409,
  "message": "You have already contributed for round 1 in this group",
  "error": "Conflict"
}
```

---

### 2. Get All Contributions

**GET** `/contributions`

Returns all contributions in the system.

#### Success Response (200 OK)

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "groupId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "550e8400-e29b-41d4-a716-446655440001",
    "roundNumber": 1,
    "transactionHash": "0xabc123def456",
    "amount": "100.50",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

---

### 3. Get Contribution by ID

**GET** `/contributions/:id`

Returns a specific contribution by ID.

#### URL Parameters

- `id` (string, UUID): The contribution ID

#### Success Response (200 OK)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "groupId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "550e8400-e29b-41d4-a716-446655440001",
  "roundNumber": 1,
  "transactionHash": "0xabc123def456",
  "amount": "100.50",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

#### Error Response (404 Not Found)

```json
null
```

---

### 4. Get Contributions by Group and User

**GET** `/contributions/by-group/:groupId/:userId`

Returns all contributions for a specific user in a specific group.

#### URL Parameters

- `groupId` (string, UUID): The group ID
- `userId` (string, UUID): The user ID

#### Success Response (200 OK)

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "groupId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "550e8400-e29b-41d4-a716-446655440001",
    "roundNumber": 1,
    "transactionHash": "0xabc123def456",
    "amount": "100.50",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440003",
    "groupId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "550e8400-e29b-41d4-a716-446655440001",
    "roundNumber": 2,
    "transactionHash": "0xdef789abc012",
    "amount": "150.75",
    "createdAt": "2024-01-16T11:00:00.000Z",
    "updatedAt": "2024-01-16T11:00:00.000Z"
  }
]
```

---

### 5. Get Contributions by Round

**GET** `/contributions/by-round/:groupId/:roundNumber`

Returns all contributions for a specific round in a specific group.

#### URL Parameters

- `groupId` (string, UUID): The group ID
- `roundNumber` (integer): The round number

#### Success Response (200 OK)

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "groupId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "550e8400-e29b-41d4-a716-446655440001",
    "roundNumber": 1,
    "transactionHash": "0xabc123def456",
    "amount": "100.50",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440004",
    "groupId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "550e8400-e29b-41d4-a716-446655440005",
    "roundNumber": 1,
    "transactionHash": "0xabc999def999",
    "amount": "200.00",
    "createdAt": "2024-01-15T10:35:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
]
```

---

## Example Scenarios

### Scenario 1: Single Contribution (Success)

```bash
curl -X POST http://localhost:3000/api/contributions \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "group-1",
    "userId": "user-1",
    "roundNumber": 1,
    "transactionHash": "hash-001",
    "amount": 100
  }'
```

**Result**: 201 Created with contribution details

### Scenario 2: Duplicate Contribution (Conflict)

```bash
curl -X POST http://localhost:3000/api/contributions \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "group-1",
    "userId": "user-1",
    "roundNumber": 1,
    "transactionHash": "hash-002",
    "amount": 50
  }'
```

**Result**: 409 Conflict with message: "You have already contributed for round 1 in this group"

### Scenario 3: Different Round (Success)

```bash
curl -X POST http://localhost:3000/api/contributions \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "group-1",
    "userId": "user-1",
    "roundNumber": 2,
    "transactionHash": "hash-003",
    "amount": 75
  }'
```

**Result**: 201 Created with contribution details (different round allowed)

### Scenario 4: Different User, Same Round (Success)

```bash
curl -X POST http://localhost:3000/api/contributions \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "group-1",
    "userId": "user-2",
    "roundNumber": 1,
    "transactionHash": "hash-004",
    "amount": 120
  }'
```

**Result**: 201 Created with contribution details (different user allowed)
