# Integration-Test Chunks

Apply these additions to the main workflow when the project defines groups of
integration specs that its runner executes separately as chunks.

## Commands and Coverage

- Read the project's scripts and runner configuration to find commands for
  listing chunks, selecting a chunk, and running all chunks in a suite.
- Use the project runner for suite and chunk runs so its server lifecycle,
  coverage checks, and diagnostics apply.
- If the runner uses a committed chunk manifest, follow its validation and
  regeneration procedure after adding, moving, renaming, or deleting specs.
  If regeneration needs edits outside the skill's allowed scope, report that
  blocker before claiming complete suite coverage.
- With no spec paths supplied, prefer chunks that release app-server and
  runner memory between runs. Use a single-process full-suite mode only when
  supported and memory headroom is safe.

## Workflow Additions

1. When building the phase list:
   - User supplied a chunk ID: resolve it with the project's chunk listing and
     use its chunk-selection command.
   - No paths or chunk ID: use the scenario selection to choose chunks and
     collect their failing spec files. Full-suite scope requires explicit
     user authorization.
2. Re-run a failing chunk while the failure is not isolated to a spec. Once
   isolated, continue the main workflow with that spec. If it passes alone,
   reproduce and verify the fix in the failing chunk.
3. Inspect runner diagnostics, including app-server log paths and memory
   snapshots where available. Check memory between chunks when the user
   reports pressure or server memory is known to climb.
4. After all known phases pass, verify every selected chunk. Count
   aggregate success as full-suite coverage only when every spec in scope is
   covered and every chunk passes; return failures to the repair workflow.
