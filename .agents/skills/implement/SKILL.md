---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask.

Call the Skill tool with "tdd" where possible, at pre-agreed seams.

Run typechecking regularly, single unit test files regularly.
Run integration tests at the end. Call the Skill tool with
"select-integration-tests" before integration runs and after changes to
determine required tests and verification status. After the selected runs
complete, call the Skill tool with "select-integration-tests" again with
their results to update verification evidence before reporting completion,
even when no code changes were made.

Once done, call the Skill tool with "code-review" to review the work.

Commit your work to the current branch.
