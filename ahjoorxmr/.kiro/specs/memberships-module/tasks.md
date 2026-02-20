# Implementation Plan: Memberships Module

## Overview

This plan implements a NestJS module for managing ROSCA group memberships with full CRUD operations, validation, error handling, and comprehensive testing. The implementation follows the existing project patterns (HealthModule) and leverages global infrastructure (ValidationPipe, HttpExceptionFilter, LoggingInterceptor, Winston logger).

## Tasks

- [x] 1. Create membership entity and enum
  - [x] 1.1 Create MembershipStatus enum
    - Create `src/memberships/entities/membership-status.enum.ts` with ACTIVE, SUSPENDED, REMOVED values
    - Export enum for use in entity and DTOs
    - _Requirements: 1.8_
  
  - [x] 1.2 Create Membership entity with TypeORM decorators
    - Create `src/memberships/entities/membership.entity.ts`
    - Define all fields: id (uuid), groupId (uuid), userId (uuid), walletAddress (string), payoutOrder (number), hasReceivedPayout (boolean), hasPaidCurrentRound (boolean), status (enum), createdAt, updatedAt
    - Add @Unique(['groupId', 'userId']) decorator for duplicate prevention
    - Add indexes on groupId and userId for query performance
    - Add ManyToOne relationships to Group and User entities with JoinColumn
    - Set appropriate default values (status=ACTIVE, booleans=false)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 5.1_

- [x] 2. Create DTOs with validation
  - [x] 2.1 Create CreateMembershipDto
    - Create `src/memberships/dto/create-membership.dto.ts`
    - Add userId field with @IsUUID() and @IsNotEmpty() decorators
    - Add walletAddress field with @IsString(), @IsNotEmpty(), @MinLength(1) decorators
    - _Requirements: 2.1, 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 2.2 Create MembershipResponseDto
    - Create `src/memberships/dto/membership-response.dto.ts`
    - Define all response fields matching entity structure
    - Use string type for dates (ISO 8601 format)
    - _Requirements: 2.6, 4.3_

