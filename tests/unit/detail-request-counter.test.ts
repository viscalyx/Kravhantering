import type { Page, Route } from '@playwright/test'
import { describe, expect, it, vi } from 'vitest'
import { countDetailRequests } from '@/tests/integration/detail-request-counter'

describe('countDetailRequests', () => {
  it('consumes an early release without releasing the next held request', async () => {
    let routeHandler!: (route: Route) => Promise<void>
    const page = {
      route: vi.fn(async (_url, handler) => {
        routeHandler = handler as (route: Route) => Promise<void>
      }),
    } as unknown as Page
    const counter = await countDetailRequests(
      page,
      /\/api\/requirements\/\d+$/u,
    )

    const earlyRelease = counter.holdNext()
    earlyRelease.release()
    const firstContinue = vi.fn(async () => undefined)
    await routeHandler({ continue: firstContinue } as unknown as Route)
    await earlyRelease.started
    expect(firstContinue).toHaveBeenCalledOnce()

    const heldRequest = counter.holdNext()
    const secondContinue = vi.fn(async () => undefined)
    const secondRoute = routeHandler({
      continue: secondContinue,
    } as unknown as Route)
    await heldRequest.started
    expect(secondContinue).not.toHaveBeenCalled()

    heldRequest.release()
    await secondRoute
    expect(secondContinue).toHaveBeenCalledOnce()
    expect(counter.count).toBe(2)
  })
})
