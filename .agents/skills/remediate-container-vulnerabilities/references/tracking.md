# Package remediation tracking

Maintain one human-managed issue per affected package, including its images
and CVEs. Use the package name and ecosystem from the scanner, plus its image
family, to find the owning open issue. Existing automation findings are scan
records, not these remediation issues. Create issues only during a user-invoked
skill run. Apply `ready-for-human` and `remediation:container-vulnerability`
when creating or adopting a package issue; create a missing label with its
documented purpose before using it. Use native sub-issue links only for
human-managed issues when a parent is in scope.

## Required issue content

Keep these sections current so another invocation can continue without chat:

- **Identity and evidence:** package/ecosystem, installed version, affected
  images and digests, source commit, job URL, scan/database time, CVEs, and
  complete evidence artifact references.
- **Fix criteria:** authoritative advisories, fixed versions, compatibility
  constraints, exact original-image selection and its owning lock or registry,
  and commands that inspect an unmodified candidate. Distinguish published
  advisory versions from packages that can actually be obtained.
- **Attempts:** installation, source patching, then removal; commands, inputs,
  results, and the concrete reason each unsuccessful path failed. For removal,
  list the full dependency closure, production-use evidence, collateral tools,
  retained runtime capabilities, and final inventory/workload checks.
- **Current remediation:** chosen path, code/recipe/lock locations, temporary
  package changes, output identities, PR and exact validated commit, all-image
  verification, and any user-approved exception's scope and lifecycle dates.
- **Next checks:** exact upstream package/image/source URLs, expected versions
  or fixes, what has to change, how to probe it, and what would make each failed
  path viable. State unknown facts explicitly. These instructions are inputs
  for the skill when the user later supplies this issue.
- **Removal and closure:** identify each temporary rule, patch, update, and
  exception to remove when the original image contains the fix. Specify the
  evidence that proves this and the required rebuild/runtime/scanner checks.

## Lifecycle

Record a passing workaround as remediated with cleanup pending, with the issue
still open. Keep both workflow labels on the issue. `ready-for-human`
identifies the maintainer's tracking item rather than authorizing an exception;
`remediation:container-vulnerability` identifies this package-remediation
workflow for searches and duplicate detection.

Only the PR that removes the workaround after the original image includes the
fix may auto-close the issue. Confirm all its affected image/CVE scopes before
closing. If an exception becomes stale sooner, remove that stale record as
the evaluator requires and record any remaining workaround cleanup separately
in this same issue. A partial cleanup does not complete the package issue.

Use a temporary UTF-8 file for multiline GitHub Markdown and pass it through
`gh ... --body-file`. Read the saved body with
`gh ... view --json body --jq .body` to verify its content and real line breaks.
