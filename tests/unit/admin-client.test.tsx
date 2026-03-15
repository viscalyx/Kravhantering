import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminClient from '@/app/[locale]/admin/admin-client'
import {
  DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
  normalizeRequirementListColumnDefaults,
} from '@/lib/requirements/list-view'
import {
  buildUiTerminologyPayload,
  getDefaultUiTerminology,
} from '@/lib/ui-terminology'

const fetchMock = vi.fn()
const routerRefresh = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
  useRouter: () => ({
    refresh: routerRefresh,
  }),
}))

function okJson(body: unknown) {
  return {
    json: async () => body,
    ok: true,
  } as Response
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

function getColumnOrder(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll('[data-testid^="admin-column-row-"]'),
  ).map(node =>
    node.getAttribute('data-testid')?.replace('admin-column-row-', ''),
  )
}

describe('AdminClient', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    routerRefresh.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('renders icon-bearing reference data cards that link to the existing pages', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.referenceData' }))

    const panel = within(screen.getByRole('tabpanel'))

    expect(panel.getByTestId('reference-data-card-areas')).toHaveAttribute(
      'href',
      '/kravomraden',
    )
    expect(panel.getByTestId('reference-data-icon-areas')).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-types')).toHaveAttribute(
      'href',
      '/kravtyper',
    )
    expect(panel.getByTestId('reference-data-icon-types')).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-scenarios')).toHaveAttribute(
      'href',
      '/kravscenarier',
    )
    expect(panel.getByTestId('reference-data-icon-scenarios')).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-statuses')).toHaveAttribute(
      'href',
      '/kravstatusar',
    )
    expect(panel.getByTestId('reference-data-icon-statuses')).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-qualityCharacteristics'),
    ).toHaveAttribute('href', '/quality-characteristics')
    expect(
      panel.getByTestId('reference-data-icon-qualityCharacteristics'),
    ).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-responsibilityAreas'),
    ).toHaveAttribute('href', '/kravpaket/ansvarsomraden')
    expect(
      panel.getByTestId('reference-data-icon-responsibilityAreas'),
    ).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-implementationTypes'),
    ).toHaveAttribute('href', '/kravpaket/genomforandeformer')
    expect(
      panel.getByTestId('reference-data-icon-implementationTypes'),
    ).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-areaOwners')).toHaveAttribute(
      'href',
      '/omradesagare',
    )
    expect(panel.getByTestId('reference-data-icon-areaOwners')).toBeTruthy()

    expect(panel.getAllByRole('link')).toHaveLength(8)
  })

  it('exposes the admin tabs through a tablist and updates selection on click', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const terminologyTab = screen.getByRole('tab', {
      name: 'admin.terminology',
    })
    const referenceDataTab = screen.getByRole('tab', {
      name: 'admin.referenceData',
    })

    expect(terminologyTab.parentElement).toHaveAttribute('role', 'tablist')
    expect(terminologyTab).toHaveAttribute('aria-selected', 'true')
    expect(referenceDataTab).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(referenceDataTab)

    expect(referenceDataTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'referenceData-panel',
    )
  })

  it('exposes admin tabs and locale toggles with accessible selection state', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const terminologyTab = screen.getByRole('tab', {
      name: 'admin.terminology',
    })
    const columnsTab = screen.getByRole('tab', { name: 'admin.columns' })
    const swedishButton = screen.getByRole('button', { name: 'admin.swedish' })
    const englishButton = screen.getByRole('button', { name: 'admin.english' })

    expect(terminologyTab).toHaveAttribute('aria-controls', 'terminology-panel')
    expect(terminologyTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'terminology-panel',
    )
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'terminology-tab',
    )
    expect(swedishButton).toHaveAttribute('aria-pressed', 'true')
    expect(englishButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(englishButton)

    expect(swedishButton).toHaveAttribute('aria-pressed', 'false')
    expect(englishButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(columnsTab)

    expect(columnsTab).toHaveAttribute('aria-controls', 'columns-panel')
    expect(columnsTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'columns-panel')
  })

  it('disables terminology controls while saving and shows an error when the save request fails', async () => {
    const pendingRequest = deferred<Response>()
    fetchMock.mockReturnValueOnce(pendingRequest.promise)

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const localeToggle = screen.getByRole('button', { name: 'admin.english' })
    const resetButton = screen.getByRole('button', {
      name: 'common.resetToDefault',
    })
    const saveButton = screen.getByRole('button', { name: 'common.save' })
    const inputs = screen.getAllByRole('textbox')

    fireEvent.click(saveButton)

    await waitFor(() => expect(saveButton).toBeDisabled())

    expect(localeToggle).toBeDisabled()
    expect(resetButton).toBeDisabled()
    expect(inputs[0]).toBeDisabled()

    pendingRequest.reject(new Error('network failed'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.terminologySaveError',
      ),
    )
  })

  it('refreshes the route after a successful terminology save', async () => {
    const updatedTerminology = buildUiTerminologyPayload(
      getDefaultUiTerminology(),
    )
    updatedTerminology[0] = {
      ...updatedTerminology[0],
      sv: {
        ...updatedTerminology[0].sv,
        singular: 'Ny kravtext',
      },
    }
    fetchMock.mockResolvedValueOnce(okJson({ terminology: updatedTerminology }))

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: 'Ny kravtext' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/terminology', {
      body: JSON.stringify({ terminology: updatedTerminology }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    })
    expect(routerRefresh).toHaveBeenCalledTimes(1)
  })

  it('restores shipped terminology defaults after a successful save', async () => {
    const updatedTerminology = buildUiTerminologyPayload(
      getDefaultUiTerminology(),
    )
    updatedTerminology[0] = {
      ...updatedTerminology[0],
      sv: {
        ...updatedTerminology[0].sv,
        singular: 'Ny kravtext',
      },
    }
    fetchMock.mockResolvedValueOnce(okJson({ terminology: updatedTerminology }))

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const singularInput = screen.getAllByRole('textbox')[0]

    fireEvent.change(singularInput, {
      target: { value: 'Ny kravtext' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())
    expect(singularInput).toHaveValue('Ny kravtext')

    fireEvent.click(
      screen.getByRole('button', { name: 'common.resetToDefault' }),
    )

    expect(singularInput).toHaveValue(
      getDefaultUiTerminology().description.sv.singular,
    )
  })

  it('keeps a reordered column layout after a successful save', async () => {
    const reorderedColumns = normalizeRequirementListColumnDefaults([
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
      { columnId: 'description', defaultVisible: true, sortOrder: 1 },
      { columnId: 'category', defaultVisible: true, sortOrder: 2 },
      { columnId: 'area', defaultVisible: true, sortOrder: 3 },
      { columnId: 'type', defaultVisible: true, sortOrder: 4 },
      {
        columnId: 'qualityCharacteristic',
        defaultVisible: false,
        sortOrder: 5,
      },
      { columnId: 'status', defaultVisible: true, sortOrder: 6 },
      { columnId: 'requiresTesting', defaultVisible: false, sortOrder: 7 },
      { columnId: 'version', defaultVisible: false, sortOrder: 8 },
    ])
    fetchMock.mockResolvedValueOnce(okJson({ columns: reorderedColumns }))

    const { container } = render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))
    fireEvent.click(
      within(screen.getByTestId('admin-column-row-category')).getByRole(
        'button',
        { name: 'admin.moveUp' },
      ),
    )

    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/requirement-columns', {
      body: JSON.stringify({ columns: reorderedColumns }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    })
    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
    ])
  })

  it('restores shipped column defaults after a successful save', async () => {
    const reorderedColumns = normalizeRequirementListColumnDefaults([
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
      { columnId: 'description', defaultVisible: true, sortOrder: 1 },
      { columnId: 'category', defaultVisible: true, sortOrder: 2 },
      { columnId: 'area', defaultVisible: true, sortOrder: 3 },
      { columnId: 'type', defaultVisible: true, sortOrder: 4 },
      {
        columnId: 'qualityCharacteristic',
        defaultVisible: false,
        sortOrder: 5,
      },
      { columnId: 'status', defaultVisible: true, sortOrder: 6 },
      { columnId: 'requiresTesting', defaultVisible: false, sortOrder: 7 },
      { columnId: 'version', defaultVisible: false, sortOrder: 8 },
    ])
    fetchMock.mockResolvedValueOnce(okJson({ columns: reorderedColumns }))

    const { container } = render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))
    fireEvent.click(
      within(screen.getByTestId('admin-column-row-category')).getByRole(
        'button',
        { name: 'admin.moveUp' },
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())
    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
    ])

    fireEvent.click(
      screen.getByRole('button', { name: 'common.resetToDefault' }),
    )

    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'area',
      'category',
      'type',
    ])
  })

  it('shows an error when saving columns fails and reset returns to shipped defaults', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
    } as Response)

    const { container } = render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))
    fireEvent.click(
      within(screen.getByTestId('admin-column-row-category')).getByRole(
        'button',
        { name: 'admin.moveUp' },
      ),
    )

    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.columnsSaveError',
      ),
    )

    expect(screen.queryByText('admin.saved')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'common.resetToDefault' }),
    )

    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'area',
      'category',
      'type',
    ])
  })

  it('disables column controls while a save is in progress', async () => {
    const pendingRequest = deferred<Response>()
    fetchMock.mockReturnValueOnce(pendingRequest.promise)

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))

    const categoryRow = screen.getByTestId('admin-column-row-category')
    const moveUpButton = within(categoryRow).getByRole('button', {
      name: 'admin.moveUp',
    })
    const defaultVisibleCheckbox = within(categoryRow).getByRole('checkbox')
    const resetButton = screen.getByRole('button', {
      name: 'common.resetToDefault',
    })
    const saveButton = screen.getByRole('button', { name: 'common.save' })

    fireEvent.click(saveButton)

    await waitFor(() => expect(saveButton).toBeDisabled())

    expect(moveUpButton).toBeDisabled()
    expect(defaultVisibleCheckbox).toBeDisabled()
    expect(resetButton).toBeDisabled()

    pendingRequest.resolve(
      okJson({ columns: DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS }),
    )

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())
  })
})
