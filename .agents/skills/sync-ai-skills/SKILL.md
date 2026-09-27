---
name: sync-ai-skills
description: Copy repository skills from `.agents/skills` into `.claude/skills` by running the bundled sync script. Use when asked to install, refresh, or sync repository skills for Claude Code discovery; do not hand-create copied skill files.
---

# Sync AI Skills

Repository skills live in `.agents/skills`, which GitHub Copilot, Codex, and
Google Antigravity read directly. Claude Code reads only `.claude/skills`, so
copy each skill folder there.

## Workflow

1. Run the bundled script from the repository root:

```bash
bash .agents/skills/sync-ai-skills/scripts/sync_ai_skills.sh
```

2. If running from another directory, pass the repository root:

```bash
bash /path/to/repo/.agents/skills/sync-ai-skills/scripts/sync_ai_skills.sh /path/to/repo
```

3. Verify the output lists copied skills and `Verified ... hash(es) match`
   lines.
4. Report copied skills.

## Safety Rules

- Run the bundled script instead of recreating each copied skill file manually.
- Create `.claude/skills` when it does not exist.
- Copy only direct skill folders under `.agents/skills`.
- Do not delete existing target skills.
- If a target skill already exists, overwrite files by copy operation and
  report it.
- Fail the sync if any copied source file is missing or has a different
  SHA-256 hash in the destination.
- Do not treat extra files already present in a target skill directory as
  failure; this sync does not delete target files.
