import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  RequirementDetailResponse,
  RequirementVersionDetail,
} from '@/lib/requirements/types'

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/components/HelpPanel', () => ({
  useHelpContent: vi.fn(),
}))

vi.mock('@/components/RequirementForm', () => ({
  default: (props: {
    mode: string
    requirementId?: number
    initialData?: Record<string, string | boolean>
  }) => (
    <div
      data-initial-data={JSON.stringify(props.initialData)}
      data-mode={props.mode}
      data-testid="req-form"
    />
  ),
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
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
    references: [],
    requiresTesting: true,
    status: 1,
    statusColor: '#3b82f6',
    statusNameEn: 'Draft',
    statusNameSv: 'Utkast',
    type: { id: 3, nameEn: 'Type', nameSv: 'Typ' },
    verificationMethod: null,
    versionNumber: 1,
    versionScenarios: [],
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
    render(<EditRequirementClient requirementId={1} />)
    await waitFor(() => {
      expect(screen.getByTestId('req-form')).toBeInTheDocument()
    })
    expect(screen.getByTestId('req-form')).toHaveAttribute('data-mode', 'edit')
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
