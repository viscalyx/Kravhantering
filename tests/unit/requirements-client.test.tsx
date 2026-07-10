import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsClient from '@/app/[locale]/requirements/requirements-client'
import type { RequirementsTableProps } from '@/components/RequirementsTable'
import {
  DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
  getRequirementColumnWidthsStorageKey,
  normalizeRequirementListColumnDefaults,
  REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
} from '@/lib/requirements/list-view'
import type { RequirementDetailResponse } from '@/lib/requirements/types'

type RequirementDetailRowSource = RequirementDetailResponse & {
  hasPendingVersion?: boolean
  pendingVersionStatusColor?: string | null
  pendingVersionStatusId?: number | null
}

const helpPanelState = vi.hoisted(() => ({
  useHelpContent: vi.fn(),
}))

const navigationState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}))

const tableState = vi.hoisted(() => ({
  detailChangeHandlers: new Map<
    number,
    (detail?: RequirementDetailResponse) => void | Promise<void>
  >(),
  renderSpy: vi.fn(),
}))

const aiGeneratorState = vi.hoisted(() => ({
  renderSpy: vi.fn(),
}))

const importDialogState = vi.hoisted(() => ({
  renderSpy: vi.fn(),
}))

const pdfDownloadState = vi.hoisted(() => ({
  clearError: vi.fn(),
  download: vi.fn(),
}))

const fetchMock = vi.fn()
const printMock = vi.fn()
const createObjectURLMock = vi.fn(() => 'blob:requirements-export')
const revokeObjectURLMock = vi.fn()
const storageGetItem = vi.fn()
const storageSetItem = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => navigationState.searchParams,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}))

vi.mock('@/components/HelpPanel', () => ({
  useHelpContent: helpPanelState.useHelpContent,
}))

vi.mock('@/components/AiRequirementGenerator', () => ({
  default: (props: Record<string, unknown>) => {
    aiGeneratorState.renderSpy(props)
    return props.open ? <div data-testid="ai-generator-modal" /> : null
  },
}))

vi.mock('@/components/RequirementsImportDialog', () => ({
  default: (props: Record<string, unknown>) => {
    importDialogState.renderSpy(props)
    return props.open ? <div data-testid="requirements-import-dialog" /> : null
  },
}))

vi.mock('@/components/reports/pdf/useServerPdfDownload', () => ({
  useServerPdfDownload: () => ({
    clearError: pdfDownloadState.clearError,
    dialog: null,
    download: pdfDownloadState.download,
    downloading: false,
    error: null,
  }),
}))

vi.mock('@/components/RequirementsTable', () => ({
  default: (props: RequirementsTableProps) => {
    const {
      areas,
      categories,
      columnPickerPlacement,
      columnWidths,
      expandedId,
      floatingActions,
      hasMore,
      loading,
      loadingMore,
      onColumnWidthsChange,
      onLoadMore,
      onRowClick,
      onSelectionChange,
      onSortChange,
      onVisibleColumnsChange,
      renderExpanded,
      rows,
      selectedIds,
      sortState,
      statusOptions,
      qualityCharacteristics,
      types,
      visibleColumns,
    } = props

    tableState.renderSpy({
      areas: areas ?? [],
      categories: categories ?? [],
      columnPickerPlacement,
      columnWidths: columnWidths ?? {},
      floatingActions: floatingActions ?? [],
      hasMore: hasMore ?? false,
      loading: loading ?? false,
      loadingMore: loadingMore ?? false,
      rows: rows ?? [],
      selectedIds: selectedIds ?? new Set(),
      sortState,
      statusOptions: statusOptions ?? [],
      qualityCharacteristics: qualityCharacteristics ?? [],
      types: types ?? [],
      visibleColumns: visibleColumns ?? [],
    })

    return (
      <div data-testid="requirements-table">
        <div data-testid="floating-actions-order">
          {(floatingActions ?? [])
            .map(
              action =>
                `${action.id}:${action.position ?? 'afterColumns'}:${action.variant ?? 'default'}`,
            )
            .join(',')}
        </div>
        <div data-testid="sort-state">
          {sortState?.by}:{sortState?.direction}
        </div>
        <div data-testid="visible-columns">
          {(visibleColumns ?? []).join(',')}
        </div>
        <div data-testid="column-widths">
          {JSON.stringify(columnWidths ?? {})}
        </div>
        <div data-testid="row-ids">
          {(rows ?? []).map(row => row.uniqueId).join(',')}
        </div>
        <div data-testid="has-more">{String(hasMore ?? false)}</div>
        <div data-testid="loading">{String(loading ?? false)}</div>
        <div data-testid="loading-more">{String(loadingMore ?? false)}</div>
        {(rows ?? []).map(row => (
          <div key={row.id}>
            <button onClick={() => onRowClick?.(row.id)} type="button">
              {`row-${row.id}`}
            </button>
            {expandedId === row.id ? renderExpanded?.(row.id) : null}
          </div>
        ))}
        {(floatingActions ?? []).map(action =>
          action.href ? (
            <a
              aria-label={action.ariaLabel}
              data-floating-action-id={action.id}
              data-floating-action-variant={action.variant ?? 'default'}
              href={action.href}
              key={action.id}
            >
              {action.id}
            </a>
          ) : (
            <button
              aria-label={action.ariaLabel}
              data-floating-action-id={action.id}
              data-floating-action-variant={action.variant ?? 'default'}
              disabled={action.disabled}
              key={action.id}
              onClick={action.disabled ? undefined : action.onClick}
              title={action.tooltip}
              type="button"
            >
              {action.id}
            </button>
          ),
        )}
        <button
          onClick={() => {
            const firstRow = rows?.[0]
            if (firstRow) onSelectionChange?.(new Set([firstRow.id]))
          }}
          type="button"
        >
          select-first-row
        </button>
        <button
          onClick={() => {
            const nextSelectedIds = (rows ?? []).slice(0, 2).map(row => row.id)
            onSelectionChange?.(new Set(nextSelectedIds))
          }}
          type="button"
        >
          select-first-two-rows
        </button>
        <button
          onClick={() => onSortChange?.({ by: 'status', direction: 'asc' })}
          type="button"
        >
          change-sort
        </button>
        <button
          onClick={() => onSortChange?.({ by: 'uniqueId', direction: 'desc' })}
          type="button"
        >
          change-sort-desc
        </button>
        <button
          onClick={() =>
            onVisibleColumnsChange?.(['uniqueId', 'description', 'status'])
          }
          type="button"
        >
          change-columns
        </button>
        <button
          onClick={() => onColumnWidthsChange?.({ status: 220, type: 200 })}
          type="button"
        >
          change-widths
        </button>
        <button
          disabled={!hasMore}
          onClick={() => onLoadMore?.()}
          type="button"
        >
          load-more
        </button>
      </div>
    )
  },
}))

