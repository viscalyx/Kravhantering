---
name: sync-ai-skills
description: Copy local repository skills from `.github/skills` into AI skill target directories by running the bundled sync script. Use when asked to install, refresh, or sync repository skills for Codex or Google Antigravity discovery, including `${CODEX_HOME:-$HOME/.codex}/skills` and `.agent/skills`; do not hand-create copied skill files.
---

# Sync AI Skills

Copy each skill folder from `.github/skills` to Codex's runtime skills
directory and this repository's local `.agent/skills` directory for Google
Antigravity.

## Workflow

1. Run the bundled script from the repository root:

```bash
bash .github/skills/sync-ai-skills/scripts/sync_ai_skills.sh
```

2. If running from another directory, pass the repository root:

```bash
bash /path/to/repo/.github/skills/sync-ai-skills/scripts/sync_ai_skills.sh /path/to/repo
```

3. Verify the output lists copied skills and `Verified ... hash(es) match`
   lines for each target.
4. Report copied skills and any skipped target.

## Safety Rules

- Run the bundled script instead of recreating each copied skill file manually.
- Do not create `${CODEX_HOME:-$HOME/.codex}` if it does not exist.
- Create `.agent/skills` when it does not exist.
- Copy only direct skill folders under `.github/skills`.
- Do not delete existing target skills.
- If a target skill already exists, overwrite files by copy operation and
  report it.
- Fail the sync if any copied source file is missing or has a different
  SHA-256 hash in the destination.
- Do not treat extra files already present in a target skill directory as
  failure; this sync does not delete target files.
- Request approval before running a command that copies outside the sandbox.
