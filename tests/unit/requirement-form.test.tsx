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
  useTranslations: (ns?: string) => {
    const t = (key: string) => (ns ? `${ns}.${key}` : key)
    t.rich = (key: string) => (ns ? `${ns}.${key}` : key)
    return t
  },
}))

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: pushMock, back: backMock }),
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

function errJson(body: unknown, status = 400, statusText = 'Bad Request') {
  return { ok: false, json: async () => body, status, statusText }
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
    localStorage.removeItem('requirement-save-destination')
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
        url.includes('/api/quality-characteristics')
      )
        return Promise.resolve(okJson({ qualityCharacteristics: [] }))
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
      if (opts?.method === 'POST')
        return Promise.resolve(
          okJson({ requirement: { id: 42, uniqueId: 'TST0042' }, version: {} }),
        )
      if (typeof url === 'string' && url.includes('/api/requirement-areas'))
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (
        typeof url === 'string' &&
        url.includes('/api/requirement-categories')
      )
        return Promise.resolve(okJson({ categories: sampleCategories }))
      if (
        typeof url === 'string' &&
        url.includes('/api/quality-characteristics')
      )
        return Promise.resolve(okJson({ qualityCharacteristics: [] }))
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

    const postCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === '/api/requirements' &&
        (c[1] as RequestInit)?.method === 'POST',
    )
    const body = JSON.parse((postCall?.[1] as RequestInit).body as string)
    expect(body).toHaveProperty('requiresTesting', false)
    expect(body).not.toHaveProperty('typeCategoryId')

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/requirements?selected=TST0042')
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
        url.includes('/api/quality-characteristics')
      )
        return Promise.resolve(okJson({ qualityCharacteristics: [] }))
      if (typeof url === 'string' && url.includes('/api/requirement-types'))
        return Promise.resolve(okJson({ types: sampleTypes }))
      return Promise.resolve(okJson({}))
    })

    const { container } = render(
      <RequirementForm
        baseRevisionToken="11111111-1111-4111-8111-111111111111"
        baseVersionId={10}
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
    const putCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === '/api/requirements/5' &&
        (c[1] as RequestInit)?.method === 'PUT',
    )
    const body = JSON.parse((putCall?.[1] as RequestInit).body as string)
    expect(body.baseRevisionToken).toBe('11111111-1111-4111-8111-111111111111')
    expect(body.baseVersionId).toBe(10)
  })

  it('shows a stale edit conflict prompt without clearing form data', async () => {
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'PUT')
        return Promise.resolve(
          errJson(
            {
              code: 'conflict',
              details: {
                latest: {
                  uniqueId: 'REQ-001',
                  versions: [
                    {
                      revisionToken: '22222222-2222-4222-8222-222222222222',
                      versionNumber: 2,
                    },
                  ],
                },
                reason: 'stale_requirement_edit',
              },
              error: 'This requirement was updated',
            },
            409,
            'Conflict',
          ),
        )
      if (typeof url === 'string' && url.includes('/api/requirement-areas'))
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (
        typeof url === 'string' &&
        url.includes('/api/requirement-categories')
      )
        return Promise.resolve(okJson({ categories: sampleCategories }))
      if (
        typeof url === 'string' &&
        url.includes('/api/quality-characteristics')
      )
        return Promise.resolve(okJson({ qualityCharacteristics: [] }))
      if (typeof url === 'string' && url.includes('/api/requirement-types'))
        return Promise.resolve(okJson({ types: sampleTypes }))
      return Promise.resolve(okJson({}))
    })

    const { container } = render(
      <RequirementForm
        baseRevisionToken="11111111-1111-4111-8111-111111111111"
        baseVersionId={10}
        initialData={{ description: 'Existing' }}
        mode="edit"
        requirementId={5}
      />,
    )

    const desc = await screen.findByRole('textbox', {
      name: /requirement\.description/,
    })
    fireEvent.change(desc, { target: { value: 'Unsaved local text' } })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'requirement.staleEditConflict',
      )
    })
    expect(desc).toHaveValue('Unsaved local text')
    expect(
      screen.getByRole('button', { name: /requirement\.staleEditViewLatest/ }),
    ).toBeInTheDocument()
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

  it('displays area owner when area is selected', async () => {
    render(
      <RequirementForm
        initialData={{ areaId: '1' }}
        mode="edit"
        requirementId={1}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText(/Owner/)).toBeInTheDocument()
    })
  })

  it('renders select options for categories and types', async () => {
    render(<RequirementForm mode="create" />)
    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: /requirement\.category/ }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('combobox', { name: /requirement\.type/ }),
    ).toBeInTheDocument()
  })

  it('fetches quality characteristics when typeId is set', async () => {
    const sampleQC = [
      { id: 10, nameSv: 'Qc sv', nameEn: 'Qc en', parentId: null },
      { id: 11, nameSv: 'Child sv', nameEn: 'Child en', parentId: 10 },
    ]
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
        url.includes('/api/quality-characteristics')
      )
        return Promise.resolve(okJson({ qualityCharacteristics: sampleQC }))
      if (typeof url === 'string' && url.includes('/api/requirement-types'))
        return Promise.resolve(okJson({ types: sampleTypes }))
      return Promise.resolve(okJson({}))
    })

    render(
      <RequirementForm
        initialData={{ typeId: '1' }}
        mode="edit"
        requirementId={1}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('combobox', {
          name: /requirement\.qualityCharacteristic/,
        }),
      ).toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/quality-characteristics?typeId=1'),
    )
  })

  it('toggles requiresTesting checkbox', async () => {
    render(<RequirementForm mode="create" />)
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', {
          name: /requirement\.requiresTesting/,
        }),
      ).toBeInTheDocument()
    })
    const checkbox = screen.getByRole('checkbox', {
      name: /requirement\.requiresTesting/,
    })
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('changes description and acceptanceCriteria fields', async () => {
    render(<RequirementForm mode="create" />)
    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: /requirement\.description/ }),
      ).toBeInTheDocument()
    })
    const desc = screen.getByRole('textbox', {
      name: /requirement\.description/,
    })
    fireEvent.change(desc, { target: { value: 'My desc' } })
    expect(desc).toHaveValue('My desc')

    const ac = screen.getByRole('textbox', {
      name: /requirement\.acceptanceCriteria/,
    })
    fireEvent.change(ac, { target: { value: 'My criteria' } })
    expect(ac).toHaveValue('My criteria')
  })
})
