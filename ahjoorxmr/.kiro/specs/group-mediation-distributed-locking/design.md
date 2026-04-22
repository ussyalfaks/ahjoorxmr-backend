# Group Mediation Distributed Locking Bugfix Design

## Overview

`GroupSyncProcessor.handleSyncGroupState` (in
`src/bullmq/group-sync.processor.ts`) runs mediation logic for a group without
any mutual exclusion across horizontally scaled instances. When a scheduled
trigger and an on-demand trigger fire simultaneously for the same group, both
workers acquire no lock, execute the full mediation path concurrently, and
produce duplicate state transitions, duplicate notifications, and potential
double-payouts.

The fix wraps the mediation body in a `redlock` distributed lock keyed on
`mediation:group:{groupId}`, acquired via the already-global `RedlockService`.
A second defence layer deduplicates at enqueue time using BullMQ's `jobId:
groupId` option (already present in `QueueService.addSyncGroupState`). Lock TTL
is configurable via `MEDIATION_LOCK_TTL_MS` (default 30 000 ms). When the lock
is unavailable the processor returns `{ status: 'SKIPPED' }` without throwing,
so BullMQ does not retry the skipped job.

The implementation is already present in the codebase. This design document
formalises the bug condition, correctness properties, and testing strategy to
validate that the fix is correct and introduces no regressions.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — two or more
  `handleSyncGroupState` executions for the same `groupId` run concurrently
  without a distributed lock, allowing both to enter the mediation body
  simultaneously.
- **Property (P)**: The desired behavior when the bug condition holds — exactly
  one execution acquires `mediation:group:{groupId}` and proceeds; all others
  return `{ status: 'SKIPPED' }` immediately.
- **Preservation**: Existing behaviors that must remain unchanged — solo-job
  execution, independent processing of different groups, no-throw on SKIPPED,
  `RedlockService` API contract, and non-mediation group-sync job behavior.
- **handleSyncGroupState**: The private method in `GroupSyncProcessor`
  (`src/bullmq/group-sync.processor.ts`) that syncs on-chain state for a single
  group and is the sole entry point for mediation logic.
- **RedlockService**: The global service at
  `src/common/redis/redlock.service.ts` that wraps the `redlock` npm package;
  exposes `acquire(resourceKey, ttlMs): Promise<Lock | null>` and
  `release(lock): Promise<void>`.
- **lockKey**: The Redis key used to represent the per-group lock:
  `mediation:group:{groupId}`.
- **lockTtlMs**: The lock TTL in milliseconds, read from `MEDIATION_LOCK_TTL_MS`
  (default: `Math.ceil(MEDIATION_MAX_EXPECTED_DURATION_MS * 1.2)`, where
  `MEDIATION_MAX_EXPECTED_DURATION_MS` defaults to 25 000 ms, giving a default
  TTL of 30 000 ms).
- **SKIPPED**: The return value `{ status: 'SKIPPED' }` emitted when the lock
  cannot be acquired; signals BullMQ not to retry.

## Bug Details

### Fault Condition

The bug manifests when two or more BullMQ workers call `handleSyncGroupState`
with the same `groupId` at overlapping times. Because no lock is acquired before
entering the mediation body, both workers read the same group state, apply the
same transitions, and emit the same notifications and payouts.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input — { executions: Array<{ groupId: string, startTime: number, endTime: number }> }
  OUTPUT: boolean

  // The bug triggers when at least two executions for the same groupId overlap in time
  // AND no distributed lock prevents concurrent entry into the mediation body.
  FOR EACH pair (a, b) IN input.executions WHERE a.groupId = b.groupId AND a ≠ b DO
    IF a.startTime < b.endTime AND b.startTime < a.endTime THEN
      RETURN true   // overlapping executions for the same group
    END IF
  END FOR
  RETURN false
END FUNCTION
```

### Examples

