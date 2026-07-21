import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusBadge from '@/components/StatusBadge'
import {
  contrastRatio,
  hexToRgb,
  relativeLuminance,
} from '@/lib/color-contrast'

const luminanceOfHex = (hex: string) => relativeLuminance(...hexToRgb(hex))

describe('StatusBadge', () => {
  it('renders the label', () => {
    render(<StatusBadge color="#3b82f6" label="Draft" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('emits exact light- and dark-mode background and foreground variables', () => {
    const { container } = render(<StatusBadge color="#3b82f6" label="Test" />)
    const span = container.querySelector('span.status-badge') as HTMLElement
    expect(span).toBeTruthy()
    expect(span.style.getPropertyValue('--sb-fg-light')).toMatch(
      /^#[0-9a-f]{6}$/,
    )
    expect(span.style.getPropertyValue('--sb-fg-dark')).toMatch(
      /^#[0-9a-f]{6}$/,
    )
    expect(span.style.getPropertyValue('--sb-bg-light')).toMatch(
      /^#[0-9a-f]{6}$/,
    )
    expect(span.style.getPropertyValue('--sb-bg-dark')).toMatch(
      /^#[0-9a-f]{6}$/,
    )
  })

  it('omits accent styling when color is null', () => {
    const { container } = render(<StatusBadge color={null} label="Unknown" />)
    const span = container.querySelector('span.status-badge') as HTMLElement
    expect(span).toBeTruthy()
    expect(span).not.toHaveAttribute('data-accent-color')
    expect(span.style.getPropertyValue('--sb-bg-light')).toBe('')
    expect(span).toHaveClass('bg-secondary-100')
  })

  it('clamps a low-contrast DB color to a readable light-mode foreground (WCAG 1.4.3)', () => {
    const { container } = render(<StatusBadge color="#ffff00" label="Bright" />)
    const span = container.querySelector('span.status-badge') as HTMLElement
    const light = span.style.getPropertyValue('--sb-fg-light')
    // Bright yellow on near-white background fails 4.5:1; the light foreground
    // must be darkened so it passes against white.
    const background = span.style.getPropertyValue('--sb-bg-light')
    expect(contrastRatio(light, background)).toBeGreaterThanOrEqual(4.5)
    expect(light.toLowerCase()).not.toBe('#ffff00')
  })

  it('lightens a dark DB color so it remains readable in dark mode (WCAG 1.4.3)', () => {
    // Dark blue would be unreadable on the dark navy page bg; the dark
    // variant must be lightened so it passes 4.5:1 against #0f172a.
    const { container } = render(<StatusBadge color="#1e3a8a" label="Deep" />)
    const span = container.querySelector('span.status-badge') as HTMLElement
    const dark = span.style.getPropertyValue('--sb-fg-dark')
    const background = span.style.getPropertyValue('--sb-bg-dark')
    expect(contrastRatio(dark, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('produces a darker light-variant and lighter dark-variant for mid-tones', () => {
    const { container } = render(<StatusBadge color="#3b82f6" label="Blue" />)
    const span = container.querySelector('span.status-badge') as HTMLElement
    const light = span.style.getPropertyValue('--sb-fg-light')
    const dark = span.style.getPropertyValue('--sb-fg-dark')
    expect(luminanceOfHex(dark)).toBeGreaterThan(luminanceOfHex(light))
  })

  it('preserves a high-contrast DB color unchanged in light mode', () => {
    const { container } = render(<StatusBadge color="#000000" label="Black" />)
    const span = container.querySelector('span.status-badge') as HTMLElement
    expect(span.style.getPropertyValue('--sb-fg-light').toLowerCase()).toBe(
      '#000000',
    )
  })

  it('uses an opaque background derived from the configured accent', () => {
    const { container } = render(<StatusBadge color="#3b82f6" label="Test" />)
    const span = container.querySelector('span.status-badge') as HTMLElement
    expect(span.style.getPropertyValue('--sb-bg-light')).toBe('#e7effe')
    expect(span.style.getPropertyValue('--sb-bg-dark')).toBe('#152444')
    expect(span.style.backgroundColor).toBe('')
  })

  it('omits accent styling for an invalid configured value', () => {
    const { container } = render(
      <StatusBadge color="invalid" label="Invalid" />,
    )
    const span = container.querySelector('span.status-badge') as HTMLElement
    expect(span).not.toHaveAttribute('data-accent-color')
    expect(span.getAttribute('style')).toBeNull()
  })

  it('renders the configured icon and supports forced theme previews', () => {
    const { container } = render(
      <StatusBadge
        color="#22c55e"
        iconName="ArrowDownLeft"
        label="P2 - Low"
        theme="dark"
      />,
    )
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('.status-badge--dark')).toBeTruthy()
  })

  it('respects the size prop', () => {
    const { rerender, container } = render(
      <StatusBadge color="#3b82f6" label="Test" size="sm" />,
    )
    expect(container.querySelector('.text-\\[10px\\]')).toBeTruthy()

    rerender(<StatusBadge color="#3b82f6" label="Test" size="md" />)
    expect(container.querySelector('.text-xs')).toBeTruthy()
  })
})
