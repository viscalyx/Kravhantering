# Locale-Paired Taxonomy And Source-Language Content

Status: Accepted on 2026-06-05.

Kravhantering treats Swedish and English as first-class UI locales. System UI
strings live in locale message files, and lookup or taxonomy rows that name
application-owned classifications use paired locale fields such as `name_sv`
and `name_en`.

Authored content and externally named content do not receive forced locale
pairs by default. Requirement packages, norm references and similar source
language values keep one factual or authored value unless the domain explicitly
requires separate maintained translations.

This keeps reusable classifications available in both supported UI languages
without pretending that every authored phrase, legal reference or standard name
has a truthful application-owned translation.

## Considered Options

- Store all user-facing text as Swedish and English pairs: rejected because
  authored content and external norm names may be single-language facts rather
  than translatable labels.
- Store all taxonomy and lookup names as one text value: rejected because the
  application must present core classifications consistently in both supported
  UI locales.
- Translate external norm references in the application: rejected because
  source-language legal and standards names should remain faithful to their
  originating document.
