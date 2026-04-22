# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Fault Condition** - Concurrent Same-Group Mediation Without Lock
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing case — two concurrent `handleSyncGroupState` calls for the same `groupId` with no lock guard
  - Create test file at `src/bullmq/__tests__/group-sync.bug-condition.spec.ts`
  - Mock `RedlockService.acquire` to always return a valid lock object (simulating no contention guard — the unfixed state)
  - Invoke `handleSyncGroupState` twice in parallel for the same `groupId` (e.g., `groupId=1`)
  - Assert that `groupRepository.save` is called **at most once** (this assertion WILL FAIL on unfixed code, proving the bug)
  - Also assert that only one execution returns `{ status: 'PROCESSED' }` and the other returns `{ status: 'SKIPPED' }`
  - Document the counterexample found: e.g., `groupRepository.save` called twice for `groupId=1` when two workers race
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Solo and Different-Group Executions Unaffected
  - **IMPORTANT**: Follow observation-first methodology
  - Create test file at `src/bullmq/__tests__/group-sync.preservation.spec.ts`
  - Observe: a solo `handleSyncGroupState` call for any `groupId` returns `{ status: 'PROCESSED' }` on unfixed code
  - Observe: `redlockService.acquire` is called once and `redlockService.release` is called once for a solo run
  - Observe: two concurrent calls for **different** `groupId` values both return `{ status: 'PROCESSED' }` without interfering
  - Write property-based test (using `fast-check` or equivalent): for any `groupId` string with no competing job, `handleSyncGroupState` returns `{ status: 'PROCESSED' }` and `release` is called exactly once
  - Write property-based test: for any two distinct `groupId` values run concurrently, both return `{ status: 'PROCESSED' }` and neither lock key interferes with the other
  - Write property-based test: for any random `MEDIATION_LOCK_TTL_MS` positive integer, the value passed to `acquire` matches the configured value
  - Verify all tests PASS on UNFIXED code (baseline behavior confirmed)
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix group mediation distributed locking

  - [x] 3.1 Inject `RedlockService` and `ConfigService` into `GroupSyncProcessor`
    - In `src/bullmq/group-sync.processor.ts`, add `RedlockService` and `ConfigService` to the constructor
    - `RedisModule` is already `@Global()` and exports `RedlockService` — no module import needed
    - Import `ConfigService` from `@nestjs/config`
    - _Bug_Condition: isBugCondition(input) — two or more `handleSyncGroupState` executions for the same `groupId` overlap in time with no lock_
    - _Requirements: 2.1, 2.5_

  - [x] 3.2 Acquire distributed lock in `handleSyncGroupState` and wrap body in `try/finally`
    - Read `lockTtlMs` via `this.configService.get<string>('MEDIATION_LOCK_TTL_MS', '30000')` and parse to integer
    - Compute `lockKey = \`mediation:group:${groupId}\``
    - Call `const lock = await this.redlockService.acquire(lockKey, lockTtlMs)` as the first operation
    - If `lock` is `null`, log a warning and return `{ status: 'SKIPPED' }` immediately — do NOT throw
    - Wrap the entire mediation body (DB read, on-chain fetch, conditional save) in a `try` block
    - In the `finally` block, call `await this.redlockService.release(lock)` unconditionally
    - _Bug_Condition: isBugCondition(input) — concurrent same-group executions enter mediation body without mutual exclusion_
    - _Expected_Behavior: exactly one execution acquires `mediation:group:{groupId}` and proceeds; all others return `{ status: 'SKIPPED' }` without throwing_
    - _Preservation: solo runs continue to acquire lock, execute full mediation body, release lock, and return `{ status: 'PROCESSED' }`_
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 3.1, 3.3_

  - [x] 3.3 Add `jobId` deduplication to `handleSyncAllGroups` bulk dispatch
    - In `handleSyncAllGroups`, locate the `groupSyncQueue.addBulk(...)` call
    - Add `jobId: g.id` to each job's `opts` object so bulk-dispatched jobs are deduplicated at enqueue time
    - This makes the bulk path consistent with `QueueService.addSyncGroupState` which already sets `jobId: data.groupId`
    - _Bug_Condition: isBugCondition — bulk dispatch enqueues duplicate `SYNC_GROUP_STATE` jobs for the same group without `jobId`_
    - _Expected_Behavior: only one `SYNC_GROUP_STATE` job per `groupId` exists in the queue at any time_
    - _Preservation: `handleSyncAllGroups` continues to dispatch jobs in batches without acquiring any mediation lock itself_
    - _Requirements: 2.3, 3.5_

  - [x] 3.4 Add `MEDIATION_LOCK_TTL_MS` to `.env.example`
    - In `ahjoorxmr/.env.example`, add `MEDIATION_LOCK_TTL_MS=30000` with a comment explaining it controls the distributed lock TTL for group mediation jobs
    - _Requirements: 2.5_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Concurrent Same-Group Mediation Without Lock
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (at most one `save`, one PROCESSED, one SKIPPED)
    - Run `src/bullmq/__tests__/group-sync.bug-condition.spec.ts` on the FIXED code
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Solo and Different-Group Executions Unaffected
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `src/bullmq/__tests__/group-sync.preservation.spec.ts` on the FIXED code
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation properties still hold after the fix

- [x] 4. Write integration test for concurrent same-group triggers
  - Create test file at `src/bullmq/__tests__/group-sync.integration.spec.ts`
  - Use a mocked `RedlockService` that simulates real lock contention: first `acquire` call returns a lock, second returns `null`
  - Trigger two concurrent `handleSyncGroupState` calls for the same `groupId`
  - Assert one returns `{ status: 'PROCESSED' }` and the other returns `{ status: 'SKIPPED' }`
  - Assert `groupRepository.save` is called at most once
  - Assert `redlockService.release` is called exactly once (only the lock-holder releases)
  - Also test: calling `addSyncGroupState` twice for the same `groupId` results in only one job in the queue (BullMQ `jobId` deduplication)
  - Also test: `SYNC_ALL_GROUPS` job routing is unaffected — `handleSyncAllGroups` dispatches batch jobs without calling `redlockService.acquire`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.5_

- [x] 5. Checkpoint — Ensure all tests pass
  - Run the full test suite for `src/bullmq/__tests__/`
  - Confirm `group-sync.bug-condition.spec.ts` passes (bug fixed)
  - Confirm `group-sync.preservation.spec.ts` passes (no regressions)
  - Confirm `group-sync.integration.spec.ts` passes (end-to-end scenario)
  - Ensure all tests pass; ask the user if questions arise
