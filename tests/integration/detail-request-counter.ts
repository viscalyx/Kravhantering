import type { Page } from '@playwright/test'

interface HeldDetailRequest {
  release(): void
  started: Promise<void>
}

export interface DetailRequestCounter {
  readonly count: number
  holdNext(): HeldDetailRequest
  reset(): void
}

export async function countDetailRequests(
  page: Page,
  url: string | RegExp,
): Promise<DetailRequestCounter> {
  let count = 0
  let holdNextRequest = false
  let releaseHeldRequest: (() => void) | null = null
  let signalHeldRequest: (() => void) | null = null

  await page.route(url, async route => {
    count += 1
    if (holdNextRequest) {
      holdNextRequest = false
      const heldRequest = new Promise<void>(resolve => {
        releaseHeldRequest = resolve
      })
      signalHeldRequest?.()
      signalHeldRequest = null
      await heldRequest
      releaseHeldRequest = null
    }
    await route.continue()
  })

  return {
    get count() {
      return count
    },
    holdNext() {
      if (holdNextRequest || releaseHeldRequest) {
        throw new Error('A detail request is already held.')
      }
      holdNextRequest = true
      const started = new Promise<void>(resolve => {
        signalHeldRequest = resolve
      })
      return {
        release() {
          releaseHeldRequest?.()
        },
        started,
      }
    },
    reset() {
      count = 0
    },
  }
}
