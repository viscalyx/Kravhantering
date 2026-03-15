import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/components/RequirementForm', () => ({
  default: (props: { mode: string; requirementId?: number }) => (
    <div data-mode={props.mode} data-testid="req-form" />
  ),
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import EditRequirementClient from '@/app/[locale]/kravkatalog/[id]/redigera/edit-requirement-client'

describe('EditRequirementClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(
      okJson({
        uniqueId: 'REQ-001',
        requirementAreaId: 1,
        versions: [
          {
            description: 'Desc',
            requirementCategoryId: 2,
            requirementTypeId: 3,
            qualityCharacteristicId: null,
            acceptanceCriteria: 'AC',
            requiresTesting: true,
          },
        ],
      }),
    )
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
})
