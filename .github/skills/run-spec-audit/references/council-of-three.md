# Council of Three

Run three independent audits using different AI models, then merge.

## Execution

1. Give the identical audit prompt to three independent AI tools.
2. Keep audits isolated. Do not paste one model's findings into
   another.
3. Save raw outputs to `tests/quality/spec_audits/YYYY-MM-DD-[model].md`.

## Merge Confidence Rules

| Confidence | Found By | Action |
|---|---|---|
| Highest | All three | Almost certainly real. Fix code or update spec. |
| High | Two of three | Likely real. Verify quickly, then fix or document. |
| Needs verification | One only | Deploy a verification probe. Do not accept by majority vote. |

## Verification Probe

When models disagree on a factual claim, ask one model to read only
the disputed files and report ground truth with line numbers. Resolve
the fact question first, then decide whether it is a spec bug, code
bug, or inference error.

## Categorize Confirmed Findings

- **Spec bug** — Documentation is wrong; update `docs/`.
- **Design decision** — Human judgment needed; do not auto-fix.
- **Real code bug** — Fix in a small subsystem-focused batch.
- **Documentation gap** — Behavior exists but is not documented.
- **Missing test** — Add or extend `tests/quality/functional.test.ts`.
- **Inferred requirement wrong** — Correct `tests/quality/QUALITY.md`.

## Fix Execution Rules

- Group fixes by subsystem, not by defect number.
- Do not write one mega-prompt for all findings.
- After each fix batch, run the smallest relevant test slice first,
  then the broader suite.
- Require at least two auditors to review the diff before closing a
  large batch.

## Output Files

- Raw audits: `tests/quality/spec_audits/YYYY-MM-DD-[model].md`
- Triage summary: `tests/quality/spec_audits/YYYY-MM-DD-triage.md`
- Follow-up notes: `tests/quality/results/YYYY-MM-DD-spec-audit.md`
