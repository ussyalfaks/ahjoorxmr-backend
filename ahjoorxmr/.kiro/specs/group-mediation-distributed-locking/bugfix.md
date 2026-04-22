# Bugfix Requirements Document

## Introduction

Concurrent scheduled and on-demand mediation triggers for the same group run without any distributed lock across horizontally scaled instances. This causes duplicate notifications, duplicate state transitions, and potential double-payouts. The fix introduces a Redis distributed lock (via redlock) keyed on `mediation:group:{groupId}`, BullMQ enqueue-time deduplication using `{ jobId: groupId }`, and a configurable lock TTL via `MEDIATION_LOCK_TTL_MS`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN two or more horizontally scaled instances simultaneously trigger mediation for the same group THEN the system processes both jobs concurrently without any mutual exclusion, causing duplicate state transitions and duplicate notifications.

1.2 WHEN a scheduled mediation trigger and an on-demand mediation trigger fire for the same group at the same time THEN the system enqueues and executes both jobs independently, risking double-payouts.

1.3 WHEN a mediation job is enqueued for a group that already has a pending job in the queue THEN the system enqueues a second identical job, resulting in redundant processing.

1.4 WHEN a mediation job holds a lock and encounters an error THEN the system may fail to release the lock, leaving it held until TTL expiry and blocking subsequent legitimate runs.

1.5 WHEN the lock TTL is not configurable THEN the system uses a hardcoded duration that may be inappropriate for different deployment environments.

### Expected Behavior (Correct)

2.1 WHEN two or more instances simultaneously trigger mediation for the same group THEN the system SHALL allow only one instance to acquire the `mediation:group:{groupId}` redlock, while all others log a warning and mark their jobs as SKIPPED without retrying.

2.2 WHEN a scheduled and an on-demand mediation trigger fire for the same group at the same time THEN the system SHALL ensure only one executes mediation logic while the other is SKIPPED via the distributed lock.

2.3 WHEN a mediation job is enqueued for a group that already has a pending job in the queue THEN the system SHALL deduplicate at enqueue time using `{ jobId: groupId }` so only one job exists in the queue at a time.

2.4 WHEN a mediation job completes or errors THEN the system SHALL release the redlock in a `finally` block, guaranteeing release on both success and error paths.

2.5 WHEN the `MEDIATION_LOCK_TTL_MS` environment variable is set THEN the system SHALL use that value as the lock TTL; when it is absent THEN the system SHALL default to 30000 ms.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a mediation job runs without any concurrent competing job for the same group THEN the system SHALL CONTINUE TO acquire the lock, execute full mediation logic, and release the lock normally.

3.2 WHEN mediation jobs for different group IDs run concurrently THEN the system SHALL CONTINUE TO process each independently without interference, as their lock keys are distinct.

3.3 WHEN a mediation job is SKIPPED due to lock unavailability THEN the system SHALL CONTINUE TO not throw an error, ensuring BullMQ does not retry the skipped job.

3.4 WHEN the `RedlockService` is injected into other services THEN the system SHALL CONTINUE TO expose `acquire` and `release` methods with the same signatures, preserving existing consumers.

3.5 WHEN group state sync jobs unrelated to mediation locking are enqueued THEN the system SHALL CONTINUE TO process them with existing retry and backoff behavior unchanged.
