import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ThemeToggle from '@/components/ThemeToggle'
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

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQueryList = {
    addEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener)
      },
    ),
    matches: initialMatches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    removeEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener)
      },
    ),
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => mediaQueryList),
  })

  return {
    emit(matches: boolean) {
      mediaQueryList.matches = matches
      const event = {
        matches,
        media: mediaQueryList.media,
      } as MediaQueryListEvent

      for (const listener of listeners) {
        listener(event)
      }
    },
  }
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

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    document.head
      .querySelectorAll(`[${themeTransitionGuardAttribute}]`)
      .forEach(node => {
        node.remove()
      })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.classList.remove('dark')
    document.head
      .querySelectorAll(`[${themeTransitionGuardAttribute}]`)
      .forEach(node => {
        node.remove()
      })
  })

  it('cycles light to dark through the guarded theme-change path', () => {
    const animationFrame = createAnimationFrameController()
    const { localStorageMock } = installLocalStorage({ theme: 'light' })
    installMatchMedia(false)

    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'toggle (light)' }))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark')
    expect(getGuardStyle()).toBeTruthy()

    animationFrame.flushNextFrame()

    expect(getGuardStyle()).toBeNull()
  })

  it('updates the document class when the OS preference changes in auto mode', () => {
    const animationFrame = createAnimationFrameController()
    installLocalStorage()
    const matchMedia = installMatchMedia(false)

    render(<ThemeToggle />)

    matchMedia.emit(true)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(getGuardStyle()).toBeTruthy()

    animationFrame.flushNextFrame()

    expect(getGuardStyle()).toBeNull()
  })

  it('does not reapply the dark class on mount when the DOM already matches', () => {
    createAnimationFrameController()
    installLocalStorage({ theme: 'dark' })
    installMatchMedia(true)
    document.documentElement.classList.add('dark')

    render(<ThemeToggle />)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(getGuardStyle()).toBeNull()
  })
})
