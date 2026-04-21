---
applyTo: '**/*.{test,spec}.{ts,tsx,js,mjs,cjs},**/__tests__/**/*'
---

# Tests

For tests under `tests/quality/`, also follow
`.github/instructions/quality-spec.instructions.md` and the directory's
own `AGENTS.md` (Fitness Scenario authoring checklist).

## Required Mocks

- `framer-motion`, `next/image`, and `next/navigation` are globally mocked in `vitest.setup.ts`. Do not re-mock unless you need custom behavior (e.g., controllable pathname, spying on `router.push`).
- The global `framer-motion` mock uses a `Proxy` that handles any `motion.*` element, `AnimatePresence`, `useInView`, and `motion.create()`.
- The global `next/navigation` mock provides default `useRouter`, `usePathname`, `useSearchParams`, `useParams`, `redirect`, and `notFound`. Override per-file with `vi.mock('next/navigation', ...)` when needed.

```tsx
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
```

## Structure

```tsx
describe('ComponentName', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders correctly', () => {})
  it('handles interactions', async () => {})
})
```

## Server Component / Page Tests

For async server components (`generateMetadata`, `generateStaticParams`, page default exports):

```tsx
// Mock next-intl/server for server components
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  getFormatter: vi.fn(async () => ({
    dateTime: (date: Date) => date.toISOString(),
  })),
}))

// Test generateMetadata
const params = Promise.resolve({ locale: 'en', slug: 'test-post' })
const metadata = await generateMetadata({ params })
expect(metadata.title).toBeDefined()

// Test generateStaticParams
const result = generateStaticParams()
expect(result).toEqual([{ slug: 'post-1' }, { slug: 'post-2' }])
```

## Guidelines

- Use `screen.getByRole()` over `getByTestId()`
- Test user behavior, not implementation
- Clear mocks in `beforeEach`
- Use `@/lib/` path alias in mocks (not `../../lib/`)

## React `act()` Guidance

- Do not wrap every render, assertion, or `userEvent` call in `act()`. Prefer normal Testing Library flows.
- Prefer `await userEvent.*`, `findBy*`, and `waitFor(...)` for async updates after user interaction, mount-time fetches, or other effects.
- Use `act()` only when the test itself triggers React updates outside Testing Library helpers:
  - manually advancing timers
  - resolving deferred promises that drive state updates
  - invoking imperative callbacks or hook-returned handlers directly
  - manually firing observer callbacks (`ResizeObserver`, `MutationObserver`, etc.)
  - dispatching custom events from raw DOM or browser mocks that bypass Testing Library helpers
- For components that start async work on mount when the test only checks the initial shell, either keep the async work pending and assert the loading state, or wait for the first settled post-effect UI state.
- Treat any React warning containing `not wrapped in act(...)` as a real test bug. Fix by awaiting the missing update or wrapping the external state trigger in `act()`.

## Responsive Awareness

- When testing components with layout-dependent behavior, consider viewport edge cases (e.g., mobile menu vs desktop nav, collapsed vs expanded layouts)
- For Playwright/E2E tests: test at mobile (375px) and desktop (1280px) viewports

## Coverage Policy

- For all newly added production code, target `>= 85%` coverage for `lines`, `statements`, `functions`, and `branches` in changed files.
- When modifying existing production code, keep or improve coverage; do not let changed files regress; add or update tests in the same change.
- If the target cannot be met immediately, document the gap and add the most direct missing tests next.

## Database Testing

- See `.github/instructions/database-schema.instructions.md` for stack rules. Persistence tests should validate SQL Server connection parsing, `scripts/db-sqlserver-admin.mjs` admin workflows, seed coverage in `typeorm/seed.mjs`, and read-only browse behavior.
- DAL tests should cover transactional rollback behavior, parameter binding (`@0`/`@1` placeholders), and any seed-data assumptions the unit relies on.
- New entities or migrations require corresponding seed coverage in `typeorm/seed.mjs` and a focused unit test that exercises the new path.
