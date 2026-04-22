# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Fault Condition** - In-Heap Row Accumulation
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the unbounded heap accumulation bug
  - **Scoped PBT Approach**: Scope the property to a concrete failing case — a single group with 10 000 contributions — to ensure reproducibility
  - Mock `contributionRepository.createQueryBuilder` to return `totalContributions = 10000` and a paginated `getMany()` that yields batches of 500 rows
  - Assert that after `generateWeeklySummaries` returns, the fixed code does NOT accumulate a `contributions[]` array of 10 000 entries (i.e., `getMany` is never called and no row-level array grows proportional to row count)
  - On UNFIXED code: the `contributions.push(...batch)` loop will accumulate all 10 000 rows — test FAILS, confirming the bug
  - Also assert that the heap guard (`heapUsedMb > maxHeapMb`) does not fire after rows are already accumulated (late-guard counterexample)
  - Document counterexamples found (e.g., "contributions[] has 10 000 entries after generateWeeklySummaries — full row set loaded into heap")
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Correct Summaries for Small Datasets
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (groups with 1–499 contributions, zero-contribution groups)
  - Observe: `generateWeeklySummaries([group with 5 contributions])` returns `{ totalContributions: 5, totalAmount: "<sum>", memberCount: <n> }` on unfixed code
  - Observe: `generateWeeklySummaries([group with 0 contributions])` returns `{ totalContributions: 0, totalAmount: "0" }` on unfixed code
  - Write property-based tests: for any group with 0–499 contributions, the fixed function returns the same `totalContributions`, `totalAmount`, and `memberCount` as the unfixed function
  - Write property-based tests: generate random arrays of 0–20 groups with 0–499 contributions each; assert scalar summary values match mocked DB aggregates
  - Also assert `sendSummariesToMembers` is called with the result array after `generateWeeklySummaries` returns
  - Also assert that when `SUMMARY_BATCH_SIZE` and `SCHEDULER_MAX_HEAP_MB` are absent, defaults of 500 and 512 are used
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.6_

- [x] 3. Fix for unbounded heap accumulation in generateWeeklySummaries

  - [x] 3.1 Implement the fix
    - Remove the `contributions[]` local array and all `contributions.push(...batch)` calls from `generateWeeklySummaries`
    - Replace the `while (offset < totalContributions)` paginated `getMany()` loop with a single `getRawOne()` call using `COUNT(*) AS totalContributions, SUM(amount) AS totalAmount` per group via TypeORM `QueryBuilder`
    - Move the heap-guard check (`process.memoryUsage().heapUsed`) to fire after each group's aggregate query, before any large allocation can occur
    - Retain per-group progress reporting: call `job.updateProgress(Math.round((processedGroups / totalGroups) * 100))` after each group
    - Retain env-var configuration: read `SUMMARY_BATCH_SIZE` (default 500) and `SCHEDULER_MAX_HEAP_MB` (default 512) from `ConfigService`
    - When heap threshold is exceeded: emit a structured JSON object at `error` log level and optionally POST to `SCHEDULER_MEMORY_ALERT_WEBHOOK`
    - _Bug_Condition: isBugCondition(input) — any group whose contributionsPerGroup[i] * AVG_ROW_BYTES > maxHeapMb * 1024 * 1024_
    - _Expected_Behavior: generateWeeklySummaries returns correct ContributionSummary[] using only DB-side GROUP BY / SUM, without accumulating individual rows in the JS heap_
    - _Preservation: Correct summaries for small datasets, zero-total for empty groups, sendSummariesToMembers invocation, distributed-lock skip, error propagation, default env-var values_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - In-Heap Row Accumulation
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 asserts that `getMany` is never called and no `contributions[]` array grows proportional to row count
    - When this test passes, it confirms the fixed code uses DB-side aggregation only
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Correct Summaries for Small Datasets
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in summary correctness, sendSummariesToMembers invocation, and default env-var handling)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
