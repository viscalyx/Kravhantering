import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Footer from '@/components/Footer'
import LanguageSwitcher from '@/components/LanguageSwitcher'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => 'en',
}))

const mockReplace = vi.fn()
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/requirements',
}))

describe('Footer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders copyright text', () => {
    render(<Footer />)
    expect(screen.getByText(/copyright/i)).toBeInTheDocument()
  })
})

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.history.replaceState(null, '', '/en/requirements')
  })

  it('renders switch button', () => {
    render(<LanguageSwitcher />)
    const btn = screen.getByRole('button', { name: 'switchTo' })
    expect(btn).toBeInTheDocument()
  })

  it('uses the same rail icon footprint as navigation links', () => {
    render(<LanguageSwitcher expanded variant="rail" />)

    const icon = screen
      .getByRole('button', { name: 'switchTo' })
      .querySelector('svg')

    expect(icon).toHaveClass('h-5', 'w-5')
  })

  it('calls router.replace on click with other locale and persists choice', () => {
    render(<LanguageSwitcher />)
    const btn = screen.getByRole('button', { name: 'switchTo' })
    fireEvent.click(btn)
    expect(mockReplace).toHaveBeenCalledWith('/requirements', { locale: 'sv' })
    expect(window.localStorage.getItem('locale')).toBe('sv')
  })

  it.each([
    '?tag=one&tag=two&empty=',
    '#section',
    '?text=%C3%A5%26%2B%23%3D%25#section',
  ])('preserves the current URL context %s', suffix => {
    render(<LanguageSwitcher />)
    window.history.replaceState(null, '', `/en/requirements${suffix}`)
    fireEvent.click(screen.getByRole('button', { name: 'switchTo' }))
    expect(mockReplace).toHaveBeenCalledWith(`/requirements${suffix}`, {
      locale: 'sv',
    })
  })

  it('switches language even if the preference cannot be stored', () => {
    const write = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Storage unavailable', 'SecurityError')
      })
    try {
      render(<LanguageSwitcher />)
      fireEvent.click(screen.getByRole('button', { name: 'switchTo' }))
      expect(mockReplace).toHaveBeenCalledWith('/requirements', {
        locale: 'sv',
      })
    } finally {
      write.mockRestore()
    }
  })
})
