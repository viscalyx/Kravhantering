import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
  fetch: vi.fn(),
  locale: 'en',
}))

vi.mock('next-intl', () => ({
  useLocale: () => state.locale,
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: state.confirm }),
}))

vi.stubGlobal('fetch', state.fetch)

import QualityCharacteristicsClient from '@/app/[locale]/quality-characteristics/quality-characteristics-client'

function requiredElement<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

const types = [{ id: 1, nameEn: 'Quality', nameSv: 'Kvalitet' }]
const categories = [
  {
    chapterId: '3',
    id: 10,
    nameEn: 'Parent',
    nameSv: 'Foralder',
    parentId: null,
    requirementTypeId: 1,
  },
  {
    chapterId: '3.0',
    id: 11,
    nameEn: 'Equal child',
    nameSv: 'Likvardigt barn',
    parentId: 10,
    requirementTypeId: 1,
  },
]

const ok = (body: unknown) => ({ ok: true, json: async () => body })

describe('QualityCharacteristicsClient branch behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.locale = 'en'
    state.fetch.mockImplementation((url: string) => {
      if (url === '/api/requirement-types')
        return Promise.resolve(ok({ types }))
      if (url === '/api/quality-characteristics') {
        return Promise.resolve(ok({ qualityCharacteristics: categories }))
      }
      return Promise.resolve(ok({}))
    })
  })

  it('renders Swedish names and treats a missing types value as empty', async () => {
    state.locale = 'sv'
    state.fetch.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') return Promise.resolve(ok({}))
      return Promise.resolve(ok({ qualityCharacteristics: categories }))
    })
    const first = render(<QualityCharacteristicsClient />)
    await waitFor(() => expect(screen.queryByText('common.loading')).toBeNull())
    expect(screen.queryByText('Kvalitet')).toBeNull()
    first.unmount()

    state.fetch.mockImplementation((url: string) => {
      if (url === '/api/requirement-types')
        return Promise.resolve(ok({ types }))
      return Promise.resolve(ok({ qualityCharacteristics: categories }))
    })
    render(<QualityCharacteristicsClient />)
    expect(await screen.findByText('Kvalitet')).toBeInTheDocument()
    expect(screen.getByText('Foralder')).toBeInTheDocument()
    expect(screen.getByText('Likvardigt barn')).toBeInTheDocument()
  })

  it.each([new Error(''), 'network rejection'])(
    'uses a safe fallback for a rejected types request %#',
    async rejection => {
      state.fetch.mockImplementation((url: string) => {
        if (url === '/api/requirement-types') return Promise.reject(rejection)
        return Promise.resolve(ok({ qualityCharacteristics: categories }))
      })

      render(<QualityCharacteristicsClient />)

      await waitFor(() =>
        expect(state.confirm).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'common.error' }),
        ),
      )
      expect(screen.getByRole('alert')).toHaveTextContent('common.error')
    },
  )

  it('ignores a types response that settles after unmount', async () => {
    let resolveTypes!: (value: ReturnType<typeof ok>) => void
    const pendingTypes = new Promise<ReturnType<typeof ok>>(resolve => {
      resolveTypes = resolve
    })
    state.fetch.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') return pendingTypes
      return Promise.resolve(ok({ qualityCharacteristics: categories }))
    })
    const view = render(<QualityCharacteristicsClient />)
    view.unmount()

    await act(async () => {
      resolveTypes(ok({ types }))
      await pendingTypes
    })
    expect(state.confirm).not.toHaveBeenCalled()
  })

  it('submits a selected parent and exposes the pending delete state', async () => {
    let resolveDelete!: (value: ReturnType<typeof ok>) => void
    const pendingDelete = new Promise<ReturnType<typeof ok>>(resolve => {
      resolveDelete = resolve
    })
    state.fetch.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return pendingDelete
      if (url === '/api/requirement-types')
        return Promise.resolve(ok({ types }))
      if (url === '/api/quality-characteristics') {
        return Promise.resolve(ok({ qualityCharacteristics: categories }))
      }
      return Promise.resolve(ok({ id: 99 }))
    })
    render(<QualityCharacteristicsClient />)
    await screen.findByText('Quality')

    fireEvent.click(screen.getByRole('button', { name: /common\.create/ }))
    fireEvent.change(requiredElement('#qc-chapter-id'), {
      target: { value: '3.1' },
    })
    fireEvent.change(requiredElement('#qc-name-sv'), {
      target: { value: 'Ny' },
    })
    fireEvent.change(requiredElement('#qc-name-en'), {
      target: { value: 'New' },
    })
    fireEvent.change(requiredElement('#qc-type'), {
      target: { value: '1' },
    })
    fireEvent.change(requiredElement('#qc-parent'), {
      target: { value: '10' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /common\.save/ }))

    await waitFor(() => {
      const call = state.fetch.mock.calls.find(
        ([url, options]) =>
          url === '/api/quality-characteristics' && options?.method === 'POST',
      )
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
        parentId: 10,
      })
    })

    const deleteButton = requiredElement<HTMLButtonElement>(
      '[data-developer-mode-name="table action"][data-developer-mode-value="delete"]',
    )
    fireEvent.click(deleteButton)
    await waitFor(() =>
      expect(deleteButton).toHaveTextContent('common.deleting'),
    )
    expect(deleteButton).toHaveAttribute('title', 'common.deletingInProgress')

    await act(async () => {
      resolveDelete(ok({}))
      await pendingDelete
    })
  })
})
