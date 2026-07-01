# Integration Test Instructions

## Test Case Source

- `docs/governance/manuella-testfall.md` is the source of truth for test
  cases.
- Playwright specs reference manual coverage by including the manual case id in
  the relevant test title, for example `REQ-01: ...`.
- If a manual case is stale, update the manual case and the matching spec.
- Keep specs organized by application area folder. Do not group unrelated app
  areas in the same spec file.

## Playwright Style

- Use auto-retrying web-first assertions (`await expect(locator).toHaveText()`,
  `.toContainText()`, `.toHaveURL()`, `.toHaveCount()`). Avoid `.toBeVisible()`
  unless explicitly testing a visibility change.
- Never use `page.waitForTimeout()` or increase default timeouts. Rely on
  Playwright auto-waiting.
- Use `test.step()` to group related interactions within a test.
- Drive coverage through user-level actions such as clicks, keyboard input,
  form filling, toggles, dialogs, and downloads. Direct API calls are acceptable
  for setup, cleanup, and verifying persisted state.
- Route mocks are acceptable when the UI behavior is the subject of the manual
  case or when avoiding destructive side effects, but the spec should still
  exercise the visible UI controls a user would use.
