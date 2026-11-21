import { createEvent, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LocaleStorageSync from '@/components/LocaleStorageSync'
import { LOCALE_STORAGE_KEY } from '@/lib/locale-preference'

const localeRef = { current: 'sv' as string }
vi.mock('next-intl', () => ({
  useLocale: () => localeRef.current,
}))

const mockReplace = vi.fn()
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/requirements',
}))

function dispatchStorageEvent(init: StorageEventInit): void {
  fireEvent(
    window,
    createEvent('storage', window, init, { EventType: 'StorageEvent' }),
  )
}

describe('LocaleStorageSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    localeRef.current = 'sv'
  })

  it('writes the active locale to localStorage on mount', () => {
    render(<LocaleStorageSync />)
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('sv')
  })

  it('reroutes with the receiving tab’s context when another tab changes the locale', () => {
    render(<LocaleStorageSync />)
    window.history.replaceState(null, '', '/sv/requirements?view=local#row')
    dispatchStorageEvent({
      key: LOCALE_STORAGE_KEY,
      newValue: 'en',
      url: 'http://localhost/sv/specifications?view=other',
    })
    expect(mockReplace).toHaveBeenCalledWith('/requirements?view=local#row', {
      locale: 'en',
    })
  })

  it('ignores storage events for unrelated keys', () => {
    render(<LocaleStorageSync />)
    dispatchStorageEvent({
      key: 'theme',
      newValue: 'dark',
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('ignores storage events that match the current locale', () => {
    render(<LocaleStorageSync />)
    dispatchStorageEvent({
      key: LOCALE_STORAGE_KEY,
      newValue: 'sv',
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('ignores storage events with invalid locales', () => {
    render(<LocaleStorageSync />)
    dispatchStorageEvent({
      key: LOCALE_STORAGE_KEY,
      newValue: 'fr',
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('does not persist an unsupported active locale', () => {
    localeRef.current = 'de'

    render(<LocaleStorageSync />)

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull()
  })
})
