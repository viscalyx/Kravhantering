import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  devMarker,
  noopDevMarker,
} from '@/lib/runtime/developer-mode-core-noop'
import DeveloperModeProvider from '@/lib/runtime/developer-mode-react-noop'

describe('production Developer Mode adapters', () => {
  it('returns empty marker metadata without retaining input', () => {
    const sensitiveInput = { label: 'database-password' }

    expect(devMarker(sensitiveInput)).toEqual({})
    expect(noopDevMarker()).toEqual({})
    expect(devMarker(sensitiveInput)).not.toBe(devMarker(sensitiveInput))
  })

  it('renders children unchanged while accepting provider-only options', () => {
    render(
      <DeveloperModeProvider
        labels={{ enabled: 'Enabled' }}
        navigationKey="nav"
      >
        <button type="button">Continue</button>
      </DeveloperModeProvider>,
    )

    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible()
  })
})
