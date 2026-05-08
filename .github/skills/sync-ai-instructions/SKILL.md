---
name: sync-ai-instructions
description: Copy repository AI instruction files from `.github/instructions/*` into `.agents/rules/` by running the bundled sync script. Use when Codex needs to sync GitHub Copilot instruction files into agent rule files, refresh `.agents/rules`, or keep local AI rule directories aligned with `.github/instructions`; do not hand-create destination files.
---

# Sync AI Instructions

## Overview

Copy each regular file from `.github/instructions/` into `.agents/rules/`
while preserving file names and leaving unrelated target files alone.

## Workflow

1. Run the bundled script from the repository root:

```bash
bash .github/skills/sync-ai-instructions/scripts/sync_ai_instructions.sh
```

2. If running from another directory, pass the repository root:

```bash
bash /path/to/repo/.github/skills/sync-ai-instructions/scripts/sync_ai_instructions.sh /path/to/repo
```

3. Verify the output lists copied files and a final synced count.
4. Report the target path and any files copied.

## Safety Rules

- Run the bundled script instead of recreating each copied file manually.
- Copy only files directly under `.github/instructions/`.
- Create `.agents/rules/` when it does not exist.
- Overwrite matching files in `.agents/rules/`.
- Do not delete existing files in `.agents/rules/`.
- Do not copy `.github/copilot-instructions.md`.
