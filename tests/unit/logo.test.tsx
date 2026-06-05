import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Logo from '@/components/Logo'

describe('Logo', () => {
  it('renders an eagerly loaded image with accessible alt text', () => {
    render(<Logo />)
    const img = screen.getByRole('img', { name: /logotyp/i })

    expect(img).toHaveAttribute('loading', 'eager')
  })

  it('applies custom className', () => {
    const { container } = render(<Logo className="h-12 w-12" />)
    const img = container.querySelector('img')

    expect(img?.classList.contains('h-12')).toBe(true)
    expect(img?.classList.contains('w-12')).toBe(true)
  })
})
