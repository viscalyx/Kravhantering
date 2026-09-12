---
name: operator-upgrade-notes
description: >-
  Review local PR changes against the target branch and decide whether
  production operators need upgrade notes, then write required guidance.
  Use for committed, staged, unstaged, or untracked changes; breaking behavior;
  deployment, configuration, or data migration impact; or proposed committed
  operator guidance.
---

# Operator Upgrade Notes

Assess whether a local PR has upgrade impact that production operators must
prepare for before rollout.

## Workflow

1. Define the review set. Include committed changes in `HEAD`, staged changes,
   unstaged changes, and untracked files relative to the target branch. Use
   local `main` by default. Use `origin/main` only if local `main` is absent or
   available evidence shows that it is stale. Follow any review boundary that
   the user gives.
2. Inventory the review set before deciding:

   ```bash
   BASE_REF="${BASE_REF:-main}"
   if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
     if [ "$BASE_REF" != main ]; then
       exit 1
     fi
     BASE_REF=origin/main
   fi
   git rev-parse --verify "$BASE_REF"
   git log --format='%h %s' "$BASE_REF"..HEAD
   git status --short
   git diff --name-status "$BASE_REF"...HEAD
   git diff --stat "$BASE_REF"...HEAD
   git diff --cached --name-status
   git diff --cached --stat
   git diff --name-status
   git diff --stat
   git ls-files --others --exclude-standard
   ```

3. Inspect the content of every relevant change. Treat
   `git diff "$BASE_REF"...HEAD` as the committed diff, `git diff --cached` as
   the staged diff, plain `git diff` as the unstaged diff, and untracked files
   as direct-inspection items. For files with staged and unstaged changes,
   assess the final worktree content unless the requested review set excludes
   it. Keep the diff direction on local changes; do not attribute changes
   present only on the target branch to the PR.
4. Read enough adjacent code, tests, documentation, and migrations to determine
   deployed behavior. Cover changes to runtime, deployment, schema, data,
   roles, APIs, release artifacts, operational documentation, and
   compatibility. File names alone are not evidence. If the user requested
   committed changes only, report unrelated worktree changes as excluded.
5. Apply every trigger below to the inspected behavior. The assessment is
   complete when each operator-relevant change is either represented in the
   notes or excluded by the no-notes rule.
6. Compare required guidance with the Unreleased section in
   `docs/operations/operator-upgrade-notes.md`. Add or correct missing guidance
   in the Unreleased section only.
   For assessment-only requests, report adequacy against the requested review
   set and return proposed text for any gaps.

## Note Triggers

Create operator notes for:

- Required operator action before or during upgrade.
- Breaking or removed behavior, renamed behavior, or changed defaults that
  affect deployments, integrations, users, or support runbooks.
- Data migration preconditions, irreversible data changes, cleanup,
  rollback limits, or compatibility windows.
- New or changed runtime configuration, secrets, certificates, networks,
  container topology, image roles, jobs, volumes, ingress, or external
  services.
- Permission, authentication, authorization, privacy, retention, export,
  action log, security audit log, reporting, or monitoring changes that
  operators must communicate or validate.
- API, MCP, report, export, file format, or integration contract changes that
  external consumers might need to accommodate.

Return no notes for internal refactors, tests, formatting, copy-only UI polish,
documentation cleanup, or fixes with no upgrade preparation or
operator-visible behavior change.

## Notes Style

- Write standalone, high-level guidance for production operators, release
  managers, or support staff.
- State what needs attention before upgrade, during rollout, or soon after
  upgrade.
- Write in ASD-STE100 Simplified Technical English. Use `CONTEXT-MAP.md` if it
  exists to select the ubiquitous language; otherwise use `CONTEXT.md`.
- Keep notes independent of implementation. Omit file paths, code symbols,
  migration numbers, table or column names, tests, commits, PRs, and issues.
- Omit detailed commands, SQL, configuration-variable lists, and code
  references unless the user asks for a runbook.
- Use one to three short paragraphs or bullets. Combine related impacts.
- Use repository operator-note language. Default to English for
  `docs/operations/operator-upgrade-notes.md`.

## Output

When no notes are needed, respond exactly with:

```text
No operator notes needed for Operator Upgrade Impact.
```

When notes are needed:

- Lead with the warning and decision shown below.
- State whether guidance is adequate, updated, or missing. Distinguish
  committed guidance from uncommitted edits and link to the notes document.
- Include new or revised guidance under `Notes written`, or missing guidance
  under `Proposed notes` for assessment-only requests. Omit this section when
  existing guidance is adequate.
- End with concise evidence for the maintainer. Keep implementation references
  in the evidence, separate from the standalone operator guidance.

Use this structure, replacing placeholders and choosing the applicable label:

```markdown
⚠️ Decision: Operator Upgrade Impact — notes required

Guidance: <adequate, updated, or missing; committed or uncommitted; document link>

<Notes written or Proposed notes>:

<standalone operator notes without code references>

Evidence:

<brief evidence summary for the maintainer; code references are allowed here>
```
