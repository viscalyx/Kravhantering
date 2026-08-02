---
applyTo: "{tests/powershell/**/*.Tests.ps1}"
---

# Pester Tests Guidelines

## Core Requirements
- Do not classify a test as unit when it can change state outside its isolated
  test fixture.
- Treat every integration test as potentially destructive.
- All public commands, private functions and classes must have unit tests
- All public commands must have integration tests
- Use Pester 6 syntax exclusively.
- Test code only inside `Describe` blocks
- Never test verbose messages, debug messages or parameter binding behavior
- Pass all mandatory parameters to avoid prompts

## Requirements
- Inside `It` blocks, assign unused return objects to `$null` (unless part of pipeline)
- Tested entity must be called from within the `It` blocks
- Keep results and assertions in same `It` block
- Avoid try-catch-finally for cleanup, use `AfterAll` or `AfterEach`
- Avoid unnecessary remove/recreate cycles
- Keep `Should.DisableV5 = $true` in runners.

## Naming
- One `Describe` block per file matching the tested entity name
- `Context` descriptions start with 'When'
- `It` descriptions start with 'Should', must not contain 'when'
- Mock variables prefix: 'mock'
- Tag suites with `Unit` or `Integration` to match their directory.

## Structure & Scope
- Public commands: Never use `InModuleScope` (unless retrieving localized strings or creating an object using an internal PowerShell class)
- Private functions/PowerShell class: Always use `InModuleScope`
- Each PowerShell class method = separate `Context` block
- Each scenario = separate `Context` block
- Use nested `Context` blocks for complex scenarios
- Mocking in `BeforeAll` (`BeforeEach` only when required)
- Setup/teardown in `BeforeAll`,`BeforeEach`/`AfterAll`,`AfterEach` close to usage
- Spacing between blocks, arrange, act, and assert for readability

## Syntax Rules
- PascalCase: `Describe`, `Context`, `It`, `Should`, `BeforeAll`, `BeforeEach`, `AfterAll`, `AfterEach` and types
- Never use `Assert-MockCalled`, use `Should-Invoke` instead
- If asserting command not throwing, invoke command directly in `It`-block and pass command output to $null if result not used in assertions, `It` block catches any exception.
- Never add an empty `-MockWith` block
- Omit `-MockWith` on `Mock` when returning `$null`
- Set `$PSDefaultParameterValues` in top BeforeAll-block for `Mock:ModuleName`, `Should-Invoke:ModuleName`, `Should-NotInvoke:ModuleName`, `InModuleScope:ModuleName`
- Omit `-ModuleName` parameter on Pester commands
- Never use `Mock` inside `InModuleScope`-block
- Never use `param()`-block inside `-MockWith` scriptblocks, parameters are auto-bound
- In `InModuleScope` tests, add `Set-StrictMode -Version 1.0` immediately before invoking the tested function
- Use `Should-Invoke -Exactly -Times <n> -Scope It` for call-count assertions
  - Assert <n> calls inside the `It` block; do not assert call counts across an entire `Describe` or `Context`
- Types must always use full type names

## File Organization

### Unit tests
- Class resources: `tests/powershell/Unit/Classes/{Name}.Tests.ps1`
- Public commands: `tests/powershell/Unit/Public/{Name}.Tests.ps1`
- Private functions: `tests/powershell/Unit/Private/{Name}.Tests.ps1`

### Integration tests
- Class resources: `tests/powershell/Integration/Classes/{Name}.Tests.ps1`
- Public commands: `tests/powershell/Integration/Public/{Name}.Tests.ps1`
- Private functions: `tests/powershell/Integration/Private/{Name}.Tests.ps1`

## Data-Driven Tests (Test Cases)
- Define `-ForEach` variables in separate `BeforeDiscovery` (close to usage)
- `-ForEach` allowed on `Context` and `It` blocks
- Never add `param()` inside Pester blocks when using `-ForEach`
- Access test case properties directly: `$PropertyName`

## Best Practices
- Cover all scenarios and code paths
- Use `BeforeEach` and `AfterEach` sparingly
- Use `$PSDefaultParameterValues` only for Pester commands (`Describe`, `Context`, `It`, `Mock`, `Should-Invoke`, `Should-NotInvoke`, `InModuleScope`)

## Unit Tests

- Keep every unit test safe for automatic execution in a developer workspace.
- Mock process, service, network, cloud, native-command, prompt, credential, and
  persistent-filesystem boundaries.
- Use Pester `TestDrive` for filesystem behavior.
- Never read from or write to the developer's real home directory, credential
  stores, repositories, services, containers, cloud resources, or accounts.
- Restore process-scoped environment variables and other mutable state in
  `AfterEach` or `AfterAll`.

## Integration Tests

- Require `KRAVHANTERING_PESTER_INTEGRATION=1` opt-in before discovering or executing
  integration setup or tests.
- Skip the complete `Describe` block when the opt-in is absent.
- Never add PowerShell integration tests to `npm run check`, default local test
  commands, editor auto-test tasks, hooks, devcontainer lifecycle commands, or
  other automatic developer workflows.
- Run integration tests locally only through
  `npm run test:powershell:integration`. The runner sets the opt-in inside its
  isolated, offline test container.
- Never target production resources, shared developer resources, or personal
  credentials.

## CI

- Run integration tests only in a dedicated PowerShell workflow on an ephemeral
  runner.
- Use `npm run test:powershell:integration` in CI so local explicit runs and CI
  have the same isolation boundary.
- Set `KRAVHANTERING_PESTER_INTEGRATION=1` only inside the offline
  integration-test container.
- Keep workflow permissions minimal and do not expose production or long-lived
  developer credentials.
- Publish the Pester test result even when the test step fails.
