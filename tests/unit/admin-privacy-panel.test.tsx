import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PrivacyPanel from '@/app/[locale]/admin/panels/privacy-panel'
import {
  expectAdminPanelContract,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

const state = vi.hoisted(() => ({
  download: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('@/components/privacy/useDataSubjectExportDownload', () => ({
  useDataSubjectExportDownload: () => ({
    dialog: null,
    download: state.download,
    downloading: null,
    error: null,
  }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('PrivacyPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', state.fetch)
  })

  it('owns the privacy tab panel contract', () => {
    renderAdminPanel(<PrivacyPanel />, { confirmModal: true })
    expectAdminPanelContract({ markerValue: 'privacy', tabId: 'privacy' })
  })

  it('previews diverse occurrences, exports evidence, and executes actions', async () => {
    const groups = [
      {
        affectedReferences: ['Area one'],
        allowedActions: ['switch', 'anonymize', 'skip'],
        count: 2,
        currentDisplayValue: 'no-user',
        fieldKey: 'owner',
        key: 'owner',
        objectKey: 'requirementAreas',
        recommendedAction: 'switch',
        warningKey: 'ownership',
      },
      {
        allowedActions: ['switch', 'skip'],
        controlledByGroupKey: 'owner',
        count: 1,
        currentDisplayValue: null,
        fieldKey: 'coAuthor',
        key: 'controlled',
        objectKey: 'areaCoAuthors',
        recommendedAction: 'skip',
        warningKey: null,
      },
      {
        allowedActions: ['skip'],
        count: 1,
        currentDisplayValue: 'Historical',
        fieldKey: 'createdBy',
        key: 'readonly',
        objectKey: 'requirementVersions',
        readOnlyReasonKey: 'history',
        recommendedAction: 'skip',
        warningKey: null,
      },
      {
        allowedActions: [],
        count: 1,
        currentDisplayValue: null,
        disabledReasonKey: 'blocked',
        fieldKey: 'actor',
        key: 'disabled',
        objectKey: 'auditEvents',
        recommendedAction: 'delete',
        warningKey: null,
      },
    ]
    state.fetch.mockImplementation(async (url: string) => {
      if (url === '/api/privacy/erasure-preview') {
        return new Response(
          JSON.stringify({
            groups,
            previewToken: 'preview-1',
            targetFingerprint: '0123456789abcdef0123',
            totalCount: 5,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        )
      }
      return new Response(
        JSON.stringify({
          actions: { anonymize: 0, delete: 0, skip: 3, switch: 2 },
          groups: [],
          requestId: 'erase-1',
          targetFingerprint: 'fingerprint',
          totalCount: 5,
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 201 },
      )
    })

    renderAdminPanel(<PrivacyPanel />, { confirmModal: true })
    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-target1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE5560000001-owner2' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementName'), {
      target: { value: 'New Owner' },
    })
    fireEvent.change(
      screen.getByLabelText('admin.privacy.replacementFirstName'),
      { target: { value: 'New' } },
    )
    fireEvent.change(
      screen.getByLabelText('admin.privacy.replacementLastName'),
      {
        target: { value: 'Owner' },
      },
    )
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementEmail'), {
      target: { value: 'new.owner@example.test' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    expect(await screen.findByText('0123456789abcdef')).toBeVisible()
    expect(screen.getByText('Area one')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.exportJson' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.exportPdf' }),
    )
    expect(state.download).toHaveBeenCalledTimes(2)

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    )
    const confirmDialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmDialog).getByRole('button', {
        name: 'admin.privacy.execute',
      }),
    )
    expect(
      await screen.findByText('admin.privacy.executeSuccess'),
    ).toBeVisible()
    expect(state.fetch).toHaveBeenCalledWith(
      '/api/privacy/erasure-requests',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('maps preview and row-specific execution failures', async () => {
    state.fetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Denied' }), { status: 403 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            groups: [
              {
                allowedActions: ['anonymize'],
                count: 1,
                currentDisplayValue: 'Person',
                fieldKey: 'actor',
                key: 'audit',
                objectKey: 'auditEvents',
                recommendedAction: 'anonymize',
                warningKey: null,
              },
            ],
            previewToken: 'preview-2',
            targetFingerprint: 'abcdef0123456789',
            totalCount: 1,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            details: { groupKey: 'audit', reason: 'retained' },
            error: 'Failed',
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        ),
      )
    renderAdminPanel(<PrivacyPanel />, { confirmModal: true })
    const target = screen.getByLabelText('admin.privacy.targetHsaId')
    fireEvent.change(target, { target: { value: 'SE5560000001-target1' } })
    const previewButton = screen.getByRole('button', {
      name: 'admin.privacy.preview',
    })
    fireEvent.click(previewButton)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.privacy.permissionError',
    )
    fireEvent.click(previewButton)
    expect(await screen.findByText('abcdef0123456789')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    )
    const confirmDialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmDialog).getByRole('button', {
        name: 'admin.privacy.execute',
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByText('admin.privacy.executionStatus.failed'),
      ).toHaveTextContent('admin.privacy.executionStatus.failed'),
    )
  })
})
