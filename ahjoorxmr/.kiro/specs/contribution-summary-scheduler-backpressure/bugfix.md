# Bugfix Requirements Document

## Introduction

The contribution summary scheduler (`scheduler/services/contribution-summary.service.ts`) loads all contributions for every active group in a single unbounded TypeORM `find()` call, performs all aggregation in the JS heap via `Array.reduce`, and provides no memory cap, no progress reporting, and no circuit breaker. As the dataset grows this causes out-of-memory pod crashes, holds a long-running database query lock for the full duration, and leaves OOM failures undetected until the process restarts. This fix introduces cursor-based batched pagination, database-side aggregation, per-batch BullMQ progress reporting, and a configurable heap-usage guard.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the scheduler runs against a large contributions dataset THEN the system loads all matching rows into the JS heap in a single query, causing out-of-memory crashes.

1.2 WHEN the scheduler computes group totals THEN the system performs all summation in-memory via JavaScript reduction instead of delegating to the database, amplifying heap pressure.

1.3 WHEN the scheduler is processing contributions THEN the system holds a single long-running database query lock for the entire dataset duration, blocking other queries.

1.4 WHEN the scheduler job is running THEN the system emits no incremental progress updates, so the Background Job Dashboard shows no real-time completion percentage.

1.5 WHEN heap usage exceeds a safe threshold during processing THEN the system has no circuit breaker and continues allocating memory until the process is killed by the OOM killer.

1.6 WHEN an OOM event occurs THEN the system provides no structured alert log or webhook notification, leaving the failure undetected until the pod restarts.

### Expected Behavior (Correct)

2.1 WHEN the scheduler runs against a large contributions dataset THEN the system SHALL process contributions in configurable-size batches (default 500, controlled by `SUMMARY_BATCH_SIZE`) and release each batch reference before loading the next, keeping heap usage bounded.

2.2 WHEN the scheduler computes group totals THEN the system SHALL use database-side `GROUP BY` and `SUM` aggregations via TypeORM `QueryBuilder`, returning only scalar results to the application layer.

2.3 WHEN the scheduler processes each batch THEN the system SHALL issue a short-lived, scoped query per batch so that no single database query lock spans the full dataset.

2.4 WHEN the scheduler completes each batch THEN the system SHALL call `job.updateProgress()` with the current completion percentage so the Background Job Dashboard reflects real-time progress.

2.5 WHEN heap usage after a batch exceeds the `SCHEDULER_MAX_HEAP_MB` threshold (default 512 MB) THEN the system SHALL pause processing, emit a structured JSON alert log at `error` level, and optionally POST the alert payload to a configured `SCHEDULER_MEMORY_ALERT_WEBHOOK` URL.

2.6 WHEN `SUMMARY_BATCH_SIZE` or `SCHEDULER_MAX_HEAP_MB` are set as environment variables THEN the system SHALL use those values instead of the hardcoded defaults.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the scheduler runs against a dataset that fits within the heap threshold THEN the system SHALL CONTINUE TO generate correct contribution summaries for all active groups.

3.2 WHEN a group has no contributions in the current week THEN the system SHALL CONTINUE TO produce a summary with zero totals for that group without error.

3.3 WHEN the scheduler completes successfully THEN the system SHALL CONTINUE TO call `sendSummariesToMembers` with the generated summaries.

3.4 WHEN the distributed lock is not acquired THEN the system SHALL CONTINUE TO skip the task and log a warning without processing any data.

3.5 WHEN the scheduler task fails after all retry attempts THEN the system SHALL CONTINUE TO propagate the error so the retry/alerting infrastructure can handle it.

3.6 WHEN `SUMMARY_BATCH_SIZE` and `SCHEDULER_MAX_HEAP_MB` are not set THEN the system SHALL CONTINUE TO operate using the documented default values (500 and 512 respectively).
