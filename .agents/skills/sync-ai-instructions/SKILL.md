---
name: sync-ai-instructions
description: Convert repository AI instruction files from `.github/instructions/*` into Claude Code rules in `.claude/rules/` by running the bundled sync script. Use when asked to sync GitHub Copilot instruction files for Claude Code, refresh `.claude/rules`, or keep Claude Code rules aligned with `.github/instructions`; do not hand-create destination files.
---

# Sync AI Instructions

## Overview

GitHub Copilot reads `.github/instructions/` directly. Claude Code reads
path-scoped rules only from `.claude/rules/`, so convert each regular file
from `.github/instructions/` into a rule with the same file name. The script
turns the Copilot `applyTo` frontmatter field into a Claude Code `paths` list
with one glob per item, so each rule loads only when Claude Code reads a
matching file.

## Workflow

1. Run the bundled script from the repository root:

```bash
bash .agents/skills/sync-ai-instructions/scripts/sync_ai_instructions.sh
```

2. If running from another directory, pass the repository root:

```bash
bash /path/to/repo/.agents/skills/sync-ai-instructions/scripts/sync_ai_instructions.sh /path/to/repo
```

3. Verify the output lists converted files and a `Verified .claude/rules`
   line.
4. Report the target path and any files converted.

## Safety Rules

- Run the bundled script instead of recreating each rule file manually.
- Run the script against the real repository root. Do not pass an alternate
  root to redirect or avoid the intended `.claude/rules/` target.
- If the repository root or `.claude/rules/` target is outside the writable
  sandbox, request approval to run the script with escalated permissions.
- Convert only files directly under `.github/instructions/`.
- Create `.claude/rules/` when it does not exist.
- Overwrite matching files in `.claude/rules/`.
- Do not delete existing files in `.claude/rules/`.
- Do not convert `.github/copilot-instructions.md`; `AGENTS.md` imports it.
- Fail the sync if any `.claude/rules/` file is missing or differs from the
  converted source.
