import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NoopDeveloperModeProvider from '../src/noop'

describe('@viscalyx/developer-mode-react/noop', () => {
  it('renders children unchanged with no markup overhead', () => {
    render(
      <NoopDeveloperModeProvider
        labels={{ badge: 'Dev', copied: 'Copied', copyFailed: 'Failed' }}
      >
        <span>hello world</span>
      </NoopDeveloperModeProvider>,
    )
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })
})
