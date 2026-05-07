import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  RequirementVersionDetail,
  RequirementVersionResponse,
} from '@/lib/requirements/types'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import VersionDetailClient from '@/app/[locale]/requirements/[id]/versions/[version]/version-detail-client'

function makeVersion(
  overrides: Partial<RequirementVersionDetail> = {},
): RequirementVersionDetail {
  return {
    acceptanceCriteria: 'Must pass',
    archiveInitiatedAt: null,
    archivedAt: null,
    category: { id: 2, nameSv: 'Kat', nameEn: 'Category' },
    createdAt: '2024-01-15T00:00:00Z',
    createdBy: null,
    description: 'Some description',
    editedAt: null,
    id: 1,
    ownerName: null,
    publishedAt: null,
    qualityCharacteristic: { id: 4, nameSv: 'TC', nameEn: 'TypeCat' },
    requiresTesting: true,
    revisionToken: '11111111-1111-4111-8111-111111111111',
    riskLevel: null,
    status: 2,
    statusColor: '#eab308',
    statusNameEn: 'Review',
    statusNameSv: 'Granskning',
    type: { id: 3, nameSv: 'Typ', nameEn: 'ReqType' },
    verificationMethod: null,
    versionNumber: 2,
    versionRequirementPackages: [],
    versionNormReferences: [],
    ...overrides,
  }
}

const sampleVersion: RequirementVersionResponse = {
  uniqueId: 'REQ-001',
  version: makeVersion(),
}

describe('VersionDetailClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okJson(sampleVersion))
  })

  it('shows loading initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<VersionDetailClient requirementId={1} versionNumber={2} />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('fetches and displays version data', async () => {
    render(<VersionDetailClient requirementId={1} versionNumber={2} />)
    await waitFor(() => {
      expect(screen.getByText(/REQ-001/)).toBeInTheDocument()
    })
    expect(screen.getByText('Some description')).toBeInTheDocument()
    expect(screen.getByText('Must pass')).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByText('ReqType')).toBeInTheDocument()
    expect(screen.getByText('TypeCat')).toBeInTheDocument()
    expect(screen.getByText('common.yes')).toBeInTheDocument()
  })

  it('shows noResults when data is null', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    })
    render(<VersionDetailClient requirementId={1} versionNumber={2} />)
    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument()
    })
  })
})
