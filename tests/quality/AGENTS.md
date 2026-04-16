# Agent Instructions

- Update `QUALITY.md` whenever functional tests change.
- When adding new scenarios to `QUALITY.md`, also update
  `.github/skills/run-spec-audit/references/scrutiny-areas.md` with a
  matching scrutiny area, `Req tag`, and `Verify` command.
- When adding new `docs/*.md` files relevant to spec compliance, add
  them to the context-files list in
  `.github/skills/run-spec-audit/SKILL.md`.
- When removing scenarios from `QUALITY.md`, remove the corresponding
  scrutiny area from `references/scrutiny-areas.md`.
