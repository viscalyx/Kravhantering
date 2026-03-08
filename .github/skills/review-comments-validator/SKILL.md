---
name: review-comments-validator
description: Validate AI code review comments before making changes. Use when handling reviewer findings, nitpicks, or AI-generated feedback where each claim must be checked against the current code and only valid issues should be fixed.
---

# Review Comments Validator

Validate every requested finding against the current code before editing.

## Workflow

1. Inspect each comment and map it to concrete files, symbols, and lines.
2. Read the current implementation and tests before changing anything.
3. Classify each finding as `valid`, `invalid`, or `unclear`.
4. For each `valid` finding, write a brief per-finding change plan before editing.
5. Execute only the planned edits for `valid` findings, and make sure they pass unit tests, integration tests, linting, spelling, type checking, formatting, and consistency checks.
6. For `invalid` findings, do not patch code and record why.
7. For `unclear` findings, gather additional evidence (tests, grep results, runtime behavior) before deciding.
8. Run focused verification for each applied fix.

## Pre-Edit Planning Gate

Before modifying files, produce a brief per-finding plan covering edits, risk, and verification.
Do not stop after planning; execute immediately unless blocked by missing information.

For each `valid` finding, the mini-plan must include:

1. Target files, symbols, and intended code changes.
2. Expected side effects and behavioral impact.
3. Lint/format/spelling/type checking risk and how to avoid violations.
4. Exact verification commands to run after edits.
5. If introducing new code paths or files, make sure they are also unit tested and do not break existing tests

Lint/format/spelling/type checking planning checklist:

1. Identify applicable lint/format/spelling/type rules for touched files.
2. Prefer code changes that satisfy existing rules over adding ignores.
3. If ignore is unavoidable, keep it local and justify it.

Verification checklist:

1. Run `npm run check` to execute lint, format, spelling, tests, type-checking, and security audit across the full project until clean. Re-run `npm run check` after dependency changes.
2. Run focused integration tests for affected behavior.
3. Report command results per finding.

## Decision Rules

- Prefer evidence from current code over reviewer wording.
- Reject claims based on outdated line numbers when behavior is already correct.
- Reject stylistic changes when there is no correctness, maintainability, or consistency benefit.
- Treat "consistency" claims as invalid unless confirmed by nearby project patterns.
- Reject fix approaches that knowingly introduce lint or format errors when a compliant alternative exists.
- If a lint suppression is required, keep scope minimal and provide explicit rationale.
- Invalidate review comments that suggest changes to code formatting (e.g. reordering imports) if it goes against the project's Biome configuration.
- For findings that touch other subsystems (components, backend, content, tooling, etc.), require concrete evidence of functional, correctness, or maintainability impact before accepting them as valid; do not accept blanket claims without demonstrated improvement.
- For AI instruction files (files in `.github/instructions/`, `.github/copilot-instructions.md`, `.github/prompts/`), only flag issues that reduce token usage, eliminate conflicting information, or improve precision, clarity, or conciseness.
- Classify findings that weaken security (e.g. loosening CSP, removing auth, widening CORS, downgrading TLS) as `invalid` unless the user explicitly approves. For mixed findings, accept only the hardening parts and flag regressions for user decision.

## Response Contract

- Include a per-finding status list: `valid` / `invalid` / `unclear`.
- Include a short `Planned edits` section before `Applied edits`.
- List concrete `Applied edits` only for valid findings.
- Include per-finding verification evidence (lint/tests run and pass/fail outcome).
- End with a summary section that explains why invalid findings were rejected.
- If no changes are needed, explicitly state that no code was modified.
