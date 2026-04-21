# Agent Instructions

Follow the rules in `.github/copilot-instructions.md` and the instructions in `.github/instructions/*.md`

- Do not describe a failure as a sandbox issue, permission problem, or filesystem restriction unless the command output confirms that cause.
- If the cause is not yet verified, describe it as an environment or execution error and say that verification is still in progress.
- When an initial command fails and a retry succeeds, report that sequence explicitly instead of implying that all later reads were blocked.
- For visible UI element, label, or layout surface changes, see `.github/instructions/developer-mode.instructions.md`.
- Never use `git stash` to see if you caused the error when linting or testing, help fix the error regardless.
