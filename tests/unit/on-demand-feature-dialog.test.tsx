import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { lazy, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OnDemandFeatureDialog from '@/components/OnDemandFeatureDialog'
import { useModalFocus } from '@/hooks/useModalFocus'

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

function LoadedModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLElement>(null)
  const { handleKeyDown } = useModalFocus({ modalRef, open: true, onClose })
  return (
    <section
      aria-label="Loaded"
      onKeyDown={handleKeyDown}
      ref={modalRef}
      role="dialog"
    >
      <h2>Loaded</h2>
      <button onClick={onClose} type="button">
        Close loaded
      </button>
    </section>
  )
}

describe('OnDemandFeatureDialog', () => {
  it('restores the page invoker after the loading panel hands ownership to the loaded modal', async () => {
    let resolveFeature: (module: { default: typeof LoadedModal }) => void =
      () => {}
    const LazyModal = lazy(
      () =>
        new Promise<{ default: typeof LoadedModal }>(resolve => {
          resolveFeature = resolve
        }),
    )
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">
            Open feature
          </button>
          {open && (
            <OnDemandFeatureDialog {...defaultProps}>
              <LazyModal onClose={() => setOpen(false)} />
            </OnDemandFeatureDialog>
          )}
        </>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open feature' })
    await user.click(trigger)
    await act(async () => {
      resolveFeature({ default: LoadedModal })
    })
    await user.click(
      await screen.findByRole('button', { name: 'Close loaded' }),
    )
    await waitFor(() => expect(trigger).toHaveFocus())
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

  it('renders import loading accessibly and retains focus without controls', async () => {
    render(
      <OnDemandFeatureDialog
        {...defaultProps}
        featureId="import-review"
        title="Review import"
        variant="import"
        wide
      >
        <SuspendedFeature />
      </OnDemandFeatureDialog>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Review import' })
    expect(dialog).toHaveAttribute(
      'data-developer-mode-context',
      'requirement import review',
    )
    await waitFor(() => expect(dialog).toHaveFocus())

    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(dialog).toHaveFocus()
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
