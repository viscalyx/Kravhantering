# CI selection and release verification

Contributors use this guide to explain which checks a change selects and why a
job skips. Maintainers use it to verify selection and release behavior after
changes to delivery automation.

Each participating workflow selects complete validation suites, called owners,
from the changed paths at its event source. Selection is scoped to that
workflow and runs again for every event, including a release after a successful
PR. The summary explains which owners run and whether publication is eligible.

Documentation, contributor instructions and operator-note corrections select
formatting, spelling, Markdown and link checks. Test paths select their complete
owners and prerequisites, including nested and package tests. Shared runners
and fixtures select their consumers. Production, dependency and packaging
inputs select applicable validation and release work. Mixed inputs take the
union. Unknown paths select all applicable owners. Renames use their destination;
deletions use the deleted path. Failed or incomplete collection blocks checks.

Push selection compares the event's exact previous and new commits. If the
previous commit is missing locally after a force-push, the collector fetches
that SHA from `origin` before comparing. This also covers Dependabot updates:
full-history checkout alone may omit the replaced branch tip. A failed fetch
still blocks selection; the collector does not substitute another base or
silently omit deleted paths.

Pull requests compare the merge base of the event's base and head commits with
the head commit. A new branch push with an all-zero previous SHA enumerates the
complete source tree. Scheduled runs, manual dispatches and stable `vX.Y.Z`
tags select all owners applicable to that workflow and event.

Whole suites use native job skips and partial quality selections use native
step skips. Required reporting describes policy exclusions and fails selected
failed, cancelled, missing or unexpectedly skipped work. PR-only suites do not
run on main pushes. GitHub-managed CodeQL and Secret Protection remain
independent.

## Diagnose a selection or skip

Open the affected workflow run's **Select applicable validation** job and read
its summary or **Classify complete changed paths** log. It records the exact
source SHA, event, ref, publication eligibility, path classifications and each
owner's selection or exclusion reason. An owner is a complete validation suite;
the result is scoped to the calling workflow, so compare summaries from the same
event when investigating different workflows.

If the selected owner is unexpected, check the path rules and `WORKFLOW_OWNERS`
mapping in [the selection policy](../../scripts/release/selection.mjs).
For browser versus runtime ownership, consult
[CI integration ownership](ci-integration-ownership.md) and the
[integration manifest](../../tests/integration-chunks.manifest.json). A selected
execution job that fails, is cancelled or skips must fail its reporting context;
inspect that job and its prerequisites rather than treating the result as a
policy exclusion. If collection fails, read the selection job's error first:
there is no valid selection to interpret.

## Request validation or a documentation preview

In GitHub Actions, open **Container Release**, choose **Run workflow** and select
`main`. Leave **preview** disabled for validation without publication. Enable it
to explicitly publish a preview, including a documentation-only change. The
dispatch source SHA remains fixed if main advances while the run is queued.
See [trusted container publishing](trusted-container-publishing.md) for release
evidence, publication stages and recovery after partial delivery.

## Maintainer verification after merge

After changing selection or required reporting, inspect workflow runs for the
paths and events affected by the change:

1. Compare documentation-only, test-only, production, shared-input and mixed
   changes. Check complete owners, prerequisites, native skips and their reasons.
2. Inspect failed prerequisites and cancelled selected jobs. Confirm required
   reporting fails rather than accepting these results as policy exclusions.
3. Check both PR and main events; their applicable owners differ. If the change
   affects scheduled runs, manual dispatches or stable tags, verify those events
   still select their required validation.
4. Confirm documentation/test-only main pushes exclude automatic publication.
   For release selection changes, check explicit previews and verify that the
   reported source SHA matches the dispatch event even if main advances.

Use [trusted container publishing](trusted-container-publishing.md) for
publication evidence and recovery procedures. A successful CI run does not
prove that an environment has been deployed.
