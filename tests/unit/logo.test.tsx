import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Logo from '@/components/Logo'

describe('Logo', () => {
  it('renders an image with accessible alt text', () => {
    const { container } = render(<Logo />)
    const img = container.querySelector('img')

    expect(img).toBeTruthy()
    expect(img?.getAttribute('alt')).toContain('logotyp')
  })

  it('applies custom className', () => {
    const { container } = render(<Logo className="h-12 w-12" />)
    const img = container.querySelector('img')

    expect(img?.classList.contains('h-12')).toBe(true)
    expect(img?.classList.contains('w-12')).toBe(true)
  })
})
