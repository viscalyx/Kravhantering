import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dispatchGlobalNavigationLayoutEvent,
  GLOBAL_NAVIGATION_LAYOUT_EVENT,
} from '@/lib/navigation-layout-events'

describe('navigation layout event', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('notifies observers in a browser', () => {
    const listener = vi.fn()
    window.addEventListener(GLOBAL_NAVIGATION_LAYOUT_EVENT, listener)

    dispatchGlobalNavigationLayoutEvent()

    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(GLOBAL_NAVIGATION_LAYOUT_EVENT, listener)
  })

  it('is safe during server rendering', () => {
    vi.stubGlobal('window', undefined)

    expect(() => dispatchGlobalNavigationLayoutEvent()).not.toThrow()
  })
})