- [x] 3. Implement service layer with business logic
  - [x] 3.1 Create MembershipsService with repository injection
    - Create `src/memberships/memberships.service.ts`
    - Inject Membership repository, Group repository, and Winston logger
    - Add @Injectable() decorator
    - _Requirements: 2.1, 3.1, 4.1, 8.1_
  
  - [x] 3.2 Implement addMember method
    - Validate group exists and is not active (throw BadRequestException if active)
    - Check for duplicate membership (throw ConflictException if exists)
    - Calculate next available payoutOrder using getNextPayoutOrder helper
    - Create Membership with status=ACTIVE, hasReceivedPayout=false, hasPaidCurrentRound=false
    - Save to database and return created membership
    - Add logging for operation start, success, and errors
    - Handle database errors (unique constraint, foreign key violations)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 5.2, 5.3, 8.1, 8.2, 8.3_
  
  - [x] 3.3 Implement removeMember method
    - Validate group exists and is not active (throw BadRequestException if active)
    - Find membership by groupId and userId
    - Throw NotFoundException if membership doesn't exist
    - Delete membership from database
    - Add logging for operation start, success, and errors
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 8.1, 8.2, 8.3_
  
  - [x] 3.4 Implement listMembers method
    - Query all memberships for groupId ordered by payoutOrder ASC
    - Return array (empty if no members or group doesn't exist)
    - Add logging for operation start and success with member count
    - _Requirements: 4.1, 4.2, 4.5, 8.1, 8.2_
  
  - [x] 3.5 Implement private helper methods
    - Create validateGroupNotActive method to check group status
    - Create getNextPayoutOrder method to calculate next position (max + 1, or 0 if first)
    - _Requirements: 2.3, 2.7, 3.4_

- [x] 4. Implement controller layer with REST endpoints
  - [x] 4.1 Create MembershipsController with service injection
    - Create `src/memberships/memberships.controller.ts`
    - Add @Controller('api/v1/groups') decorator
    - Inject MembershipsService
    - _Requirements: 2.1, 3.1, 4.1_
  
  - [x] 4.2 Implement POST /api/v1/groups/:id/members endpoint
    - Add @Post(':id/members') decorator
    - Add @HttpCode(HttpStatus.CREATED) decorator
    - Use @Param('id', ParseUUIDPipe) for groupId validation
    - Use @Body() with CreateMembershipDto for request validation
    - Call service.addMember and return MembershipResponseDto
    - _Requirements: 2.1, 2.6, 7.5_
  
  - [x] 4.3 Implement DELETE /api/v1/groups/:id/members/:userId endpoint
    - Add @Delete(':id/members/:userId') decorator
    - Add @HttpCode(HttpStatus.NO_CONTENT) decorator
    - Use @Param('id', ParseUUIDPipe) and @Param('userId', ParseUUIDPipe) for validation
    - Call service.removeMember
    - _Requirements: 3.1, 3.3, 7.5_
  
  - [x] 4.4 Implement GET /api/v1/groups/:id/members endpoint
    - Add @Get(':id/members') decorator
    - Use @Param('id', ParseUUIDPipe) for groupId validation
    - Call service.listMembers and return array of MembershipResponseDto
    - _Requirements: 4.1, 4.4, 7.5_

- [x] 5. Create and configure MembershipsModule
  - [x] 5.1 Create module definition
    - Create `src/memberships/memberships.module.ts`
    - Import TypeOrmModule.forFeature([Membership, Group, User])
    - Declare MembershipsController
    - Provide MembershipsService
    - Export MembershipsService for use by other modules
    - _Requirements: All requirements (module integration)_
  
  - [x] 5.2 Register MembershipsModule in AppModule
    - Add MembershipsModule to imports array in `src/app.module.ts`
    - Ensure TypeORM is configured with Membership entity
    - _Requirements: All requirements (module integration)_

- [x] 6. Checkpoint - Verify basic functionality
  - Ensure all files compile without errors
  - Verify module loads successfully
  - Ask user if questions arise before proceeding to tests

- [x] 7. Write unit tests for service layer
  - [x] 7.1 Set up test infrastructure
    - Create `src/memberships/__tests__/memberships.service.spec.ts`
    - Set up Jest test module with mocked repositories and logger
    - Create mock factories for Membership, Group entities
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ]* 7.2 Write unit tests for addMember method
    - Test successful member addition with correct initialization
    - Test active group rejection (BadRequestException)
    - Test duplicate membership rejection (ConflictException)
    - Test payout order calculation (first member = 0, subsequent = max + 1)
    - Test database error handling (unique constraint, foreign key violations)
    - Test logging calls for success and error cases
    - _Requirements: 6.1, 6.4, 6.5, 6.6_
  
  - [ ]* 7.3 Write unit tests for removeMember method
    - Test successful member removal
    - Test active group rejection (BadRequestException)
    - Test non-existent membership (NotFoundException)
    - Test logging calls for success and error cases
    - _Requirements: 6.2, 6.5, 6.6_
  
  - [ ]* 7.4 Write unit tests for listMembers method
    - Test successful listing with multiple members
    - Test empty array for non-existent group
    - Test ordering by payoutOrder ascending
    - Test logging calls
    - _Requirements: 6.3, 6.6_
  
  - [ ]* 7.5 Verify code coverage meets 80% threshold
    - Run Jest with coverage flag
    - Ensure service layer achieves minimum 80% coverage
    - _Requirements: 6.7_

