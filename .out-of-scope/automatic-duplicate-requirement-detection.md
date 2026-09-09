# Automatic Duplicate Requirement Detection

Automatic identification of duplicate requirements is outside the project's
scope. This includes exact-text warnings, fuzzy text matching, and AI-based
matching during requirement import.

## Why This Is Out of Scope

The requirement area owner is responsible for analyzing the requirements they
import and deciding whether an existing requirement already covers the intended
obligation. This assessment remains part of their review of the import.

Matching wording does not establish that two requirements express the same
obligation. Small differences can change the meaning, while different wording
can express the same obligation. The project leaves this assessment to the
responsible person rather than adding automatic duplicate detection to the
import workflow.

This decision does not change the existing ability to review, edit, and exclude
candidate rows before import. It also does not change validation or duplicate
reference-link handling.

## Prior Requests

- [#1318: Warn about duplicate requirement candidates before import](https://github.com/viscalyx/Kravhantering/issues/1318)
