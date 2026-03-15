import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: vi.fn() }),
}))

const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ owners: [] }),
})
vi.stubGlobal('fetch', fetchMock)

import OmradesagarePage, {
  generateMetadata,
} from '@/app/[locale]/omradesagare/page'

describe('omradesagare page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generateMetadata returns title', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toBe('areaOwners')
  })

  it('renders the client component', () => {
    render(<OmradesagarePage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
