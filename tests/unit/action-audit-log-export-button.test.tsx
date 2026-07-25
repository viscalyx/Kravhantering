import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ActionAuditLogExportButton from '@/components/admin/ActionAuditLogExportButton'

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
    vi.clearAllMocks()
    downloadState.downloading = false
  })

  it('starts the smart CSV download and restores focus to its trigger', async () => {
    const user = userEvent.setup()
    render(
      <ActionAuditLogExportButton
        fallbackFilename="atgardslogg.csv"
        href="/api/admin/audit-events?action=x&locale=sv&format=csv"
        label="Exportera CSV"
      />,
    )
    const button = screen.getByRole('button', { name: 'Exportera CSV' })

    await user.click(button)

    expect(downloadState.download).toHaveBeenCalledWith({
      fallbackFilename: 'atgardslogg.csv',
      output: 'csv',
      restoreFocusTo: button,
      url: '/api/admin/audit-events?action=x&locale=sv&format=csv',
    })
    expect(screen.getByRole('status')).toHaveTextContent('Preparing CSV')
    expect(button).toHaveAttribute('data-developer-mode-context', 'action log')
    expect(button).toHaveAttribute(
      'data-developer-mode-name',
      'CSV export button',
    )
  })

  it('disables duplicate triggering while generation is pending', () => {
    downloadState.downloading = true
    render(
      <ActionAuditLogExportButton
        fallbackFilename="action-log.csv"
        href="/api/admin/audit-events?format=csv"
        label="Export CSV"
      />,
    )

    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })
})
