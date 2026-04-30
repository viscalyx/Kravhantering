---
applyTo: '**/*.{test,spec}.{ts,tsx,js,mjs,cjs},**/__tests__/**/*'
---

# Tests

Tests in this monorepo run on **Vitest only**. There is no Playwright,
no database harness, and no Next.js test fixture — keep them simple.

## Layout

- Each package keeps its tests in `packages/<name>/tests/**`.
- File names use `*.test.ts` or `*.test.tsx`. The root
  `vitest.config.ts` glob picks them up automatically.
- The shared environment is `happy-dom` (set in `vitest.config.ts`).
  Do not switch environments per test file unless absolutely
  necessary; if you do, restore the default with the file-level
  `// @vitest-environment` pragma so siblings are unaffected.

## Structure

```ts
import { describe, expect, it } from 'vitest'

describe('ComponentName', () => {
  it('does the documented thing', () => {
    // arrange / act / assert
  })
})
```

- Prefer explicit imports (`import { describe, it, expect } from 'vitest'`)
  over `globals: true`. Globals stay disabled in the root config.
- Use Testing Library queries (`screen.getByRole`, `findByText`)
  over `getByTestId`.
- Test public, exported behaviour from each package — never reach
  into `dist/` or relative paths that bypass the package's
  `exports` map. Smoke tests live in
  `packages/<name>/tests/smoke.test.*` and import from `../src/...`.

## React `act()` Guidance

- Do not wrap every render, assertion, or `userEvent` call in
  `act()`. Prefer normal Testing Library flows.
- Prefer `await userEvent.*`, `findBy*`, and `waitFor(...)` for
  async updates after user interaction or mount-time effects.
- Use `act()` only when the test itself triggers React updates
  outside Testing Library helpers (manual timers, observer
  callbacks, imperative handles).
- Treat any React warning containing `not wrapped in act(...)` as
  a real test bug.

## Coverage Policy

- For all newly added production code, target `>= 85%` coverage
  for `lines`, `statements`, `functions`, and `branches` in
  changed files.
- When modifying existing production code, keep or improve
  coverage; do not let changed files regress.
- If the target cannot be met immediately, document the gap in
  the PR description and add the most direct missing tests next.
