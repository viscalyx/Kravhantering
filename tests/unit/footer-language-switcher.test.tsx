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
  })

  it('renders switch button', () => {
    render(<LanguageSwitcher />)
    const btn = screen.getByRole('button', { name: 'switchTo' })
    expect(btn).toBeInTheDocument()
  })

  it('calls router.replace on click with other locale and persists choice', () => {
    render(<LanguageSwitcher />)
    const btn = screen.getByRole('button', { name: 'switchTo' })
    fireEvent.click(btn)
    expect(mockReplace).toHaveBeenCalledWith('/requirements', { locale: 'sv' })
    expect(window.localStorage.getItem('locale')).toBe('sv')
  })
})
