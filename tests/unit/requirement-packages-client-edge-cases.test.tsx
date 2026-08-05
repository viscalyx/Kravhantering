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
  useTranslations: (namespace?: string) => (key: string) =>
    `${namespace}.${key}`,
}))
vi.mock('@/i18n/routing', () => routingLinkMock())
vi.mock('@/components/ConfirmModal', () => confirmModalMock(confirm))
vi.mock('@/components/StatusBadge', () => statusBadgeMock())

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementPackagesClient from '@/app/[locale]/requirement-packages/requirement-packages-client'

const actor = {
  authenticated: true,
  hsaId: 'SE5560000001-admin',
  name: 'Admin',
  roles: ['Admin'],
}
const requirementPackage = {
  id: 1,
  isArchived: false,
  leadDisplayName: 'Lead',
  leadEmail: null,
  leadHsaId: 'SE5560000001-lead',
  linkedRequirementCount: 2,
  name: 'Package',
  permissions: { canManageAssignments: true },
  purposeAndScope: '',
}

function urlOf(value: unknown) {
  return value instanceof Request ? value.url : String(value)
}

describe('requirement-package client branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirm.mockResolvedValue(true)
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = urlOf(input)
      if (url === '/api/auth/me') return okJsonResponse(actor)
      if (url.startsWith('/api/requirement-packages?')) {
        return okJsonResponse({ requirementPackages: [requirementPackage] })
      }
      return okJsonResponse({})
    })
  })

  it('archives and reactivates packages while preserving compact state actions', async () => {
    render(<RequirementPackagesClient />)
    await screen.findByText('Package')
    fetchMock
      .mockResolvedValueOnce(
        okJsonResponse({ ...requirementPackage, isArchived: true }),
      )
      .mockResolvedValueOnce(
        okJsonResponse({
          requirementPackages: [{ ...requirementPackage, isArchived: true }],
        }),
      )
    fireEvent.click(
      screen.getByRole('button', { name: 'requirementPackage.archive' }),
    )
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages/1/archive',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const reactivate = await screen.findByRole('button', {
      name: 'requirementPackage.reactivate',
    })
    fetchMock
      .mockResolvedValueOnce(okJsonResponse(requirementPackage))
      .mockResolvedValueOnce(
        okJsonResponse({ requirementPackages: [requirementPackage] }),
      )
    fireEvent.click(reactivate)
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages/1/reactivate',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('shows response and network errors from package state actions', async () => {
    render(<RequirementPackagesClient />)
    await screen.findByText('Package')
    const archive = screen.getByRole('button', {
      name: 'requirementPackage.archive',
    })
    fetchMock.mockResolvedValueOnce(
      failedJsonResponse({ error: 'Archive denied' }),
    )
    fireEvent.click(archive)
    expect(await screen.findByRole('alert')).toHaveTextContent('Archive denied')

    fetchMock.mockRejectedValueOnce(new Error('network failure'))
    fireEvent.click(archive)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('common.error'),
    )
  })

  it('renders linked descriptions and all locale status fallbacks then closes the dialog', async () => {
    const longDescription = 'L'.repeat(170)
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = urlOf(input)
      if (url === '/api/auth/me') return okJsonResponse(actor)
      if (url.startsWith('/api/requirement-packages?')) {
        return okJsonResponse({ requirementPackages: [requirementPackage] })
      }
      if (url === '/api/requirement-packages/1') {
        return okJsonResponse({
          linkedRequirements: [
            {
              archiveInitiatedAt: null,
              description: null,
              id: 1,
              statusColor: null,
              statusIconName: null,
              statusNameEn: 'English',
              statusNameSv: 'Svenska',
              uniqueId: 'REQ-NULL',
              versionNumber: 1,
            },
            {
              archiveInitiatedAt: '2026-08-01T00:00:00.000Z',
              description: longDescription,
              id: 2,
              statusColor: null,
              statusIconName: null,
              statusId: 2,
              statusNameEn: null,
              statusNameSv: 'Svenska',
              uniqueId: 'REQ-LONG',
              versionNumber: 2,
            },
            {
              archiveInitiatedAt: null,
              description: 'Short',
              id: 3,
              statusColor: null,
              statusIconName: null,
              statusNameEn: null,
              statusNameSv: null,
              uniqueId: 'REQ-SHORT',
              versionNumber: 3,
            },
          ],
          requirementPackage,
        })
      }
      return okJsonResponse({})
    })
    render(<RequirementPackagesClient />)
    await screen.findByText('Package')
    fireEvent.click(
      screen.getByRole('button', {
        name: /requirementPackage\.requirementCount/i,
      }),
    )
    await screen.findByText('REQ-NULL')
    expect(screen.getByText('-')).toBeInTheDocument()
    expect(screen.getByText(`${'L'.repeat(80)}...`)).toHaveAttribute(
      'title',
      longDescription,
    )
    expect(
      screen.getByText('requirement.statusLabel.Arkiveringsgranskning'),
    ).toBeInTheDocument()
    expect(screen.getByText('Svenska')).toBeInTheDocument()
    const closeButtons = screen.getAllByRole('button', { name: 'common.close' })
    fireEvent.click(closeButtons.at(-1) as HTMLElement)
    await waitFor(() => expect(screen.queryByText('REQ-NULL')).toBeNull())
  })

  it('falls back for malformed actor responses and rejected actor requests', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = urlOf(input)
      if (url === '/api/auth/me') return failedJsonResponse({})
      if (url.startsWith('/api/requirement-packages?')) {
        return okJsonResponse({ requirementPackages: [requirementPackage] })
      }
      return okJsonResponse({})
    })
    const first = render(<RequirementPackagesClient />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'requirementPackage.currentUserUnavailable',
    )
    first.unmount()

    fetchMock.mockImplementation(async (input: unknown) => {
      if (urlOf(input) === '/api/auth/me') throw 'network failure'
      return okJsonResponse({ requirementPackages: [requirementPackage] })
    })
    render(<RequirementPackagesClient />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'requirementPackage.currentUserUnavailable',
    )
  })

  it.each([
    null,
    { authenticated: false },
    { authenticated: true, hsaId: ' ' },
  ])('rejects malformed successful actor payload %#', async body => {
    fetchMock.mockImplementation(async (input: unknown) => {
      if (urlOf(input) === '/api/auth/me') return okJsonResponse(body)
      return okJsonResponse({ requirementPackages: [requirementPackage] })
    })
    render(<RequirementPackagesClient />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'requirementPackage.currentUserUnavailable',
    )
  })

  it('normalizes actor fallbacks and renders packages without assignment permission', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      if (urlOf(input) === '/api/auth/me') {
        return okJsonResponse({
          authenticated: true,
          email: 7,
          hsaId: ' SE5560000001-fallback ',
          name: ' ',
          roles: ['Author', 7],
        })
      }
      return okJsonResponse({
        requirementPackages: [
          requirementPackage,
          {
            ...requirementPackage,
            id: 2,
            linkedRequirementCount: 0,
            name: 'No assignment permission',
            permissions: undefined,
          },
        ],
      })
    })
    render(<RequirementPackagesClient />)
    expect(
      await screen.findByText('No assignment permission'),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', {
        name: 'requirementPackage.manageCoAuthors',
      }),
    ).toHaveLength(1)
  })

  it('accepts an actor without a roles collection', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      if (urlOf(input) === '/api/auth/me') {
        return okJsonResponse({
          authenticated: true,
          hsaId: 'SE5560000001-author',
        })
      }
      return okJsonResponse({ requirementPackages: [requirementPackage] })
    })
    render(<RequirementPackagesClient />)
    expect(await screen.findByText('Package')).toBeInTheDocument()
  })

  it('renders nullable package details in the edit form', async () => {
    render(<RequirementPackagesClient />)
    await screen.findByText('Package')
    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }))
    expect(
      screen.getByRole('button', { name: 'requirementPackage.changeLead' }),
    ).toBeInTheDocument()
  })

  it('shows a linked-requirements network failure', async () => {
    render(<RequirementPackagesClient />)
    await screen.findByText('Package')
    fetchMock.mockRejectedValueOnce(new Error('network failure'))
    fireEvent.click(
      screen.getByRole('button', {
        name: /requirementPackage\.requirementCount/i,
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('common.error')
    fetchMock.mockResolvedValueOnce(okJsonResponse({}))
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(await screen.findByText('common.noneAvailable')).toBeInTheDocument()
  })

  it('ignores linked data that resolves after its modal closes', async () => {
    let resolveLinked!: (response: unknown) => void
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = urlOf(input)
      if (url === '/api/auth/me') return okJsonResponse(actor)
      if (url.startsWith('/api/requirement-packages?')) {
        return okJsonResponse({ requirementPackages: [requirementPackage] })
      }
      if (url === '/api/requirement-packages/1') {
        return new Promise(resolve => {
          resolveLinked = resolve
        })
      }
      return okJsonResponse({})
    })
    render(<RequirementPackagesClient />)
    await screen.findByText('Package')
    fireEvent.click(
      screen.getByRole('button', {
        name: /requirementPackage\.requirementCount/i,
      }),
    )
    await screen.findByRole('status')
    const closeButtons = screen.getAllByRole('button', { name: 'common.close' })
    fireEvent.click(closeButtons.at(-1) as HTMLElement)
    resolveLinked(okJsonResponse({ linkedRequirements: [] }))
    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    )
  })

  it('ignores an actor response that resolves after unmount', async () => {
    let resolveActor!: (response: unknown) => void
    fetchMock.mockImplementation(async (input: unknown) => {
      if (urlOf(input) === '/api/auth/me') {
        return new Promise(resolve => {
          resolveActor = resolve
        })
      }
      return okJsonResponse({ requirementPackages: [requirementPackage] })
    })
    const view = render(<RequirementPackagesClient />)
    view.unmount()
    resolveActor(okJsonResponse(actor))
    await Promise.resolve()
  })
})
