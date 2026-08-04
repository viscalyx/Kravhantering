import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusBadgeThemePreview from '@/components/StatusBadgeThemePreview'

const copy = {
  contrastPassLabel: 'Passes AA',
  contrastResultLabel: (ratio: string) => `Contrast ${ratio}:1`,
  darkThemeLabel: 'Dark theme',
  guidance: 'Check both themes.',
  invalidColorWarning: 'Enter an exact hex color.',
  lightThemeLabel: 'Light theme',
  title: 'Badge preview',
}

describe('StatusBadgeThemePreview', () => {
  it('renders icon-and-text previews with passing ratios in both themes', () => {
    const { container } = render(
      <StatusBadgeThemePreview
        color="#3b82f6"
        copy={copy}
        developerModeContext="status editor"
        iconName="PenLine"
        label="Draft"
        warningId="color-warning"
      />,
    )

    const preview = screen.getByRole('status', { name: 'Badge preview' })
    expect(preview).toHaveTextContent('Light theme')
    expect(preview).toHaveTextContent('Dark theme')
    expect(preview).toHaveTextContent('Passes AA')
    expect(container.querySelectorAll('.status-badge')).toHaveLength(2)
    expect(container.querySelectorAll('.status-badge svg')).toHaveLength(2)
    expect(
      container.querySelectorAll('[data-accent-color="#3b82f6"]'),
    ).toHaveLength(2)
  })

  it('shows an invalid-color warning without an accented preview', () => {
    const { container } = render(
      <StatusBadgeThemePreview
        color="invalid-color"
        copy={copy}
        developerModeContext="status editor"
        iconName="PenLine"
        label="Draft"
        warningId="color-warning"
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Enter an exact hex color.',
    )
    expect(container.querySelector('[data-accent-color]')).toBeNull()
  })

  it('previews accent styling without inventing an icon', () => {
    const { container } = render(
      <StatusBadgeThemePreview
        color="#3b82f6"
        copy={copy}
        developerModeContext="status editor"
        label="Draft"
        warningId="color-warning"
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Passes AA')
    expect(
      container.querySelectorAll('[data-accent-color="#3b82f6"]'),
    ).toHaveLength(2)
    expect(container.querySelector('.status-badge svg')).toBeNull()
  })
})