vi.mock('@/app/[locale]/requirements/[id]/requirement-detail-client', () => ({
  default: ({
    onChange,
    onClose,
    requirementId,
  }: {
    onChange?: (detail?: RequirementDetailResponse) => void | Promise<void>
    onClose?: () => void
    requirementId?: number
  }) => {
    if (requirementId != null && onChange) {
      tableState.detailChangeHandlers.set(requirementId, onChange)
    }

    return (
      <div>
        detail
        <button onClick={() => void onChange?.()} type="button">
          {`detail-refresh-${requirementId}`}
        </button>
        <button
          onClick={() =>
            void onChange?.({
              area: {
                id: 1,
                name: 'Integration',
                ownerHsaId: 'SE5560000001-area1',
                ownerName: 'SE5560000001-area1',
                prefix: 'INT',
              },
              createdAt: '2026-03-01T00:00:00Z',
              id: requirementId ?? 1,
              isArchived: false,
              permissions: {
                allowedTransitionStatusIds: [1, 2, 3, 4],
                canArchive: true,
                canDeleteDraft: true,
                canEdit: true,
                canManageSuggestions: true,
                canReactivate: true,
                canRestore: true,
                canViewHistory: true,
              },
              specificationCount: 0,
              uniqueId: 'PWT0007',
              versions: [
                {
                  acceptanceCriteria: 'Acceptance 1',
                  archiveInitiatedAt: '2026-05-16T08:00:00.000Z',
                  archivedAt: null,
                  category: {
                    id: 2,
                    nameEn: 'Business requirement',
                    nameSv: 'Verksamhetskrav',
                  },
                  createdAt: '2026-03-01T00:00:00Z',
                  createdBy: 'owner-1',
                  description: 'Pinned krav 1',
                  editedAt: null,
                  id: requirementId ?? 1,
                  ownerName: 'Owner',
                  publishedAt: '2026-03-01T00:00:00Z',
                  verifiable: false,
                  revisionToken: '11111111-1111-4111-8111-000000000001',
                  priorityLevel: null,
                  status: 2,
                  statusColor: '#eab308',
                  statusNameEn: 'Review',
                  statusNameSv: 'Granskning',
                  qualityCharacteristic: null,
                  type: {
                    id: 3,
                    nameEn: 'Functional',
                    nameSv: 'Funktionellt',
                  },
                  verificationMethod: null,
                  versionNumber: 1,
                  versionRequirementPackages: [],
                  versionNormReferences: [],
                },
              ],
            })
          }
          type="button"
        >
          {`detail-apply-archive-${requirementId}`}
        </button>
        <button onClick={onClose} type="button">
          {`detail-close-${requirementId}`}
        </button>
      </div>
    )
  },
}))

function okJson(body: unknown) {
  return {
    json: async () => body,
    ok: true,
  } as Response
}

function createDeferredJsonResponse<T>() {
  let resolve: ((body: T) => void) | undefined
  const promise = new Promise<Response>(promiseResolve => {
    resolve = body => promiseResolve(okJson(body))
  })

  return {
    promise,
    resolve(body: T) {
      resolve?.(body)
    },
  }
}

function makeRequirementRow(
  id: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    area: { name: 'Integration' },
    id,
    isArchived: false,
    uniqueId: `INT${String(id).padStart(4, '0')}`,
    version: {
      categoryNameEn: 'Business requirement',
      categoryNameSv: 'Verksamhetskrav',
      description: `Testkrav ${id}`,
      verifiable: false,
      status: 3,
      statusColor: '#22c55e',
      statusNameEn: 'Published',
      statusNameSv: 'Publicerad',
      qualityCharacteristicNameEn: null,
      qualityCharacteristicNameSv: null,
      priorityLevelId: null,
      priorityLevelNameEn: null,
      priorityLevelNameSv: null,
      priorityLevelColor: null,
      typeNameEn: 'Functional',
      typeNameSv: 'Funktionellt',
      versionNumber: 1,
    },
    ...overrides,
  }
}

function makeRequirementDetail(
  id: number,
  overrides: Partial<RequirementDetailRowSource> = {},
): RequirementDetailRowSource {
  return {
    area: {
      id: 1,
      name: 'Integration',
      ownerHsaId: 'SE5560000001-area1',
      ownerName: 'SE5560000001-area1',
      prefix: 'INT',
    },
    createdAt: '2026-03-01T00:00:00Z',
    id,
    isArchived: false,
    permissions: {
      allowedTransitionStatusIds: [1, 2, 3, 4],
      canArchive: true,
      canDeleteDraft: true,
      canEdit: true,
      canManageSuggestions: true,
      canReactivate: true,
      canRestore: true,
      canViewHistory: true,
    },
    specificationCount: 0,
    uniqueId: `INT${String(id).padStart(4, '0')}`,
    versions: [
      {
        acceptanceCriteria: `Acceptance ${id}`,
        archiveInitiatedAt: null,
        archivedAt: null,
        category: {
          id: 2,
          nameEn: 'Business requirement',
          nameSv: 'Verksamhetskrav',
        },
        createdAt: '2026-03-01T00:00:00Z',
        createdBy: 'owner-1',
        description: `Pinned krav ${id}`,
        editedAt: null,
        id,
        ownerName: 'Owner',
        publishedAt: '2026-03-01T00:00:00Z',
        verifiable: false,
        revisionToken: `11111111-1111-4111-8111-${String(id).padStart(12, '0')}`,
        priorityLevel: null,
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        qualityCharacteristic: null,
        type: { id: 3, nameEn: 'Functional', nameSv: 'Funktionellt' },
        verificationMethod: null,
        versionNumber: 1,
        versionRequirementPackages: [],
        versionNormReferences: [],
      },
    ],
    ...overrides,
  }
}

