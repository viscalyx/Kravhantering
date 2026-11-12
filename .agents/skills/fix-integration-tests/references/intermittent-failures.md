# Intermittent failures

## Preserve evidence

- Before another run replaces artifacts, copy the failure's traces, screenshots,
  runner/server output, resource samples and available execution records into
  a unique investigation directory outside runner output. Preserve a safe
  assertion summary and artifact locations/expiry for later handoff.
- Correlate stable test identity with execution ID, commit/dirty state,
  run/job/attempt, exact safe command and selection, runtime/font profile,
  tool/dependency versions, worker/order/seed, outcome and artifact references.
  Mark unavailable context explicitly; retain the original failure immutably.
- Separate observed facts, hypotheses, confirmed causes and resolution.
  A later unchanged pass verifies that execution and leaves an unknown cause
  unresolved. Keep the record when publication gates subsequently pass.

## Bound the experiment

1. Identify a missing observation that distinguishes the hypotheses. Select
   cases and runtime through `select-integration-tests`, reusing unaffected
   passing evidence.
2. Before execution, record the hypothesis, safe command, selected cases/order,
   finite attempt budget, stop condition and distinguishing observation.
   Use repository npm scripts. Full local suites require explicit user scope;
   billable provider calls require explicit payment authorization.
3. Capture the result, including inconclusive passes. At the limit, retain an
   unresolved follow-up with the evidence, attempted experiments, specific next
   step, owner and condition for another run. Continue independent repair phases.

## Follow the evidence

- Clocks/readiness: distinguish runner monotonic time, browser Date/performance,
  real AudioContext time and injected server clocks. Advancing one does not
  complete another's work. Observe readiness/completion and pending work before
  measuring a timed contract. Preserve realistic media/network boundaries.
- Cleanup/order: compare isolated and predecessor-inclusive runs. Inspect
  worker/repeat/seed, retained requests, subscriptions, tracks, contexts and
  fixture-server shutdown. Repair established ownership or cleanup defects
  at the responsible helper.
- Environment: compare runtime/fonts, lockfile/tool versions and existing
  OOM/throttling, memory and renderer evidence. Distinguish host totals from
  container limits. Repair setup before modifying assertions.
- Product races: preserve the failing transition and use the main skill's
  production-change report. Keep test-only edits within that skill's boundary.

Add only missing diagnostics: bounded timelines with named time sources,
observable transitions, pending work and dropped-event counts. Retain synthetic
metadata rather than credentials, request bodies, transcripts or audio payloads.
Diagnostic collection failures must preserve the original test outcome.

## Record and resolve

- Where available, use `npm run test:investigate -- --help` to append retained
  execution records and apply assessments without running tests. Keep one
  record per stable test key and preserve earlier assessments.
- Record facts as execution ID plus observation; record hypotheses separately.
  Each experiment carries command/selection, attempt budget, stop condition and
  result execution IDs. Preserve actionable summaries after artifacts expire.
- Confirm a cause only with a controlled trigger and evidence explaining the
  defect. Classify it as environment, test synchronization, test isolation or
  product race; retain unknown when the evidence cannot distinguish them.
- Claim a fix only with a repair reference and focused passing regression
  evidence for that defect. Report execution verification separately from cause
  disposition. Preserve assertions and contracts instead of substituting longer
  arbitrary waits, skipped tests, lower thresholds or unreported retries.
