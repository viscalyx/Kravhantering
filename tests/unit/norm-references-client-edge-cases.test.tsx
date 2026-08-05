import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmModalMock,
  failedJsonResponse,
  okJsonResponse,
  routingLinkMock,
  statusBadgeMock,
} from './helpers/admin-client-test-helpers'

const confirm = vi.hoisted(() => vi.fn())
vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace?: string) =>
    Object.assign((key: string) => `${namespace}.${key}`, {
      rich: (key: string) => `${namespace}.${key}`,
    }),
}))
vi.mock('@/i18n/routing', () => routingLinkMock())
vi.mock('@/components/ConfirmModal', () => confirmModalMock(confirm))
vi.mock('@/components/StatusBadge', () => statusBadgeMock())

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import NormReferencesClient from '@/app/[locale]/norm-references/norm-references-client'

const norm = {
  id: 1,
  isArchived: false,
  issuer: 'ISO',
  linkedRequirementCount: 2,
  name: 'Security Standard',
  normReferenceId: 'ISO-1',
  reference: 'ISO 1',
  type: 'Standard',
  updatedAt: '2026-08-01T00:00:00.000Z',
  uri: null,
  version: null,
}

describe('norm-reference client branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okJsonResponse({ normReferences: [norm] }))
  })

  it('filters across reference fields and clears an active search', async () => {
    fetchMock.mockResolvedValue(
      okJsonResponse({
        normReferences: [
          norm,
          {
            ...norm,
            id: 2,
            issuer: 'Boverket',
            name: 'Building rules',
            normReferenceId: 'BBR',
            reference: 'Chapter 1',
            type: 'Regulation',
            version: '31',
          },
        ],
      }),
    )
    render(<NormReferencesClient />)
    await screen.findByText('Security Standard')
    const filter = screen.getByRole('textbox', {
      name: 'normReference.filterByName',
    })
    fireEvent.change(filter, { target: { value: 'bbr' } })
    await waitFor(() =>
      expect(screen.getByText('Building rules')).toBeInTheDocument(),
    )
    expect(screen.queryByText('Security Standard')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'common.clearSearch' }))
    expect(await screen.findByText('Security Standard')).toBeInTheDocument()
  })

  it('renders null, short, and truncated linked descriptions with locale status fallbacks', async () => {
    const longDescription = 'A'.repeat(170)
    fetchMock
      .mockResolvedValueOnce(okJsonResponse({ normReferences: [norm] }))
      .mockResolvedValueOnce(
        okJsonResponse({
          linkedRequirements: [
            {
              archiveInitiatedAt: null,
              description: null,
              id: 1,
              statusColor: null,
              statusIconName: null,
              statusNameEn: 'English only',
              statusNameSv: null,
              uniqueId: 'REQ-NULL',
              versionNumber: 1,
            },
            {
              archiveInitiatedAt: null,
              description: 'Short',
              id: 2,
              statusColor: null,
              statusIconName: null,
              statusNameEn: null,
              statusNameSv: 'Svenska',
              uniqueId: 'REQ-SHORT',
              versionNumber: 2,
            },
            {
              archiveInitiatedAt: null,
              description: longDescription,
              id: 3,
              statusColor: null,
              statusIconName: null,
              statusNameEn: null,
              statusNameSv: null,
              uniqueId: 'REQ-LONG',
              versionNumber: 3,
            },
          ],
          normReference: norm,
        }),
      )
    render(<NormReferencesClient />)
    await screen.findByText('Security Standard')
    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }))
    await screen.findByText('REQ-NULL')
    expect(screen.getAllByText('-').length).toBeGreaterThan(0)
    expect(screen.getByText('Short')).toBeInTheDocument()
    expect(screen.getByText(`${'A'.repeat(80)}...`)).toHaveAttribute(
      'title',
      longDescription,
    )
    expect(screen.getByText('English only')).toBeInTheDocument()
    expect(screen.getByText('Svenska')).toBeInTheDocument()
  })

  it('shows linked-load response and network failures', async () => {
    fetchMock
      .mockResolvedValueOnce(okJsonResponse({ normReferences: [norm] }))
      .mockResolvedValueOnce(failedJsonResponse({}))
    const first = render(<NormReferencesClient />)
    await screen.findByText('Security Standard')
    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('common.error')
    first.unmount()

    fetchMock
      .mockResolvedValueOnce(okJsonResponse({ normReferences: [norm] }))
      .mockRejectedValueOnce(new Error('network failure'))
    render(<NormReferencesClient />)
    await screen.findByText('Security Standard')
    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('common.error')
  })

  it('renders loading and empty linked states when the response omits its list', async () => {
    let resolveLinked!: (value: unknown) => void
    const pending = new Promise(resolve => {
      resolveLinked = resolve
    })
    fetchMock
      .mockResolvedValueOnce(okJsonResponse({ normReferences: [norm] }))
      .mockReturnValueOnce(pending)
    render(<NormReferencesClient />)
    await screen.findByText('Security Standard')
    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'common.loading',
    )
    resolveLinked(okJsonResponse({}))
    expect(await screen.findByText('common.noneAvailable')).toBeInTheDocument()
  })

  it('shows response and network errors from archive actions', async () => {
    confirm.mockResolvedValue(true)
    render(<NormReferencesClient />)
    await screen.findByText('Security Standard')
    const archive = screen.getByRole('button', {
      name: 'normReference.archive',
    })

    fetchMock.mockResolvedValueOnce(failedJsonResponse({}))
    fireEvent.click(archive)
    expect(await screen.findByRole('alert')).toHaveTextContent('common.error')

    fetchMock.mockRejectedValueOnce(new Error('network failure'))
    fireEvent.click(archive)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('common.error'),
    )
  })
})