function mockMetadataFetch(url: string) {
  if (url === '/api/requirement-areas') {
    return Promise.resolve(
      okJson({
        areas: [
          {
            id: 1,
            name: 'Integration',
            permissions: { canAuthor: true },
            prefix: 'INT',
          },
        ],
      }),
    )
  }
  if (url === '/api/requirement-categories') {
    return Promise.resolve(okJson({ categories: [] }))
  }
  if (url === '/api/requirement-types') {
    return Promise.resolve(okJson({ types: [] }))
  }
  if (url === '/api/quality-characteristics') {
    return Promise.resolve(okJson({ qualityCharacteristics: [] }))
  }
  if (url === '/api/requirement-statuses') {
    return Promise.resolve(
      okJson({
        statuses: [
          {
            color: '#22c55e',
            id: 3,
            nameEn: 'Published',
            nameSv: 'Publicerad',
            sortOrder: 3,
          },
        ],
      }),
    )
  }
  if (url === '/api/priority-levels') {
    return Promise.resolve(okJson({ priorityLevels: [] }))
  }
  if (url === '/api/requirement-packages') {
    return Promise.resolve(okJson([]))
  }
  if (url.startsWith('/api/norm-references')) {
    return Promise.resolve(okJson({ normReferences: [] }))
  }

  return null
}

function mockCommonFetches() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.startsWith('/api/requirements?')) {
      if (url.includes('format=csv')) {
        return {
          blob: async () => new Blob(['csv']),
          ok: true,
        } as Response
      }

      return okJson({
        pagination: { hasMore: false },
        requirements: [makeRequirementRow(1)],
      })
    }

    const metadataResponse = mockMetadataFetch(url)
    if (metadataResponse) {
      return metadataResponse
    }

    throw new Error(`Unhandled fetch: ${url}`)
  })
}

type FloatingAction = NonNullable<
  RequirementsTableProps['floatingActions']
>[number]

function latestFloatingActions(): FloatingAction[] {
  const calls = tableState.renderSpy.mock.calls as {
    floatingActions: FloatingAction[]
  }[][]
  return calls.at(-1)?.[0].floatingActions ?? []
}

