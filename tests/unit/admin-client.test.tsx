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

    expect(screen.getByTestId('reference-data-card-areas')).toHaveAttribute(
      'href',
      '/kravomraden',
    )
    expect(screen.getByTestId('reference-data-icon-areas')).toBeTruthy()

    expect(screen.getByTestId('reference-data-card-types')).toHaveAttribute(
      'href',
      '/kravtyper',
    )
    expect(screen.getByTestId('reference-data-icon-types')).toBeTruthy()

    expect(screen.getByTestId('reference-data-card-scenarios')).toHaveAttribute(
      'href',
      '/kravscenarier',
    )
    expect(screen.getByTestId('reference-data-icon-scenarios')).toBeTruthy()

    expect(screen.getByTestId('reference-data-card-statuses')).toHaveAttribute(
      'href',
      '/kravstatusar',
    )
    expect(screen.getByTestId('reference-data-icon-statuses')).toBeTruthy()

    expect(screen.getByTestId('reference-data-card-iso25010')).toHaveAttribute(
      'href',
      '/iso25010',
    )
    expect(screen.getByTestId('reference-data-icon-iso25010')).toBeTruthy()

    expect(
      screen.getByTestId('reference-data-card-responsibilityAreas'),
    ).toHaveAttribute('href', '/kravpaket/ansvarsomraden')
    expect(
      screen.getByTestId('reference-data-icon-responsibilityAreas'),
    ).toBeTruthy()

    expect(
      screen.getByTestId('reference-data-card-implementationTypes'),
    ).toHaveAttribute('href', '/kravpaket/genomforandeformer')
    expect(
      screen.getByTestId('reference-data-icon-implementationTypes'),
    ).toBeTruthy()

    expect(screen.getAllByRole('link')).toHaveLength(7)
  })

  it('renders a horizontally scrollable admin tab rail with non-shrinking tab buttons', () => {
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

    expect(terminologyTab.parentElement).toHaveAttribute('role', 'tablist')
    expect(terminologyTab.parentElement?.className).toContain('overflow-x-auto')
    expect(terminologyTab.className).toContain('shrink-0')
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

  it('uses 44px touch targets and responsive column action buttons', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const englishButton = screen.getByRole('button', { name: 'admin.english' })
    const terminologyResetButton = screen.getByRole('button', {
      name: 'common.resetToDefault',
    })
    const terminologySaveButton = screen.getByRole('button', {
      name: 'common.save',
    })

    expect(englishButton.className).toContain('min-h-[44px]')
    expect(englishButton.className).toContain('min-w-[44px]')
    expect(terminologyResetButton.className).toContain('min-h-[44px]')
    expect(terminologySaveButton.className).toContain('min-w-[44px]')

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))

    const columnResetButton = screen.getByRole('button', {
      name: 'common.resetToDefault',
    })
    const columnSaveButton = screen.getByRole('button', { name: 'common.save' })

    expect(columnResetButton.parentElement?.className).toContain('flex-wrap')
    expect(columnResetButton.className).toContain('min-h-[44px]')
    expect(columnResetButton.className).toContain('w-full')
    expect(columnResetButton.className).toContain('sm:min-w-[44px]')
    expect(columnSaveButton.className).toContain('min-h-[44px]')
    expect(columnSaveButton.className).toContain('w-full')
    expect(columnSaveButton.className).toContain('sm:min-w-[44px]')
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

  it('keeps a reordered column layout after a successful save', async () => {
    const reorderedColumns = normalizeRequirementListColumnDefaults([
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
      { columnId: 'description', defaultVisible: true, sortOrder: 1 },
      { columnId: 'category', defaultVisible: true, sortOrder: 2 },
      { columnId: 'area', defaultVisible: true, sortOrder: 3 },
      { columnId: 'type', defaultVisible: true, sortOrder: 4 },
      { columnId: 'typeCategory', defaultVisible: false, sortOrder: 5 },
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

  it('shows an error when saving columns fails and reset returns to the last saved order', async () => {
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
