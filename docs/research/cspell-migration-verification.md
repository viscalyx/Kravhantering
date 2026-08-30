# cSpell migration and fail-safe verification research note

Research date: 2026-08-30

This note supplies facts for
[Bestäm metod för ordlistemigrering och felsäker verifiering](https://github.com/viscalyx/Kravhantering/issues/974).
It does not choose a migration policy.

## Current repository baseline

The repository snapshot is commit
`2893b11ac0c927affa059fe3dd38acba82dc7924`.

[`package.json`](../../package.json) defines the quality-gate command as:

```text
cspell "**/*.{ts,tsx,js,jsx,md,json}" --no-progress
```

`npm run check` invokes that command through `npm run spell:check`. A direct
run on the snapshot checks 1,493 files, skips four, and reports no issues.
The command-line glob does not select `.mjs`, `.mts`, JSONC, YAML, shell,
PowerShell, Python, deployment-specific files, or dot directories.

[`cspell.jsonc`](../../cspell.jsonc) currently:

- uses languages `en,sv`;
- imports `@cspell/dict-sv/cspell-ext.json`;
- has 1,529 central `words` entries, of which 1,525 are exact unique values
  and 1,496 are unique after Swedish-locale case folding;
- has four repeated exact values and 29 case-variant groups;
- has five file-specific words in one override and no `flagWords`;
- sets `caseSensitive: false` and `allowCompoundWords: false`;
- enables Gitignore handling and lists 25 explicit ignored paths; and
- enables several file-type parsers that the narrower command-line glob does
  not currently reach.

The lockfile pins cSpell 10.0.1 and `@cspell/dict-sv` 2.3.2; see
[`package-lock.json`](../../package-lock.json). The version reported by the
installed executable is also 10.0.1.

## Earlier inventory and binding decisions

The 2026-08-11 resolution of
[Inventera projektets cSpell-undantagsyta](https://github.com/viscalyx/Kravhantering/issues/975#issuecomment-5249202062)
records a historical audit snapshot:

- 1,268 central entries, 1,237 case-normalized unique entries, three exact
  duplicates, and 28 case-variant groups;
- 374 central entries with no other exact tracked token occurrence;
- 101 real local directive lines in 54 files, plus one documented example;
- 245 local `ignore`/`words` entries and 174 case-insensitive unique values;
- 89 directive lines and 200 local entries reached by the then-current
  1,291-file check, leaving 12 directive lines and 45 entries outside it; and
- at least 124 of the 200 reached local entries already accepted by the base
  test or duplicated centrally.

That inventory requires these review categories: ordinary Swedish, domain
terms, project terms and fixtures, proper names, technical tokens, language
variants, and correction or removal candidates. Its counts remain evidence
for the shape of the problem, but the current 1,529-entry central list shows
that a migration must regenerate its working inventory rather than treat the
1,268-entry snapshot as current.

The resolution of
[Välj svensk basordlista och integrationsform](https://github.com/viscalyx/Kravhantering/issues/973#issuecomment-5470029034)
sets these constraints:

- keep `@cspell/dict-sv` as the only general Swedish base, npm-managed and
  imported through its existing extension configuration;
- do not copy or rebuild the package word data;
- keep project and domain terms as reviewed project exceptions;
- keep `allowCompoundWords: false`; and
- do not add SAOL 14, import SALDO full forms, or block on SAOL 15. SAOL can be
  reconsidered only under the gate stated in that resolution.

The resolution of
[Bestäm vilka filer stavningskontrollen ska omfatta](https://github.com/viscalyx/Kravhantering/issues/977#issuecomment-5470099519)
defines the destination surface semantically: all tracked, project-authored
source, documentation, and configuration where spelling can be a quality
defect. It includes hidden project files and the listed code, script, data,
style, template, container, and deployment formats. Exclusions must remain
narrow and motivated. `cspell.jsonc` itself and `.github/skills/**` remain
excluded. Rollout uses verifiable cohorts, with script cohorts last, but the
final state covers the entire decided surface.

The 1,291-file count above and the current 1,493-file count are dated
snapshots, not conflicting measurements. The latter is both recorded in the
scope decision and reproduced on the current checkout.

## Installed cSpell mechanisms

cSpell 10.0.1 provides enough primitives for a reproducible migration without
dictating the policy:

- `lint` accepts explicit globs, `--dot`, repeated `--exclude`, `--file`, and
  a newline-delimited `--file-list`. A tracked-file manifest can therefore be
  supplied independently of filesystem discovery. `--no-config-search`, an
  explicit `--config`, `--no-cache`, and the npm lock make the execution
  inputs explicit. See the official
  [CLI reference](https://cspell.org/docs/api/cspell) and
  [glob semantics](https://cspell.org/docs/globs).
- `--words-only --unique --no-progress --no-summary --no-color` emits the
  distinct unknown tokens. Sorting that output under a fixed locale gives a
  stable comparison artifact. `--issue-template` can instead emit exact
  file, row, column, token, and message tuples for classification with source
  locations.
- `trace --stdin --all --only-found --no-color --dictionary-path full` maps
  candidate words to the dictionaries that accept them. Because the current
  configuration's `[words]` dictionary accepts every central exception, a
  redundancy probe against the base requires a standalone probe configuration
  that omits project words. An imported overlay cannot subtract word lists:
  cSpell documents word-list override merging as a union in its
  [override rules](https://cspell.org/docs/Configuration/overrides).
- `dictionaries --enabled` records the actual enabled dictionaries for a
  configuration. `check` displays the full checked file, while `--show-context`
  adds context to lint findings.
- `--validate-directives` checks directive names. It does not reject extra
  text following a valid `ignore` or `words` directive because that text is
  parsed as more entries.
- Named plain-text project dictionaries are supported through
  `dictionaryDefinitions` and `dictionaries`. Separate named dictionaries
  can preserve provenance visible through `trace`; whether categories should
  become runtime dictionaries or only review metadata remains a policy
  question. See cSpell's
  [custom dictionary format](https://cspell.org/docs/dictionaries/custom-dictionaries).

## Exact local-directive rationale syntax

There is no structured rationale field on `cspell:ignore` or `cspell:words`
in the installed version. Put human rationale in an adjacent ordinary comment
line that does not contain a cSpell directive prefix:

```text
// Reason: exact external fixture identifier from the signed sample payload.
// cspell:ignore externalfixturetoken
```

A preceding or following ordinary comment line is safe and remains subject to
normal spell checking. Do not append rationale on the directive line.

The version-10.0.1 parser captures from the directive prefix through the end
of the physical line, then splits everything after `ignore` or `words` on
commas, whitespace, and semicolons. Consequently this input:

```text
// cspell:ignore externalfixturetoken because fixture identifier
```

adds `externalfixturetoken`, `because`, `fixture`, and `identifier` to the
file's ignored-word dictionary. Adding `//`, `#`, `--`, `*/`, or prose after
the intended token does not create an inline comment boundary for the
directive parser. The upstream tests explicitly confirm that closing block
and HTML comment markers are captured too. See the pinned
[parser capture and splitter](https://github.com/streetsidesoftware/cspell/blob/0f43abf29e5da0ecbcb08214055cdc1e3267c3ea/packages/cspell-lib/src/lib/Settings/InDocSettings.ts#L11-L13)
and
[word-list parsing](https://github.com/streetsidesoftware/cspell/blob/0f43abf29e5da0ecbcb08214055cdc1e3267c3ea/packages/cspell-lib/src/lib/Settings/InDocSettings.ts#L288-L327),
plus the pinned
[parser tests](https://github.com/streetsidesoftware/cspell/blob/0f43abf29e5da0ecbcb08214055cdc1e3267c3ea/packages/cspell-lib/src/lib/Settings/InDocSettings.test.ts#L116-L148).

The directive payload ends at the newline, but its effect does not. The
official 10.0.1
[in-document settings documentation](https://github.com/streetsidesoftware/cspell/blob/0f43abf29e5da0ecbcb08214055cdc1e3267c3ea/packages/cspell/README.md#ignore)
states that both `ignore` and `words` entries apply to the entire file.
Line-only suppression is a different directive:
`cspell:disable-line` or `cspell:disable-next-line`.

Direct calls to the installed parser reproduce these facts: trailing prose is
returned as additional `ignoreWords` or `words`; the same prose on the line
before or after is not. CLI probes also show that trailing rationale tokens
become accepted throughout the synthetic document, and
`--validate-directives` reports no error for that valid directive.

## Feasible fail-safe evidence

The installed CLI supports these complementary verification methods. They are
building blocks for the policy decision, not a choice among them.

1. Freeze one tracked-file manifest and one exact configuration/version for
   both sides of every cohort comparison. Record the checked-file count and
   sorted issue tuples; fail if a cohort selects no files.
2. Generate a fresh inventory of central entries and local directives. Preserve
   exact spelling, case variants, occurrence locations, base-only `trace`
   results, and the required human category and rationale. Exact duplicates,
   base-accepted entries, and entries with no tracked occurrence become review
   candidates, not automatic deletions.
3. Run a base-only probe before classification. Otherwise the current
   project-word dictionary masks precisely the redundancy being measured.
4. Maintain a reviewed negative corpus of intentional misspellings and
   near-misses, including Swedish inflections and compounds, project/domain
   terms, technical tokens, case variants, and samples for each enabled file
   type. `stdin://<representative-path>` exercises the real parser and file
   override selection without modifying production files.
5. Emit the negative corpus with `--words-only --unique` and compare its sorted
   output with an explicit expected set. A mutation generator can expand
   candidates deterministically, but any generated form that is another valid
   word needs review rather than automatic failure.
6. Trace every unexpectedly accepted negative token to identify whether the
   base dictionary, a project dictionary, a local directive, or a file override
   accepts it. Known dangerous misspellings can be represented with
   `flagWords`, which override `words`; note that `ignoreWords` override even
   `flagWords`, so local ignores must also be audited.
7. Run `--validate-directives` and separately lint rationale comments. The
   validator alone cannot detect rationale accidentally appended to a valid
   `ignore` or `words` line.

Passing the ordinary repository spell check proves a clean positive corpus.
It does not alone prove false-negative resistance; the negative corpus,
base-only trace, directive audit, and fixed file manifest cover distinct blind
spots.