describe('RequirementsClient', () => {
  beforeEach(() => {
    navigationState.searchParams = new URLSearchParams()
    fetchMock.mockReset()
    helpPanelState.useHelpContent.mockReset()
    printMock.mockReset()
    createObjectURLMock.mockReset()
    createObjectURLMock.mockReturnValue('blob:requirements-export')
    revokeObjectURLMock.mockReset()
    storageGetItem.mockReset()
    storageGetItem.mockImplementation(() => null)
    storageSetItem.mockReset()
    tableState.renderSpy.mockReset()
    tableState.detailChangeHandlers.clear()
    aiGeneratorState.renderSpy.mockReset()
    importDialogState.renderSpy.mockReset()
    pdfDownloadState.clearError.mockReset()
    pdfDownloadState.download.mockReset()
    pdfDownloadState.download.mockResolvedValue(undefined)
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: printMock,
      writable: true,
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
      writable: true,
    })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: storageGetItem,
        setItem: storageSetItem,
      },
      writable: true,
    })
    window.history.replaceState({}, '', '/')
  })

  it('registers help content for inline detail and lifecycle guidance', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    expect(helpPanelState.useHelpContent).toHaveBeenCalledWith({
      sections: [
        {
          kind: 'text',
          bodyKey: 'requirements.overview.body',
          headingKey: 'requirements.overview.heading',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.inlineDetail.body',
          headingKey: 'requirements.inlineDetail.heading',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.body',
          headingKey: 'requirements.properties.heading',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.requirementId.body',
          headingKey: 'requirements.properties.requirementId.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.area.body',
          headingKey: 'requirements.properties.area.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.description.body',
          headingKey: 'requirements.properties.description.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.acceptanceCriteria.body',
          headingKey: 'requirements.properties.acceptanceCriteria.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.category.body',
          headingKey: 'requirements.properties.category.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.type.body',
          headingKey: 'requirements.properties.type.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.qualityCharacteristic.body',
          headingKey: 'requirements.properties.qualityCharacteristic.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.priorityLevel.body',
          headingKey: 'requirements.properties.priorityLevel.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.verifiable.body',
          headingKey: 'requirements.properties.verifiable.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.verificationMethod.body',
          headingKey: 'requirements.properties.verificationMethod.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.requirementPackages.body',
          headingKey: 'requirements.properties.requirementPackages.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.normReferences.body',
          headingKey: 'requirements.properties.normReferences.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.properties.status.body',
          headingKey: 'requirements.properties.status.heading',
          subheading: true,
        },
        {
          kind: 'text',
          bodyKey: 'requirements.filtering.body',
          headingKey: 'requirements.filtering.heading',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.columns.body',
          headingKey: 'requirements.columns.heading',
        },
        {
          bodyKey: 'requirements.lifecycleVisual.body',
          headingKey: 'requirements.lifecycleVisual.heading',
          kind: 'visual',
          visualId: 'requirementLifecycle',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.lifecycle.body',
          headingKey: 'requirements.lifecycle.heading',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.actions.body',
          headingKey: 'requirements.actions.heading',
        },
      ],
      titleKey: 'requirements.title',
    })
  })

  it('waits for hydrated preferences and the first row response before mounting the table', async () => {
    const columnWidthsStorageKey = getRequirementColumnWidthsStorageKey('sv')
    const initialRequirementsResponse = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()

    storageGetItem.mockImplementation((key: string) => {
      if (key === REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY) {
        return '["area","status"]'
      }
      if (key === columnWidthsStorageKey) {
        return '{"status":220}'
      }
      return null
    })
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: storageGetItem,
        setItem: storageSetItem,
      },
      writable: true,
    })

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return initialRequirementsResponse.promise
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return Promise.resolve(metadataResponse)
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    expect(screen.getByTestId('requirements-card-loading')).toBeTruthy()
    expect(screen.getByText('loadingRequirements')).toBeTruthy()
    expect(screen.queryByTestId('requirements-table')).toBeNull()
    expect(tableState.renderSpy).not.toHaveBeenCalled()

    initialRequirementsResponse.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        'uniqueId,description,area,status',
      ),
    )

    expect(screen.queryByTestId('requirements-card-loading')).toBeNull()
    expect(tableState.renderSpy).toHaveBeenCalled()
    expect(tableState.renderSpy.mock.calls[0]?.[0]).toMatchObject({
      columnWidths: { status: 220 },
      loading: false,
      rows: [expect.objectContaining({ uniqueId: 'INT0001' })],
      visibleColumns: ['uniqueId', 'description', 'area', 'status'],
    })
  })

  it('disables AI generation when availability is disabled by Admin Center', async () => {
    const aiGenerationAvailability = {
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: false,
    }
    mockCommonFetches()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <RequirementsClient
        aiGenerationAvailability={aiGenerationAvailability}
      />,
    )

    await waitFor(() =>
      expect(screen.getByTestId('requirements-table')).toBeTruthy(),
    )

    const aiButton = screen.getByRole('button', { name: 'aiGenerate' })
    expect(aiButton).toBeDisabled()
    expect(aiButton).toHaveAttribute('title', 'aiGenerateDisabledByAdmin')
    expect(latestFloatingActions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          disabled: true,
          id: 'ai-generate',
          tooltip: 'aiGenerateDisabledByAdmin',
        }),
      ]),
    )

    fireEvent.click(aiButton)

    expect(screen.queryByTestId('ai-generator-modal')).toBeNull()
    expect(aiGeneratorState.renderSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      aiGenerationAvailability,
      open: false,
    })
  })

  it('does not open AI generation when no requirement area is authorable', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return okJson({
          pagination: { hasMore: false },
          requirements: [makeRequirementRow(1)],
        })
      }
      if (url === '/api/requirement-areas') {
        return okJson({
          areas: [
            {
              id: 1,
              name: 'Integration',
              permissions: { canAuthor: false },
              prefix: 'INT',
            },
          ],
        })
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) return metadataResponse

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('requirements-table')).toBeTruthy(),
    )

    const aiButton = screen.getByRole('button', { name: 'aiGenerate' })
    expect(aiButton).toBeDisabled()
    expect(aiButton).toHaveAttribute(
      'title',
      'aiGenerateDisabledNoAuthorableArea',
    )
    expect(latestFloatingActions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          disabled: true,
          id: 'ai-generate',
          tooltip: 'aiGenerateDisabledNoAuthorableArea',
        }),
      ]),
    )

    fireEvent.click(aiButton)

    expect(screen.queryByTestId('ai-generator-modal')).toBeNull()
    expect(aiGeneratorState.renderSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      open: false,
    })
  })

  it('clears the initial loading state when the first row request rejects', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return Promise.reject(new Error('Requirements fetch failed'))
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return Promise.resolve(metadataResponse)
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.queryByTestId('requirements-card-loading')).toBeNull(),
    )

    expect(screen.getByTestId('requirements-table')).toBeTruthy()
    expect(screen.getByTestId('row-ids').textContent).toBe('')
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })

  it('hydrates saved columns and widths and sends sort params in list requests', async () => {
    const columnWidthsStorageKey = getRequirementColumnWidthsStorageKey('sv')

    storageGetItem.mockImplementation((key: string) => {
      if (key === REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY) {
        return '["area","status"]'
      }
      if (key === columnWidthsStorageKey) {
        return '{"status":220}'
      }
      return null
    })
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: storageGetItem,
        setItem: storageSetItem,
      },
      writable: true,
    })

    mockCommonFetches()
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<RequirementsClient />)

    const tableCard = container.querySelector(
      '[data-requirements-workbench="true"]',
    )

    expect(tableCard).toBeTruthy()

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        'uniqueId,description,area,status',
      ),
    )
    expect(screen.getByTestId('floating-actions-order').textContent).toBe(
      'create:beforeColumns:primary,ai-generate:beforeColumns:default,reports:afterColumns:default,import:afterColumns:default,export:afterColumns:default',
    )
    expect(tableState.renderSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      columnPickerPlacement: 'end',
    })
    expect(screen.queryByText('newRequirement')).toBeNull()
    expect(
      screen.getByRole('link', { name: 'newRequirement' }),
    ).toHaveAttribute('href', '/requirements/new')
    expect(
      screen.getByRole('link', { name: 'newRequirement' }).dataset
        .floatingActionVariant,
    ).toBe('primary')
    expect(
      screen.getByRole('button', { name: 'reports' }).dataset
        .floatingActionVariant,
    ).toBe('default')
    expect(
      screen.getByRole('button', { name: 'export' }).dataset
        .floatingActionVariant,
    ).toBe('default')
    expect(
      screen.getByRole('button', { name: 'importRequirements' }).dataset
        .floatingActionVariant,
    ).toBe('default')
    fireEvent.click(screen.getByRole('button', { name: 'importRequirements' }))
    expect(screen.getByTestId('requirements-import-dialog')).toBeTruthy()
    expect(screen.getByTestId('sort-state').textContent).toBe('uniqueId:asc')
    expect(screen.getByTestId('column-widths').textContent).toBe(
      '{"status":220}',
    )
    expect(storageGetItem).toHaveBeenCalledWith(
      REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
    )
    expect(storageGetItem).toHaveBeenCalledWith(columnWidthsStorageKey)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('sortBy=uniqueId'),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('sortDirection=asc'),
    )
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('locale=sv'))

    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    fireEvent.click(screen.getByText('change-columns'))

    await waitFor(() =>
      expect(storageSetItem).toHaveBeenCalledWith(
        REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
        '["uniqueId","description","status"]',
      ),
    )

    fireEvent.click(screen.getByText('change-widths'))

    await waitFor(() =>
      expect(storageSetItem).toHaveBeenCalledWith(
        columnWidthsStorageKey,
        '{"type":200,"status":220}',
      ),
    )

    // Reports pill is a dropdown menu with list report options (menu
    // rendering tested in requirements-table.test.tsx floating-action tests)
    expect(screen.getByRole('button', { name: 'reports' })).toHaveAttribute(
      'data-floating-action-id',
      'reports',
    )

    fireEvent.click(screen.getByRole('button', { name: 'export' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('format=csv'),
      ),
    )
    const exportRequest = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find(url => url.includes('format=csv'))
    expect(exportRequest).toBeTruthy()
    expect(exportRequest).not.toContain('limit=')
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:requirements-export')
  })

  it('uses localized filter-based report URLs for floating actions', async () => {
    const reviewRow = makeRequirementRow(1)
    reviewRow.version.status = 2
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return okJson({
          pagination: { hasMore: true },
          requirements: [reviewRow],
        })
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    const reportsAction = latestFloatingActions().find(
      action => action.id === 'reports',
    )

    const pdfListItem = reportsAction?.menuItems?.find(
      item => item.id === 'pdf-list',
    )
    expect(reportsAction?.menuItems).toHaveLength(1)
    expect(reportsAction?.badge).toBeUndefined()
    expect(reportsAction?.variant).toBeUndefined()
    expect(pdfListItem).toBeTruthy()
    if (
      pdfListItem &&
      !('kind' in pdfListItem) &&
      typeof pdfListItem.onClick === 'function'
    ) {
      pdfListItem.onClick()
    }
    expect(pdfDownloadState.download).toHaveBeenCalledWith({
      fallbackFilename: 'requirements-list.pdf',
      url: '/sv/requirements/reports/pdf/list?locale=sv&sortBy=uniqueId&sortDirection=asc&statuses=3',
    })

    fireEvent.click(screen.getByText('select-first-row'))

    await waitFor(() => {
      const selectedReportsAction = latestFloatingActions().find(
        action => action.id === 'reports',
      )
      expect(selectedReportsAction?.badge).toBe(1)
    })
    expect(latestFloatingActions().map(action => action.id)).toEqual([
      'create',
      'ai-generate',
      'reports',
      'import',
      'export',
    ])

    const selectedReportsAction = latestFloatingActions().find(
      action => action.id === 'reports',
    )
    expect(selectedReportsAction?.variant).toBe('warning')
    const reviewPdfItem = selectedReportsAction?.menuItems?.find(
      item => item.id === 'review-report-pdf',
    )
    expect(selectedReportsAction?.menuItems).toHaveLength(2)
    expect(reviewPdfItem).toMatchObject({
      badge: 1,
      label: 'downloadCombinedReportPdf',
    })
    expect(reviewPdfItem).toBeTruthy()
    if (
      reviewPdfItem &&
      !('kind' in reviewPdfItem) &&
      typeof reviewPdfItem.onClick === 'function'
    ) {
      reviewPdfItem.onClick()
    }
    expect(pdfDownloadState.download).toHaveBeenLastCalledWith({
      fallbackFilename: 'combined-review-report.pdf',
      url: '/sv/requirements/reports/pdf/review-combined?ids=1',
    })
  })

  it('keeps the mixed-status report guidance on the disabled combined report row', async () => {
    const reviewRow = makeRequirementRow(1)
    reviewRow.version.status = 2
    const publishedRow = makeRequirementRow(2)

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return okJson({
          pagination: { hasMore: false },
          requirements: [reviewRow, publishedRow],
        })
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001,INT0002'),
    )

    fireEvent.click(screen.getByText('select-first-two-rows'))

    await waitFor(() => {
      const selectedReportsAction = latestFloatingActions().find(
        action => action.id === 'reports',
      )
      expect(selectedReportsAction?.badge).toBe(2)
    })

    const selectedReportsAction = latestFloatingActions().find(
      action => action.id === 'reports',
    )
    const reviewPdfItem = selectedReportsAction?.menuItems?.find(
      item => item.id === 'review-report-pdf',
    )

    expect(selectedReportsAction?.tooltip).toBe('reports')
    expect(reviewPdfItem).toMatchObject({
      badge: 2,
      description: 'reviewReportAllMustBeReview',
      disabled: true,
      label: 'downloadCombinedReportPdf',
      tooltip: 'reviewReportAllMustBeReview',
    })
  })

  it('ignores export failures without starting a download', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (url.includes('format=csv')) {
          return Promise.reject(new Error('Export failed'))
        }

        return okJson({
          pagination: { hasMore: false },
          requirements: [makeRequirementRow(1)],
        })
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'export' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('format=csv'),
      ),
    )

    expect(createObjectURLMock).not.toHaveBeenCalled()
    expect(revokeObjectURLMock).not.toHaveBeenCalled()
  })

  it('ignores stale refresh responses and pinned-row fetches once a newer refresh wins', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const staleList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const freshList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const stalePinned =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()
    const freshPinned =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()
    let pinnedFetchCount = 0

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return staleList.promise
        }
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=desc')
        ) {
          return freshList.promise
        }
      }

      if (url === '/api/requirements/1') {
        pinnedFetchCount += 1
        return pinnedFetchCount === 1
          ? stalePinned.promise
          : freshPinned.promise
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    staleList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(2)],
    })

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input]) => String(input) === '/api/requirements/1',
        ),
      ).toHaveLength(1),
    )

    fireEvent.click(screen.getByText('change-sort-desc'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortDirection=desc'),
      ),
    )

    freshList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(3)],
    })

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input]) => String(input) === '/api/requirements/1',
        ),
      ).toHaveLength(2),
    )

    freshPinned.resolve(
      makeRequirementDetail(1, {
        hasPendingVersion: true,
        pendingVersionStatusColor: '#eab308',
        pendingVersionStatusId: 2,
        uniqueId: 'FRESH-PINNED-0001',
      }),
    )

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toContain('INT0003'),
    )
    expect(screen.getByTestId('row-ids').textContent).toContain(
      'FRESH-PINNED-0001',
    )
    expect(screen.getByTestId('row-ids').textContent).not.toContain('INT0002')
    expect(tableState.renderSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      rows: expect.arrayContaining([
        expect.objectContaining({
          hasPendingVersion: true,
          pendingVersionStatusColor: '#eab308',
          pendingVersionStatusId: 2,
          uniqueId: 'FRESH-PINNED-0001',
        }),
      ]),
    })

    await act(async () => {
      stalePinned.resolve(
        makeRequirementDetail(1, { uniqueId: 'STALE-PINNED-0001' }),
      )
      await Promise.resolve()
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).not.toContain(
        'STALE-PINNED-0001',
      ),
    )
    expect(screen.getByTestId('row-ids').textContent).toContain(
      'FRESH-PINNED-0001',
    )
    expect(screen.getByTestId('row-ids').textContent).not.toContain('INT0002')
    expect(screen.getByTestId('row-ids').textContent).not.toContain(
      'STALE-PINNED-0001',
    )
  })

  it('prepends a pinned row when status sort metadata is unavailable', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedDetail =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return pinnedList.promise
        }
      }

      if (url === '/api/requirements/1') {
        return pinnedDetail.promise
      }
      if (url === '/api/requirement-statuses') {
        return okJson({ statuses: [] })
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    pinnedList.resolve({
      pagination: { hasMore: false },
      requirements: [
        makeRequirementRow(3, {
          version: {
            ...makeRequirementRow(3).version,
            status: 1,
            statusNameEn: 'Draft',
            statusNameSv: 'Utkast',
          },
        }),
      ],
    })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/requirements/1'),
    )

    pinnedDetail.resolve(
      makeRequirementDetail(1, {
        uniqueId: 'PINNED-0001',
        versions: [
          {
            ...makeRequirementDetail(1).versions[0],
            status: 3,
          },
        ],
      }),
    )

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe(
        'PINNED-0001,INT0003',
      ),
    )
  })

  it('clears a pinned row immediately when selecting a different row', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedDetail =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return pinnedList.promise
        }
      }

      if (url === '/api/requirements/1') {
        return pinnedDetail.promise
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1), makeRequirementRow(3)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001,INT0003'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    pinnedList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(3)],
    })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/requirements/1'),
    )

    fireEvent.click(screen.getByText('row-3'))

    pinnedDetail.resolve(makeRequirementDetail(1, { uniqueId: 'PINNED-0001' }))

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0003'),
    )
    expect(screen.getByTestId('row-ids').textContent).not.toContain(
      'PINNED-0001',
    )
  })

  it('clears a pinned row immediately when the expanded detail closes', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const closeRefresh = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedDetail =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()
    let statusListRequestCount = 0

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          statusListRequestCount += 1
          return statusListRequestCount === 1
            ? pinnedList.promise
            : closeRefresh.promise
        }
      }

      if (url === '/api/requirements/1') {
        return pinnedDetail.promise
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    pinnedList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(3)],
    })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/requirements/1'),
    )

    pinnedDetail.resolve(makeRequirementDetail(1, { uniqueId: 'PINNED-0001' }))

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toContain(
        'PINNED-0001',
      ),
    )
    expect(screen.getByTestId('row-ids').textContent).toContain('INT0003')

    fireEvent.click(screen.getByText('detail-close-1'))

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0003'),
    )
    expect(screen.getByTestId('row-ids').textContent).not.toContain(
      'PINNED-0001',
    )

    closeRefresh.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(4)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0004'),
    )
  })

  it('ignores stale load-more responses after a newer refresh replaces the list', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const staleLoadMore = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const freshRefresh = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (url.includes('offset=1')) {
          return staleLoadMore.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return freshRefresh.promise
        }
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: true },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )
    await waitFor(() =>
      expect(screen.getByTestId('has-more').textContent).toBe('true'),
    )

    fireEvent.click(screen.getByText('load-more'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('offset=1'),
      ),
    )

    fireEvent.click(screen.getByText('change-sort'))

    freshRefresh.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(2)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0002'),
    )
    expect(screen.getByTestId('has-more').textContent).toBe('false')

    staleLoadMore.resolve({
      pagination: { hasMore: true },
      requirements: [makeRequirementRow(3)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('loading-more').textContent).toBe('false'),
    )

    expect(screen.getByTestId('row-ids').textContent).toBe('INT0002')
    expect(screen.getByTestId('row-ids').textContent).not.toContain('INT0003')
    expect(screen.getByTestId('has-more').textContent).toBe('false')
  })

  it('does not start load more while a refresh is already in flight', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const refreshedList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return refreshedList.promise
        }
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: true },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )
    await waitFor(() =>
      expect(screen.getByTestId('has-more').textContent).toBe('true'),
    )

    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )
    await waitFor(() =>
      expect(screen.getByTestId('loading').textContent).toBe('true'),
    )

    fireEvent.click(screen.getByText('load-more'))

    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          String(input).startsWith('/api/requirements?') &&
          String(input).includes('offset=1'),
      ),
    ).toBe(false)
    expect(screen.getByTestId('loading-more').textContent).toBe('false')

    refreshedList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(2)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0002'),
    )
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })

  it('keeps refreshed rows when the pinned-row fetch rejects', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const refreshedList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return refreshedList.promise
        }
      }

      if (url === '/api/requirements/1') {
        return Promise.reject(new Error('Pinned fetch failed'))
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    refreshedList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(2)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0002'),
    )
    expect(screen.getByTestId('row-ids').textContent).not.toContain('INT0001')
  })

  it('pins and expands a selected URL requirement that is outside the first page', async () => {
    navigationState.searchParams = new URLSearchParams('selected=PWT0009')
    window.history.replaceState({}, '', '/sv/requirements?selected=PWT0009')

    let selectedDetailFetchCount = 0
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return Promise.resolve(
          okJson({
            pagination: { hasMore: true },
            requirements: [makeRequirementRow(1)],
          }),
        )
      }

      if (
        url === '/api/requirements/PWT0009' ||
        url === '/api/requirements/9'
      ) {
        selectedDetailFetchCount += 1
        return Promise.resolve(
          okJson(
            makeRequirementDetail(9, {
              uniqueId: 'PWT0009',
            }),
          ),
        )
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toContain('PWT0009'),
    )

    expect(screen.getByText('detail-refresh-9')).toBeInTheDocument()
    expect(selectedDetailFetchCount).toBeGreaterThan(0)
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('keeps the URL-selected pin when hydration resolves before row refresh detail', async () => {
    navigationState.searchParams = new URLSearchParams('selected=PWT0009')
    window.history.replaceState({}, '', '/sv/requirements?selected=PWT0009')

    const hydrationDetail =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()
    const refreshDetail =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()
    let selectedDetailFetchCount = 0

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return Promise.resolve(
          okJson({
            pagination: { hasMore: false },
            requirements: [makeRequirementRow(1)],
          }),
        )
      }

      if (url === '/api/requirements/PWT0009') {
        selectedDetailFetchCount += 1
        return selectedDetailFetchCount === 1
          ? hydrationDetail.promise
          : refreshDetail.promise
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() => expect(selectedDetailFetchCount).toBeGreaterThan(1))

    hydrationDetail.resolve(makeRequirementDetail(9, { uniqueId: 'PWT0009' }))
    refreshDetail.resolve(makeRequirementDetail(9, { uniqueId: 'PWT0009' }))

    await waitFor(() =>
      expect(screen.getByText('detail-refresh-9')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('row-ids').textContent).toContain('PWT0009')
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('keeps a user row click when delayed URL hydration resolves afterward', async () => {
    navigationState.searchParams = new URLSearchParams('selected=PWT0009')
    window.history.replaceState({}, '', '/sv/requirements?selected=PWT0009')

    const delayedHydration =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()
    let selectedDetailFetchCount = 0

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return Promise.resolve(
          okJson({
            pagination: { hasMore: false },
            requirements: [makeRequirementRow(1)],
          }),
        )
      }

      if (url === '/api/requirements/PWT0009') {
        selectedDetailFetchCount += 1
        return selectedDetailFetchCount === 1
          ? delayedHydration.promise
          : Promise.resolve(
              okJson(makeRequirementDetail(9, { uniqueId: 'PWT0009' })),
            )
      }

      if (url === '/api/requirements/9') {
        return Promise.resolve(
          okJson(makeRequirementDetail(9, { uniqueId: 'PWT0009' })),
        )
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByText('detail-refresh-9')).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByText('row-1'))

    await waitFor(() =>
      expect(screen.getByText('detail-refresh-1')).toBeInTheDocument(),
    )

    delayedHydration.resolve(makeRequirementDetail(9, { uniqueId: 'PWT0009' }))

    await waitFor(() => expect(window.location.search).toBe(''))
    expect(screen.getByText('detail-refresh-1')).toBeInTheDocument()
    expect(screen.queryByText('detail-refresh-9')).toBeNull()
  })

  it('replaces a selected stale list row with the refreshed requirement detail snapshot', async () => {
    let listFetchCount = 0

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        listFetchCount += 1
        return Promise.resolve(
          okJson({
            pagination: { hasMore: false },
            requirements: [
              makeRequirementRow(1, {
                uniqueId: 'PWT0005',
                version: {
                  ...makeRequirementRow(1).version,
                  status: 3,
                  statusNameSv: 'Publicerad',
                },
              }),
            ],
          }),
        )
      }

      if (url === '/api/requirements/1') {
        return Promise.resolve(
          okJson(
            makeRequirementDetail(1, {
              uniqueId: 'PWT0005',
              versions: [
                {
                  ...makeRequirementDetail(1).versions[0],
                  archiveInitiatedAt: '2026-05-16T08:00:00.000Z',
                  status: 2,
                  statusNameSv: 'Granskning',
                },
              ],
            }),
          ),
        )
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('PWT0005'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('detail-refresh-1'))

    await waitFor(() => expect(listFetchCount).toBeGreaterThanOrEqual(2))
    await waitFor(() =>
      expect(tableState.renderSpy.mock.calls.at(-1)?.[0]).toMatchObject({
        rows: [
          expect.objectContaining({
            uniqueId: 'PWT0005',
            version: expect.objectContaining({
              archiveInitiatedAt: '2026-05-16T08:00:00.000Z',
              status: 2,
              statusNameSv: 'Granskning',
            }),
          }),
        ],
      }),
    )
  })

  it('preserves inline detail scroll position after a selected requirement refresh', async () => {
    let listFetchCount = 0
    const scrollIntoView = vi.fn()
    const originalGetElementById = document.getElementById.bind(document)
    const getElementByIdSpy = vi
      .spyOn(document, 'getElementById')
      .mockImplementation((elementId: string) => {
        if (elementId === 'requirement-row-detail-1') {
          return { scrollIntoView } as unknown as HTMLElement
        }

        return originalGetElementById(elementId)
      })

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        listFetchCount += 1
        return Promise.resolve(
          okJson({
            pagination: { hasMore: false },
            requirements: [makeRequirementRow(1)],
          }),
        )
      }

      if (url === '/api/requirements/1') {
        return Promise.resolve(okJson(makeRequirementDetail(1)))
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(await screen.findByText('detail-refresh-1'))

    await waitFor(() => expect(listFetchCount).toBeGreaterThanOrEqual(2))

    expect(scrollIntoView).not.toHaveBeenCalled()
    getElementByIdSpy.mockRestore()
  })

  it('keeps the mutation response detail visible when a follow-up list refresh is stale', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return Promise.resolve(
          okJson({
            pagination: { hasMore: false },
            requirements: [
              makeRequirementRow(1, {
                uniqueId: 'PWT0007',
                version: {
                  ...makeRequirementRow(1).version,
                  status: 3,
                  statusNameSv: 'Publicerad',
                },
              }),
            ],
          }),
        )
      }

      if (url === '/api/requirements/1') {
        return Promise.resolve(
          okJson(
            makeRequirementDetail(1, {
              uniqueId: 'PWT0007',
              versions: [
                {
                  ...makeRequirementDetail(1).versions[0],
                  archiveInitiatedAt: null,
                  status: 3,
                  statusNameSv: 'Publicerad',
                },
              ],
            }),
          ),
        )
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('PWT0007'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(await screen.findByText('detail-apply-archive-1'))

    await waitFor(() =>
      expect(tableState.renderSpy.mock.calls.at(-1)?.[0]).toMatchObject({
        rows: [
          expect.objectContaining({
            uniqueId: 'PWT0007',
            version: expect.objectContaining({
              archiveInitiatedAt: '2026-05-16T08:00:00.000Z',
              status: 2,
              statusNameSv: 'Granskning',
            }),
          }),
        ],
      }),
    )
  })

  it('does not reselect an older row from a stale mutation detail callback', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return Promise.resolve(
          okJson({
            pagination: { hasMore: false },
            requirements: [makeRequirementRow(1), makeRequirementRow(2)],
          }),
        )
      }

      if (url === '/api/requirements/2') {
        return Promise.resolve(okJson(makeRequirementDetail(2)))
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001,INT0002'),
    )

    fireEvent.click(screen.getByText('row-1'))
    await waitFor(() =>
      expect(screen.getByText('detail-refresh-1')).toBeInTheDocument(),
    )

    const staleChangeHandler = tableState.detailChangeHandlers.get(1)
    expect(staleChangeHandler).toBeDefined()

    fireEvent.click(screen.getByText('row-2'))
    await waitFor(() =>
      expect(screen.getByText('detail-refresh-2')).toBeInTheDocument(),
    )

    await act(async () => {
      await staleChangeHandler?.(
        makeRequirementDetail(1, { uniqueId: 'STALE-0001' }),
      )
    })

    await waitFor(() =>
      expect(screen.getByText('detail-refresh-2')).toBeInTheDocument(),
    )
    expect(screen.queryByText('detail-refresh-1')).toBeNull()
    expect(
      fetchMock.mock.calls.some(
        ([input]) => String(input) === '/api/requirements/1',
      ),
    ).toBe(false)
  })

  it('resets load-more state when the next page request rejects', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (url.includes('offset=1')) {
          return Promise.reject(new Error('Load more failed'))
        }

        return okJson({
          pagination: { hasMore: true },
          requirements: [makeRequirementRow(1)],
        })
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )
    expect(screen.getByTestId('has-more').textContent).toBe('true')

    fireEvent.click(screen.getByText('load-more'))

    await waitFor(() =>
      expect(screen.getByTestId('loading-more').textContent).toBe('false'),
    )

    expect(screen.getByTestId('row-ids').textContent).toBe('INT0001')
    expect(screen.getByTestId('has-more').textContent).toBe('true')
  })

  it('falls back to default column preferences when local storage is invalid', async () => {
    const columnWidthsStorageKey = getRequirementColumnWidthsStorageKey('sv')

    storageGetItem.mockImplementation((key: string) => {
      if (key === REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY) {
        return 'not-json'
      }
      if (key === columnWidthsStorageKey) {
        return '{invalid'
      }
      return null
    })
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: storageGetItem,
        setItem: storageSetItem,
      },
      writable: true,
    })

    mockCommonFetches()
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        DEFAULT_VISIBLE_REQUIREMENT_COLUMNS.join(','),
      ),
    )
    expect(screen.getByTestId('column-widths').textContent).toBe('{}')
  })

  it('clears hidden default filters from stored column preferences', async () => {
    storageGetItem.mockImplementation((key: string) => {
      if (key === REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY) {
        return '["uniqueId","description"]'
      }
      return null
    })
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: storageGetItem,
        setItem: storageSetItem,
      },
      writable: true,
    })

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        expect(url).not.toContain('statuses=3')
        return okJson({
          pagination: { hasMore: false },
          requirements: [],
        })
      }

      if (url === '/api/requirement-areas') {
        return okJson({ areas: [] })
      }
      if (url === '/api/requirement-categories') {
        return okJson({ categories: [] })
      }
      if (url === '/api/requirement-types') {
        return okJson({ types: [] })
      }
      if (url === '/api/quality-characteristics') {
        return okJson({ qualityCharacteristics: [] })
      }
      if (url === '/api/requirement-statuses') {
        return okJson({ statuses: [] })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        'uniqueId,description',
      ),
    )
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/requirements?'),
      ),
    )
  })

  it('applies the admin-managed column order when browser preferences already include the reordered columns', async () => {
    storageGetItem.mockImplementation((key: string) => {
      if (key === REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY) {
        return '["area","category"]'
      }
      return null
    })
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: storageGetItem,
        setItem: storageSetItem,
      },
      writable: true,
    })

    mockCommonFetches()
    vi.stubGlobal('fetch', fetchMock)

    const reorderedDefaults = normalizeRequirementListColumnDefaults([
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
      { columnId: 'verifiable', defaultVisible: false, sortOrder: 7 },
      { columnId: 'version', defaultVisible: false, sortOrder: 8 },
    ])

    render(<RequirementsClient initialColumnDefaults={reorderedDefaults} />)

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        'uniqueId,description,category,area',
      ),
    )
  })

  it('keeps successful metadata filters when one metadata request fails', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return okJson({
          pagination: { hasMore: false },
          requirements: [makeRequirementRow(1)],
        })
      }

      if (url === '/api/requirement-areas') {
        return Promise.reject(new Error('Areas fetch failed'))
      }
      if (url === '/api/requirement-categories') {
        return okJson({
          categories: [
            {
              id: 11,
              nameEn: 'Business requirement',
              nameSv: 'Verksamhetskrav',
            },
          ],
        })
      }
      if (url === '/api/requirement-types') {
        return okJson({
          types: [
            {
              id: 12,
              nameEn: 'Functional',
              nameSv: 'Funktionellt',
            },
          ],
        })
      }
      if (url === '/api/quality-characteristics') {
        return okJson({
          qualityCharacteristics: [
            {
              id: 13,
              nameEn: 'Parent',
              nameSv: 'Foralder',
              parentId: null,
            },
          ],
        })
      }
      if (url === '/api/requirement-statuses') {
        return okJson({
          statuses: [
            {
              color: '#22c55e',
              id: 14,
              nameEn: 'Published',
              nameSv: 'Publicerad',
              sortOrder: 14,
            },
          ],
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )
    await waitFor(() =>
      expect(tableState.renderSpy.mock.calls.at(-1)?.[0]).toMatchObject({
        areas: [],
        categories: [expect.objectContaining({ id: 11 })],
        statusOptions: [expect.objectContaining({ id: 14 })],
        qualityCharacteristics: [expect.objectContaining({ id: 13 })],
        types: [expect.objectContaining({ id: 12 })],
      }),
    )
  })
})
