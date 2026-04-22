# Contribution Summary Scheduler Backpressure Bugfix Design

## Overview

`ContributionSummaryService.generateWeeklySummaries` (in
`src/scheduler/services/contribution-summary.service.ts`) accumulates every
matching `Contribution` row into a JS-heap array before returning. On large
datasets this causes OOM pod crashes, holds a long-running DB query lock, and
produces no real-time progress signal. The fix replaces the in-heap accumulation
with cursor-based batched pagination, delegates all aggregation to the database
via `GROUP BY / SUM`, reports per-batch BullMQ progress, and adds a configurable
heap-usage circuit breaker with optional webhook alerting.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — the scheduler
  loads all `Contribution` rows for a group into the JS heap in a single
  unbounded query, causing OOM when the dataset is large.
- **Property (P)**: The desired behavior when the bug condition holds — the
  scheduler must process contributions in bounded batches, delegate aggregation
  to the DB, and never accumulate the full row set in the heap.
- **Preservation**: Existing behaviors that must remain unchanged — correct
  summary generation for small datasets, zero-total handling for empty groups,
  `sendSummariesToMembers` invocation, distributed-lock skip logic, error
  propagation, and default env-var values.
- **generateWeeklySummaries**: The method in
  `src/scheduler/services/contribution-summary.service.ts` that produces
  `ContributionSummary[]` for all active groups over the past week.
- **batchSize**: The number of rows fetched per DB round-trip, controlled by
  `SUMMARY_BATCH_SIZE` (default 500).
- **maxHeapMb**: The heap-usage ceiling in MB, controlled by
  `SCHEDULER_MAX_HEAP_MB` (default 512).
- **ProgressJob**: The optional BullMQ job handle passed to
  `generateWeeklySummaries`; its `updateProgress(n)` method is called after
  each batch.

## Bug Details

### Fault Condition

The bug manifests when `generateWeeklySummaries` is called against a group
whose contribution count for the past week is large enough that loading all
rows into the `contributions[]` array exhausts available heap. The function
fetches aggregate counts correctly via `QueryBuilder`, but then re-fetches the
full row set in a paginated loop and pushes every row into an in-memory array
that is never released until the method returns.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input — { groups: Group[], contributionsPerGroup: number[] }
  OUTPUT: boolean

  // The bug triggers when any group has enough contributions that
  // accumulating them all in the heap would exceed the safe threshold.
  FOR EACH i IN 0..groups.length-1 DO
    IF contributionsPerGroup[i] * AVG_ROW_BYTES > maxHeapMb * 1024 * 1024 THEN
      RETURN true
    END IF
  END FOR
  RETURN false
