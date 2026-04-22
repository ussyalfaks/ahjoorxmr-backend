# Bugfix Requirements Document

## Introduction

`disbursePayout()` in `PayoutService` submits an on-chain Stellar transaction without first recording intent to the database. If the process crashes after `server.sendTransaction()` returns but before the `payout_transactions` row is updated to `SUBMITTED`, the system has no record that the broadcast occurred. A subsequent retry call for the same `payoutOrderId` will submit a second on-chain transaction, paying the recipient twice. This document captures the defective behavior, the correct behavior, and the existing behavior that must be preserved.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `disbursePayout()` is called for a `payoutOrderId` that has no existing `payout_transactions` record THEN the system calls `server.sendTransaction()` before any database row exists, leaving no durable record of the broadcast intent

1.2 WHEN the process crashes after `server.sendTransaction()` returns but before the `payout_transactions` row is updated to `SUBMITTED` THEN the system has no record that the transaction was broadcast, so the next retry call for the same `payoutOrderId` submits a second on-chain transaction

1.3 WHEN a `payout_transactions` row exists in `SUBMITTED` status but the process restarts THEN the system has no background mechanism to resolve the final on-chain state, leaving the record permanently stuck in `SUBMITTED`

### Expected Behavior (Correct)

2.1 WHEN `disbursePayout()` is called for a `payoutOrderId` that has no existing record THEN the system SHALL insert a `payout_transactions` row with status `PENDING_SUBMISSION` before calling `server.sendTransaction()`

2.2 WHEN a `payout_transactions` row already exists for the given `payoutOrderId` THEN the system SHALL return the current state of that record without submitting a new on-chain transaction, preventing duplicate payouts

2.3 WHEN `server.sendTransaction()` returns successfully THEN the system SHALL update the `payout_transactions` row to `SUBMITTED` with the real `txHash`

2.4 WHEN a `payout_transactions` row is in `SUBMITTED` status THEN the system SHALL enqueue a BullMQ reconciliation job that polls the Stellar RPC and transitions the record to `CONFIRMED` or `FAILED` with exponential back-off (max 5 retries)

2.5 WHEN the process crashes after broadcast but before the status update and then restarts THEN the system SHALL detect the `PENDING_SUBMISSION` row with a non-null `txHash` and the reconciliation job SHALL resolve the correct final state

2.6 WHEN the reconciliation job confirms the on-chain transaction THEN the system SHALL transition the `payout_transactions` row to `CONFIRMED`

2.7 WHEN the reconciliation job detects an on-chain failure THEN the system SHALL transition the `payout_transactions` row to `FAILED`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `disbursePayout()` is called for a valid group and round where no payout has been attempted THEN the system SHALL CONTINUE TO submit the on-chain transaction and return the transaction hash

3.2 WHEN a group member has already received their payout (`hasReceivedPayout = true`) THEN the system SHALL CONTINUE TO reject the request with a `ConflictException`

3.3 WHEN the group does not exist THEN the system SHALL CONTINUE TO throw a `NotFoundException`

3.4 WHEN the group is not in `ACTIVE` status THEN the system SHALL CONTINUE TO throw a `BadRequestException`

3.5 WHEN the Stellar RPC call fails with no prior broadcast THEN the system SHALL CONTINUE TO mark the `payout_transactions` row as `FAILED` and throw a `BadGatewayException`

3.6 WHEN a `payout_transactions` row exists in `SUBMITTED` status and `disbursePayout()` is called again for the same `payoutOrderId` THEN the system SHALL CONTINUE TO re-enqueue the reconciliation job and return the existing `txHash` without a second broadcast

3.7 WHEN the BullMQ reconciliation job is registered THEN the system SHALL CONTINUE TO expose it in the Background Job Dashboard with status and last-run timestamp
