import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  RequirementDetailResponse,
  RequirementVersionDetail,
} from '@/lib/requirements/types'

vi.mock('next-intl', () => {
  const cache = new Map<
    string | undefined,
    ((key: string) => string) & { rich: (key: string) => string }
  >()
  return {
    useTranslations: (ns?: string) => {
      const cached = cache.get(ns)
      if (cached) return cached
      const t = ((key: string) => (ns ? `${ns}.${key}` : key)) as ((
        key: string,
      ) => string) & { rich: (key: string) => string }
      t.rich = (key: string) => (ns ? `${ns}.${key}` : key)
      cache.set(ns, t)
      return t
    },
  }
})

vi.mock('@/components/HelpPanel', () => ({
  useHelpContent: vi.fn(),
}))

vi.mock('@/components/RequirementForm', () => ({
  default: (props: {
    baseRevisionToken?: string | null
    baseVersionId?: number | null
    mode: string
    requirementId?: number | string
    initialData?: Record<string, string | boolean>
  }) => (
    <div
      data-base-revision-token={props.baseRevisionToken ?? ''}
      data-base-version-id={props.baseVersionId ?? ''}
      data-initial-data={JSON.stringify(props.initialData)}
      data-mode={props.mode}
      data-testid="req-form"
    />
  ),
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import EditRequirementClient from '@/app/[locale]/requirements/[id]/edit/edit-requirement-client'

function makeVersion(
  overrides: Partial<RequirementVersionDetail> = {},
): RequirementVersionDetail {
  return {
    acceptanceCriteria: 'AC',
    archiveInitiatedAt: null,
    archivedAt: null,
    category: { id: 2, nameEn: 'Category', nameSv: 'Kategori' },
    createdAt: '2026-03-01T00:00:00Z',
    createdBy: 'owner-1',
    description: 'Desc',
    editedAt: null,
    id: 1,
    ownerName: 'Owner',
    publishedAt: null,
    qualityCharacteristic: null,
    requiresTesting: true,
    revisionToken: '11111111-1111-4111-8111-111111111111',
    riskLevel: null,
    status: 1,
    statusColor: '#3b82f6',
    statusNameEn: 'Draft',
    statusNameSv: 'Utkast',
    type: { id: 3, nameEn: 'Type', nameSv: 'Typ' },
    verificationMethod: null,
    versionNumber: 1,
    versionScenarios: [],
    versionNormReferences: [],
    ...overrides,
  }
}

function makeRequirementDetailResponse(
  overrides: Partial<Omit<RequirementDetailResponse, 'versions'>> = {},
  versionOverrides: Partial<RequirementVersionDetail> = {},
): RequirementDetailResponse {
  return {
    area: {
      id: 1,
      name: 'Core platform',
      ownerId: 1,
      ownerName: 'Area Owner',
      prefix: 'REQ',
    },
    createdAt: '2026-03-01T00:00:00Z',
    id: 1,
    isArchived: false,
    specificationCount: 0,
    uniqueId: 'REQ-001',
    versions: [makeVersion(versionOverrides)],
    ...overrides,
  }
}

describe('EditRequirementClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okJson(makeRequirementDetailResponse()))
  })

  it('shows loading initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<EditRequirementClient requirementId={1} />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('fetches requirement data and renders form', async () => {
    fetchMock.mockResolvedValue(
      okJson(
        makeRequirementDetailResponse(
          {},
          {
            id: 10,
            revisionToken: '22222222-2222-4222-8222-222222222222',
          },
        ),
      ),
    )
    render(<EditRequirementClient requirementId={1} />)
    await waitFor(() => {
      expect(screen.getByTestId('req-form')).toBeInTheDocument()
    })
    expect(screen.getByTestId('req-form')).toHaveAttribute('data-mode', 'edit')
    expect(screen.getByTestId('req-form')).toHaveAttribute(
      'data-base-version-id',
      '10',
    )
    expect(screen.getByTestId('req-form')).toHaveAttribute(
      'data-base-revision-token',
      '22222222-2222-4222-8222-222222222222',
    )
    expect(screen.getByText(/REQ-001/)).toBeInTheDocument()
  })

  it('shows a blocked error when requirement is in Review status', async () => {
    fetchMock.mockResolvedValue(
      okJson(makeRequirementDetailResponse({}, { status: 2 })),
    )
    render(<EditRequirementClient requirementId={1} />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'requirement.editNotAllowedStatusReview',
      )
    })
    expect(screen.queryByTestId('req-form')).not.toBeInTheDocument()
  })

  it('shows a blocked error when requirement is in Archived status', async () => {
    fetchMock.mockResolvedValue(
      okJson(makeRequirementDetailResponse({}, { status: 4 })),
    )
    render(<EditRequirementClient requirementId={1} />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'requirement.editNotAllowedStatusArchived',
      )
    })
    expect(screen.queryByTestId('req-form')).not.toBeInTheDocument()
  })

  it('shows the published warning notice when requirement is Published', async () => {
    fetchMock.mockResolvedValue(
      okJson(makeRequirementDetailResponse({}, { status: 3 })),
    )
    render(<EditRequirementClient requirementId={1} />)
    await waitFor(() => {
      expect(screen.getByTestId('req-form')).toBeInTheDocument()
    })
    expect(
      screen.getByText('requirement.editPublishedVersionNotice'),
    ).toBeInTheDocument()
  })

  it('clears a previous fetch error before refetching a new requirement', async () => {
    const nextFetch = deferred<ReturnType<typeof okJson>>()
    fetchMock.mockReset()
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/1')) {
        return Promise.resolve({ ok: false })
      }
      if (url.endsWith('/2')) {
        return nextFetch.promise
      }
      return Promise.resolve(okJson(makeRequirementDetailResponse()))
    })

    const { rerender } = render(<EditRequirementClient requirementId={1} />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('common.error')
    })

    rerender(<EditRequirementClient requirementId={2} />)

    await waitFor(() => {
      expect(screen.getByText('common.loading')).toBeInTheDocument()
    })

    nextFetch.resolve(
      okJson(makeRequirementDetailResponse({ id: 2, uniqueId: 'REQ-002' })),
    )

    await waitFor(() => {
      expect(screen.getByTestId('req-form')).toBeInTheDocument()
    })
    expect(screen.getByText(/REQ-002/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('hides a stale published notice while refetching a different requirement', async () => {
    const nextFetch = deferred<ReturnType<typeof okJson>>()
    fetchMock.mockReset()
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/1')) {
        return Promise.resolve(
          okJson(makeRequirementDetailResponse({}, { status: 3 })),
        )
      }
      if (url.endsWith('/2')) {
        return nextFetch.promise
      }
      return Promise.resolve(okJson(makeRequirementDetailResponse()))
    })

    const { rerender } = render(<EditRequirementClient requirementId={1} />)

    await waitFor(() => {
      expect(
        screen.getByText('requirement.editPublishedVersionNotice'),
      ).toBeInTheDocument()
    })

    rerender(<EditRequirementClient requirementId={2} />)

    await waitFor(() => {
      expect(screen.getByText('common.loading')).toBeInTheDocument()
      expect(
        screen.queryByText('requirement.editPublishedVersionNotice'),
      ).not.toBeInTheDocument()
      expect(screen.queryByTestId('req-form')).not.toBeInTheDocument()
    })

    nextFetch.resolve(okJson(makeRequirementDetailResponse({ id: 2 })))

    await waitFor(() => {
      expect(screen.getByTestId('req-form')).toBeInTheDocument()
    })
    expect(
      screen.queryByText('requirement.editPublishedVersionNotice'),
    ).not.toBeInTheDocument()
  })

  it('pre-fills qualityCharacteristicId from latest version', async () => {
    fetchMock.mockResolvedValue(
      okJson(
        makeRequirementDetailResponse(
          { uniqueId: 'REQ-002' },
          {
            requiresTesting: false,
            qualityCharacteristic: {
              id: 42,
              nameEn: 'Maintainability',
              nameSv: 'Underhallbarhet',
            },
          },
        ),
      ),
    )
    render(<EditRequirementClient requirementId={2} />)
    await waitFor(() => {
      expect(screen.getByTestId('req-form')).toBeInTheDocument()
    })
    const initialData = JSON.parse(
      screen.getByTestId('req-form').getAttribute('data-initial-data') ?? '{}',
    ) as Record<string, string | boolean>
    expect(initialData.qualityCharacteristicId).toBe('42')
  })
})
