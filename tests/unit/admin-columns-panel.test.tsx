import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ColumnsPanel from '@/app/[locale]/admin/panels/columns-panel'
import { normalizeRequirementListColumnDefaults } from '@/lib/requirements/list-view'
import {
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, ok = true): Response {
  return { json: vi.fn(async () => body), ok } as unknown as Response
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('ColumnsPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(pendingFetch)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('owns the columns tab panel contract', () => {
    renderAdminPanel(<ColumnsPanel />)
    expectAdminPanelContract({ markerValue: 'columns', tabId: 'columns' })
  })

  it('loads, edits, reorders, resets, and saves column defaults', async () => {
    const defaults = normalizeRequirementListColumnDefaults(null)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ columns: defaults }))
      .mockResolvedValueOnce(jsonResponse({}))

    renderAdminPanel(<ColumnsPanel />)

    const rows = await screen.findAllByRole('article')
    expect(rows.length).toBeGreaterThan(3)
    const hideableRow = rows.find(row => {
      const checkbox = within(row).getByRole('checkbox')
      return !checkbox.hasAttribute('disabled')
    })
    expect(hideableRow).toBeDefined()
    fireEvent.click(within(hideableRow as HTMLElement).getByRole('checkbox'))

    const movableRow = rows[1] as HTMLElement
    fireEvent.click(
      within(movableRow).getByRole('button', { name: 'admin.moveDown' }),
    )
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'admin.moveUp' })
        .find(button => !button.hasAttribute('disabled')) as HTMLElement,
    )

    const save = screen.getByRole('button', { name: 'common.save' })
    expect(save).toBeEnabled()
    fireEvent.click(save)

    expect(await screen.findByText('admin.saved')).toBeVisible()
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/requirement-columns',
      expect.objectContaining({ method: 'PUT' }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'common.resetToDefault' }),
    )
    expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled()
  })

  it('shows save failures from both HTTP rejection and network failure', async () => {
    const defaults = normalizeRequirementListColumnDefaults(null)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ columns: defaults }))
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockRejectedValueOnce(new Error('network unavailable'))

    renderAdminPanel(<ColumnsPanel />)
    const checkboxes = await screen.findAllByRole('checkbox')
    const hideable = checkboxes.find(input => !input.hasAttribute('disabled'))
    fireEvent.click(hideable as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.columnsSaveError',
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.columnsSaveError',
      ),
    )
  })

  it('offers a retry after loading fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(jsonResponse({}))

    renderAdminPanel(<ColumnsPanel />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.columnsLoadError',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.panelLoadError.retry' }),
    )

    expect(await screen.findAllByRole('article')).not.toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to load requirement column defaults',
      expect.objectContaining({ attempt: 1 }),
    )
  })

  it('shows a load error for a rejected HTTP response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false))

    renderAdminPanel(<ColumnsPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.columnsLoadError',
    )
  })
})
