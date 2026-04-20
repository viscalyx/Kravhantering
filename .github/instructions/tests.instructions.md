---
applyTo: '**/*.{test,spec}.{ts,tsx,js,mjs,cjs},**/__tests__/**/*'
---

# Tests

## Required Mocks

> **Note:** `framer-motion`, `next/image`, and `next/navigation` are globally
> mocked in `vitest.setup.ts`.
> Do **not** re-mock them in individual test files unless you need custom
> behavior (e.g., controllable pathname, spying on `router.push`).
> The global framer-motion mock uses a `Proxy` that handles any `motion.*`
> element, `AnimatePresence`, `useInView`, and `motion.create()`.
> The global `next/navigation` mock provides default `useRouter`, `usePathname`,
> `useSearchParams`, `useParams`, `redirect`, and `notFound`. Override per-file
> with your own `vi.mock('next/navigation', ...)` when needed.

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

- Do **not** add `act()` by default around every render, assertion, or
  `userEvent` call. Prefer normal Testing Library flows first.
- Prefer `await userEvent.*`, `findBy*`, and `waitFor(...)` when the component
  updates after user interaction, mount-time fetches, or other async effects.
- Use `act()` when the test itself triggers React updates outside Testing
  Library's wrapped helpers, for example:
  - manually advancing timers
  - resolving deferred promises that drive state updates
  - invoking imperative callbacks or hook-returned handlers directly
  - manually firing observer callbacks (`ResizeObserver`, `MutationObserver`,
    etc.)
  - dispatching custom events from raw DOM or browser mocks that bypass
    Testing Library helpers
- If a component starts async work on mount and the test only checks the
  initial shell, either:
  - keep the async work intentionally pending and assert the loading state, or
  - wait for the first settled post-effect UI state before ending the test
- Treat any React warning containing `not wrapped in act(...)` as a real test
  bug. Fix the test by awaiting the missing update or wrapping the direct
  external state trigger in `act()`.

## Responsive Awareness

- When testing components with layout-dependent behavior, consider viewport edge cases (e.g., mobile menu vs desktop nav, collapsed vs expanded layouts)
- For Playwright/E2E tests: test at mobile (375px) and desktop (1280px) viewports

## Coverage Policy

- For all newly added production code, target `>= 85%` coverage for `lines`, `statements`, `functions`, and `branches` in changed files.
- When modifying existing production code, keep or improve coverage; do not let changed files regress; add or update tests in the same change.
- If the target cannot be met immediately, document the gap and add the most direct missing tests next.

## Database Migration Testing

- The approved target architecture is SQL Server + TypeORM. New migration scaffolding should prefer focused tests that validate SQL Server connection parsing, container/admin workflows, seed-parity rules, and read-only browse behavior.
- While the SQLite + Drizzle runtime still exists, keep its tests passing unless the migration explicitly replaces them in the same change.
- When moving a DAL path from SQLite to SQL Server, add or update tests that prove transactional rollback behavior and any preserved seed-data assumptions.
