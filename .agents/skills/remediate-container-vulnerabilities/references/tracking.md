# Package remediation tracking

Maintain one human-managed issue per affected package, including its images
and CVEs. Use the package name and ecosystem from the scanner, plus its image
family, to find the owning open issue. Existing automation findings are scan
records, not these remediation issues. Create issues only during a user-invoked
skill run. Apply `ready-for-human` and `remediation:container-vulnerability`
when creating or adopting a package issue; create a missing label with its
documented purpose before using it. Use native sub-issue links only for
human-managed issues when a parent is in scope.

## Opening summary

Start each package issue with `## Action taken`, before technical evidence.
Write two to four short paragraphs in plain ASD-STE100 Simplified Technical
English. Explain:

- What the build actually does: install a fixed package, build a source patch,
  remove unused software, or apply a user-approved exception. If nothing has
  been applied, state that and identify the proposed action separately.
- Why the action is needed. Distinguish a fix published as a package from a
  fix already included in the original image. Explain coordinated package-set
  updates and any collateral tools removed, without implying a separate
  vulnerability in every package.
- What is verified and whether the change is merged or released. Separate a
  passing rebuilt image from an unchanged upstream image or installed release.
  For an exception, state that the affected package remains and that the user
  approved a temporary exception.

Use package names where needed, and explain their purpose in ordinary words.
Put commands, image hashes, CVE lists, and detailed evidence below the summary.

## Next step

Put `## Next step` immediately after `## Action taken`. In plain ASD-STE100
Simplified Technical English, explain what to do at the next maintenance
review and what result permits cleanup. Keep current PR progress in
`Action taken` or the evidence sections; `Next step` must remain useful after
that PR is merged.

Tell the reader to run `$remediate-container-vulnerabilities` with this issue
and explain what to inspect in the current unmodified upstream image. For an
image update, explain how to select its exact new identity, synchronize its
consumers and locks, remove only the unnecessary workaround, and rebuild and
verify the affected images. For package refreshes, rebuild without cached
package-install steps. Link the owning image-maintenance workflow for
exact steps. Explain that deployment uses a new immutable project release;
existing release images and installed containers do not update automatically.
State when to retain the workaround and issue, and when cleanup permits closure.
For completed cleanup, state that no further action is needed for this case.
Keep this section short and useful without reading technical details.

Link to an existing detailed-check section when commands, versions, evidence,
or several conditions are needed. Keep those details in one place; a simple
next step needs no duplicate instruction section. Put the remaining technical
evidence below these two opening sections.

Update both opening sections whenever the action, verification state, or next
action changes, including when adopting an issue or completing its cleanup.

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
