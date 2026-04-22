# Stellar Payout Idempotency Bugfix Design

## Overview

`disbursePayout()` in `PayoutService` (`src/groups/payout.service.ts`) submits an on-chain
Stellar transaction before any durable record of the broadcast intent exists in the database.
If the process crashes in the window between `server.sendTransaction()` returning and the
`payout_transactions` row being updated to `SUBMITTED`, a subsequent retry will submit a
second on-chain transaction, paying the recipient twice.

The fix introduces a write-ahead log pattern: a `PENDING_SUBMISSION` row is inserted before
the RPC call, the computed `txHash` is stored via the `onBeforeSubmit` callback (already
wired in the current code), and a BullMQ reconciliation job resolves any row left in an
intermediate state after a crash. Idempotency is enforced by checking for an existing
`payout_transactions` row keyed on `payoutOrderId` before any broadcast.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `disbursePayout()` is called
  for a `payoutOrderId` that has no existing `payout_transactions` row, causing
  `server.sendTransaction()` to be invoked before any durable record of the broadcast exists.
- **Property (P)**: The desired behavior when the bug condition holds — a `PENDING_SUBMISSION`
  row must be persisted before `server.sendTransaction()` is called, so that any crash leaves
  a recoverable record.
- **Preservation**: All existing behaviors for inputs that do NOT trigger the bug condition
  must remain unchanged after the fix.
- **disbursePayout**: `StellarService.disbursePayout()` in `src/stellar/stellar.service.ts` —
  builds, prepares, and submits the Soroban contract call; accepts an `onBeforeSubmit` callback
  that fires with the computed hash before `server.sendTransaction()`.
- **distributePayout**: `PayoutService.distributePayout()` in `src/groups/payout.service.ts` —
  orchestrates group/membership validation, idempotency check, DB writes, and RPC call.
- **payoutOrderId**: Composite key `"${groupId}:${round}"` used as the unique idempotency key
  in `payout_transactions`.
- **PayoutTransactionStatus**: Enum with values `PENDING_SUBMISSION`, `SUBMITTED`,
  `CONFIRMED`, `FAILED`.
- **onBeforeSubmit callback**: Optional hook in `StellarService.disbursePayout()` that is
  called with the computed `txHash` before `server.sendTransaction()` fires, enabling the
  caller to persist the hash durably before the broadcast.
- **ReconcilePayoutJob**: BullMQ job on `payout-reconciliation-queue` that polls
  `StellarService.getTransactionStatus()` and transitions a `payout_transactions` row to
  `CONFIRMED` or `FAILED`.

## Bug Details

### Fault Condition

The bug manifests when `distributePayout()` is called for a `payoutOrderId` that has no
existing `payout_transactions` record. In the current (unfixed) code path, the function
calls `server.sendTransaction()` before any DB row exists. If the process crashes after the
RPC returns but before the row is saved, the next retry has no record of the prior broadcast
and submits a second transaction.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { groupId: string, round: number }
  OUTPUT: boolean

  payoutOrderId := buildPayoutOrderId(input.groupId, input.round)
  existingRow   := payout_transactions.findOne({ payoutOrderId })

  RETURN existingRow IS NULL
         AND group.status = ACTIVE
         AND membership.hasReceivedPayout = false
         AND membership EXISTS for (groupId, round - 1)