- [x] 8. Write property-based tests using fast-check
  - [x] 8.1 Set up property test infrastructure
    - Create `src/memberships/__tests__/memberships.service.properties.spec.ts`
    - Import fast-check library
    - Create custom arbitraries (uuidArb, walletAddressArb, membershipStatusArb, groupArb, membershipArb)
    - Set up test module with mocked repositories
    - _Requirements: All requirements (property validation)_
  
  - [ ]* 8.2 Write property test for new membership initialization (Property 1)
    - **Property 1: New membership initialization**
    - **Validates: Requirements 2.2, 2.4, 2.5**
    - Test that any valid add member request creates membership with status=ACTIVE, hasReceivedPayout=false, hasPaidCurrentRound=false
    - Use fc.property with uuidArb, walletAddressArb
    - Run 100 iterations
  
  - [ ]* 8.3 Write property test for sequential payout order (Property 2)
    - **Property 2: Sequential payout order assignment**
    - **Validates: Requirements 2.3**
    - Test that adding member to group with N members assigns payoutOrder=N
    - Use fc.property with groupArb and fc.array(membershipArb)
    - Run 100 iterations
  
  - [ ]* 8.4 Write property test for successful response (Property 3)
    - **Property 3: Successful member addition response**
    - **Validates: Requirements 2.6**
    - Test that valid add member request returns membership with all fields including generated id
    - Use fc.property with uuidArb, walletAddressArb
    - Run 100 iterations
  
  - [ ]* 8.5 Write property test for active group rejection (Property 4)
    - **Property 4: Active group modification rejection**
    - **Validates: Requirements 2.7, 3.4**
    - Test that add/remove requests to active groups throw BadRequestException
    - Use fc.property with active groupArb
    - Run 100 iterations
  
  - [ ]* 8.6 Write property test for invalid request rejection (Property 5)
    - **Property 5: Invalid request rejection**
    - **Validates: Requirements 2.1, 2.8, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**
    - Test that requests with missing fields, invalid types, empty walletAddress, or invalid UUIDs are rejected
    - Use fc.property with invalid input generators
    - Run 100 iterations
  
  - [ ]* 8.7 Write property test for membership deletion (Property 6)
    - **Property 6: Membership deletion completeness**
    - **Validates: Requirements 3.2, 3.3**
    - Test that valid remove request deletes membership from database
    - Use fc.property with membershipArb
    - Run 100 iterations
  
  - [ ]* 8.8 Write property test for non-existent removal (Property 7)
    - **Property 7: Non-existent membership removal**
    - **Validates: Requirements 3.5**
    - Test that removing non-existent membership throws NotFoundException
    - Use fc.property with uuidArb
    - Run 100 iterations
  
  - [ ]* 8.9 Write property test for complete list retrieval (Property 8)
    - **Property 8: Complete member list retrieval**
    - **Validates: Requirements 4.1, 4.3**
    - Test that listing members returns all N members with all required fields
    - Use fc.property with fc.array(membershipArb)
    - Run 100 iterations
  
  - [ ]* 8.10 Write property test for list ordering (Property 9)
    - **Property 9: Member list ordering**
    - **Validates: Requirements 4.2**
    - Test that list members returns members sorted by payoutOrder ascending
    - Use fc.property with fc.array(membershipArb)
    - Run 100 iterations
  
  - [ ]* 8.11 Write property test for list response status (Property 10)
    - **Property 10: Successful list response status**
    - **Validates: Requirements 4.4**
    - Test that valid list request returns HTTP 200 (verify at controller level)
    - Use fc.property with uuidArb
    - Run 100 iterations
  
  - [ ]* 8.12 Write property test for duplicate prevention (Property 11)
    - **Property 11: Duplicate membership prevention**
    - **Validates: Requirements 5.2, 5.3**
    - Test that adding duplicate membership throws ConflictException with appropriate message
    - Use fc.property with membershipArb
    - Run 100 iterations
  
  - [ ]* 8.13 Write property test for add-then-list consistency (Property 12)
    - **Property 12: Add-then-list consistency**
    - **Validates: Requirements 2.2, 4.1**
    - Test that after adding member, listing includes that member
    - Use fc.property with uuidArb, walletAddressArb
    - Run 100 iterations
  
  - [ ]* 8.14 Write property test for remove-then-list consistency (Property 13)
    - **Property 13: Remove-then-list consistency**
    - **Validates: Requirements 3.2, 4.1**
    - Test that after removing member, listing excludes that member
    - Use fc.property with membershipArb
    - Run 100 iterations

- [x] 9. Write integration tests
  - [ ]* 9.1 Set up integration test infrastructure
    - Create `src/memberships/__tests__/memberships.integration.spec.ts`
    - Configure test database (in-memory SQLite or test PostgreSQL)
    - Set up NestJS testing module with real database connection
    - Create test data seeding utilities
    - _Requirements: All requirements (end-to-end validation)_
  
  - [ ]* 9.2 Write integration tests for complete request-response cycle
    - Test POST /api/v1/groups/:id/members with validation pipe
    - Test DELETE /api/v1/groups/:id/members/:userId with validation pipe
    - Test GET /api/v1/groups/:id/members with validation pipe
    - Test exception filter responses for all error conditions
    - Test database persistence and retrieval
    - Verify logging output
    - _Requirements: All requirements (end-to-end validation)_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Run all unit tests, property tests, and integration tests
  - Verify code coverage meets requirements
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end functionality with real infrastructure
- The implementation follows existing NestJS patterns from HealthModule
- Global infrastructure (ValidationPipe, HttpExceptionFilter, LoggingInterceptor) is already configured
- TypeORM configuration and Group/User entities are assumed to exist