- **Scheduled + on-demand race (bug triggers)**: Instance A processes a
  scheduled `SYNC_GROUP_STATE` job for `groupId=42` at T=0. Instance B receives
  an on-demand trigger for the same group at T=50 ms. Without a lock, both
  enter the mediation body, read the same on-chain state, and both call
  `groupRepository.save(group)` — producing duplicate state transitions.
- **Two scheduled instances race (bug triggers)**: A horizontal scale-out event
  causes two workers to dequeue the same job (BullMQ stall recovery). Both
  execute `handleSyncGroupState` for `groupId=7` concurrently, resulting in
  duplicate payout notifications.
- **Different groups concurrent (no bug)**: Instance A processes `groupId=1`
  while Instance B processes `groupId=2`. Their lock keys are distinct; no
  interference occurs.
- **Solo execution (no bug)**: A single worker processes `groupId=99` with no
  competing job. The lock is acquired, mediation runs, and the lock is released
  normally.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- A solo `handleSyncGroupState` execution for any `groupId` must continue to
  acquire the lock, execute the full mediation body (DB read, on-chain state
  fetch, conditional save), and release the lock, returning `{ status: 'PROCESSED' }`.
- Concurrent `handleSyncGroupState` executions for **different** `groupId`
  values must continue to run independently without interference, as their lock
  keys are distinct.
- When the lock is unavailable, the processor must return `{ status: 'SKIPPED' }`
  without throwing, so BullMQ does not schedule a retry for the skipped job.
- `RedlockService.acquire` and `RedlockService.release` must continue to expose
  the same method signatures and behavior for all existing consumers.
- `handleSyncAllGroups` (the `SYNC_ALL_GROUPS` job handler) must continue to
  dispatch `SYNC_GROUP_STATE` jobs in batches without acquiring any mediation
  lock itself.

**Scope:**
All inputs that do NOT involve concurrent same-group executions (i.e., where
`isBugCondition` returns false) must be completely unaffected by this fix. This
includes:
- Solo mediation runs for any group
- Concurrent runs for distinct groups
- `SYNC_ALL_GROUPS` batch dispatch jobs
- All other BullMQ queues (email, event-sync, payout-reconciliation, dead-letter)

## Hypothesized Root Cause

Based on reading the current implementation and the bug description:

1. **Missing lock acquisition before mediation body**: The original
   `handleSyncGroupState` had no call to `redlockService.acquire` before
   entering the DB read / on-chain fetch / save sequence. Any number of workers
   could execute the full body concurrently for the same group.

2. **No enqueue-time deduplication for bulk-dispatched jobs**: `handleSyncAllGroups`
   calls `groupSyncQueue.addBulk` without setting `jobId` on each job, so
   multiple scheduled runs could enqueue duplicate `SYNC_GROUP_STATE` jobs for
   the same group. (`QueueService.addSyncGroupState` already sets `jobId:
   groupId` for on-demand enqueues, but the bulk path bypasses this.)

3. **No finally-block lock release**: Without a `try/finally` wrapper, any
   exception thrown inside the mediation body would leave the lock held until
   TTL expiry, blocking all subsequent legitimate runs for that group.

4. **Non-configurable lock TTL**: A hardcoded TTL would be inappropriate for
   environments where mediation takes longer or shorter than the default
   estimate, making the lock either expire too early (allowing re-entry) or
   hold too long (blocking legitimate runs).

## Correctness Properties

Property 1: Fault Condition - Mutual Exclusion for Same-Group Mediation

_For any_ input where the bug condition holds (isBugCondition returns true —
i.e., two or more `handleSyncGroupState` executions for the same `groupId`
overlap in time), the fixed processor SHALL allow exactly one execution to
acquire `mediation:group:{groupId}` and proceed to the mediation body, while
all other concurrent executions SHALL return `{ status: 'SKIPPED' }` without
entering the mediation body, without throwing, and without triggering a BullMQ
retry.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Solo and Different-Group Executions Unaffected

