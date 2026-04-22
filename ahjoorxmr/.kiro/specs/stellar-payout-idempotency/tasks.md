# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Fault Condition** - Write-Ahead Record Before Broadcast
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing case — `distributePayout` called for a new `payoutOrderId` (no existing `payout_transactions` row, group ACTIVE, membership valid)
  - Spy on `payoutTransactionRepository.save` and `stellarService.disbursePayout` (or `server.sendTransaction`) to capture call order
  - Assert that `payoutTransactionRepository.save` with status `PENDING_SUBMISSION` is called BEFORE `stellarService.disbursePayout` is invoked
  - Simulate crash by making `disbursePayout` throw after `onBeforeSubmit` fires; assert the row has `PENDING_SUBMISSION` status and a non-null `txHash`
  - Call `distributePayout` twice for the same `payoutOrderId` with no existing row on the first call; assert `disbursePayout` is called exactly once
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g., "`disbursePayout` is called before `PENDING_SUBMISSION` row is saved", "second call triggers a second broadcast")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Idempotency for Existing Records and Precondition Guards
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `distributePayout` with `membership.hasReceivedPayout = true` throws `ConflictException` on unfixed code
  - Observe: `distributePayout` with non-existent group throws `NotFoundException` on unfixed code
  - Observe: `distributePayout` with group status not `ACTIVE` throws `BadRequestException` on unfixed code
  - Observe: `distributePayout` when a `SUBMITTED` row exists does NOT call `disbursePayout` and re-enqueues reconciliation job on unfixed code
  - Observe: `distributePayout` when `disbursePayout` throws with no prior hash marks row `FAILED` and throws `BadGatewayException` on unfixed code
  - Write property-based tests: for all inputs where `isBugCondition` returns false (existing row, or precondition failure), the fixed function produces the same result as the original
  - Generate random precondition-failure inputs (missing group, wrong status, already-paid membership) and verify the correct exception is always thrown
  - Generate random existing `payout_transactions` records (any status) and verify `disbursePayout` is never called
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix for stellar payout idempotency — write-ahead record and startup reconciliation

  - [x] 3.1 Implement the fix in `src/groups/payout.service.ts`
    - Verify (and correct if needed) that `payoutTransactionRepository.save(payoutTransaction)` with `PENDING_SUBMISSION` status is called and awaited before `stellarService.disbursePayout()` is invoked
    - Verify that the `onBeforeSubmit` callback correctly persists the computed `txHash` to the DB before `server.sendTransaction()` fires, enabling crash recovery via the reconciliation processor
    - Confirm the existing idempotency check (`existingPayoutTransaction` lookup keyed on `payoutOrderId`) returns early for all status variants (`PENDING_SUBMISSION`, `SUBMITTED`, `CONFIRMED`, `FAILED`) without calling `disbursePayout`
    - Confirm the `SUBMITTED` re-call path re-enqueues the reconciliation job and returns the existing `txHash` without a second broadcast
    - Confirm that when `disbursePayout` throws before any hash is computed (`payoutTransaction.txHash` is still null), the row is correctly transitioned to `FAILED` and `BadGatewayException` is thrown
    - _Bug_Condition: isBugCondition(input) where no `payout_transactions` row exists for `payoutOrderId`, group.status = ACTIVE, membership.hasReceivedPayout = false_
    - _Expected_Behavior: `PENDING_SUBMISSION` row persisted before `server.sendTransaction()` fires; row transitions to `SUBMITTED` with real `txHash` on success; reconciliation job enqueued_
    - _Preservation: All inputs where isBugCondition returns false must produce identical behavior to the original function_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Add startup reconciliation sweep
    - Add an `OnApplicationBootstrap` lifecycle hook (or verify `pollUnconfirmedPayouts` cron covers it) that enqueues reconciliation jobs for all `PENDING_SUBMISSION` rows with a non-null `txHash` on process startup
    - This closes the crash-recovery gap where a row could be stuck for up to 5 minutes waiting for the cron
    - _Requirements: 2.4, 2.5_

  - [x] 3.3 Verify reconciliation processor handles `PENDING_SUBMISSION` + non-null `txHash` in `src/bullmq/payout-reconciliation.processor.ts`
    - Confirm the processor's existing path (lines 40-46) correctly polls `StellarService.getTransactionStatus()` and transitions the row to `CONFIRMED` or `FAILED`
    - Add tests if coverage is missing
    - _Requirements: 2.5, 2.6, 2.7_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Write-Ahead Record Before Broadcast
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the `PENDING_SUBMISSION` row is persisted before `server.sendTransaction()` and idempotency is enforced
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Idempotency for Existing Records and Precondition Guards
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all precondition guards (`ConflictException`, `NotFoundException`, `BadRequestException`) still fire correctly
    - Confirm `SUBMITTED` re-call still re-enqueues reconciliation job without second broadcast

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite (`payout.service.spec.ts`, `payout-reconciliation.processor.spec.ts`, and any integration tests)
  - Ensure all tests pass; ask the user if questions arise
  - Confirm the `payout-reconciliation-queue` is still registered in the Background Job Dashboard (requirement 3.7)
