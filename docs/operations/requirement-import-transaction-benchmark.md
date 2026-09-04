# Requirement import transaction benchmark

This benchmark defines the evidence for the requirement import transaction
duration objective, lock-wait limit, row ceiling, database batch size, and
operator alerts. It measures the current implementation without changing its
production behavior.

The machine-readable baseline is
[`tests/performance/requirement-import-transaction-baseline.json`](../../tests/performance/requirement-import-transaction-baseline.json).
It contains aggregate timings and bounded database-native lock evidence only.
It contains no actor identity, requirement content, SQL text, destination
identifier, token, or raw database event.

## Reproduce the benchmark

The benchmark requires Docker and the repository dependencies from
`npm install`. Create the ignored SQL Server environment file once:

```bash
cp .env.sqlserver.example .env.sqlserver
```

Set a valid `MSSQL_SA_PASSWORD` in `.env.sqlserver`, then run:

```bash
npm run perf:requirement-import
```

The command starts an isolated SQL Server, creates a disposable benchmark
database, applies migrations and deterministic fixtures, runs the benchmark,
and removes the database, container, network, and volume in a `finally` path.
It writes the local result to
`test-results/requirement-import-transaction-benchmark/measurements.json`.

Maintainers update the checked-in baseline with:

```bash
npm run perf:requirement-import:update-baseline
```

The full reference run takes approximately 59 minutes. Reduced repetitions or
screening ranges are diagnostic only and do not qualify as baseline evidence.

## Reference environment

The baseline timestamp is `2026-09-04T19:32:18.242Z`. The host runs Linux
6.17.0-1022-azure on x86-64 with Docker 29.8.0. The runner observes 16 logical
CPUs and 64,297 MiB RAM. This exceeds the documented 8-vCPU and 16-GiB minimum
host, while the workload-bearing containers retain the production component
limits:

- application runner: 3 CPUs and 4,096 MiB RAM;
- SQL Server: 2 CPUs and 4,096 MiB RAM;
- SQL Server 2025 CU8, product version `17.0.4075.5`;
- Node.js `v24.20.0` in `node:24-bookworm`;
- one application runner and one SQL Server, with no unrelated workload.

SQL Server reports 16 logical CPUs and 3,277 MiB physical memory from inside
the container. Docker enforces the 2-CPU and 4-GiB SQL Server limits. The
application runner uses the documented 3-CPU and 4-GiB limits. These component
limits prevent the larger physical host from increasing the benchmark's
application or database allocation.

The benchmark raises the database statement timeout to 300,000 ms so the
screen can observe transactions beyond the production default of 15,000 ms.
This is measurement configuration only. The production database batch size is
50, the current import ceiling is 500 rows, and each node admits at most two
concurrent imports.

## Methodology

Every case uses deterministic synthetic data in two disposable destinations.
A light row uses scalar requirement fields. A maximum-related row references
all 200 synthetic norm references and all 200 synthetic requirement packages.

The screen covers REST and MCP, requirements library and requirements
specification destinations, light and maximum-related rows, and 1, 50, 100,
250, and 500 rows. Each screen case uses one warm-up and one measured run. The
125-row and 150-row boundary checks use the maximum-related library case for
both REST and MCP.

The candidate and every contention case use one warm-up followed by 30 measured
repetitions. Percentiles use nearest-rank p50 and p95. Failure counts distinguish
SQL Server deadlock 1205, lock timeout 1222, application-lock timeout,
statement timeout, and other failure. Retry count is a separate aggregate.

The contention matrix contains:

- two simultaneous MCP imports into the same library;
- a REST library import while an ordinary transaction holds a destination-row
  update lock for 250 ms;
- three representative reads during an MCP specification import;
- two simultaneous MCP validation-session admissions for one library.

The harness samples `sys.dm_os_waiting_tasks` every 10 ms and retains only
aggregate `LCK_*` wait type, sample count, and maximum wait. REST import
execution remains `READ COMMITTED`. MCP import execution and MCP validation
admission remain `SERIALIZABLE`.

## Screening results

The table reports milliseconds from the one-run screen. All 40 cases complete
without a deadlock, lock timeout, application-lock timeout, statement timeout,
or other failure.

