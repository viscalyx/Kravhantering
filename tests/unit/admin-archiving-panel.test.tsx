import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArchivingPanel from '@/app/[locale]/admin/panels/archiving-panel'
import {
  clickAdminConfirmationAction,
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

const fetchMock = vi.fn()
const panelState = vi.hoisted(() => ({
  downloadBlob: vi.fn(),
  locale: 'sv',
  translations: {
    admin: (key: string) => `admin.${key}`,
    common: (key: string) => `common.${key}`,
  },
}))

function okJson(body: unknown): Response {
  return { json: vi.fn(async () => body), ok: true } as unknown as Response
}

function errorJson(error: string, status = 500): Response {
  return new Response(JSON.stringify({ error }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function retentionPolicy() {
  return {
    action: 'delete',
    ageDays: 730,
    decisionReference: null,
    id: 5,
    informationSet: 'Retention policy',
    isEnabled: true,
    lastRunAt: '2026-07-13T23:30:00.000Z',
    latestRun: null,
    policyKey: 'retention_policy',
    statusCondition: 'Older than two years',
  }
}

function retentionPreview({ requiresExport = false } = {}) {
  const policy = retentionPolicy()
  return {
    candidates: [
      {
        action: 'delete',
        ageBasis: '2024-07-13T23:30:00.000Z',
        blockedReasonKey: null,
        currentDisplayValue: null,
        fieldKey: 'displayName',
        key: 'candidate-1',
        objectKey: 'requirements',
        reference: 'REQ-1',
        requiresExport,
        sourceKey: 'requirements.old',
        subjectId: '1',
        subjectTable: 'requirements',
      },
    ],
    cutoff: '2024-07-14T00:00:00.000Z',
    policy,
    previewToken: 'preview-token',
    summary: {
      archiveCount: requiresExport ? 1 : 0,
      candidateCount: 1,
      deleteCount: 1,
      exceptionCount: 0,
      skippedCount: 0,
    },
  }
}

vi.mock('@/lib/browser-download', () => ({
  downloadBlob: panelState.downloadBlob,
}))

vi.mock('next-intl', () => ({
  useLocale: () => panelState.locale,
  useTranslations: (namespace: 'admin' | 'common') =>
    panelState.translations[namespace],
}))

describe('ArchivingPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(pendingFetch)
    vi.stubGlobal('fetch', fetchMock)
    panelState.downloadBlob.mockReset()
    panelState.locale = 'sv'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('owns the archiving tab panel contract', () => {
    renderAdminPanel(<ArchivingPanel />, { confirmModal: true })
    expectAdminPanelContract({
      markerValue: 'archiving',
      tabId: 'archiving',
    })
  })

  it('formats retention timestamps in the shared UTC timezone', async () => {
    const dateTimeSpy = vi
      .spyOn(Date.prototype, 'toLocaleString')
      .mockReturnValue('formatted date and time')
    const dateSpy = vi
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('formatted date')
    const policy = retentionPolicy()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url === '/api/admin/archiving/policies' && method === 'GET') {
          return Promise.resolve(okJson({ policies: [policy] }))
        }
        if (url === '/api/admin/archiving/preview' && method === 'POST') {
          return Promise.resolve(
            okJson({
              candidates: [
                {
                  action: 'delete',
                  ageBasis: '2024-07-13T23:30:00.000Z',
                  blockedReasonKey: null,
                  currentDisplayValue: 'Old value',
                  fieldKey: 'displayName',
                  key: 'candidate-1',
                  objectKey: 'requirements',
                  reference: 'REQ-1',
                  requiresExport: false,
                  sourceKey: 'requirements.old',
                  subjectId: '1',
                  subjectTable: 'requirements',
                },
              ],
              cutoff: '2024-07-14T00:00:00.000Z',
              policy,
              previewToken: 'preview-token',
              summary: {
                archiveCount: 0,
                candidateCount: 1,
                deleteCount: 1,
                exceptionCount: 0,
                skippedCount: 0,
              },
            }),
          )
        }
        return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`))
      },
    )

    renderAdminPanel(<ArchivingPanel />, { confirmModal: true })

    expect(await screen.findByText('formatted date and time')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.preview',
      }),
    )
    expect(await screen.findByText('REQ-1')).toBeVisible()

    expect(dateTimeSpy).toHaveBeenCalledWith('sv', { timeZone: 'UTC' })
    expect(dateSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
    for (const call of dateSpy.mock.calls) {
      expect(call).toEqual(['sv', { timeZone: 'UTC' }])
    }
  })

  it('creates an exception, refreshes preview, and executes after confirmation', async () => {
    const preview = retentionPreview()
    fetchMock
      .mockResolvedValueOnce(okJson({ policies: [retentionPolicy()] }))
      .mockResolvedValueOnce(okJson(preview))
      .mockResolvedValueOnce(okJson({ exception: { id: 9 } }))
      .mockResolvedValueOnce(okJson(preview))
      .mockResolvedValueOnce(okJson({ ...preview, runId: 11 }))
      .mockResolvedValueOnce(okJson({ policies: [retentionPolicy()] }))

    renderAdminPanel(<ArchivingPanel />, { confirmModal: true })
    await screen.findByText('Retention policy')
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.preview',
      }),
    )
    await screen.findByText('REQ-1')
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.createException',
      }),
    )
    expect(
      await screen.findByText('admin.archiving.retention.exceptionCreated'),
    ).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.execute',
      }),
    )
    await clickAdminConfirmationAction('admin.archiving.retention.execute')

    expect(
      await screen.findByText('admin.archiving.retention.executeSuccess'),
    ).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/archiving/runs',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('requires export, downloads English JSON, supports cancel, then executes with its token', async () => {
    panelState.locale = 'en'
    const preview = retentionPreview({ requiresExport: true })
    preview.policy.policyKey = ' !!! '
    fetchMock
      .mockResolvedValueOnce(okJson({ policies: [retentionPolicy()] }))
      .mockResolvedValueOnce(okJson(preview))
      .mockResolvedValueOnce(
        okJson({
          archive: { schemaVersion: 'v2' },
          exportToken: 'export-token',
        }),
      )
      .mockResolvedValueOnce(okJson({ ...preview, runId: 11 }))
      .mockResolvedValueOnce(okJson({ policies: [retentionPolicy()] }))

    renderAdminPanel(<ArchivingPanel />, { confirmModal: true })
    await screen.findByText('Retention policy')
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.preview',
      }),
    )
    expect(
      await screen.findByText('admin.archiving.retention.exportRequired'),
    ).toBeVisible()
    const execute = screen.getByRole('button', {
      name: 'admin.archiving.retention.execute',
    })
    expect(execute).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.exportJson',
      }),
    )
    await waitFor(() => expect(panelState.downloadBlob).toHaveBeenCalled())
    expect(panelState.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(
        /^archive-export-retention-\d{4}-\d{2}-\d{2}\.json$/,
      ),
    )
    expect(execute).toBeEnabled()

    fireEvent.click(execute)
    await clickAdminConfirmationAction('common.cancel')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    fireEvent.click(execute)
    await clickAdminConfirmationAction('admin.archiving.retention.execute')
    await screen.findByText('admin.archiving.retention.executeSuccess')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/archiving/runs',
      expect.objectContaining({
        body: JSON.stringify({
          exportToken: 'export-token',
          policyId: 5,
          previewToken: 'preview-token',
        }),
      }),
    )
  })

  it('recovers from policy load failures and clears preview when policy changes', async () => {
    const disabledPolicy = {
      ...retentionPolicy(),
      id: 6,
      informationSet: 'Disabled policy',
      isEnabled: false,
      lastRunAt: null,
    }
    fetchMock
      .mockResolvedValueOnce(errorJson('policy service unavailable'))
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(
        okJson({ policies: [retentionPolicy(), disabledPolicy] }),
      )

    renderAdminPanel(<ArchivingPanel />, { confirmModal: true })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'policy service unavailable',
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.reload',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.archiving.retention.loadError',
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.reload',
      }),
    )
    await screen.findByText('Retention policy')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '6' } })
    expect(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.preview',
      }),
    ).toBeDisabled()
    expect(screen.getByText('admin.archiving.retention.disabled')).toBeVisible()
  })

  it('keeps an empty policy list stable and falls back when an error has no message', async () => {
    fetchMock.mockResolvedValueOnce(okJson({})).mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }),
    )

    renderAdminPanel(<ArchivingPanel />, { confirmModal: true })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.preview',
      }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.reload',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.archiving.retention.loadError',
    )
  })

  it('maps preview, exception, export, and execution failures to visible messages', async () => {
    const preview = retentionPreview({ requiresExport: true })
    fetchMock
      .mockResolvedValueOnce(okJson({ policies: [retentionPolicy()] }))
      .mockResolvedValueOnce(errorJson('preview rejected', 422))
      .mockResolvedValueOnce(okJson(preview))
      .mockResolvedValueOnce(errorJson('exception rejected', 422))
      .mockResolvedValueOnce(errorJson('stale export', 409))
      .mockResolvedValueOnce(
        okJson({ archive: {}, exportToken: 'export-token' }),
      )
      .mockResolvedValueOnce(errorJson('stale run', 409))

    renderAdminPanel(<ArchivingPanel />, { confirmModal: true })
    await screen.findByText('Retention policy')
    const previewButton = screen.getByRole('button', {
      name: 'admin.archiving.retention.preview',
    })
    fireEvent.click(previewButton)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'preview rejected',
    )
    fireEvent.click(previewButton)
    await screen.findByText('REQ-1')
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.createException',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'exception rejected',
    )
    const exportButton = screen.getByRole('button', {
      name: 'admin.archiving.retention.exportJson',
    })
    fireEvent.click(exportButton)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.archiving.retention.stalePreview',
    )
    fireEvent.click(exportButton)
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'admin.archiving.retention.execute',
        }),
      ).toBeEnabled(),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.execute',
      }),
    )
    await clickAdminConfirmationAction('admin.archiving.retention.execute')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.archiving.retention.stalePreview',
    )
  })

  it('shows bounded messages when each retention mutation loses its network', async () => {
    const preview = retentionPreview()
    fetchMock
      .mockResolvedValueOnce(okJson({ policies: [retentionPolicy()] }))
      .mockRejectedValueOnce(new Error('preview network failure'))
      .mockResolvedValueOnce(okJson(preview))
      .mockRejectedValueOnce(new Error('exception network failure'))
      .mockRejectedValueOnce(new Error('export network failure'))
      .mockRejectedValueOnce(new Error('execution network failure'))

    renderAdminPanel(<ArchivingPanel />, { confirmModal: true })
    await screen.findByText('Retention policy')
    const previewButton = screen.getByRole('button', {
      name: 'admin.archiving.retention.preview',
    })
    fireEvent.click(previewButton)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.archiving.retention.previewError',
    )
    fireEvent.click(previewButton)
    await screen.findByText('REQ-1')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.createException',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.archiving.retention.exceptionError',
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.exportJson',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.archiving.retention.exportError',
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.execute',
      }),
    )
    await clickAdminConfirmationAction('admin.archiving.retention.execute')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.archiving.retention.executeError',
    )
  })
})
