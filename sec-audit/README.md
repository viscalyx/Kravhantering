# Repository security audit archive

This archive contains the full-repository source audit completed on
19 September 2026. The publication branch is
`security/audit-sep-21-2026`. The original `tmp/sec-audit/` folder is now
`sec-audit/` at the repository root.

## Start here

- [Main report](REPORT.md): scope, limitations, prioritized validation leads,
hardening notes, positive controls and coverage summary.
- [Validation details](NEEDS-VALIDATION.md): source traces, evidence, exact
blockers and bounded next steps for each unresolved lead.
- [Structured findings](findings.json): machine-readable records with stable
fingerprints for tracking and deduplication.
- [Confirmed finding details](FINDINGS-DETAIL.md): explains why no confirmed
findings are retained.
- [Coverage ledger](coverage-ledger.json): the 115 reviewed units, their
  evidence
and remaining boundaries.
- [Audit skill](../.github/skills/security-audit/SKILL.md): the review method
  and
report contracts included on this branch.

## What the result means

There are 16 independently reviewed leads marked `needs_validation` and no
runtime-confirmed vulnerabilities. Coverage records 90 covered units,
23 candidate units and two externally blocked units. Multiple units can refer
to one deduplicated lead.

The required operating-system sandbox could not be created. No application
builds, runtime tests, live probes or dependency vulnerability-database refresh
ran. This is a source audit, not proof that the application is secure or that
every proposed effect is reproducible. The starting commit and separately
reviewed concurrent changes are recorded in [run metadata](run-metadata.json)
and [source integrity](source-integrity.json).

## How to follow up

1. Read the main report and choose a lead from the validation details.
2. Assign an owner and track the existing fingerprint in a follow-up issue.
3. Confirm the stated roles, configuration and data-state prerequisites.
4. Run only the specified small dummy-data check in an isolated environment,
with no production data, live traffic or shared development services.
5. Record whether the check confirms or refutes the boundary violation.
Resolve owner-policy questions explicitly and retain evidence of the decision.
6. For a confirmed defect, agree on severity from demonstrated impact, implement
the smallest fix, add a regression test and independently verify the result.

Start with the taxonomy, specification preload and suggestion visibility leads,
then the requirement-state and retention cases. Treat this as validation order,
not a severity ranking. Keep hardening suggestions separate from
vulnerabilities.
A current dependency scan and owner review of deployed controls remain separate
follow-up work.

## Publication and provenance

Credential-pattern and high-entropy checks cover the published archive and
skill.
Literal public development credential examples are replaced with omission
markers; generated Python bytecode caches are excluded. No credential values
are needed to read or use these reports. See the
[publication check](publication-security-check.json) and
[redaction manifest](publication-manifest.json).

Original independent-verification hashes are preserved. The redaction manifest
maps any changed record to its published digest. Publication redaction does not
change verdicts or source locations.

Historical absolute paths and `tmp/sec-audit/` references in prompts, metadata
and scratch records describe the original local run. They are not links to the
published files. Archived helper scripts contain local orchestration
assumptions;
do not run them as application tooling. Use the reports above for follow-up.
