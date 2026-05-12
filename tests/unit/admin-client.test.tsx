import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminClient from '@/app/[locale]/admin/admin-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import { HelpProvider, useHelp } from '@/components/HelpPanel'
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
const createObjectURLMock = vi.fn(() => 'blob:data-subject-export')
const revokeObjectURLMock = vi.fn()
const anchorClickMock = vi.fn()
const routerRefresh = routerMock.refresh
const routerReplace = routerMock.replace

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations:
    (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
      const translationKey = namespace ? `${namespace}.${key}` : key
      if (
        key === 'privacy.errorWithDetail' ||
        key === 'privacy.serverErrorWithDetail' ||
        key === 'privacy.exportError' ||
        key === 'exportError'
      ) {
        return `${translationKey} ${values?.message ?? ''} ${values?.detail ?? ''}`.trim()
      }
      return translationKey
    },
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

function errorJson(body: unknown, status: number) {
  return {
    json: async () => body,
    ok: false,
    status,
  } as Response
}

function dataSubjectExportBody() {
  return {
    generatedAt: '2026-05-12T12:00:00.000Z',
    generatedBy: {
      displayName: 'Disa PrivacyOfficer',
      hsaId: 'SE2321000032-privacy1',
      roles: ['PrivacyOfficer'],
      source: 'oidc',
      sub: 'privacy-sub',
    },
    limitations: [],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [],
    subject: {
      hsaId: 'SE2321000032-kalle2',
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: {
      itemCount: 2,
      limitationCount: 0,
      sourceCount: 1,
    },
  }
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

function HelpContentProbe() {
  const { content } = useHelp()
  return <output data-testid="help-title">{content?.titleKey ?? 'none'}</output>
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
    createObjectURLMock.mockClear()
    revokeObjectURLMock.mockClear()
    anchorClickMock.mockClear()
    routerRefresh.mockReset()
    routerReplace.mockReset()
    searchParamsMock.current = new URLSearchParams()
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
    })
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: anchorClickMock,
    })
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

    expect(
      panel.getByTestId('reference-data-card-requirementPackages'),
    ).toHaveAttribute('href', '/requirement-packages')
    expect(
      panel.getByTestId('reference-data-icon-requirementPackages'),
    ).toBeTruthy()

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

  it('switches the header help content when the privacy tab is selected', async () => {
    render(
      <HelpProvider>
        <ConfirmModalProvider>
          <AdminClient
            currentUserRoles={['PrivacyOfficer']}
            initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
            initialTerminology={buildUiTerminologyPayload(
              getDefaultUiTerminology(),
            )}
          />
        </ConfirmModalProvider>
        <HelpContentProbe />
      </HelpProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('help-title')).toHaveTextContent('admin.title'),
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.privacy.title' }))

    await waitFor(() =>
      expect(screen.getByTestId('help-title')).toHaveTextContent(
        'adminPrivacy.title',
      ),
    )
  })

  it('dims and disables the privacy tab without the PrivacyOfficer role', () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const privacyTab = screen.getByRole('tab', {
      name: 'admin.privacy.title',
    })

    expect(privacyTab).toHaveAttribute('aria-disabled', 'true')
    expect(privacyTab).toHaveAttribute('title', 'admin.privacy.disabledTooltip')
    expect(privacyTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'terminology-panel',
    )
    expect(screen.queryByLabelText('admin.privacy.targetHsaId')).toBeNull()

    fireEvent.click(privacyTab)

    expect(routerReplace).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows inline help for each privacy form field', () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    const helpButtons = [
      ['admin.privacy.targetHsaId', 'admin.privacy.fieldHelp.targetHsaId'],
      [
        'admin.privacy.replacementHsaId',
        'admin.privacy.fieldHelp.replacementHsaId',
      ],
      [
        'admin.privacy.replacementName',
        'admin.privacy.fieldHelp.replacementName',
      ],
      [
        'admin.privacy.replacementFirstName',
        'admin.privacy.fieldHelp.replacementFirstName',
      ],
      [
        'admin.privacy.replacementLastName',
        'admin.privacy.fieldHelp.replacementLastName',
      ],
      [
        'admin.privacy.replacementEmail',
        'admin.privacy.fieldHelp.replacementEmail',
      ],
    ] as const

    for (const [label] of helpButtons) {
      expect(
        screen.getByRole('button', { name: `common.help: ${label}` }),
      ).toBeTruthy()
    }

    fireEvent.click(
      screen.getByRole('button', {
        name: 'common.help: admin.privacy.targetHsaId',
      }),
    )

    expect(screen.getByText('admin.privacy.fieldHelp.targetHsaId')).toBeTruthy()
  })

  it('previews duplicate-name privacy erasure by HSA-ID instead of name', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['INT0001 v1 / suggestion 990001'],
            allowedActions: ['anonymize', 'switch', 'skip'],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            fieldKey: 'resolvedBy',
            key: 'improvement_suggestions.resolved_by',
            objectKey: 'improvementSuggestions',
            recommendedAction: 'anonymize',
            warningKey: 'decisionSwitch',
          },
        ],
        previewToken: 'duplicate-name-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    expect(screen.getAllByRole('textbox')).toHaveLength(6)
    expect(
      screen.getByLabelText('admin.privacy.replacementFirstName'),
    ).toBeTruthy()
    expect(
      screen.getByLabelText('admin.privacy.replacementLastName'),
    ).toBeTruthy()
    expect(screen.getByLabelText('admin.privacy.replacementEmail')).toBeTruthy()
    expect(
      screen.getByRole('img', {
        name: 'admin.privacy.replacementEmailOptional',
      }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/privacy/erasure-preview',
        expect.objectContaining({
          body: JSON.stringify({
            replacement: null,
            target: {
              hsaId: 'SE2321000032-kalle2',
            },
          }),
          method: 'POST',
        }),
      ),
    )

    const row = screen
      .getByText('admin.privacy.objects.improvementSuggestions')
      .closest('tr')

    expect(row).not.toBeNull()
    expect(
      within(row as HTMLTableRowElement).getByText(
        'admin.privacy.fields.resolvedBy',
      ),
    ).toBeTruthy()
    expect(within(row as HTMLTableRowElement).getByText('1')).toBeTruthy()
    expect(
      within(row as HTMLTableRowElement).getByText('Kalle Svensson'),
    ).toBeTruthy()
    expect(
      within(row as HTMLTableRowElement).getByText(
        'INT0001 v1 / suggestion 990001',
      ),
    ).toBeTruthy()
    const actionSelect = within(row as HTMLTableRowElement).getByRole(
      'combobox',
    )
    expect(actionSelect).toHaveValue('anonymize')
    expect(
      within(row as HTMLTableRowElement).queryByRole('option', {
        name: 'admin.privacy.actions.switch',
      }),
    ).toBeNull()
    expect(
      within(row as HTMLTableRowElement).getByRole('option', {
        name: 'admin.privacy.actions.anonymize',
      }),
    ).toHaveValue('anonymize')
    expect(
      within(row as HTMLTableRowElement).getByRole('option', {
        name: 'admin.privacy.actions.skip',
      }),
    ).toHaveValue('skip')
    const executeButton = screen.getByRole('button', {
      name: 'admin.privacy.execute',
    })
    const previewTable = row?.closest('table')
    expect(previewTable).not.toBeNull()
    const executePosition =
      previewTable?.compareDocumentPosition(executeButton) ?? 0
    expect(Boolean(executePosition & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    )
    expect(screen.queryByText('admin.privacy.objects.owners')).toBeNull()
    expect(screen.queryByText('admin.privacy.fields.identity')).toBeNull()
  })

  it('exports the privacy preview target as structured JSON', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [
            {
              affectedReferences: ['INT0001 v1 / suggestion 990001'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'resolvedBy',
              key: 'improvement_suggestions.resolved_by',
              objectKey: 'improvementSuggestions',
              recommendedAction: 'anonymize',
              warningKey: 'decisionSwitch',
            },
          ],
          previewToken: 'duplicate-name-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 1,
        }),
      )
      .mockResolvedValueOnce(okJson(dataSubjectExportBody()))

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await screen.findByRole('button', {
      name: 'admin.privacy.exportJson',
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.exportJson' }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/privacy/data-subject-export',
        expect.objectContaining({
          body: JSON.stringify({
            delivery: 'json',
            target: { hsaId: 'SE2321000032-kalle2' },
          }),
          method: 'POST',
        }),
      ),
    )
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(anchorClickMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:data-subject-export')
  })

  it('shows a preview export error when data portability export fails', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [],
          previewToken: 'empty-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 0,
        }),
      )
      .mockResolvedValueOnce(
        errorJson({ error: 'PrivacyOfficer role is required' }, 403),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await screen.findByRole('button', {
      name: 'admin.privacy.exportJson',
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.exportJson' }),
    )

    await screen.findByRole('alert')
    expect(
      screen.getByText(
        'admin.privacy.exportError PrivacyOfficer role is required',
      ),
    ).toBeTruthy()
    expect(createObjectURLMock).not.toHaveBeenCalled()
  })

  it('does not show the privacy execution button for an empty preview', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [],
        previewToken: 'empty-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 0,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-johlju' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await screen.findByText('admin.privacy.previewResult')

    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()
  })

  it('shows safe server details when privacy preview fails unexpectedly', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      errorJson(
        {
          debugMessage: 'Invalid column name created_by_hsa_id',
          error: 'Failed to preview privacy erasure',
        },
        500,
      ),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-12345' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.privacy.serverPreviewError',
      ),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Invalid column name created_by_hsa_id',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'databasmigreringar',
    )
  })

  it('keeps the preview and marks executed privacy rows after a successful erasure', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [
            {
              affectedReferences: ['SEC Säkerhet'],
              allowedActions: ['switch', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              disabledReasonKey: null,
              fieldKey: 'identity',
              key: 'owners.identity',
              objectKey: 'owners',
              recommendedAction: 'switch',
              warningKey: 'ownerAreaSwitchOnly',
            },
            {
              affectedReferences: ['SEC Säkerhet'],
              allowedActions: ['switch', 'skip'],
              controlledByGroupKey: 'owners.identity',
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              disabledReasonKey: null,
              fieldKey: 'owner',
              key: 'requirement_areas.owner',
              objectKey: 'requirementAreas',
              readOnlyReasonKey: 'controlledByOwner',
              recommendedAction: 'switch',
              warningKey: 'liveAssignment',
            },
            {
              affectedReferences: ['INT0001 v1'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'createdBy',
              key: 'requirement_versions.created_by',
              objectKey: 'requirementVersions',
              recommendedAction: 'skip',
              warningKey: 'historySwitch',
            },
          ],
          previewToken: 'execution-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 3,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          actions: { anonymize: 0, delete: 0, skip: 1, switch: 2 },
          groups: [],
          requestId: 'erasure-request-1',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 3,
        }),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE2321000032-johlju' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementName'), {
      target: { value: 'John Carl Levi' },
    })
    fireEvent.change(
      screen.getByLabelText('admin.privacy.replacementFirstName'),
      {
        target: { value: 'John Carl' },
      },
    )
    fireEvent.change(
      screen.getByLabelText('admin.privacy.replacementLastName'),
      {
        target: { value: 'Levi' },
      },
    )
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementEmail'), {
      target: { value: 'john.levi@example.com' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const ownerRow = (
      await screen.findByText('admin.privacy.objects.owners')
    ).closest('tr')
    const requirementAreaRow = screen
      .getByText('admin.privacy.objects.requirementAreas')
      .closest('tr')
    const versionRow = screen
      .getByText('admin.privacy.objects.requirementVersions')
      .closest('tr')

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'admin.privacy.execute' }),
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [executeUrl, executeInit] = fetchMock.mock.calls.at(-1) ?? []
    expect(executeUrl).toBe('/api/privacy/erasure-requests')
    expect(executeInit).toEqual(expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String((executeInit as RequestInit).body))).toEqual({
      actions: {
        'owners.identity': 'switch',
        'requirement_areas.owner': 'switch',
        'requirement_versions.created_by': 'skip',
      },
      previewToken: 'execution-preview-token',
      replacement: {
        displayName: 'John Carl Levi',
        email: 'john.levi@example.com',
        firstName: 'John Carl',
        hsaId: 'SE2321000032-johlju',
        lastName: 'Levi',
      },
      target: { hsaId: 'SE2321000032-kalle1' },
    })

    expect(screen.getByText('admin.privacy.status')).toBeTruthy()
    expect(ownerRow).toHaveTextContent(
      'admin.privacy.executionStatus.completed',
    )
    expect(ownerRow?.className).toContain('bg-emerald')
    expect(requirementAreaRow).toHaveTextContent(
      'admin.privacy.executionStatus.completed',
    )
    expect(requirementAreaRow?.className).toContain('bg-emerald')
    expect(versionRow).toHaveTextContent(
      'admin.privacy.executionStatus.skipped',
    )
    expect(versionRow?.className).toContain('bg-secondary')
    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()
  })

  it('clears stale privacy preview rows when the target HSA-ID changes', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['INT0001 v1'],
            allowedActions: ['anonymize', 'skip'],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            fieldKey: 'createdBy',
            key: 'requirement_versions.created_by',
            objectKey: 'requirementVersions',
            recommendedAction: 'anonymize',
            warningKey: 'historySwitch',
          },
        ],
        previewToken: 'target-change-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    const targetInput = screen.getByLabelText('admin.privacy.targetHsaId')
    fireEvent.change(targetInput, {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await screen.findByText('admin.privacy.objects.requirementVersions')
    expect(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeTruthy()

    fireEvent.change(targetInput, {
      target: { value: 'SE2321000032-kalle2' },
    })

    expect(
      screen.queryByText('admin.privacy.objects.requirementVersions'),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()
  })

  it('shows execute-specific server details when privacy execution fails unexpectedly', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [
            {
              affectedReferences: ['REQ0001 v1'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Linnéa Bergström',
              fieldKey: 'createdBy',
              key: 'requirement_versions.created_by',
              objectKey: 'requirementVersions',
              recommendedAction: 'anonymize',
              warningKey: 'historySwitch',
            },
          ],
          previewToken: 'execution-server-error-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 1,
        }),
      )
      .mockResolvedValueOnce(
        errorJson(
          {
            debugMessage: 'Cannot update responsible_hsa_id',
            error: 'Failed to execute privacy erasure',
          },
          500,
        ),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-12345' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )
    await screen.findByText('admin.privacy.objects.requirementVersions')

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'admin.privacy.execute' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.privacy.serverExecuteError',
      ),
    )
    const executeButton = screen.getByRole('button', {
      name: 'admin.privacy.execute',
    })
    const executeAlert = screen.getByRole('alert')
    expect(executeAlert).toHaveTextContent('Cannot update responsible_hsa_id')
    expect(
      Boolean(
        executeButton.compareDocumentPosition(executeAlert) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
    expect(screen.queryByText('admin.privacy.status')).toBeNull()
    expect(
      screen.queryByText('admin.privacy.executionStatus.failed'),
    ).toBeNull()
  })

  it('marks only the failed privacy row when execution returns safe row details', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [
            {
              affectedReferences: ['SEC Säkerhet'],
              allowedActions: ['delete', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              disabledReasonKey: null,
              fieldKey: 'identity',
              key: 'owners.identity',
              objectKey: 'owners',
              recommendedAction: 'delete',
              warningKey: 'ownerDelete',
            },
            {
              affectedReferences: ['INT0001 v1'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'createdBy',
              key: 'requirement_versions.created_by',
              objectKey: 'requirementVersions',
              recommendedAction: 'anonymize',
              warningKey: 'historySwitch',
            },
          ],
          previewToken: 'failed-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 2,
        }),
      )
      .mockResolvedValueOnce(
        errorJson(
          {
            code: 'validation',
            details: {
              groupKey: 'owners.identity',
              reason: 'owner_area_references_blocking',
            },
            error:
              'Requirement areas must be switched before changing the owner identity',
          },
          400,
        ),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const ownerRow = (
      await screen.findByText('admin.privacy.objects.owners')
    ).closest('tr')
    const versionRow = screen
      .getByText('admin.privacy.objects.requirementVersions')
      .closest('tr')

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'admin.privacy.execute' }),
    )

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some(alert =>
            alert.textContent?.includes('admin.privacy.errorWithDetail'),
          ),
      ).toBe(true),
    )

    expect(screen.getByText('admin.privacy.status')).toBeTruthy()
    expect(ownerRow).toHaveTextContent('admin.privacy.executionStatus.failed')
    expect(ownerRow?.className).toContain('bg-red')
    expect(versionRow).toHaveTextContent('admin.privacy.warnings.historySwitch')
    expect(versionRow).not.toHaveTextContent(
      'admin.privacy.executionStatus.completed',
    )
    expect(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeEnabled()
  })

  it('keeps stale privacy previews in preview mode without row failure status', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [
            {
              affectedReferences: ['INT0001 v1'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'createdBy',
              key: 'requirement_versions.created_by',
              objectKey: 'requirementVersions',
              recommendedAction: 'anonymize',
              warningKey: 'historySwitch',
            },
          ],
          previewToken: 'stale-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 1,
        }),
      )
      .mockResolvedValueOnce(
        errorJson(
          {
            code: 'conflict',
            error: 'Privacy erasure preview is stale',
          },
          409,
        ),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const versionRow = (
      await screen.findByText('admin.privacy.objects.requirementVersions')
    ).closest('tr')

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'admin.privacy.execute' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.privacy.stalePreview',
      ),
    )

    expect(screen.queryByText('admin.privacy.status')).toBeNull()
    expect(
      screen.queryByText('admin.privacy.executionStatus.failed'),
    ).toBeNull()
    expect(versionRow).toHaveTextContent('admin.privacy.warnings.historySwitch')
    expect(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeEnabled()
  })

  it('disables the owner action row when requirement areas still reference the owner and no replacement exists', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['INT Integration', 'SEC Säkerhet'],
            allowedActions: ['skip'],
            blockingReferences: [
              {
                objectKey: 'requirementAreas',
                values: ['INT Integration', 'SEC Säkerhet'],
              },
            ],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: 'ownerAreaReplacementRequired',
            fieldKey: 'identity',
            key: 'owners.identity',
            objectKey: 'owners',
            recommendedAction: 'skip',
            warningKey: 'ownerSwitch',
          },
          {
            affectedReferences: ['INT Integration', 'SEC Säkerhet'],
            allowedActions: ['switch', 'skip'],
            controlledByGroupKey: 'owners.identity',
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: null,
            fieldKey: 'owner',
            key: 'requirement_areas.owner',
            objectKey: 'requirementAreas',
            readOnlyReasonKey: 'controlledByOwner',
            recommendedAction: 'skip',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'owner-blocked-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 2,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const row = await screen.findByText('admin.privacy.objects.owners')
    const ownerRow = row.closest('tr')
    expect(ownerRow).not.toBeNull()
    expect(ownerRow).toHaveAttribute('aria-disabled', 'true')

    const select = within(ownerRow as HTMLTableRowElement).getByRole('combobox')
    expect(select).toBeDisabled()
    expect(
      within(ownerRow as HTMLTableRowElement).getAllByRole('option'),
    ).toHaveLength(1)
    expect(
      within(ownerRow as HTMLTableRowElement).getByRole('option', {
        name: 'admin.privacy.actions.skip',
      }),
    ).toHaveValue('skip')
    expect(ownerRow).toHaveTextContent(
      'admin.privacy.blockers.ownerAreaReplacementRequired',
    )
    const ownerAlert = within(ownerRow as HTMLTableRowElement).getByRole(
      'alert',
    )
    expect(ownerAlert).not.toHaveTextContent('INT Integration')
    expect(ownerAlert).not.toHaveTextContent('SEC Säkerhet')
    expect(ownerRow).toHaveTextContent('INT Integration')
    expect(ownerRow).toHaveTextContent('SEC Säkerhet')

    const requirementAreaRow = (
      await screen.findByText('admin.privacy.objects.requirementAreas')
    ).closest('tr')
    expect(requirementAreaRow).not.toBeNull()
    expect(requirementAreaRow).toHaveAttribute('aria-disabled', 'true')
    expect(
      within(requirementAreaRow as HTMLTableRowElement).queryByRole('combobox'),
    ).toBeNull()
    expect(requirementAreaRow).toHaveTextContent('admin.privacy.actions.skip')
    expect(requirementAreaRow).toHaveTextContent('INT Integration')
    expect(requirementAreaRow).toHaveTextContent('SEC Säkerhet')
    expect(requirementAreaRow).toHaveTextContent(
      'admin.privacy.readOnly.controlledByOwner',
    )
  })

  it('disables the requirement package owner row when no replacement exists', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['SPR Språkstöd', 'TIL Tillgänglighet'],
            allowedActions: ['skip'],
            count: 2,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: 'ownerPackageReplacementRequired',
            fieldKey: 'owner',
            key: 'requirement_packages.owner',
            objectKey: 'requirementPackages',
            recommendedAction: 'skip',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'package-owner-blocked-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 2,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const row = (
      await screen.findByText('admin.privacy.objects.requirementPackages')
    ).closest('tr')
    expect(row).not.toBeNull()
    expect(row).toHaveAttribute('aria-disabled', 'true')

    const select = within(row as HTMLTableRowElement).getByRole('combobox')
    expect(select).toBeDisabled()
    expect(
      within(row as HTMLTableRowElement).getAllByRole('option'),
    ).toHaveLength(1)
    expect(
      within(row as HTMLTableRowElement).getByRole('option', {
        name: 'admin.privacy.actions.skip',
      }),
    ).toHaveValue('skip')
    expect(row).toHaveTextContent(
      'admin.privacy.blockers.ownerPackageReplacementRequired',
    )
    expect(row).toHaveTextContent('SPR Språkstöd')
    expect(row).toHaveTextContent('TIL Tillgänglighet')
  })

  it('shows only switch and skip for an owner row when a replacement is supplied for linked requirement areas', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['SEC Säkerhet'],
            allowedActions: ['switch', 'skip'],
            blockingReferences: [
              {
                objectKey: 'requirementAreas',
                values: ['SEC Säkerhet'],
              },
            ],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: null,
            fieldKey: 'identity',
            key: 'owners.identity',
            objectKey: 'owners',
            recommendedAction: 'switch',
            warningKey: 'ownerAreaSwitchOnly',
          },
          {
            affectedReferences: ['SEC Säkerhet'],
            allowedActions: ['switch', 'skip'],
            controlledByGroupKey: 'owners.identity',
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: null,
            fieldKey: 'owner',
            key: 'requirement_areas.owner',
            objectKey: 'requirementAreas',
            readOnlyReasonKey: 'controlledByOwner',
            recommendedAction: 'switch',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'owner-switch-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 2,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE2321000032-johlju' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementName'), {
      target: { value: 'John Levi' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const ownerRow = (
      await screen.findByText('admin.privacy.objects.owners')
    ).closest('tr')
    expect(ownerRow).not.toBeNull()

    const select = within(ownerRow as HTMLTableRowElement).getByRole('combobox')
    expect(select).toBeEnabled()
    expect(
      within(ownerRow as HTMLTableRowElement)
        .getAllByRole('option')
        .map(option => option.getAttribute('value')),
    ).toEqual(['switch', 'skip'])
    expect(ownerRow).not.toHaveTextContent('admin.privacy.actions.anonymize')
    expect(ownerRow).not.toHaveTextContent('admin.privacy.actions.delete')

    const requirementAreaRow = (
      await screen.findByText('admin.privacy.objects.requirementAreas')
    ).closest('tr')
    expect(requirementAreaRow).not.toBeNull()
    expect(requirementAreaRow).toHaveAttribute('aria-disabled', 'true')
    expect(
      within(requirementAreaRow as HTMLTableRowElement).queryByRole('combobox'),
    ).toBeNull()
    expect(requirementAreaRow).toHaveTextContent('admin.privacy.actions.switch')
    expect(requirementAreaRow).toHaveTextContent('SEC Säkerhet')
    expect(requirementAreaRow).toHaveTextContent(
      'admin.privacy.readOnly.controlledByOwner',
    )
  })

  it('hides switch actions if the replacement HSA-ID is cleared after preview', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['SPR Språkstöd'],
            allowedActions: ['switch', 'skip'],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: null,
            fieldKey: 'owner',
            key: 'requirement_packages.owner',
            objectKey: 'requirementPackages',
            recommendedAction: 'switch',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'replacement-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE2321000032-johlju' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementName'), {
      target: { value: 'John Levi' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const row = (
      await screen.findByText('admin.privacy.objects.requirementPackages')
    ).closest('tr')
    expect(row).not.toBeNull()
    const rowQueries = within(row as HTMLTableRowElement)
    expect(rowQueries.getByRole('combobox')).toHaveValue('switch')
    expect(
      rowQueries.getByRole('option', {
        name: 'admin.privacy.actions.switch',
      }),
    ).toHaveValue('switch')

    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: '' },
    })

    expect(rowQueries.getByRole('combobox')).toHaveValue('skip')
    expect(
      rowQueries.queryByRole('option', {
        name: 'admin.privacy.actions.switch',
      }),
    ).toBeNull()
    expect(
      rowQueries.getByRole('option', {
        name: 'admin.privacy.actions.skip',
      }),
    ).toHaveValue('skip')
  })

  it('shows only delete and skip for an owner row with no linked requirement areas', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: [],
            allowedActions: ['delete', 'skip'],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: null,
            fieldKey: 'identity',
            key: 'owners.identity',
            objectKey: 'owners',
            recommendedAction: 'delete',
            warningKey: 'ownerDelete',
          },
        ],
        previewToken: 'owner-delete-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const ownerRow = (
      await screen.findByText('admin.privacy.objects.owners')
    ).closest('tr')
    expect(ownerRow).not.toBeNull()

    const select = within(ownerRow as HTMLTableRowElement).getByRole('combobox')
    expect(select).toBeEnabled()
    expect(
      within(ownerRow as HTMLTableRowElement)
        .getAllByRole('option')
        .map(option => option.getAttribute('value')),
    ).toEqual(['delete', 'skip'])
    expect(ownerRow).not.toHaveTextContent('admin.privacy.actions.switch')
    expect(ownerRow).not.toHaveTextContent('admin.privacy.actions.anonymize')
  })

  it('explains when privacy preview requires the PrivacyOfficer role', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        code: 'forbidden',
        error: 'PrivacyOfficer role is required',
      }),
      ok: false,
      status: 403,
    } as Response)

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.privacy.permissionError',
      ),
    )
  })

  it('explains that replacement switching needs both HSA-ID and name', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        error: 'Invalid request',
        issues: [
          {
            code: 'too_small',
            message: 'Too small: expected string to have >=1 characters',
            path: 'replacement.displayName',
          },
        ],
      }),
      ok: false,
      status: 400,
    } as Response)

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE2321000032-johlju' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.privacy.replacementIncomplete',
      ),
    )
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
