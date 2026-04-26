# Agent Instructions

Follow the rules in `.github/copilot-instructions.md` and the instructions in `.github/instructions/*.md`

- Do not describe a failure as a sandbox issue, permission problem, or filesystem restriction unless the command output confirms that cause.
- If the cause is not yet verified, describe it as an environment or execution error and say that verification is still in progress.
- When an initial command fails and a retry succeeds, report that sequence explicitly instead of implying that all later reads were blocked.
- For visible UI element, label, or layout surface changes, see `.github/instructions/developer-mode.instructions.md`.
- Never use `git stash` to see if you caused the error when linting or testing, help fix the error regardless.
- Never use `git checkout`, `git revert` or other Git commands to undo your changes unless you are confident that you won't loose uncommitted work. If you need to undo changes, use `git view` to compare with the last committed version then use edit tools to implement the necessary fixes.
