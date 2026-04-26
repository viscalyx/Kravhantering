import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LocaleStorageSync from '@/components/LocaleStorageSync'
import { LOCALE_STORAGE_KEY } from '@/lib/locale-preference'

const localeRef = { current: 'sv' as 'sv' | 'en' }
vi.mock('next-intl', () => ({
  useLocale: () => localeRef.current,
}))

const mockReplace = vi.fn()
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/requirements',
}))

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

  it('reroutes when another tab changes the stored locale', () => {
    render(<LocaleStorageSync />)
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LOCALE_STORAGE_KEY,
          newValue: 'en',
        }),
      )
    })
    expect(mockReplace).toHaveBeenCalledWith('/requirements', { locale: 'en' })
  })

  it('ignores storage events for unrelated keys', () => {
    render(<LocaleStorageSync />)
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'theme',
          newValue: 'dark',
        }),
      )
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('ignores storage events that match the current locale', () => {
    render(<LocaleStorageSync />)
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LOCALE_STORAGE_KEY,
          newValue: 'sv',
        }),
      )
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('ignores storage events with invalid locales', () => {
    render(<LocaleStorageSync />)
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LOCALE_STORAGE_KEY,
          newValue: 'fr',
        }),
      )
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
