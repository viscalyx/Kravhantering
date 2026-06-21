# Dead Code Report Template

Use this template for the final report.

## Summary

- Confirmed dead findings: `<count>`
- Likely dead findings: `<count>`
- Possible future-use placeholder findings: `<count>`
- Backward-compatibility keep findings: `<count>`
- Past-tense documentation cleanup findings: `<count>`
- Total estimated removable lines: `<count>`

## Commands Used

```sh
<short, reproducible commands>
```

## Findings

<!-- markdownlint-disable MD013 -->
| Id | Status | Type | What | Location | Why it is dead or dormant | Evidence | Estimated lines saved | Recommendation | Possible future use if kept |
| -- | ------ | ---- | ---- | -------- | ------------------------- | -------- | --------------------- | -------------- | --------------------------- |
| 1 | confirmed dead | stale helper and test | Old helper module | `lib/old-helper.ts`, `tests/unit/old-helper.test.ts` | The helper is only imported by its own test. Production routes use a different parser. | `rg -n "old-helper\|oldHelper" app components lib scripts tests` only finds the helper and its test. | 72 | Remove the helper and its dedicated test, or wire the live route to this helper before keeping it. | Could serve as a shared parser if multiple routes adopt it. |
| 2 | keep | backward-compatibility seam | Legacy query parameter | `app/api/example/route.ts:42` | The route ignores the parameter, but old callers may still send it and a regression test preserves acceptance. | `tests/unit/example-route.test.ts:88` sends the legacy parameter; route code drops it before calling the service. | 0 | Keep until the public API contract removes the parameter. | n/a |
| 3 | keep | documentation cleanup | Active docs use past-tense wording | `docs/example.md:12` | The document describes current behavior through a previous implementation. | Search hit: `no longer uses the old parser`. | 0 | Rewrite as current state: the route uses the current parser. | n/a |
<!-- markdownlint-enable MD013 -->

## Notes

- Use `confirmed dead`, `likely dead`, `possible future-use placeholder`, or
  `keep`.
- Use `backward-compatibility seam` for keep findings that exist for older
  callers or public API contracts.
- Use `documentation cleanup` for active docs that should describe current
  state instead of migration history.
- Use `whole file` or `lines X-Y` in working notes when calculating the
  line count.
- Keep evidence short and concrete.
- For `possible future-use placeholder`, cite both a documentation signal and
  a code-structure signal.
- Use `n/a` in `Possible future use if kept` when no credible reuse case
  exists.
