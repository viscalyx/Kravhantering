import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PrintButton from '@/components/PrintButton'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      print: 'Skriv ut',
    }
    return translations[key] ?? key
  },
}))

describe('PrintButton', () => {
  it('renders a button with print text', () => {
    render(<PrintButton />)
    expect(screen.getByText('Skriv ut')).toBeTruthy()
  })

  it('calls window.print on click', () => {
    const printSpy = vi.spyOn(globalThis, 'print').mockImplementation(() => {})
    render(<PrintButton />)
    fireEvent.click(screen.getByText('Skriv ut'))
    expect(printSpy).toHaveBeenCalledOnce()
    printSpy.mockRestore()
  })
})
