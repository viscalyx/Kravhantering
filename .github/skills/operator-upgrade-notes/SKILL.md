---
name: operator-upgrade-notes
description: >-
  Review a local branch diff against main for pull request operator upgrade
  impact. Use when Codex must decide whether a PR needs operator upgrade notes,
  detect breaking or removed behavior, deployment/configuration/data migration
  impacts, or draft standalone high-level operator notes for the PR template.
---

# Operator Upgrade Notes

Assess whether a branch introduces upgrade impact that production operators
must prepare for before rollout.

## Workflow

1. Interpret the task as changes introduced by `HEAD` relative to the target
   branch. Prefer local `main`; use `origin/main` only when local `main` is not
   available or is clearly stale.
2. Run focused diff discovery before judging impact:

```bash
git rev-parse --verify main
git log --oneline main..HEAD
git diff --name-status main...HEAD
git diff --stat main...HEAD
```

3. Keep the diff direction focused on branch changes. Operator notes should
   describe the branch's upgrade impact, not unrelated changes present only on
   `main`.
4. Read changed files that affect runtime, deployment, schema, data, roles,
   APIs, release artifacts, operational docs, or compatibility.
5. Inspect enough adjacent code, tests, docs, and migrations to understand the
   deployed behavior. Do not infer impact from file names alone.
6. Decide whether operators need pre-upgrade preparation, rollout awareness, or
   post-upgrade checks.
7. Return either `No operator notes needed` or a paste-ready notes block.

## Note Triggers

Create operator notes when the diff introduces any of these upgrade impacts:

- Required operator action before or during upgrade.
- Breaking changes, removed behavior, renamed behavior, or changed defaults
  that affect existing deployments, integrations, users, or support runbooks.
- Data migration preconditions, irreversible data changes, data cleanup needs,
  rollback limitations, or compatibility windows.
- New or changed runtime configuration, secrets, certificates, network
  dependencies, container topology, image roles, jobs, volumes, ingress, or
  external services.
- Permission, authentication, authorization, privacy, retention, export, audit,
  reporting, or monitoring changes operators must communicate or validate.
- API, MCP, report, export, file format, or integration contract changes that
  external consumers might need to adjust for.

Do not create operator notes for internal-only refactors, tests, formatting,
copy-only UI polish, documentation-only cleanup, or bug fixes with no upgrade
preparation or operator-facing behavior change.

## Notes Style

Write the operator notes as standalone, high-level operational guidance:

- Address production operators, release managers, or support staff.
- Explain what needs attention before upgrade, during rollout, or shortly after
  upgrade.
- Keep the text independent of the implementation. Do not mention file paths,
  code symbols, migration numbers, table or column names, test names, commits,
  PR numbers, or issue numbers.
- Avoid detailed commands, SQL, config variable lists, or code references unless
  the user explicitly asks for a runbook.
- Prefer one to three short paragraphs or bullets. Combine related impacts into
  one note instead of listing implementation details.
- Use the repository's operator-note language. Default to English for
  `.github/pull_request_template.md` and
  `docs/operations/operator-upgrade-notes.md`.

## Output

When no notes are needed, respond exactly with:

```text
No operator notes needed for Operator Upgrade Impact.
```

When notes are needed, use this structure:

```markdown
Decision: Operator notes required

Notes to paste:

<standalone operator notes without code references>

Rationale:
<brief evidence summary for the maintainer; code references are allowed here>
```

If asked to edit a PR body, preserve the
`operator-upgrade:no-notes`,
`operator-upgrade:notes start`, and
`operator-upgrade:notes end` markers. Check `No operator notes needed` only
when the decision is no notes; otherwise leave it unchecked and replace the
placeholder between the notes markers.
