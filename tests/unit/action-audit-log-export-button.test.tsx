import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ActionAuditLogExportButton, {
  actionAuditLogExportControllerLoader,
} from '@/components/admin/ActionAuditLogExportButton'

const downloadState = vi.hoisted(() => ({
  download: vi.fn(),
  downloading: false,
}))

vi.mock('@/components/generated-output/useGeneratedOutputDownload', () => ({
  useGeneratedOutputDownload: () => ({
    ...downloadState,
    dialog: <p role="status">Preparing CSV</p>,
  }),
}))

describe('ActionAuditLogExportButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    downloadState.download.mockClear()
    downloadState.downloading = false
  })

  it('starts the smart CSV download and restores focus to its trigger', async () => {
    const user = userEvent.setup()
    render(
      <ActionAuditLogExportButton
        fallbackFilename="atgardslogg.csv"
        href="/api/admin/audit-events?action=x&locale=sv&format=csv"
        label="Exportera CSV"
        loadErrorLabel="CSV-exporten kunde inte läsas in. Försök igen."
      />,
    )
    const button = screen.getByRole('button', { name: 'Exportera CSV' })

    await user.click(button)

    await waitFor(() =>
      expect(downloadState.download).toHaveBeenCalledWith({
        fallbackFilename: 'atgardslogg.csv',
        output: 'csv',
        restoreFocusTo: screen.getByRole('button', {
          name: 'Exportera CSV',
        }),
        url: '/api/admin/audit-events?action=x&locale=sv&format=csv',
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent('Preparing CSV')
    const loadedButton = screen.getByRole('button', { name: 'Exportera CSV' })
    expect(loadedButton).toHaveAttribute(
      'data-developer-mode-context',
      'action log',
    )
    expect(loadedButton).toHaveAttribute(
      'data-developer-mode-name',
      'CSV export button',
    )
  })

  it('disables duplicate triggering while generation is pending', async () => {
    const user = userEvent.setup()
    downloadState.downloading = true
    render(
      <ActionAuditLogExportButton
        fallbackFilename="action-log.csv"
        href="/api/admin/audit-events?format=csv"
        label="Export CSV"
        loadErrorLabel="Could not load the CSV export. Try again."
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled(),
    )
    expect(downloadState.download).toHaveBeenCalledTimes(1)
  })

  it('reports a controller load failure and allows retry', async () => {
    const user = userEvent.setup()
    vi.spyOn(
      actionAuditLogExportControllerLoader,
      'load',
    ).mockRejectedValueOnce(new Error('chunk failed'))
    render(
      <ActionAuditLogExportButton
        fallbackFilename="action-log.csv"
        href="/api/admin/audit-events?format=csv"
        label="Export CSV"
        loadErrorLabel="Could not load the CSV export. Try again."
      />,
    )

    const button = screen.getByRole('button', { name: 'Export CSV' })
    await user.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the CSV export. Try again.',
    )
    expect(button).toBeEnabled()

    await user.click(button)

    await waitFor(() => expect(downloadState.download).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
