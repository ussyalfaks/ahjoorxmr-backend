# Requirements Document

## Introduction

The MembershipsModule manages the relationship between users and ROSCA (Rotating Savings and Credit Association) groups. It tracks which users belong to which groups, their position in the payout queue, their contribution status, and their membership state. This module enforces business rules around membership lifecycle, prevents duplicate memberships, and provides APIs for administrators to manage group membership before groups become active.

## Glossary

- **MembershipsModule**: The NestJS module responsible for managing user memberships in ROSCA groups
- **Membership**: An entity representing a user's participation in a specific ROSCA group
- **Group**: A ROSCA group entity (referenced by groupId foreign key)
- **User**: A user entity (referenced by userId foreign key)
- **Payout_Order**: A zero-indexed number indicating the member's position in the payout queue
- **Membership_Status**: An enumeration with values ACTIVE, SUSPENDED, or REMOVED
- **Administrator**: A user with permissions to manage group memberships
- **Active_Group**: A group with status set to ACTIVE
- **Wallet_Address**: A blockchain wallet address string associated with a member

## Requirements

### Requirement 1: Membership Entity Persistence

**User Story:** As a developer, I want to persist membership data with all required fields, so that the system can track user participation in ROSCA groups.

#### Acceptance Criteria

1. THE MembershipsModule SHALL store Membership entities with field id of type uuid
2. THE MembershipsModule SHALL store Membership entities with field groupId of type uuid as a foreign key to Group
3. THE MembershipsModule SHALL store Membership entities with field userId of type uuid as a foreign key to User
4. THE MembershipsModule SHALL store Membership entities with field walletAddress of type string
5. THE MembershipsModule SHALL store Membership entities with field payoutOrder of type number representing zero-indexed position
6. THE MembershipsModule SHALL store Membership entities with field hasReceivedPayout of type boolean
7. THE MembershipsModule SHALL store Membership entities with field hasPaidCurrentRound of type boolean
8. THE MembershipsModule SHALL store Membership entities with field status of type Membership_Status enum
9. THE MembershipsModule SHALL store Membership entities with field createdAt of type timestamp
10. THE MembershipsModule SHALL store Membership entities with field updatedAt of type timestamp

### Requirement 2: Add Member to Group

**User Story:** As an administrator, I want to add a wallet address to a group before it goes active, so that I can build the membership roster.

#### Acceptance Criteria

1. WHEN a POST request is received at /api/v1/groups/:id/members, THE MembershipsModule SHALL validate the request body
2. WHEN a valid add member request is received, THE MembershipsModule SHALL create a new Membership entity with status ACTIVE
3. WHEN a valid add member request is received, THE MembershipsModule SHALL assign the next available payoutOrder value
4. WHEN a valid add member request is received, THE MembershipsModule SHALL set hasReceivedPayout to false
5. WHEN a valid add member request is received, THE MembershipsModule SHALL set hasPaidCurrentRound to false
6. WHEN a valid add member request is received, THE MembershipsModule SHALL return the created Membership entity with HTTP status 201
7. WHEN an add member request is received for an Active_Group, THE MembershipsModule SHALL reject the request with HTTP status 400
8. WHEN an add member request is received with invalid data, THE MembershipsModule SHALL return validation errors with HTTP status 400

### Requirement 3: Remove Member from Group

**User Story:** As an administrator, I want to remove a member from a group before it goes active, so that I can correct membership errors.

#### Acceptance Criteria

1. WHEN a DELETE request is received at /api/v1/groups/:id/members/:userId, THE MembershipsModule SHALL validate the group exists
2. WHEN a valid remove member request is received, THE MembershipsModule SHALL delete the Membership entity
3. WHEN a valid remove member request is received, THE MembershipsModule SHALL return HTTP status 204
4. WHEN a remove member request is received for an Active_Group, THE MembershipsModule SHALL reject the request with HTTP status 400
5. WHEN a remove member request is received for a non-existent membership, THE MembershipsModule SHALL return HTTP status 404

### Requirement 4: List Group Members

**User Story:** As a user, I want to view all members of a group with their status, so that I can see the membership roster and payout order.

#### Acceptance Criteria

1. WHEN a GET request is received at /api/v1/groups/:id/members, THE MembershipsModule SHALL retrieve all Membership entities for the specified group
2. WHEN a valid list members request is received, THE MembershipsModule SHALL return members ordered by payoutOrder ascending
3. WHEN a valid list members request is received, THE MembershipsModule SHALL include all Membership fields in the response
4. WHEN a valid list members request is received, THE MembershipsModule SHALL return HTTP status 200
5. WHEN a list members request is received for a non-existent group, THE MembershipsModule SHALL return an empty array with HTTP status 200

### Requirement 5: Prevent Duplicate Memberships

**User Story:** As a system administrator, I want to prevent duplicate memberships in the same group, so that data integrity is maintained.

#### Acceptance Criteria

1. THE MembershipsModule SHALL enforce a unique constraint on the combination of groupId and userId at the database level
2. WHEN an add member request would create a duplicate membership, THE MembershipsModule SHALL reject the request with HTTP status 409
3. WHEN a duplicate membership is rejected, THE MembershipsModule SHALL return an error message indicating the user is already a member

### Requirement 6: Service Layer Testing

**User Story:** As a developer, I want comprehensive unit tests for the service layer, so that I can verify business logic correctness.

#### Acceptance Criteria

1. THE MembershipsModule SHALL include unit tests for the addMember service method
2. THE MembershipsModule SHALL include unit tests for the removeMember service method
3. THE MembershipsModule SHALL include unit tests for the listMembers service method
4. THE MembershipsModule SHALL include unit tests for duplicate membership prevention
5. THE MembershipsModule SHALL include unit tests for Active_Group validation
6. THE MembershipsModule SHALL include unit tests that verify all error conditions return appropriate error types
7. THE MembershipsModule SHALL include unit tests that achieve at least 80 percent code coverage for the service layer

### Requirement 7: Request Validation

**User Story:** As a developer, I want all API requests validated using class-validator, so that invalid data is rejected before processing.

#### Acceptance Criteria

1. WHEN a request is received, THE MembershipsModule SHALL validate all required fields are present
2. WHEN a request is received, THE MembershipsModule SHALL validate field types match expected types
3. WHEN a request is received with a walletAddress field, THE MembershipsModule SHALL validate it is a non-empty string
4. WHEN a request is received with a userId field, THE MembershipsModule SHALL validate it is a valid uuid
5. WHEN a request is received with a groupId field, THE MembershipsModule SHALL validate it is a valid uuid
6. WHEN validation fails, THE MembershipsModule SHALL return descriptive error messages with HTTP status 400

### Requirement 8: Logging and Error Handling

**User Story:** As a system operator, I want all membership operations logged, so that I can audit and troubleshoot issues.

#### Acceptance Criteria

1. WHEN a membership operation begins, THE MembershipsModule SHALL log the operation type and parameters using Winston logger
2. WHEN a membership operation succeeds, THE MembershipsModule SHALL log the success with relevant entity identifiers
3. WHEN a membership operation fails, THE MembershipsModule SHALL log the error with context information
4. WHEN an unexpected error occurs, THE MembershipsModule SHALL return HTTP status 500 with a generic error message
5. WHEN an unexpected error occurs, THE MembershipsModule SHALL log the full error details for debugging
