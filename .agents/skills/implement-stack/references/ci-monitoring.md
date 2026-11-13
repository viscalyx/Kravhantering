# CI monitoring

Use the [bundled watcher](../scripts/watch-ci.mjs) for each publication wait.
Resolve the skill directory from this skill's location and invoke its absolute
path with Node.js 24 or newer:

```sh
node '<skill-directory>/scripts/watch-ci.mjs' \
  --input '<manifest.json>' --state '<state.json>'
```

The watcher uses Node built-ins and GitHub authentication through `GH_TOKEN`,
`GITHUB_TOKEN` or `gh auth`. It requires no repository npm script, dependency
installation or particular working directory. Keep its manifest and state files
in the Spec's journal directory.
Use separate state files for published and ready phases. Run the watcher
as a background process with JSON lines redirected to a journal file;
consume its events instead of issuing independent CI polling commands.

## Pin the intended evidence

Write a version 1 JSON manifest with an explicit repository, target policy
branch, phase, and ordered PRs. For a native stack, include its server
`stack` number and every member in bottom-to-top order. An ordinary PR
omits `stack`.

```json
{
  "version": 1,
  "repo": "owner/repository",
  "policyBranch": "main",
  "phase": "published",
  "prs": [
    {
      "number": 123,
      "head": "0123456789012345678901234567890123456789",
      "checks": [
        {
          "context": "application",
          "appId": 15368,
          "workflow": ".github/workflows/ci.yml",
          "event": "pull_request"
        }
      ]
    }
  ]
}
```

Populate checks from the target branch's effective required-check policy
and the publication gates. Read the workflow definitions to identify
workflow paths, events and readiness triggers. The watcher cross-checks
branch rules and legacy branch protection; omitted required checks,
unavailable policy, ambiguous job identities and unsupported required
workflow rules cannot produce success. This adapter observes GitHub Actions
jobs bound to check-run application IDs. Other check providers require an
adapter before their evidence can satisfy a gate.

For the ready phase, retain checks that remain applicable and add any gates
triggered by readiness. Set `phase` to `ready`. For each check that must run
again, set `readyAfter` to the UTC timestamp recorded immediately before
marking that PR ready. The watcher requires a workflow run created after
that boundary. A retry of an earlier run cannot satisfy this requirement.
Checks without `readyAfter` may reuse evidence on the same head. Confirm
trigger behavior from workflow configuration; the watcher cannot infer
readiness intent from a check name.

## Consume status and events

Each event is one JSON object: `id`, `kind` (`change` or `heartbeat`) and
`snapshot`. The snapshot identifies the repository, phase, expected and
observed PR heads, observation time, required checks, workflow run and
attempt, job and job attempt, diagnostic references and blockers. Historical
attempts are separate from each check's current state. A successful job
retained by a partial retry is identified by `retained: true`.

States are `pending`, `unknown`, `inaccessible`, `failed`, `successful` and
`diverged`. Only `successful` verifies the listed CI gates. Pending jobs,
missing evidence and inaccessible APIs cannot establish a pass. A failure
includes its job URL; later artifacts produce a new event. Diagnostic-access
errors preserve known failures. Changed heads, bases or stack membership
produce `diverged`; reconcile with the journal before creating a new watch.

`workflowFailures` reports current dependency-job failures even while the
required aggregate job is absent. Report those failures with their evidence;
the required-check outcome can still be pending. Older attempt failures
remain historical and do not appear in this list.

Report meaningful events with their current run/attempt and evidence.
Treat identical event IDs as the same notification. Preserve event IDs
already delivered to the user. Resume with `--ack <event-id>` to acknowledge
all pending events through that ID. The durable outbox is written before
emission: interruption may replay unacknowledged events with their original
IDs, but acknowledged events remain suppressed. Acknowledgement is local
state only. A continuously running consumer can keep its delivered IDs in
the journal and pass the latest acknowledgement at the next resume.

For a user status request, run the same command with `--status`. It immediately
returns cached evidence, observation age, next observation time and `stale`;
describe it as evidence from that time. `--once` refreshes when polling is due,
otherwise it preserves the scheduled delay. Neither option bypasses a server
retry limit. `--help` lists invocation options and exit statuses. The Node
command writes JSON lines directly to stdout.

Polling starts at 15 seconds, doubles after unchanged observations, and caps
at five minutes. Changes reset the interval. Server retry delays can extend
the cap. A simulated three-hour unchanged wait performs at most 41
observations and emits one event with the default heartbeat disabled. Each
observation makes multiple paginated read requests. This bounds observation
frequency at the cost of up to five minutes' detection latency after a long
unchanged wait. Optional `--heartbeat <seconds>` accepts zero or at least
300 seconds; use a sparse interval such as 900 for a persistent display.
Heartbeat output is status evidence, not an instruction to send chat messages.

Ctrl-C or termination stops observation without changing CI or publication
state. Resume with the same manifest and state path; changed manifests
require new state files. An atomic sibling lock prevents concurrent state
writers. On restart, the watcher reclaims a lock only when the PID in
`owner.json` is confirmed gone; live or unverifiable owners block acquisition.
Preserve state and event files. The command only reads GitHub; readiness,
repairs, approvals and publication remain the orchestrator's responsibility.

## Runtime instruction handoff

The session's externally managed developer/runtime instructions own the
roughly one-minute conversational update requirement. The owning source is
not in this repository; repository instructions cannot override it.
Conversational deduplication remains pending with the owner of the Codex
runtime/session instruction configuration.

Hand off this change to that owner: while a watcher owns a wait, use its
meaningful change, diagnostic, completion and blocker events for updates;
allow unchanged waits to remain quiet, with optional sparse status display.
Answer user status requests immediately with observation time and staleness.
Keep progress updates for substantive work outside the wait.

Owner verification: run a long unchanged wait under the revised runtime
instructions and confirm no timer-driven conversational repetitions, then
inject a failure, late diagnostic, completion and user status request and
confirm each receives an accurate response. The CLI simulation verifies
polling and event suppression; it does not verify that external instruction
change.
