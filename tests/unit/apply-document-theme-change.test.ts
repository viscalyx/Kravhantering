import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyDocumentThemeChange,
  themeTransitionGuardAttribute,
} from '@/lib/theme/apply-document-theme-change'

function getGuardStyle() {
  return document.head.querySelector(`[${themeTransitionGuardAttribute}]`)
}

function createAnimationFrameController() {
  let nextHandle = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  const requestSpy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation(callback => {
      const handle = nextHandle++
      callbacks.set(handle, callback)
      return handle
    })

  const cancelSpy = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(handle => {
      callbacks.delete(handle)
    })

  return {
    cancelSpy,
    flushNextFrame() {
      const pending = [...callbacks.entries()]
      callbacks.clear()
      for (const [, callback] of pending) {
        callback(16)
      }
    },
    requestSpy,
  }
}

describe('applyDocumentThemeChange', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.removeAttribute('data-theme')
    document.head
      .querySelectorAll(`[${themeTransitionGuardAttribute}]`)
      .forEach(node => {
        node.remove()
      })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.head
      .querySelectorAll(`[${themeTransitionGuardAttribute}]`)
      .forEach(node => {
        node.remove()
      })
  })

  it('applies the mutation immediately and inserts a transition guard', () => {
    const animationFrame = createAnimationFrameController()

    applyDocumentThemeChange(() => {
      document.documentElement.classList.add('dark')
    })

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(getGuardStyle()).toBeInstanceOf(HTMLStyleElement)
    expect(getGuardStyle()?.textContent).toContain(
      'animation: none !important;',
    )
    expect(getGuardStyle()?.textContent).toContain(
      'transition: none !important;',
    )
    expect(animationFrame.requestSpy).toHaveBeenCalledTimes(1)
  })

  it('removes the transition guard on the next frame', () => {
    const animationFrame = createAnimationFrameController()

    applyDocumentThemeChange(() => {
      document.documentElement.setAttribute('data-theme', 'navy')
    })

    expect(getGuardStyle()).toBeTruthy()

    animationFrame.flushNextFrame()

    expect(getGuardStyle()).toBeNull()
  })

  it('replaces any existing guard before scheduling a new cleanup', () => {
    const animationFrame = createAnimationFrameController()

    applyDocumentThemeChange(() => {
      document.documentElement.classList.add('dark')
    })
    const firstGuard = getGuardStyle()

    applyDocumentThemeChange(() => {
      document.documentElement.setAttribute('data-theme', 'navy')
    })
    const secondGuard = getGuardStyle()

    expect(firstGuard).not.toBe(secondGuard)
    expect(
      document.head.querySelectorAll(`[${themeTransitionGuardAttribute}]`),
    ).toHaveLength(1)
    expect(animationFrame.cancelSpy).toHaveBeenCalledTimes(1)

    animationFrame.flushNextFrame()

    expect(getGuardStyle()).toBeNull()
  })

  it('falls back to timeout cleanup when requestAnimationFrame is unavailable', () => {
    vi.useFakeTimers()

    const originalRequestAnimationFrame = window.requestAnimationFrame
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: undefined,
    })

    try {
      applyDocumentThemeChange(() => {
        document.documentElement.classList.add('dark')
      })

      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(getGuardStyle()).toBeTruthy()
      expect(setTimeoutSpy).toHaveBeenCalled()

      vi.runAllTimers()

      expect(getGuardStyle()).toBeNull()
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        value: originalRequestAnimationFrame,
      })
      vi.useRealTimers()
    }
  })
})
