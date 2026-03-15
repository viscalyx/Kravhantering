import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
const backMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: pushMock, back: backMock }),
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementForm from '@/components/RequirementForm'

const sampleAreas = [{ id: 1, name: 'Area 1', ownerName: 'Owner' }]
const sampleCategories = [{ id: 1, nameSv: 'Kat', nameEn: 'Cat' }]
const sampleTypes = [{ id: 1, nameSv: 'Typ', nameEn: 'Type' }]

describe('RequirementForm', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/requirement-areas'))
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (
        typeof url === 'string' &&
        url.includes('/api/requirement-categories')
      )
        return Promise.resolve(okJson({ categories: sampleCategories }))
      if (
        typeof url === 'string' &&
        url.includes('/api/requirement-type-categories')
      )
        return Promise.resolve(okJson({ typeCategories: [] }))
      if (typeof url === 'string' && url.includes('/api/requirement-types'))
        return Promise.resolve(okJson({ types: sampleTypes }))
      return Promise.resolve(okJson({}))
    })
  })

  it('renders create mode form', async () => {
    const { container } = render(<RequirementForm mode="create" />)
    await waitFor(() => {
      expect(container.querySelector('form')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: /common\.save/i }),
    ).toBeInTheDocument()
  })

  it('renders edit mode form', async () => {
    const { container } = render(
      <RequirementForm
        initialData={{ description: 'Test desc' }}
        mode="edit"
        requirementId={1}
      />,
    )
    await waitFor(() => {
      expect(container.querySelector('form')).toBeInTheDocument()
    })
  })

  it('fetches options on mount', async () => {
    render(<RequirementForm mode="create" />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/requirement-areas')
      expect(fetchMock).toHaveBeenCalledWith('/api/requirement-categories')
      expect(fetchMock).toHaveBeenCalledWith('/api/requirement-types')
    })
  })

  it('submits create form and navigates', async () => {
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return Promise.resolve(okJson({ id: 42 }))
      if (typeof url === 'string' && url.includes('/api/requirement-areas'))
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (
        typeof url === 'string' &&
        url.includes('/api/requirement-categories')
      )
        return Promise.resolve(okJson({ categories: sampleCategories }))
      if (
        typeof url === 'string' &&
        url.includes('/api/requirement-type-categories')
      )
        return Promise.resolve(okJson({ typeCategories: [] }))
      if (typeof url === 'string' && url.includes('/api/requirement-types'))
        return Promise.resolve(okJson({ types: sampleTypes }))
      return Promise.resolve(okJson({}))
    })

    const { container } = render(<RequirementForm mode="create" />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/requirement-areas')
    })

    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/kravkatalog/42')
    })
  })

  it('submits edit form targeting correct URL', async () => {
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'PUT') return Promise.resolve(okJson({ id: 5 }))
      if (typeof url === 'string' && url.includes('/api/requirement-areas'))
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (
        typeof url === 'string' &&
        url.includes('/api/requirement-categories')
      )
        return Promise.resolve(okJson({ categories: sampleCategories }))
      if (
        typeof url === 'string' &&
        url.includes('/api/requirement-type-categories')
      )
        return Promise.resolve(okJson({ typeCategories: [] }))
      if (typeof url === 'string' && url.includes('/api/requirement-types'))
        return Promise.resolve(okJson({ types: sampleTypes }))
      return Promise.resolve(okJson({}))
    })

    const { container } = render(
      <RequirementForm
        initialData={{ description: 'Existing' }}
        mode="edit"
        requirementId={5}
      />,
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/requirement-areas')
    })

    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements/5',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })

  it('navigates back on cancel', async () => {
    render(<RequirementForm mode="create" />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/requirement-areas')
    })
    const cancelBtn = screen.getByRole('button', { name: /common\.cancel/i })
    fireEvent.click(cancelBtn)
    expect(backMock).toHaveBeenCalled()
  })
})
