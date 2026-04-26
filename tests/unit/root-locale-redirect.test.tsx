import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RootLocaleRedirect from '@/components/RootLocaleRedirect'
import { LOCALE_STORAGE_KEY } from '@/lib/locale-preference'

const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

describe('RootLocaleRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('redirects to the default locale when nothing is stored', () => {
    render(<RootLocaleRedirect defaultLocale="sv" />)
    expect(mockReplace).toHaveBeenCalledWith('/sv/requirements')
  })

  it('redirects to the stored locale when present', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en')
    render(<RootLocaleRedirect defaultLocale="sv" />)
    expect(mockReplace).toHaveBeenCalledWith('/en/requirements')
  })

  it('falls back to the default locale when the stored value is invalid', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'fr')
    render(<RootLocaleRedirect defaultLocale="sv" />)
    expect(mockReplace).toHaveBeenCalledWith('/sv/requirements')
  })
})