_For any_ input where the bug condition does NOT hold (isBugCondition returns
false — i.e., no concurrent same-group executions exist), the fixed
`handleSyncGroupState` SHALL produce the same observable result as the original
function: acquiring the lock, executing the full mediation body, releasing the
lock in a `finally` block, and returning `{ status: 'PROCESSED' }`, preserving
all existing group-sync behavior for non-racing inputs.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, the following changes are needed.
Note: the lock acquisition, `try/finally` release, and `SKIPPED` return are
already present in the current `group-sync.processor.ts`. The items below
describe what was added and what still needs verification.

**File**: `src/bullmq/group-sync.processor.ts`

**Function**: `handleSyncGroupState`

**Specific Changes**:

1. **Acquire redlock before mediation body**: Call
   `this.redlockService.acquire(`mediation:group:${groupId}`, lockTtlMs)` as
   the first operation. If `acquire` returns `null` (lock unavailable), log a
   warning and return `{ status: 'SKIPPED' }` immediately.

2. **Wrap mediation body in try/finally**: Place the entire DB read, on-chain
   fetch, and conditional save inside a `try` block. In the `finally` block,
   call `this.redlockService.release(lock)` unconditionally, guaranteeing
   release on both success and error paths.

3. **Read lock TTL from ConfigService**: Read `MEDIATION_LOCK_TTL_MS` via
   `this.configService.get<string>('MEDIATION_LOCK_TTL_MS', String(Math.ceil(maxExpectedDurationMs * 1.2)))`,
   where `maxExpectedDurationMs` is read from `MEDIATION_MAX_EXPECTED_DURATION_MS`
   (default 25 000 ms), yielding a default TTL of 30 000 ms.

4. **Add jobId deduplication to bulk dispatch**: In `handleSyncAllGroups`, add
   `jobId: g.id` to each job's `opts` inside the `addBulk` call, so that
   bulk-dispatched jobs are also deduplicated at enqueue time, consistent with
   `QueueService.addSyncGroupState`.

5. **Add `MEDIATION_LOCK_TTL_MS` to `.env.example`**: Document the new env var
   with its default value so operators can tune it per environment.

**File**: `ahjoorxmr/.env.example`

**Specific Changes**:

1. **Add `MEDIATION_LOCK_TTL_MS=30000`** with a comment explaining it controls
   the distributed lock TTL for group mediation jobs.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples
that demonstrate the bug on unfixed code, then verify the fix works correctly
and preserves existing behavior.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing
the fix. Confirm or refute the root cause analysis. If we refute, we will need
to re-hypothesize.

**Test Plan**: Write unit tests that mock `RedlockService.acquire` to always
return a valid lock (simulating no contention), then invoke
`handleSyncGroupState` twice concurrently for the same `groupId` and assert
that `groupRepository.save` is called twice. Run these tests on the UNFIXED
code (before lock acquisition was added) to observe the duplicate-save behavior.

**Test Cases**:
1. **Concurrent same-group execution test**: Invoke `handleSyncGroupState` twice
   in parallel for `groupId=1` with no lock guard; assert `groupRepository.save`
   is called twice (will demonstrate the bug on unfixed code).
2. **Duplicate enqueue test**: Call `groupSyncQueue.addBulk` with two jobs for
   the same `groupId` without `jobId`; assert two jobs exist in the queue (will
   demonstrate the missing deduplication on the bulk path).
3. **No finally-release test**: Mock the mediation body to throw; assert that
   without a `try/finally`, `redlockService.release` is never called (will
   demonstrate the lock-leak on unfixed code).
4. **Hardcoded TTL test**: Verify that without `ConfigService` integration, the
   TTL passed to `acquire` is a hardcoded constant rather than the env-var value
   (may demonstrate the non-configurability issue).

**Expected Counterexamples**:
- `groupRepository.save` is called more than once for the same group when two
  executions run concurrently.
- Possible causes: missing `redlockService.acquire` call, missing `try/finally`
  for release, missing `jobId` on bulk-dispatched jobs.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed
processor produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  results := runConcurrently(handleSyncGroupState_fixed, input.executions)
  ASSERT count(results WHERE status = 'PROCESSED') = 1
  ASSERT count(results WHERE status = 'SKIPPED') = len(input.executions) - 1
  ASSERT groupRepository.save.callCount <= 1
  ASSERT redlockService.release.callCount = len(input.executions)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the
fixed processor produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleSyncGroupState_original(input) = handleSyncGroupState_fixed(input)
  ASSERT groupRepository.save.callCount_original = groupRepository.save.callCount_fixed
  ASSERT redlockService.acquire.callCount = 1
  ASSERT redlockService.release.callCount = 1
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation
checking because:
- It generates many random `groupId` and group-state combinations automatically.
- It catches edge cases (group not found, no on-chain state, unchanged state)
  that manual unit tests might miss.
- It provides strong guarantees that solo-execution behavior is identical for
  all non-racing inputs.

**Test Plan**: Observe the return value and side effects of `handleSyncGroupState`
on the fixed code for solo executions, then write property-based tests asserting
the same outcomes across randomly generated group states.

**Test Cases**:
1. **Solo execution preservation**: For any `groupId` with no competing job,
   verify the processor returns `{ status: 'PROCESSED' }` and
   `redlockService.release` is called exactly once.
2. **Different-group independence**: For any two distinct `groupId` values run
   concurrently, verify both return `{ status: 'PROCESSED' }` and neither
   interferes with the other's lock.
3. **Error-path lock release**: When the mediation body throws, verify
   `redlockService.release` is still called (finally block) and the error
   propagates to BullMQ for retry handling.
4. **SKIPPED does not throw**: When `acquire` returns `null`, verify the
   processor returns `{ status: 'SKIPPED' }` without throwing.

### Unit Tests

- Test that when `redlockService.acquire` returns `null`, `handleSyncGroupState`
  returns `{ status: 'SKIPPED' }` and `groupRepository.findOne` is never called.
- Test that when `redlockService.acquire` returns a lock and the mediation body
  throws, `redlockService.release` is still called exactly once.
- Test that `lockTtlMs` is read from `ConfigService` with key
  `MEDIATION_LOCK_TTL_MS` and defaults to `Math.ceil(25000 * 1.2) = 30000`.
- Test that `lockKey` is formatted as `mediation:group:{groupId}` for any
  `groupId` value.
- Test that `handleSyncAllGroups` does not call `redlockService.acquire` (lock
  is per-job, not per-batch).
- Test that `QueueService.addSyncGroupState` passes `jobId: data.groupId` in
  job options, preventing duplicate enqueues.

### Property-Based Tests

- Generate random `groupId` strings and verify that the lock key passed to
  `redlockService.acquire` is always `mediation:group:${groupId}`.
- Generate random pairs of distinct `groupId` values and verify that concurrent
  executions for different groups both return `{ status: 'PROCESSED' }` without
  interfering with each other's lock acquisition.
- Generate random group state objects (varying `current_round`, `status`) and
  verify that a solo `handleSyncGroupState` execution always calls
  `redlockService.release` exactly once, regardless of whether the group state
  changed.
- Generate random `MEDIATION_LOCK_TTL_MS` values (positive integers) and verify
  that the value passed to `redlockService.acquire` matches the configured value.

### Integration Tests

- Test the full `handleSyncGroupState` flow with a mocked `RedlockService` that
  simulates lock contention: verify one job returns `PROCESSED` and the other
  returns `SKIPPED`.
- Test that when `addSyncGroupState` is called twice for the same `groupId`,
  BullMQ deduplication (via `jobId`) results in only one job in the queue.
- Test that switching between `SYNC_GROUP_STATE` and `SYNC_ALL_GROUPS` job
  types in the processor routes correctly and that `SYNC_ALL_GROUPS` is
  unaffected by the mediation lock.