END FUNCTION
```

### Examples

- **Duplicate payout on crash**: `distributePayout("group-1", 2)` is called. No
  `payout_transactions` row exists. `server.sendTransaction()` returns `"hash-abc"`. Process
  crashes before the row is saved. Next retry calls `server.sendTransaction()` again →
  recipient receives two payouts.
- **Stuck SUBMITTED row**: A `SUBMITTED` row exists but the process restarts before the
  reconciliation job is enqueued. The row stays `SUBMITTED` indefinitely with no background
  resolution.
- **Normal first-time payout (non-bug)**: `distributePayout("group-1", 1)` is called, no
  existing row, group is ACTIVE, membership is valid. Expected: one broadcast, row transitions
  `PENDING_SUBMISSION → SUBMITTED`, reconciliation job enqueued.
- **Idempotent re-call on SUBMITTED (non-bug)**: `distributePayout("group-1", 2)` is called
  when a `SUBMITTED` row already exists. Expected: no second broadcast, reconciliation job
  re-enqueued, existing `txHash` returned.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- A first-time valid payout call must still submit the on-chain transaction and return the
  transaction hash (requirement 3.1).
- When `membership.hasReceivedPayout = true`, the function must still throw `ConflictException`
  (requirement 3.2).
- When the group does not exist, the function must still throw `NotFoundException`
  (requirement 3.3).
- When the group is not `ACTIVE`, the function must still throw `BadRequestException`
  (requirement 3.4).
- When the Stellar RPC call fails with no prior broadcast, the `payout_transactions` row must
  still be marked `FAILED` and a `BadGatewayException` must still be thrown (requirement 3.5).
- When a `SUBMITTED` row already exists and `distributePayout()` is called again, the
  reconciliation job must still be re-enqueued and the existing `txHash` returned without a
  second broadcast (requirement 3.6).
- The `payout-reconciliation-queue` must remain registered in the Background Job Dashboard
  (requirement 3.7).

**Scope:**
All inputs where `isBugCondition` returns `false` — i.e., a `payout_transactions` row already
exists, or the group/membership preconditions fail — must be completely unaffected by this fix.

## Hypothesized Root Cause

Based on the bug description and code review of `src/groups/payout.service.ts`:

1. **Missing write-ahead record**: The current code creates the `PayoutTransaction` entity and
   saves it with `PENDING_SUBMISSION` status before calling `stellarService.disbursePayout()`.
   However, the `onBeforeSubmit` callback (which stores the computed hash) is only called
   inside `disbursePayout()` after the transaction is built but before `sendTransaction()`.
   If the process crashes between `sendTransaction()` returning and the subsequent
   `payoutTransaction.status = SUBMITTED` save, the row remains `PENDING_SUBMISSION` with a
   `txHash` — which is actually the recoverable state. The reconciliation processor already
   handles `PENDING_SUBMISSION` rows with a non-null `txHash` (see
   `payout-reconciliation.processor.ts` lines 40-46). The gap is that the `pollUnconfirmedPayouts`
   cron and the on-startup reconciliation path may not be reliably triggered.

2. **No startup reconciliation sweep**: On process restart, there is no explicit startup hook
   that enqueues reconciliation jobs for all `PENDING_SUBMISSION` rows with a non-null `txHash`.
   The `pollUnconfirmedPayouts` cron runs every 5 minutes, so a crashed row could be stuck for
   up to 5 minutes, and only if the cron fires correctly.

3. **Idempotency check is present but the crash window is real**: The idempotency check
   (`existingPayoutTransaction` lookup) is already implemented. The bug window is specifically
   the gap between `sendTransaction()` returning and the `SUBMITTED` save — the `onBeforeSubmit`
   callback mitigates this by storing the hash before broadcast, but the reconciliation
   triggering on restart needs to be verified.

4. **SUBMITTED row re-enqueue path**: Requirement 3.6 states that a re-call on a `SUBMITTED`
   row must re-enqueue the reconciliation job. This path exists in the current code but needs
   test coverage to confirm it is not broken by the fix.

## Correctness Properties

Property 1: Fault Condition - Write-Ahead Record Before Broadcast

_For any_ input where the bug condition holds (isBugCondition returns true — no existing
`payout_transactions` row, group ACTIVE, membership valid), the fixed `distributePayout`
function SHALL persist a `payout_transactions` row with status `PENDING_SUBMISSION` to the
database before `server.sendTransaction()` is invoked, ensuring a durable record of broadcast
intent exists even if the process crashes immediately after the RPC call returns.

**Validates: Requirements 2.1**

Property 2: Preservation - Idempotency for Existing Records

_For any_ input where a `payout_transactions` row already exists for the given `payoutOrderId`
(isBugCondition returns false because existingRow IS NOT NULL), the fixed `distributePayout`
function SHALL NOT call `server.sendTransaction()` and SHALL return the existing record's state,
preserving the duplicate-prevention behavior.

**Validates: Requirements 2.2, 3.6**

## Fix Implementation

### Changes Required

The current implementation in `src/groups/payout.service.ts` already contains most of the
correct structure. Based on root cause analysis, the primary gaps are test coverage and
ensuring the startup reconciliation path is reliable.

**File**: `src/groups/payout.service.ts`

**Function**: `distributePayout`

**Specific Changes**:

1. **Verify write-ahead save order**: Confirm that `payoutTransactionRepository.save(payoutTransaction)`
   with `PENDING_SUBMISSION` status is called and awaited before `stellarService.disbursePayout()`
   is invoked. This is already present in the current code but must be validated by tests.

2. **Verify onBeforeSubmit callback**: Confirm that the `onBeforeSubmit` callback correctly
   persists the computed `txHash` to the DB before `server.sendTransaction()` fires. This
   ensures crash recovery is possible via the reconciliation processor.

3. **Startup reconciliation sweep**: Add an `OnApplicationBootstrap` lifecycle hook (or verify
   the existing `pollUnconfirmedPayouts` cron covers it) that enqueues reconciliation jobs for
   all `PENDING_SUBMISSION` rows with a non-null `txHash` on process startup, closing the
   crash-recovery gap.

4. **Idempotency path test coverage**: Ensure the existing idempotency check (return early if
   `existingPayoutTransaction` is found) is covered by tests for all status variants
   (`PENDING_SUBMISSION`, `SUBMITTED`, `CONFIRMED`, `FAILED`).

5. **Error path — no txHash**: Confirm that when `stellarService.disbursePayout()` throws
   before any hash is computed (i.e., `payoutTransaction.txHash` is still null), the row is
   correctly transitioned to `FAILED`.

**File**: `src/bullmq/payout-reconciliation.processor.ts`

**Specific Changes**:

6. **PENDING_SUBMISSION + txHash path**: The processor already handles this case (lines 40-46).
   Verify with tests that a `PENDING_SUBMISSION` row with a non-null `txHash` is correctly
   resolved to `CONFIRMED` or `FAILED` by the reconciliation job.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that
demonstrate the bug on unfixed code, then verify the fix works correctly and preserves
existing behavior.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix.
Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that spy on `payoutTransactionRepository.save` and
`stellarService.disbursePayout` (or `server.sendTransaction`) to assert the order of
operations. Run these tests on the UNFIXED code to observe whether the DB write precedes
the RPC call.

**Test Cases**:
1. **Write-ahead order test**: Call `distributePayout` for a new `payoutOrderId`; assert that
   `payoutTransactionRepository.save` with `PENDING_SUBMISSION` is called before
   `stellarService.disbursePayout` (will fail on unfixed code if order is wrong).
2. **Crash simulation test**: Simulate a crash by making `disbursePayout` throw after the
   `onBeforeSubmit` callback fires; assert the row has `PENDING_SUBMISSION` status and a
   non-null `txHash` (will fail on unfixed code if hash is not persisted pre-broadcast).
3. **Duplicate broadcast test**: Call `distributePayout` twice for the same `payoutOrderId`
   with no existing row on the first call; assert `disbursePayout` is called exactly once
   (will fail on unfixed code if idempotency check is missing).
4. **SUBMITTED re-call test**: Call `distributePayout` when a `SUBMITTED` row exists; assert
   `disbursePayout` is NOT called and reconciliation job IS enqueued (may fail on unfixed code).

**Expected Counterexamples**:
- `disbursePayout` is called before the `PENDING_SUBMISSION` row is saved.
- Possible causes: incorrect save ordering, missing `await`, callback not firing before RPC.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function
produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := distributePayout_fixed(input.groupId, input.round)
  ASSERT payout_transactions row with PENDING_SUBMISSION was saved BEFORE sendTransaction
  ASSERT payout_transactions row transitions to SUBMITTED after success
  ASSERT reconciliation job is enqueued with correct payoutTransactionId
  ASSERT result = txHash
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function
produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT distributePayout_original(input) = distributePayout_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain.
- It catches edge cases that manual unit tests might miss.
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs.

**Test Plan**: Observe behavior on UNFIXED code first for existing-record scenarios and
precondition-failure scenarios, then write property-based tests capturing that behavior.

**Test Cases**:
1. **ConflictException preservation**: For any input where `membership.hasReceivedPayout = true`,
   verify `ConflictException` is still thrown after the fix.
2. **NotFoundException preservation**: For any input where the group does not exist, verify
   `NotFoundException` is still thrown.
3. **BadRequestException preservation**: For any input where group status is not `ACTIVE`,
   verify `BadRequestException` is still thrown.
4. **SUBMITTED idempotency preservation**: For any input where a `SUBMITTED` row exists,
   verify no second broadcast occurs and the reconciliation job is re-enqueued.
5. **RPC failure preservation**: For any input where `disbursePayout` throws with no prior
   hash, verify the row is marked `FAILED` and `BadGatewayException` is thrown.

### Unit Tests

- Test that `payoutTransactionRepository.save` with `PENDING_SUBMISSION` is called before
  `stellarService.disbursePayout` for a new `payoutOrderId`.
- Test that the `onBeforeSubmit` callback persists the `txHash` before `sendTransaction`.
- Test idempotency for all four `PayoutTransactionStatus` variants.
- Test the `SUBMITTED` re-call path re-enqueues the reconciliation job.
- Test the reconciliation processor handles `PENDING_SUBMISSION` + non-null `txHash` correctly.

### Property-Based Tests

- Generate random `(groupId, round)` pairs and verify that for any first-time call, the
  write-ahead save always precedes the RPC call.
- Generate random existing `payout_transactions` records and verify that `disbursePayout` is
  never called when a record already exists.
- Generate random precondition-failure inputs (missing group, wrong status, already-paid
  membership) and verify the correct exception is always thrown.

### Integration Tests

- Test full `distributePayout` flow: new payout → `PENDING_SUBMISSION` → `SUBMITTED` →
  reconciliation job enqueued → `CONFIRMED`.
- Test crash recovery: insert a `PENDING_SUBMISSION` row with a non-null `txHash`, trigger
  `pollUnconfirmedPayouts`, verify reconciliation job is enqueued and resolves to `CONFIRMED`.
- Test that the `payout-reconciliation-queue` appears in the Background Job Dashboard endpoint.