<!-- markdownlint-disable MD013 -->
| Source | Destination | Shape | 1 row | 50 rows | 100 rows | 250 rows | 500 rows |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| REST | Library | Light | 70.10 | 2,212.33 | 4,419.35 | 10,945.93 | 21,770.62 |
| REST | Library | Maximum-related | 244.59 | 10,860.37 | 21,712.26 | 54,264.82 | 108,888.62 |
| REST | Specification | Light | 149.34 | 2,276.08 | 4,442.00 | 10,984.76 | 22,069.86 |
| REST | Specification | Maximum-related | 203.48 | 6,715.97 | 13,262.66 | 33,280.72 | 66,588.40 |
| MCP | Library | Light | 78.53 | 2,257.62 | 4,412.17 | 10,941.00 | 21,879.11 |
| MCP | Library | Maximum-related | 242.56 | 10,974.71 | 21,789.59 | 54,393.51 | 108,814.17 |
| MCP | Specification | Light | 113.83 | 216.94 | 243.06 | 455.74 | 856.90 |
| MCP | Specification | Maximum-related | 158.90 | 4,547.40 | 9,036.93 | 22,440.82 | 44,835.58 |
<!-- markdownlint-enable MD013 -->

The library maximum-related case is the limiting shape. At its boundary, REST
and MCP require 27,195.29 ms and 27,246.85 ms for 125 rows, then 32,552.00 ms
and 32,683.75 ms for 150 rows.

## Candidate and contention results

The candidate is a 100-row, maximum-related MCP library import. It represents
the slowest source and destination combination near the proposed ceiling.

<!-- markdownlint-disable MD013 -->
| Case | Operations per repetition | p50 ms | p95 ms | Maximum ms | Failures | Database lock evidence |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Candidate | 1 | 21,788.88 | 21,963.63 | 22,222.16 | None | None observed |
| Same-destination imports | 2 | 22,118.43 | 22,634.77 | 26,630.90 | 30 deadlocks | `LCK_M_X`: 2,300 samples, 4,784 ms maximum |
| Ordinary destination write | 2 | 4,600.69 | 4,648.22 | 4,650.17 | None | `LCK_M_S`: 603 samples, 239 ms maximum; `LCK_M_X`: 21 samples, 231 ms maximum |
| Representative reads | 4 | 9,043.71 | 9,150.95 | 9,171.42 | None | None observed |
| MCP validation admissions | 2 | 99.99 | 109.37 | 114.73 | None | `LCK_M_X`: 120 samples, 46 ms maximum |
<!-- markdownlint-enable MD013 -->

Each same-destination repetition completes one import and returns one SQL
Server deadlock. No harness retry occurs. The other candidate and contention
operations record no failure. The deadlock result makes contention failure
monitoring and a bounded retry recommendation necessary even though the
single-import candidate remains below the duration objective.

## Recommendations

Use the following explicit values in the parent policy decision:

- requirement import transaction-duration objective: **30,000 ms**;
- requirement import lock-wait limit: **5,000 ms**;
- requirement import row ceiling: **100 rows**;
- database write group size: **50 rows**;
- deadlock retries: **one** retry with jitter;
- lock, application-lock, and statement-timeout retries: **zero**;
- warning alert: p95 transaction duration at or above **24,000 ms** in a
  **5-minute** window;
- critical duration alert: any transaction at or above **30,000 ms**;
- contention alert: at least **one** deadlock, lock timeout,
  application-lock timeout, statement timeout, or other import failure in a
  **5-minute** window.

The 30-second objective gives about 27% headroom over the candidate maximum and
keeps the one-run 125-row refinement below the objective. The 150-row
refinement exceeds it, so 100 is the defensible production ceiling. The
50-row database group remains below that ceiling and matches current database
write batching.

The 5-second lock-wait limit is a failure-classification and alert boundary
inside the 30-second transaction objective. It is not the database statement
timeout. The 15-second production statement timeout applies to each database
request, while the 30-second objective covers the complete import transaction.
The benchmark's 300-second statement timeout exists only to expose the
screening curve and must not become a production default.

The two-import-per-node admission cap remains part of the capacity model. A
single candidate consumes about 22 seconds of one slot; same-destination work
can deadlock even when two slots are available. Capacity planning therefore
uses two independent slots only for unrelated destinations and monitors the
contention alert separately.

These values are recommendations only. A separate policy change implements
enforcement, retry behavior, and telemetry after approval in issue #996.
