import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { lazy } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OnDemandFeatureDialog from '@/components/OnDemandFeatureDialog'

const defaultProps = {
  closeLabel: 'Close',
  errorDescription: 'Reload the page and try again.',
  errorTitle: 'Could not load AI-assisted authoring',
  featureId: 'ai-authoring' as const,
  loadingLabel: 'Loading AI-assisted authoring…',
  onErrorClose: vi.fn(),
  reloadLabel: 'Reload page',
  title: 'Generate requirements with AI',
  variant: 'ai' as const,
}

function SuspendedFeature(): never {
  throw new Promise(() => undefined)
}

function BrokenFeature(): never {
  throw new Error('feature import failed')
}

function LoadedFeature() {
  return (
    <section
      aria-label="Generate requirements with AI"
      aria-modal="true"
      role="dialog"
    >
      <button type="button">Loaded feature action</button>
    </section>
  )
}

describe('OnDemandFeatureDialog', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens the requested modal immediately with a focused loading state and no close action', async () => {
    const { unmount } = render(
      <OnDemandFeatureDialog {...defaultProps}>
        <SuspendedFeature />
      </OnDemandFeatureDialog>,
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Generate requirements with AI',
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading AI-assisted authoring…',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(dialog).toHaveAttribute(
      'data-developer-mode-context',
      'AI-assisted authoring',
    )
    expect(dialog).toHaveAttribute(
      'data-developer-mode-name',
      'feature loading',
    )
    expect(dialog).toHaveAttribute('data-developer-mode-value', 'ai-authoring')
    await waitFor(() => expect(dialog).toHaveFocus())
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('restores a nonzero page position after the modal unmounts', () => {
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(12)
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(34)
    const scrollTo = vi.mocked(window.scrollTo)

    const { unmount } = render(
      <OnDemandFeatureDialog {...defaultProps}>
        <SuspendedFeature />
      </OnDemandFeatureDialog>,
    )

    expect(document.body.style.left).toBe('-12px')
    expect(document.body.style.top).toBe('-34px')
    unmount()
    expect(scrollTo).toHaveBeenCalledWith(12, 34)
  })

  it('replaces the loading body with the loaded feature and moves focus into it', async () => {
    let resolveFeature:
      | ((module: { default: typeof LoadedFeature }) => void)
      | null = null
    const LazyFeature = lazy(
      () =>
        new Promise<{ default: typeof LoadedFeature }>(resolve => {
          resolveFeature = resolve
        }),
    )

    render(
      <OnDemandFeatureDialog {...defaultProps}>
        <LazyFeature />
      </OnDemandFeatureDialog>,
    )

    expect(screen.getByRole('status')).toBeVisible()
    await act(async () => {
      resolveFeature?.({ default: LoadedFeature })
    })

    const action = await screen.findByRole('button', {
      name: 'Loaded feature action',
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(action).toHaveFocus()
  })

  it('contains a load failure in the requested modal with close and reload actions', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    const onErrorClose = vi.fn()
    const originalWindow = window
    vi.stubGlobal(
      'window',
      new Proxy(originalWindow, {
        get(target, property) {
          if (property === 'location') return { reload }
          return Reflect.get(target, property, target)
        },
      }),
    )
    const user = userEvent.setup()

    render(
      <OnDemandFeatureDialog {...defaultProps} onErrorClose={onErrorClose}>
        <BrokenFeature />
      </OnDemandFeatureDialog>,
    )

    const alert = screen.getByRole('alert')
    const dialog = screen.getByRole('dialog', {
      name: 'Generate requirements with AI',
    })
    expect(alert).toHaveTextContent('Could not load AI-assisted authoring')
    expect(alert).toHaveTextContent('Reload the page and try again.')
    expect(dialog).toHaveAttribute(
      'data-developer-mode-name',
      'feature load error',
    )

    await user.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(reload).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onErrorClose).toHaveBeenCalledOnce()
  })

  it('traps keyboard focus within the error modal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()

    render(
      <OnDemandFeatureDialog {...defaultProps}>
        <BrokenFeature />
      </OnDemandFeatureDialog>,
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Generate requirements with AI',
    })
    const close = screen.getByRole('button', { name: 'Close' })
    const reload = screen.getByRole('button', { name: 'Reload page' })
    await waitFor(() => expect(dialog).toHaveFocus())

    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(reload).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
  })
})