END FUNCTION
```

### Examples

- **Large group (bug triggers)**: A group with 200 000 contribution rows.
  Current code fetches all 200 000 rows in 400 batches of 500 and pushes each
  into `contributions[]`. The array grows to ~200 000 objects before the method
  returns, exhausting heap and killing the pod.
- **Medium group (bug triggers at scale)**: 50 active groups each with 20 000
  rows. The `contributions[]` arrays for all groups are live simultaneously
  during `Promise.all`-style processing, multiplying heap pressure.
- **Small group (no crash, but still wasteful)**: A group with 100 rows. The
  bug condition does not trigger an OOM, but the full row set is still loaded
  unnecessarily instead of using DB-side aggregation.
- **Empty group (edge case)**: A group with 0 contributions this week. The
  `while` loop never executes; a zero-total summary is returned correctly even
  in the unfixed code.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Correct contribution summaries (totalContributions, totalAmount, memberCount)
  must be generated for all active groups when the dataset fits within the heap
  threshold.
- Groups with zero contributions in the current week must produce a summary
  with `totalContributions: 0` and `totalAmount: "0"` without error.
- After `generateWeeklySummaries` returns, `sendSummariesToMembers` must be
  called with the resulting summaries array.
- When the distributed lock is not acquired, `handleContributionSummaries` must
  skip processing and log a warning — no change to this path.
- When the task fails after all retry attempts, the error must propagate so the
  retry/alerting infrastructure can handle it.
- When `SUMMARY_BATCH_SIZE` and `SCHEDULER_MAX_HEAP_MB` are absent from the
  environment, the service must use defaults of 500 and 512 respectively.

**Scope:**
All inputs that do NOT involve a large contributions dataset (i.e., where
`isBugCondition` returns false) must be completely unaffected by this fix. This
includes:
- Scheduler invocations against small datasets
- The distributed-lock acquisition and release path
- The `sendSummariesToMembers` method
- All other scheduler tasks (audit-log archival, group-status updates, etc.)

## Hypothesized Root Cause

Based on reading the current implementation:

1. **In-heap row accumulation**: The `contributions` local array inside
   `generateWeeklySummaries` is populated with every row returned by the
   paginated `getMany()` loop. Although `batch.length = 0` is called after each
   batch, the rows have already been spread into `contributions` via
   `contributions.push(...batch)`, so the heap reference is not released.

2. **Redundant double-query pattern**: The method first runs a `COUNT/SUM`
   aggregate query to get `totalContributions`, then runs a second paginated
   loop to fetch the actual rows. The aggregate result is sufficient for the
   summary; the row-level data is only needed if callers consume individual
   contribution details, which `sendSummariesToMembers` does not.

3. **No early-exit on heap breach**: The `heapUsedMb > maxHeapMb` check exists
   but only fires after a batch has already been pushed into `contributions[]`,
   meaning the guard triggers too late when rows are large.

4. **Progress denominator computed from a pre-pass**: The first loop over
   `groups` computes `totalRows` via aggregate queries, but the result is only
   used for progress percentage. This pre-pass is correct but adds an extra
   round-trip per group before processing begins.

## Correctness Properties

Property 1: Fault Condition - Bounded Heap During Summary Generation

_For any_ input where the bug condition holds (isBugCondition returns true —
i.e., at least one group has a contribution count large enough to exhaust heap
if fully loaded), the fixed `generateWeeklySummaries` function SHALL return
correct `ContributionSummary` objects using only DB-side `GROUP BY / SUM`
aggregation, without accumulating individual contribution rows in the JS heap,
and SHALL halt processing and emit a structured error-level JSON log if heap
usage after any batch exceeds `SCHEDULER_MAX_HEAP_MB`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.5**

Property 2: Preservation - Correct Summaries for Non-Buggy Inputs

_For any_ input where the bug condition does NOT hold (isBugCondition returns
false — i.e., all groups have small enough contribution counts to fit safely in
heap), the fixed `generateWeeklySummaries` function SHALL produce the same
`ContributionSummary` values (groupId, groupName, totalContributions,
totalAmount, memberCount) as the original function, preserving correctness for
all small-dataset scheduler runs.

**Validates: Requirements 3.1, 3.2, 3.6**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct:

**File**: `src/scheduler/services/contribution-summary.service.ts`

**Function**: `generateWeeklySummaries`

**Specific Changes**:

1. **Remove the `contributions[]` accumulation array**: Delete the
   `contributions` local array and all `contributions.push(...)` calls. The
   `ContributionSummary` interface's `contributions` field should be removed or
   left empty — callers only consume `totalContributions`, `totalAmount`, and
   `memberCount`.

2. **Replace the paginated row-fetch loop with a single DB-side aggregate**:
   The existing `while (offset < totalContributions)` loop that calls
   `getMany()` must be replaced with a single `getRawOne()` call using
   `COUNT(*) / SUM(amount)` per group. This eliminates the need to fetch any
   row-level data.

3. **Retain the heap-guard check after the aggregate call**: After computing
   the aggregate for each group, check `process.memoryUsage().heapUsed` and
   trigger the circuit breaker (structured error log + optional webhook POST)
   if the threshold is exceeded. This check now fires before any large
   allocation rather than after.

4. **Retain per-group progress reporting**: After processing each group, call
   `job.updateProgress(Math.round((processedGroups / totalGroups) * 100))`.
   Progress is now group-based rather than row-based, which is simpler and
   equally informative for the dashboard.

5. **Retain env-var configuration**: `SUMMARY_BATCH_SIZE` and
   `SCHEDULER_MAX_HEAP_MB` must still be read from `ConfigService` with the
   same defaults (500 and 512). `SUMMARY_BATCH_SIZE` is no longer used for
   row pagination but can be retained for future use or removed — either is
   acceptable as long as the env-var contract is preserved.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples
that demonstrate the bug on unfixed code, then verify the fix works correctly
and preserves existing behavior.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing
the fix. Confirm or refute the root cause analysis. If we refute, we will need
to re-hypothesize.

**Test Plan**: Write unit tests that mock `contributionRepository.createQueryBuilder`
to return a large `totalContributions` count and verify that the unfixed code
attempts to allocate a `contributions[]` array proportional to that count. Run
these tests on the UNFIXED code to observe the accumulation behavior.

**Test Cases**:
1. **Large dataset accumulation test**: Mock a group with 10 000 contributions;
   assert that after `generateWeeklySummaries` the returned summary's
   `contributions` array has 10 000 entries (will pass on unfixed code,
   demonstrating the heap accumulation).
2. **Heap guard fires too late**: Mock heap usage to exceed `maxHeapMb` after
   the first batch; assert that `contributions[]` already contains `batchSize`
   entries before the guard triggers (will pass on unfixed code, demonstrating
   the late-guard problem).
3. **Progress not called on unfixed path without job**: Verify that when no
   `job` is passed, `updateProgress` is never called — this is correct on both
   versions and serves as a baseline.
4. **Zero-contribution group baseline**: Mock a group with 0 contributions;
   assert the summary has `totalContributions: 0` (should pass on both unfixed
   and fixed code — confirms preservation baseline).

**Expected Counterexamples**:
- The unfixed code accumulates all rows into `contributions[]` even when only
  aggregate totals are needed.
- Possible causes: `contributions.push(...batch)` inside the while loop,
  missing early release of the accumulated array.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed
function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := generateWeeklySummaries_fixed(input)
  ASSERT result[i].totalContributions = DB_COUNT(group_i, weekAgo)
  ASSERT result[i].totalAmount = DB_SUM(group_i, weekAgo)
  ASSERT contributions[] is empty OR absent from result
  ASSERT no single DB query fetched more than batchSize rows
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the
fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT generateWeeklySummaries_original(input).totalContributions
       = generateWeeklySummaries_fixed(input).totalContributions
  ASSERT generateWeeklySummaries_original(input).totalAmount
       = generateWeeklySummaries_fixed(input).totalAmount
  ASSERT generateWeeklySummaries_original(input).memberCount
       = generateWeeklySummaries_fixed(input).memberCount
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation
checking because:
- It generates many random group/contribution configurations automatically.
- It catches edge cases (zero contributions, single contribution, decimal
  amounts) that manual unit tests might miss.
- It provides strong guarantees that summary values are identical for all
  non-buggy inputs.

**Test Plan**: Observe the aggregate values returned by the unfixed code for
small datasets, then write property-based tests that assert the fixed code
returns identical scalar values.

**Test Cases**:
1. **Aggregate preservation**: For any group with 1–499 contributions (below
   batchSize), verify `totalContributions` and `totalAmount` match the unfixed
   output.
2. **Zero-group preservation**: For a group with 0 contributions, verify the
   summary has `totalContributions: 0` and `totalAmount: "0"`.
3. **sendSummariesToMembers still called**: After `generateWeeklySummaries`
   returns, verify `sendSummariesToMembers` is invoked with the result array.
4. **Default env-var preservation**: When `SUMMARY_BATCH_SIZE` and
   `SCHEDULER_MAX_HEAP_MB` are absent, verify the service reads defaults of
   500 and 512.

### Unit Tests

- Test that `generateWeeklySummaries` calls `getRawOne` with `COUNT(*)` and
  `SUM(amount)` per group and does not call `getMany`.
- Test that `job.updateProgress` is called with a value between 0 and 100
  after each group is processed when a job handle is provided.
- Test that when heap usage exceeds `maxHeapMb`, a structured JSON object is
  logged at `error` level and processing halts.
- Test that when `SCHEDULER_MEMORY_ALERT_WEBHOOK` is set and heap threshold is
  exceeded, a `fetch` POST is made to that URL with the alert payload.
- Test edge cases: group with 0 contributions, group with exactly `batchSize`
  contributions, multiple groups processed sequentially.

### Property-Based Tests

- Generate random arrays of groups (0–20 groups) with random contribution
  counts (0–1000 per group) and verify that the fixed function returns
  `totalContributions` equal to the mocked DB count for every group.
- Generate random `amount` strings (valid decimal numbers) and verify that
  `totalAmount` equals the sum of all amounts for the group.
- Generate random heap-usage values and verify that the circuit breaker fires
  if and only if `heapUsedMb > maxHeapMb`.

### Integration Tests

- Test the full `handleContributionSummaries` scheduler task with a real
  in-memory SQLite or mocked TypeORM data source: verify summaries are
  generated and `sendSummariesToMembers` is called.
- Test that when the distributed lock is not acquired, the task is skipped and
  no DB queries are issued.
- Test that when the task throws after all retries, the error propagates out of
  `executeWithRetry`.
