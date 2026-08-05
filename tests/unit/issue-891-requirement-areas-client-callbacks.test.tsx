import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: vi.fn(async () => true) }),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementAreasClient from '@/app/[locale]/requirement-areas/requirement-areas-client'

const areas = [
  {
    description: 'System integration',
    id: 1,
    name: 'Integration',
    ownerHsaId: 'SE5560000001-owner',
    permissions: { canManageAssignments: true },
    prefix: 'INT',
  },
  {
    description: null,
    id: 2,
    name: 'Nullable area',
    ownerHsaId: 'SE5560000001-other',
    permissions: { canManageAssignments: false },
    prefix: 'NULL',
  },
]

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

describe('RequirementAreasClient observable callback behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-areas') {
        return Promise.resolve(response({ areas }))
      }
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(
          response({
            prefixes: [
              {
                id: 1,
                isDefault: true,
                label: null,
                prefix: 'SE5560000001',
              },
            ],
          }),
        )
      }
      return Promise.resolve(response({}))
    })
  })

  it('renders nullable descriptions and hides assignment actions without permission', async () => {
    render(<RequirementAreasClient />)
    await screen.findByText('Nullable area')

    expect(screen.getByText('-')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'area.manageCoAuthors' }),
    ).toHaveLength(1)
  })

  it('maps a nullable area into the edit dialog and submits edited values', async () => {
    render(<RequirementAreasClient />)
    await screen.findByText('Nullable area')
    fireEvent.click(screen.getAllByRole('button', { name: 'common.edit' })[1])

    const dialog = await screen.findByRole('dialog', { name: 'area.editArea' })
    const description = within(dialog).getByRole('textbox', {
      name: /area\.description/,
    })
    expect(description).toHaveValue('')
    const prefix = within(dialog).getByRole('textbox', { name: /area\.prefix/ })
    const name = within(dialog).getByRole('textbox', { name: /area\.name/ })
    fireEvent.change(prefix, { target: { value: 'next' } })
    fireEvent.change(name, { target: { value: 'Updated area' } })
    fireEvent.change(description, { target: { value: 'New description' } })
    expect(prefix).toHaveValue('NEXT')

    fetchMock.mockResolvedValueOnce(response({ id: 2 }))
    fetchMock.mockResolvedValueOnce(response({ areas }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, options]) =>
          url === '/api/requirement-areas/2' && options?.method === 'PUT',
      )
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({
        description: 'New description',
        name: 'Updated area',
        prefix: 'NEXT',
      })
    })
  })

  it('opens and closes the owner and co-author dialogs from visible actions', async () => {
    render(<RequirementAreasClient />)
    await screen.findByText('Integration')
    fireEvent.click(screen.getAllByRole('button', { name: 'common.edit' })[0])
    const editDialog = await screen.findByRole('dialog', {
      name: 'area.editArea',
    })
    fireEvent.click(
      within(editDialog).getByRole('button', { name: 'area.changeOwner' }),
    )
    const ownerDialog = await screen.findByRole('dialog', {
      name: 'area.changeOwnerTitle',
    })
    fireEvent.click(
      within(ownerDialog).getByRole('button', { name: 'common.cancel' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'area.changeOwnerTitle' }),
      ).toBeNull(),
    )
    fireEvent.click(
      within(editDialog).getByRole('button', { name: 'common.cancel' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'area.editArea' }),
      ).toBeNull(),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'area.manageCoAuthors' }),
    )
    const coAuthors = await screen.findByRole('dialog', {
      name: 'area.coAuthors',
    })
    fireEvent.click(within(coAuthors).getByText('common.close'))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'area.coAuthors' }),
      ).toBeNull(),
    )
  })
})
