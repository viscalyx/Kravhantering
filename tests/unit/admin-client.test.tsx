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
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
import {
  buildUiTerminologyPayload,
  getDefaultUiTerminology,
} from '@/lib/ui-terminology'

const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}))
const searchParamsMock = vi.hoisted(() => ({
  current: new URLSearchParams(),
}))
const fetchMock = vi.fn()
const routerRefresh = routerMock.refresh
const routerReplace = routerMock.replace

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock.current,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
  useRouter: () => ({
    refresh: routerRefresh,
    replace: routerReplace,
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
    routerReplace.mockReset()
    searchParamsMock.current = new URLSearchParams()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('opens the reference data tab from the admin tab query parameter', () => {
    searchParamsMock.current = new URLSearchParams('tab=referenceData')

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const referenceDataTab = screen.getByRole('tab', {
      name: 'admin.referenceData',
    })

    expect(referenceDataTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'referenceData-panel',
    )
  })

  it('writes the selected admin tab to the current history entry', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.referenceData' }))

    expect(routerReplace).toHaveBeenCalledWith(
      {
        pathname: '/admin',
        query: { tab: 'referenceData' },
      },
      { scroll: false },
    )
  })

  it('removes the admin tab query when returning to the default tab', () => {
    searchParamsMock.current = new URLSearchParams('tab=referenceData')

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.terminology' }))

    expect(routerReplace).toHaveBeenCalledWith('/admin', { scroll: false })
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
      '/requirement-areas',
    )
    expect(panel.getByTestId('reference-data-icon-areas')).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-types')).toHaveAttribute(
      'href',
      '/requirement-types',
    )
    expect(panel.getByTestId('reference-data-icon-types')).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-scenarios')).toHaveAttribute(
      'href',
      '/usage-scenarios',
    )
    expect(panel.getByTestId('reference-data-icon-scenarios')).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-statuses')).toHaveAttribute(
      'href',
      '/requirement-statuses',
    )
    expect(panel.getByTestId('reference-data-icon-statuses')).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-qualityCharacteristics'),
    ).toHaveAttribute('href', '/quality-characteristics')
    expect(
      panel.getByTestId('reference-data-icon-qualityCharacteristics'),
    ).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-riskLevels')).toHaveAttribute(
      'href',
      '/risk-levels',
    )
    expect(panel.getByTestId('reference-data-icon-riskLevels')).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-responsibilityAreas'),
    ).toHaveAttribute('href', '/specifications/responsibility-areas')
    expect(
      panel.getByTestId('reference-data-icon-responsibilityAreas'),
    ).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-implementationTypes'),
    ).toHaveAttribute('href', '/specifications/implementation-types')
    expect(
      panel.getByTestId('reference-data-icon-implementationTypes'),
    ).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-lifecycleStatuses'),
    ).toHaveAttribute('href', '/specifications/lifecycle-statuses')
    expect(
      panel.getByTestId('reference-data-icon-lifecycleStatuses'),
    ).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-areaOwners')).toHaveAttribute(
      'href',
      '/owners',
    )
    expect(panel.getByTestId('reference-data-icon-areaOwners')).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-specificationItemStatuses'),
    ).toHaveAttribute('href', '/specification-item-statuses')
    expect(
      panel.getByTestId('reference-data-icon-specificationItemStatuses'),
    ).toBeTruthy()

    expect(panel.getAllByRole('link')).toHaveLength(12)
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

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/terminology',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ terminology: updatedTerminology }),
      }),
    )
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

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/requirement-columns',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ columns: reorderedColumns }),
      }),
    )
    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
    ])
  })

  it('normalizes duplicate column defaults before toggling and saving', async () => {
    const duplicateColumns: RequirementListColumnDefault[] = [
      ...DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
      {
        columnId: 'category',
        defaultVisible: false,
        sortOrder: DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS.length,
      },
    ]
    const normalizedHiddenCategoryColumns =
      normalizeRequirementListColumnDefaults(
        DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS.map(column =>
          column.columnId === 'category'
            ? { ...column, defaultVisible: false }
            : column,
        ),
      )
    fetchMock.mockResolvedValueOnce(
      okJson({ columns: normalizedHiddenCategoryColumns }),
    )

    render(
      <AdminClient
        initialColumnDefaults={duplicateColumns}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))

    const categoryRow = screen.getByTestId('admin-column-row-category')
    const categoryCheckbox = within(categoryRow).getByRole('checkbox')

    expect(categoryCheckbox).toBeChecked()

    fireEvent.click(categoryCheckbox)

    expect(categoryCheckbox).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/requirement-columns',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ columns: normalizedHiddenCategoryColumns }),
      }),
    )
    expect(
      within(screen.getByTestId('admin-column-row-category')).getByRole(
        'checkbox',
      ),
    ).not.toBeChecked()
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
