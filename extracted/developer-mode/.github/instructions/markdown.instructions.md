---
applyTo: "{docs/**/*.md,README.md,CONTRIBUTING.md,RELEASING.md,SECURITY.md,CODE_OF_CONDUCT.md,packages/**/*.md}"
---

## Markdown Style Guide

- Do not use `---` to separate sections in Markdown files unless they
  are part of YAML frontmatter.

## Markdown Linting

Follow markdownlint rules `MD013` (line length) and `MD060`
(table column style) in all Markdown files.

### MD013 — Line Length

- Wrap prose at ~80 characters on word boundaries.
- Never break inline code in backticks; break before or after the
  full backtick segment.
- Never split a Markdown URL or break inside `[text](url)`.
  A single long link line is permitted without disable markers.
- Never wrap Markdown comments (`<!-- ... -->`).
- Disable MD013 only for tables, fenced code blocks, or `<img>` tags
  whose lines exceed 80 chars. Wrap the block with inline markers:

```markdown
<!-- markdownlint-disable MD013 -->
| Col A | Col B | Col C | … long table row … |
<!-- markdownlint-enable MD013 -->
```

- Do not disable MD013 for regular prose or link lines.

### MD060 — Table Column Style

- Default to `aligned` style (pipes vertically aligned).
- Use `compact` style (single space around cell content) when any
  cell content exceeds ~20 characters or the table has more than
  ~5 columns.
- Do not mix styles in one table. If markdownlint reports
  violations, reformat the entire table to one style.
