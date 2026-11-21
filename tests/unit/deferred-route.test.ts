import type { Page, Route } from '@playwright/test'
import { expect, it, vi } from 'vitest'
import { deferRoute } from '@/tests/support/deferred-route'

it('keeps the route registered until overlapping requests finish out of order', async () => {
  const register =
    vi.fn<
      (url: string, handler: (route: Route) => Promise<void>) => Promise<void>
    >()
  const unroute = vi.fn()
  const page = { route: register, unroute } as unknown as Page
  const pending = await deferRoute(page, '**/detail', route => route.fulfill())
  const handler = register.mock.calls[0][1]
  const firstResponse = Promise.withResolvers<void>()
  const first = handler({ fulfill: () => firstResponse.promise } as Route)
  const second = handler({ fulfill: async () => undefined } as Route)

  pending.fulfill()
  await second
  const cleanup = pending.cleanup()
  await Promise.resolve()
  expect(unroute).not.toHaveBeenCalled()

  firstResponse.resolve()
  await Promise.all([first, cleanup])
  expect(unroute).toHaveBeenCalledOnce()
})
