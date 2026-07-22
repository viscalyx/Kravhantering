import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArchivingPanel from '@/app/[locale]/admin/panels/archiving-panel'
import {
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

const fetchMock = vi.fn()

function okJson(body: unknown): Response {
  return { json: vi.fn(async () => body), ok: true } as unknown as Response
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

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('ArchivingPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(pendingFetch)
    vi.stubGlobal('fetch', fetchMock)
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
})
