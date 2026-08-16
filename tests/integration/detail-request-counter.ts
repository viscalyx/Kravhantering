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
  let releaseRequested = false
  let releaseHeldRequest: (() => void) | null = null
  let signalHeldRequest: (() => void) | null = null

  await page.route(url, async route => {
    count += 1
    if (holdNextRequest) {
      holdNextRequest = false
      const heldRequest = releaseRequested
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            releaseHeldRequest = resolve
          })
      releaseRequested = false
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
      let released = false
      return {
        release() {
          if (released) return
          released = true
          if (releaseHeldRequest) {
            releaseHeldRequest()
          } else {
            releaseRequested = true
          }
        },
        started,
      }
    },
    reset() {
      count = 0
    },
  }
}
