import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import VersionDetailClient from '@/app/[locale]/kravkatalog/[id]/versioner/[version]/version-detail-client'

const sampleVersion = {
  uniqueId: 'REQ-001',
  version: {
    id: 1,
    versionNumber: 2,
    description: 'Some description',
    acceptanceCriteria: 'Must pass',
    category: { nameSv: 'Kat', nameEn: 'Category' },
    type: { nameSv: 'Typ', nameEn: 'ReqType' },
    qualityCharacteristic: { nameSv: 'TC', nameEn: 'TypeCat' },
    requiresTesting: true,
    ownerName: null,
    createdAt: '2024-01-15T00:00:00Z',
  },
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
