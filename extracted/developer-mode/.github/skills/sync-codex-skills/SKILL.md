---
name: sync-codex-skills
description: Copy local repository skills from .github/skills into Codex's runtime skills directory so the Codex VS Code extension can discover them. Use when asked to install or refresh local skills for Codex.
---

# Sync Codex Skills

Copy each skill folder from `.github/skills` to Codex's skill directory.

## Workflow

1. Resolve source and target paths:
   - Source: `.github/skills`
   - Codex home: `${CODEX_HOME:-$HOME/.codex}`
   - Target: `${CODEX_HOME:-$HOME/.codex}/skills`
2. Gate on Codex home existence:
   - Continue only if `${CODEX_HOME:-$HOME/.codex}` exists as a directory.
   - If it does not exist, stop and report that sync was skipped.
3. Copy each skill folder from source to target.
4. Verify copied skills exist in target.
5. Report copied skills and target path.

## Commands

Use these commands:

```bash
CODEX_ROOT="${CODEX_HOME:-$HOME/.codex}"
if [ ! -d "$CODEX_ROOT" ]; then
  echo "Skipping sync: Codex home does not exist: $CODEX_ROOT"
  exit 0
fi
TARGET="$CODEX_ROOT/skills"
mkdir -p "$TARGET"
cp -R .github/skills/. "$TARGET/"
find "$TARGET" -maxdepth 2 -name SKILL.md | sort
```

## Safety Rules

- Do not create `${CODEX_HOME:-$HOME/.codex}` if it does not exist.
- Do not delete existing target skills.
- If a target skill already exists, overwrite only that skill folder content by copy operation and report it.
- If copying outside workspace needs approval, request escalation before running the copy command.
