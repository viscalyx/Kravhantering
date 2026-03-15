import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SearchBar from '@/components/SearchBar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('SearchBar', () => {
  it('renders with initial value', () => {
    render(<SearchBar onChange={vi.fn()} value="test" />)
    const input = screen.getByRole('searchbox')
    expect(input).toHaveValue('test')
  })

  it('calls onChange on form submit', () => {
    const onChange = vi.fn()
    render(<SearchBar onChange={onChange} value="" />)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'query' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(onChange).toHaveBeenCalledWith('query')
  })

  it('clears input on clear button click', () => {
    const onChange = vi.fn()
    render(<SearchBar onChange={onChange} value="test" />)
    const clearBtn = screen.getByRole('button', { name: /clearSearch/i })
    fireEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('does not show clear button when value is empty', () => {
    render(<SearchBar onChange={vi.fn()} value="" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
