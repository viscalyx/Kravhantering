# Agent Instructions

- Do not describe a failure as a sandbox issue, permission problem, or filesystem restriction unless the command output confirms that cause.
- If the cause is not yet verified, describe it as an environment or execution error and say that verification is still in progress.
- When an initial command fails and a retry succeeds, report that sequence explicitly instead of implying that all later reads were blocked.
- If you change visible UI elements, labels, or layout surfaces, also update the related Developer Mode developer help: `data-agent-*` markers or scan heuristics, `docs/developer-mode-overlay.md`, and the relevant tests/instructions.
