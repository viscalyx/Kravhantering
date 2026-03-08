import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ExportButton from '@/components/ExportButton'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const t: Record<string, string> = { export: 'Exportera' }
    return t[key] ?? key
  },
}))

describe('ExportButton', () => {
  it('renders with export label', () => {
    render(<ExportButton onClick={() => {}} />)
    expect(screen.getByText('Exportera')).toBeTruthy()
  })

  it('calls onClick handler', () => {
    const handler = vi.fn()
    render(<ExportButton onClick={handler} />)
    fireEvent.click(screen.getByText('Exportera'))
    expect(handler).toHaveBeenCalledOnce()
  })
})
