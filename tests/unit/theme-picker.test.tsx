import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ThemePicker from '@/components/ThemePicker'
import { themeTransitionGuardAttribute } from '@/lib/theme/apply-document-theme-change'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function installLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))

  const localStorageMock = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
  }

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  })

  return { localStorageMock, store }
}

function createAnimationFrameController() {
  let nextHandle = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    const handle = nextHandle++
    callbacks.set(handle, callback)
    return handle
  })

  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => {
    callbacks.delete(handle)
  })

  return {
    flushNextFrame() {
      const pending = [...callbacks.entries()]
      callbacks.clear()
      for (const [, callback] of pending) {
        callback(16)
      }
    },
  }
}

function getGuardStyle() {
  return document.head.querySelector(`[${themeTransitionGuardAttribute}]`)
}

describe('ThemePicker', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.head
      .querySelectorAll(`[${themeTransitionGuardAttribute}]`)
      .forEach(node => {
        node.remove()
      })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-theme')
    document.head
      .querySelectorAll(`[${themeTransitionGuardAttribute}]`)
      .forEach(node => {
        node.remove()
      })
  })

  it('applies a color theme through the guarded theme-change path', () => {
    const animationFrame = createAnimationFrameController()
    const { localStorageMock } = installLocalStorage()

    render(<ThemePicker />)

    fireEvent.click(screen.getByRole('button', { name: 'pickColor' }))
    fireEvent.click(screen.getByRole('option', { name: /themes\.navy/i }))

    expect(document.documentElement.getAttribute('data-theme')).toBe('navy')
    expect(localStorageMock.setItem).toHaveBeenCalledWith('colorTheme', 'navy')
    expect(getGuardStyle()).toBeTruthy()

    animationFrame.flushNextFrame()

    expect(getGuardStyle()).toBeNull()
  })

  it('does not reapply the color theme on mount when the DOM already matches', () => {
    createAnimationFrameController()
    installLocalStorage({ colorTheme: 'navy' })
    document.documentElement.setAttribute('data-theme', 'navy')

    render(<ThemePicker />)

    expect(document.documentElement.getAttribute('data-theme')).toBe('navy')
    expect(getGuardStyle()).toBeNull()
  })
})
