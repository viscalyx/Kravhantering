import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LazyAiRequirementGenerator from '@/components/LazyAiRequirementGenerator'
import LazyRequirementsImportDialog, {
  type InitialRequirementsImport,
} from '@/components/LazyRequirementsImportDialog'

const mockDialogState = vi.hoisted(() => ({ importShouldFail: false }))

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) => (key: string, values?: Record<string, unknown>) =>
      `${namespace ? `${namespace}.` : ''}${key}${
        values ? ` ${Object.values(values).join(' ')}` : ''
      }`,
}))

vi.mock('@/components/AiRequirementGenerator', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <section aria-label="Loaded AI authoring" aria-modal="true" role="dialog">
      <button onClick={onClose} type="button">
        Close loaded AI authoring
      </button>
    </section>
  ),
}))

vi.mock('@/components/RequirementsImportDialog', () => ({
  default: ({ onClose }: { onClose: (importSucceeded: boolean) => void }) =>
    mockDialogState.importShouldFail ? (
      (() => {
        throw new Error('import feature failed')
      })()
    ) : (
      <section
        aria-label="Loaded import review"
        aria-modal="true"
        role="dialog"
      >
        <button onClick={() => onClose(true)} type="button">
          Complete loaded import review
        </button>
      </section>
    ),
}))

describe('lazy requirement workflow dialogs', () => {
  beforeEach(() => {
    mockDialogState.importShouldFail = false
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not mount either feature while it is closed', () => {
    const { rerender } = render(
      <LazyAiRequirementGenerator onClose={vi.fn()} open={false} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <LazyRequirementsImportDialog
        mode="library"
        onClose={vi.fn()}
        open={false}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('restores the AI trigger after the loaded feature closes', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<button type="button">AI trigger</button>)
    const trigger = screen.getByRole('button', { name: 'AI trigger' })
    trigger.focus()

    render(
      <LazyAiRequirementGenerator
        onClose={onClose}
        open
        returnFocusTarget={trigger}
      />,
    )

    const close = await screen.findByRole('button', {
      name: 'Close loaded AI authoring',
    })
    expect(close).toHaveFocus()
    await user.click(close)

    expect(onClose).toHaveBeenCalledOnce()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('closes loaded AI authoring without a return target', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(<LazyAiRequirementGenerator onClose={onClose} open />)

    await user.click(
      await screen.findByRole('button', {
        name: 'Close loaded AI authoring',
      }),
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('reports import success and restores the import trigger', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<button type="button">Import trigger</button>)
    const trigger = screen.getByRole('button', { name: 'Import trigger' })
    trigger.focus()

    render(
      <LazyRequirementsImportDialog
        destinationName="Example specification"
        mode="specification-local"
        onClose={onClose}
        open
        returnFocusTarget={trigger}
      />,
    )

    const complete = await screen.findByRole('button', {
      name: 'Complete loaded import review',
    })
    expect(complete).toHaveFocus()
    await user.click(complete)

    expect(onClose).toHaveBeenCalledWith(true)
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('keeps a library import load failure in the requested modal', async () => {
    mockDialogState.importShouldFail = true
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const initialImport = {
      key: 'queued-import',
      payload: {},
    } as InitialRequirementsImport

    render(
      <LazyRequirementsImportDialog
        initialImport={initialImport}
        mode="library"
        onClose={onClose}
        open
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'onDemandFeature.importReview.loadErrorTitle',
    )
    expect(
      screen.getByRole('dialog', {
        name: 'onDemandFeature.importReview.titleLibrary',
      }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'common.close' }))
    expect(onClose).toHaveBeenCalledWith(false)
  })
})
