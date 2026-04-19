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

## Responsive Awareness

- When testing components with layout-dependent behavior, consider viewport edge cases (e.g., mobile menu vs desktop nav, collapsed vs expanded layouts)
- For Playwright/E2E tests: test at mobile (375px) and desktop (1280px) viewports

## Coverage Policy

- For all newly added production code, target `>= 85%` coverage for `lines`, `statements`, `functions`, and `branches` in changed files.
- When modifying existing production code, keep or improve coverage; do not let changed files regress; add or update tests in the same change.
- If the target cannot be met immediately, document the gap and add the most direct missing tests next.
