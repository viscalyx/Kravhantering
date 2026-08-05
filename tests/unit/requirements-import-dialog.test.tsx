import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsImportDialog, {
  type ImportPreviewResponse,
} from '@/components/RequirementsImportDialog'
import { apiFetch } from '@/lib/http/api-fetch'

const confirmMock = vi.hoisted(() => vi.fn())
const downloadBlobMock = vi.hoisted(() => vi.fn())
const importLocaleState = vi.hoisted(() => ({ locale: 'sv' }))
const importDialogTranslate = vi.hoisted(() => {
  const messages: Record<string, string> = {
    descriptionRequired: 'Kravtext måste anges innan raden kan importeras.',
    importTitleWithDestination: '{title} för {destination}',
    loadingInitialImport: 'Förbereder importgranskning...',
    verificationMethodRequired:
      'Verifieringsmetod måste anges för verifierbara krav.',
  }
  const translate = (key: string, params?: Record<string, string>) => {
    const template = messages[key] ?? key
    return Object.entries(params ?? {}).reduce(
      (result, [name, value]) => result.replaceAll(`{${name}}`, value),
      template,
    )
  }
  return Object.assign(translate, {
    rich: (key: string) => messages[key] ?? key,
  })
})

vi.mock('next-intl', () => ({
  useLocale: () => importLocaleState.locale,
  useTranslations: () => importDialogTranslate,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({
    confirm: confirmMock,
  }),
}))

vi.mock('@/lib/http/api-fetch', () => ({
  apiFetch: vi.fn(),
}))

vi.mock('@/lib/browser-download', () => ({
  downloadBlob: downloadBlobMock,
}))

function mockReferenceDataFetch(
  options: {
    normReferences?: Array<{
      id: number
      name: string
      normReferenceId: string
    }>
    priorityLevels?: Array<{
      assessmentCriteriaEn: string
      assessmentCriteriaSv: string
      code: string
      color?: string
      descriptionEn: string
      descriptionSv: string
      id: number
      iconName: string | null
      nameEn: string
      nameSv: string
    }>
    requirementPackages?: Array<{ id: number; name: string }>
    types?: Array<{
      id: number
      nameEn: string
      nameSv: string
      qualityCharacteristics?: Array<{
        id: number
        nameEn: string
        nameSv: string
        parentId: number | null
        requirementTypeId: number
      }>
    }>
  } = {},
) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = url.includes('requirement-packages')
      ? { requirementPackages: options.requirementPackages ?? [] }
      : url.includes('norm-references')
        ? { normReferences: options.normReferences ?? [] }
        : url.includes('requirement-types')
          ? { types: options.types ?? [] }
          : url.includes('priority-levels')
            ? { priorityLevels: options.priorityLevels ?? [] }
            : { categories: [] }

    return {
      json: async () => body,
      ok: true,
    } as Response
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function validImportPayload() {
  return JSON.stringify({
    requirements: [{ description: 'Kravtext' }],
    schemaVersion: 'requirement-import.v3',
  })
}

function importPreviewRow(
  sourceIndex = 0,
): ImportPreviewResponse['rows'][number] {
  return {
    errors: [],
    infos: [],
    proposedNeedsReferenceKey: null,
    proposedNormReferenceKeys: [],
    reviewRowId: `row-${sourceIndex}`,
    resolvedPriorityLevel: undefined as
      | {
          code: string
          color: string
          iconName: string | null
          name: string
        }
      | undefined,
    selected: true,
    sourceIndex,
    values: {
      acceptanceCriteria: null,
      categoryId: null,
      description: `Kravtext ${sourceIndex + 1}`,
      needsReferenceId: null,
      normReferenceIds: [],
      priorityLevelId: null as number | null,
      qualityCharacteristicId: null,
      requirementPackageIds: [],
      typeId: null,
      verifiable: false,
      verificationMethod: null,
    },
    warnings: [],
  }
}

function importPreviewResponse(rows = [importPreviewRow()]): Response {
  return {
    json: async () => ({
      needsReferenceProposals: [],
      previewToken: 'preview-token',
      proposals: [],
      rows,
      summary: { errorCount: 0, rowCount: rows.length, warningCount: 0 },
    }),
    ok: true,
  } as Response
}

function importExecuteResponse(): Response {
  return {
    json: async () => ({
      createdRows: [
        {
          acceptanceCriteria: null,
          categoryName: null,
          createdDatabaseId: 9001,
          createdVisibleId: 'KRAV9001',
          description: 'Kravtext',
          importMode: 'specification-local',
          needsReferenceId: null,
          normReferences: [],
          priorityLevelName: null,
          qualityCharacteristicName: null,
          requirementPackageNames: [],
          sourceIndex: 0,
          targetAreaId: null,
          targetSpecificationId: 8,
          typeName: null,
          verifiable: false,
          verificationMethod: null,
        },
      ],
      summary: { createdCount: 1 },
    }),
    ok: true,
  } as Response
}

function specificationLocalPreviewResponse(): Response {
  return {
    json: async () => ({
      needsReferenceProposals: [
        {
          description: 'Stödjer införande av GDPR artikel 32.',
          key: 'gdpr-need',
          referencedCount: 1,
          resolvedNeedsReferenceId: null,
          text: 'Personuppgiftsbehandling behöver tekniskt skydd',
          warnings: [],
        },
      ],
      previewToken: 'preview-token',
      proposals: [],
      rows: [
        {
          errors: [
            {
              code: 'import_needs_reference_unresolved',
              field: 'needsReferenceKey',
              level: 'error',
              message: 'Needs reference is unresolved.',
              originalValue: 'gdpr-need',
            },
          ],
          infos: [],
          proposedNeedsReferenceKey: 'gdpr-need',
          proposedNormReferenceKeys: [],
          reviewRowId: 'row-0',
          selected: true,
          sourceIndex: 0,
          values: {
            acceptanceCriteria: null,
            categoryId: null,
            description: 'Kravtext',
            needsReferenceId: null,
            normReferenceIds: [],
            priorityLevelId: null,
            qualityCharacteristicId: null,
            requirementPackageIds: [],
            verifiable: false,
            typeId: null,
            verificationMethod: null,
          },
          warnings: [],
        },
      ],
      summary: { errorCount: 1, rowCount: 1, warningCount: 0 },
    }),
    ok: true,
  } as Response
}

describe('RequirementsImportDialog', () => {
  beforeEach(() => {
    importLocaleState.locale = 'sv'
    vi.mocked(apiFetch).mockReset()
    confirmMock.mockReset()
    confirmMock.mockResolvedValue(true)
    downloadBlobMock.mockReset()
    mockReferenceDataFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the specification-local import title when a destination is shown', async () => {
    render(
      <RequirementsImportDialog
        destinationName="Upphandling av e-tjänstplattform"
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(5))
    expect(
      screen.getByRole('heading', {
        name: 'Importera lokala krav för Upphandling av e-tjänstplattform',
      }),
    ).toBeInTheDocument()
  })

  it('announces repeated preview errors with alert semantics', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      json: async () => ({ error: 'Förhandsgranskningen misslyckades.' }),
      ok: false,
    } as Response)

    render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: { value: validImportPayload() },
    })
    const previewButton = screen.getByRole('button', {
      name: 'Förhandsgranska krav',
    })

    fireEvent.click(previewButton)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Förhandsgranskningen misslyckades.',
    )

    fireEvent.click(previewButton)
    await waitFor(() => {
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Förhandsgranskningen misslyckades.',
      )
    })
  })

  it('announces large-preview warnings with status semantics', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      importPreviewResponse(
        Array.from({ length: 200 }, (_, index) => importPreviewRow(index)),
      ),
    )

    render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: { value: validImportPayload() },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Förhandsgranska krav' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Filen innehåller 200 eller fler krav.',
    )
  })

  it('renders an imported priority with its localized name and configured icon', async () => {
    mockReferenceDataFetch({
      priorityLevels: [
        {
          assessmentCriteriaEn: 'Low impact',
          assessmentCriteriaSv: 'Låg påverkan',
          code: 'P2',
          color: '#22c55e',
          descriptionEn: 'Low priority',
          descriptionSv: 'Låg prioritet',
          iconName: 'ArrowDownLeft',
          id: 2,
          nameEn: 'Low',
          nameSv: 'Låg',
        },
      ],
    })
    const row = importPreviewRow()
    row.values.priorityLevelId = 2
    vi.mocked(apiFetch).mockResolvedValue(importPreviewResponse([row]))

    render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: { value: validImportPayload() },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Förhandsgranska krav' }),
    )

    const priorityBadge = await screen.findByText('P2 – Låg')
    expect(
      priorityBadge.closest('.status-badge')?.querySelector('svg'),
    ).toBeTruthy()
  })

  it('omits the priority separator when the localized name is empty', async () => {
    mockReferenceDataFetch({
      priorityLevels: [
        {
          assessmentCriteriaEn: 'Low impact',
          assessmentCriteriaSv: 'Låg påverkan',
          code: 'P2',
          color: '#22c55e',
          descriptionEn: 'Low priority',
          descriptionSv: 'Låg prioritet',
          iconName: 'ArrowDownLeft',
          id: 2,
          nameEn: 'Low',
          nameSv: '',
        },
      ],
    })
    const row = importPreviewRow()
    row.values.priorityLevelId = 2
    vi.mocked(apiFetch).mockResolvedValue(importPreviewResponse([row]))

    render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: { value: validImportPayload() },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Förhandsgranska krav' }),
    )

    expect(await screen.findByText('P2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expandera rad #1' }))
    expect(screen.getByRole('option', { name: 'P2' })).toBeInTheDocument()
  })

  it('renders the server-resolved priority snapshot when taxonomy no longer contains the selected ID', async () => {
    const row = importPreviewRow()
    row.values.priorityLevelId = 2
    row.resolvedPriorityLevel = {
      code: 'P2',
      color: '#22c55e',
      iconName: 'ArrowDownLeft',
      name: 'Låg',
    }
    vi.mocked(apiFetch).mockResolvedValue(importPreviewResponse([row]))

    render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: { value: validImportPayload() },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Förhandsgranska krav' }),
    )

    const priorityBadge = await screen.findByText('P2 – Låg')
    expect(priorityBadge.closest('.status-badge')).toHaveAttribute(
      'data-accent-color',
      '#22c55e',
    )
  })

  it('announces a successful import receipt with status semantics', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(importPreviewResponse())
      .mockResolvedValueOnce(importExecuteResponse())

    render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: { value: validImportPayload() },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Förhandsgranska krav' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Importera valda' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Importerade rader: 1',
    )
  })

  it('clears a previous receipt while a later import is in progress', async () => {
    const secondImport = createDeferred<Response>()
    let executeCalls = 0
    vi.mocked(apiFetch).mockImplementation(input => {
      const url = String(input)
      if (url.includes('/import/preview')) {
        return Promise.resolve(
          importPreviewResponse([importPreviewRow(0), importPreviewRow(1)]),
        )
      }
      executeCalls += 1
      return executeCalls === 1
        ? Promise.resolve(importExecuteResponse())
        : secondImport.promise
    })

    render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: { value: validImportPayload() },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Förhandsgranska krav' }),
    )
    await screen.findByRole('button', { name: 'Importera valda' })

    fireEvent.click(
      screen.getByRole('switch', { name: 'Välj inte rad #2 för import' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Importera valda' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Importerade rader: 1',
    )

    fireEvent.click(
      screen.getByRole('switch', { name: 'Välj rad #2 för import' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Importera valda' }))

    await waitFor(() =>
      expect(
        screen.queryByText('Importerade rader: 1'),
      ).not.toBeInTheDocument(),
    )

    secondImport.resolve(importExecuteResponse())
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Importerade rader: 1',
    )
  })

  it('loads JSON text from a dropped file', async () => {
    render(
      <RequirementsImportDialog
        areas={[{ id: 7, name: 'Bilddiagnostik', permissions: {} }]}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )

    const payload = JSON.stringify({
      requirements: [{ description: 'Kravtext' }],
      schemaVersion: 'requirement-import.v3',
    })
    const file = new File([payload], 'requirements.json', {
      type: 'application/json',
    })

    fireEvent.drop(
      screen.getByRole('button', {
        name: 'Släpp en JSON-fil här, eller klicka för att välja fil.',
      }),
      {
        dataTransfer: { files: [file] },
      },
    )

    await waitFor(() =>
      expect(screen.getByLabelText(/Import-JSON/)).toHaveValue(payload),
    )
  })

  it('downloads the library-scoped import instruction before a requirement area is selected', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.includes('requirement-packages')
        ? { requirementPackages: [] }
        : url.includes('norm-references')
          ? { normReferences: [] }
          : url.includes('requirement-types')
            ? { types: [] }
            : url.includes('priority-levels')
              ? { priorityLevels: [] }
              : { categories: [] }

      return {
        blob: async () => new Blob(['# Importinstruktion']),
        json: async () => body,
        ok: true,
      } as Response
    })
    global.fetch = fetchMock

    render(
      <RequirementsImportDialog
        areas={[
          {
            id: 7,
            name: 'Bilddiagnostik',
            permissions: {},
            prefix: 'IMG',
          },
        ]}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    const instructionButton = screen.getByRole('button', {
      name: 'Ladda ner importinstruktion',
    })

    expect(instructionButton).toBeEnabled()

    fireEvent.click(instructionButton)

    await waitFor(() => expect(downloadBlobMock).toHaveBeenCalledTimes(1))
    expect(
      fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter(url => url.includes('/api/requirements/import/instruction')),
    ).toEqual([
      '/api/requirements/import/instruction?locale=sv&kind=requirements_library',
    ])
  })

  it('shows and resolves proposed needs references for specification-local import', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      json: async () => ({
        needsReferenceProposals: [
          {
            description: 'Stödjer införande av GDPR artikel 32.',
            key: 'gdpr-need',
            referencedCount: 1,
            resolvedNeedsReferenceId: null,
            text: 'Personuppgiftsbehandling behöver tekniskt skydd',
            warnings: [],
          },
        ],
        previewToken: 'preview-token',
        proposals: [],
        rows: [
          {
            errors: [
              {
                code: 'import_needs_reference_unresolved',
                field: 'needsReferenceKey',
                level: 'error',
                message: 'Needs reference is unresolved.',
                originalValue: 'gdpr-need',
              },
            ],
            infos: [],
            proposedNeedsReferenceKey: 'gdpr-need',
            proposedNormReferenceKeys: [],
            reviewRowId: 'row-0',
            selected: true,
            sourceIndex: 0,
            values: {
              acceptanceCriteria: null,
              categoryId: null,
              description: 'Kravtext',
              needsReferenceId: null,
              normReferenceIds: [],
              priorityLevelId: null,
              qualityCharacteristicId: null,
              requirementPackageIds: [],
              verifiable: false,
              typeId: null,
              verificationMethod: null,
            },
            warnings: [],
          },
        ],
        summary: { errorCount: 1, rowCount: 1, warningCount: 0 },
      }),
      ok: true,
    } as Response)

    render(
      <RequirementsImportDialog
        mode="specification-local"
        needsReferences={[
          {
            description: null,
            id: 12,
            text: 'Befintlig behovsreferens',
          },
        ]}
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: {
        value: JSON.stringify({
          proposedNeedsReferences: [
            {
              key: 'gdpr-need',
              text: 'Personuppgiftsbehandling behöver tekniskt skydd',
            },
          ],
          requirements: [
            {
              description: 'Kravtext',
              needsReferenceKey: 'gdpr-need',
            },
          ],
          schemaVersion: 'requirement-import.v3',
        }),
      },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Förhandsgranska krav' }),
    )

    fireEvent.click(
      await screen.findByRole('tab', {
        name: /Föreslagna behovsreferenser/,
      }),
    )
    expect(
      await screen.findByRole('heading', {
        name: 'Personuppgiftsbehandling behöver tekniskt skydd',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Importnyckel: gdpr-need')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Länka befintlig behovsreferens'), {
      target: { value: '12' },
    })

    expect(await screen.findByText('Löst')).toBeInTheDocument()
  })

  it('creates a proposed needs reference once and keeps it across parent sync', async () => {
    const createRequest = createDeferred<Response>()
    vi.mocked(apiFetch).mockImplementation(input => {
      const url = String(input)
      if (url.includes('/needs-references')) {
        return createRequest.promise
      }
      if (url === '/api/specification-local-requirements/import/preview') {
        return Promise.resolve(specificationLocalPreviewResponse())
      }
      return Promise.resolve({ json: async () => ({}), ok: true } as Response)
    })

    const { rerender } = render(
      <RequirementsImportDialog
        mode="specification-local"
        needsReferences={[
          {
            description: null,
            id: 12,
            text: 'Befintlig behovsreferens',
          },
        ]}
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: {
        value: JSON.stringify({
          proposedNeedsReferences: [
            {
              key: 'gdpr-need',
              text: 'Personuppgiftsbehandling behöver tekniskt skydd',
            },
          ],
          requirements: [
            {
              description: 'Kravtext',
              needsReferenceKey: 'gdpr-need',
            },
          ],
          schemaVersion: 'requirement-import.v3',
        }),
      },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Förhandsgranska krav' }),
    )
    fireEvent.click(
      await screen.findByRole('tab', {
        name: /Föreslagna behovsreferenser/,
      }),
    )

    const createButton = await screen.findByRole('button', {
      name: 'Skapa behovsreferens',
    })
    fireEvent.click(createButton)
    fireEvent.click(createButton)

    expect(
      vi
        .mocked(apiFetch)
        .mock.calls.filter(([input]) =>
          String(input).includes('/needs-references'),
        ),
    ).toHaveLength(1)
    expect(createButton).toBeDisabled()

    createRequest.resolve({
      json: async () => ({
        needsReference: {
          description: 'Skapad från importförslag.',
          id: 31,
          text: 'Skapad behovsreferens',
        },
      }),
      ok: true,
    } as Response)

    expect(await screen.findByText('Löst')).toBeInTheDocument()

    rerender(
      <RequirementsImportDialog
        mode="specification-local"
        needsReferences={[
          {
            description: null,
            id: 12,
            text: 'Befintlig behovsreferens',
          },
          {
            description: null,
            id: 44,
            text: 'Parent-synkad behovsreferens',
          },
        ]}
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    expect(
      await screen.findByRole('option', { name: 'Skapad behovsreferens' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Parent-synkad behovsreferens' }),
    ).toBeInTheDocument()
  })

  it('shows an error when proposed needs reference creation fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    vi.mocked(apiFetch).mockImplementation(input => {
      const url = String(input)
      if (url.includes('/needs-references')) {
        return Promise.reject(new Error('Network unavailable'))
      }
      if (url === '/api/specification-local-requirements/import/preview') {
        return Promise.resolve(specificationLocalPreviewResponse())
      }
      return Promise.resolve({ json: async () => ({}), ok: true } as Response)
    })

    render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: {
        value: JSON.stringify({
          proposedNeedsReferences: [
            {
              key: 'gdpr-need',
              text: 'Personuppgiftsbehandling behöver tekniskt skydd',
            },
          ],
          requirements: [
            {
              description: 'Kravtext',
              needsReferenceKey: 'gdpr-need',
            },
          ],
          schemaVersion: 'requirement-import.v3',
        }),
      },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Förhandsgranska krav' }),
    )
    fireEvent.click(
      await screen.findByRole('tab', {
        name: /Föreslagna behovsreferenser/,
      }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Skapa behovsreferens' }),
    )

    expect(await screen.findByText('Något gick fel')).toBeInTheDocument()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to create needs reference from import proposal',
      expect.any(Error),
    )
  })

  it('reviews and edits rich library rows across tabs and association pickers', async () => {
    mockReferenceDataFetch({
      normReferences: [
        { id: 31, name: 'ISO active', normReferenceId: 'ISO-ACTIVE' },
        { id: 32, name: 'ISO second', normReferenceId: 'ISO-SECOND' },
      ],
      priorityLevels: [
        {
          assessmentCriteriaEn: 'High assessment',
          assessmentCriteriaSv: 'Hög bedömning',
          code: 'P4',
          color: '#ef4444',
          descriptionEn: 'High priority',
          descriptionSv: 'Hög prioritet',
          iconName: 'AlertCircle',
          id: 4,
          nameEn: 'High',
          nameSv: 'Hög',
        },
      ],
      requirementPackages: [
        { id: 5, name: 'Security package' },
        { id: 6, name: 'Operations package' },
      ],
      types: [
        {
          id: 10,
          nameEn: 'Functional',
          nameSv: 'Funktionellt',
          qualityCharacteristics: [
            {
              id: 100,
              nameEn: 'Quality group',
              nameSv: 'Kvalitetsgrupp',
              parentId: null,
              requirementTypeId: 10,
            },
            {
              id: 101,
              nameEn: 'Completeness',
              nameSv: 'Fullständighet',
              parentId: 100,
              requirementTypeId: 10,
            },
          ],
        },
        {
          id: 20,
          nameEn: 'Non-functional',
          nameSv: 'Icke-funktionellt',
          qualityCharacteristics: [],
        },
      ],
    })
    const onClose = vi.fn()
    const populated = importPreviewRow(0)
    populated.errors = [
      {
        code: 'server_error',
        field: 'categoryId',
        level: 'error',
        message: 'Server error',
        originalValue: 'bad-category',
      },
    ]
    populated.infos = [
      {
        code: 'import_requirement_packages_ignored_for_specification_local',
        field: 'requirementPackageIds',
        level: 'info',
        message: 'Packages ignored',
      },
    ]
    populated.proposedNormReferenceKeys = ['proposal-a']
    populated.resolvedPriorityLevel = {
      code: 'P4',
      color: '#ef4444',
      iconName: 'AlertCircle',
      name: 'Hög',
    }
    populated.values = {
      ...populated.values,
      acceptanceCriteria: 'Must pass inspection',
      categoryId: 7,
      description: `${'A long requirement '.repeat(20)}\ncontinued`,
      normReferenceIds: [31, 999],
      priorityLevelId: 4,
      qualityCharacteristicId: 101,
      requirementPackageIds: [5, 999],
      typeId: 10,
      verifiable: true,
      verificationMethod: 'Inspection',
    }
    populated.warnings = [
      {
        code: 'import_proposed_norm_reference_unresolved',
        field: 'proposedNormReferenceKeys',
        level: 'warning',
        message: 'Unresolved proposal',
        originalValue: 'proposal-a',
      },
    ]
    const sparse = importPreviewRow(1)
    sparse.selected = false
    sparse.infos = [
      {
        code: 'informational',
        level: 'info',
        message: 'Information only',
      },
    ]

    render(
      <RequirementsImportDialog
        areas={[
          {
            id: 7,
            name: 'Clinical systems',
            permissions: { canAuthor: true },
            prefix: 'Clinical',
          },
          {
            id: 8,
            name: 'Read only',
            permissions: { canAuthor: false },
            prefix: 'READ',
          },
        ]}
        embedded
        initialImport={{
          areaId: 7,
          key: 'rich-library-preview',
          payload: JSON.parse(validImportPayload()),
          preview: {
            needsReferenceProposals: [],
            previewToken: 'rich-preview-token',
            proposals: [
              {
                issuer: 'ISO',
                key: 'proposal-a',
                name: 'Proposed active reference',
                normReferenceId: 'ISO-ACTIVE',
                reference: 'ISO A',
                referencedCount: 1,
                resolvedNormReferenceDbId: null,
                type: 'standard',
                uri: 'https://example.test/iso',
                version: '2026',
                warnings: [
                  {
                    code: 'import_proposed_norm_reference_unresolved',
                    level: 'warning',
                    message: 'Unresolved',
                    originalValue: 'proposal-a',
                  },
                ],
              },
              {
                issuer: 'ISO',
                key: 'proposal-resolved',
                name: 'Resolved reference',
                normReferenceId: 'ISO-SECOND',
                reference: 'ISO B',
                referencedCount: 0,
                resolvedNormReferenceDbId: 32,
                type: 'standard',
                uri: null,
                version: null,
                warnings: [],
              },
            ],
            rows: [populated, sparse],
            summary: { errorCount: 1, rowCount: 2, warningCount: 1 },
          },
        }}
        mode="library"
        onClose={onClose}
        open
      />,
    )

    const expandAll = await screen.findByRole('button', {
      name: 'Expandera alla',
    })
    fireEvent.click(expandAll)
    expect(screen.getAllByText('Kravtext')).toHaveLength(2)
    expect(
      screen.getByText('Inget matchande kravpaket hittades.'),
    ).toBeVisible()
    expect(
      screen.getByText('Ingen matchande normreferens hittades.'),
    ).toBeVisible()

    const descriptions = screen.getAllByLabelText(/Kravtext/)
    fireEvent.change(descriptions[0], { target: { value: '' } })
    expect(
      screen.getByText('Kravtext måste anges innan raden kan importeras.'),
    ).toBeVisible()
    fireEvent.change(descriptions[0], { target: { value: 'Corrected' } })

    const typeSelects = screen.getAllByLabelText('Typ')
    fireEvent.change(typeSelects[0], { target: { value: '20' } })
    fireEvent.change(typeSelects[0], { target: { value: '' } })
    const verifiable = screen.getAllByLabelText('Verifierbar')[0]
    fireEvent.click(verifiable)
    fireEvent.click(verifiable)
    const verificationMethods = screen.getAllByLabelText(/Verifieringsmetod/)
    fireEvent.change(verificationMethods[0], { target: { value: '' } })
    expect(
      screen.getByText('Verifieringsmetod måste anges för verifierbara krav.'),
    ).toBeVisible()

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Välj kravpaket' })[0],
    )
    const packageDialog = screen.getByRole('dialog', {
      name: 'Välj kravpaket',
    })
    const search = screen.getByPlaceholderText('Sök...')
    fireEvent.change(search, { target: { value: 'no result' } })
    expect(screen.getByText('Inga träffar.')).toBeVisible()
    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(screen.getByLabelText('Operations package'))
    fireEvent.click(
      packageDialog.querySelector('button.btn-primary') as HTMLButtonElement,
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Välj normreferenser' })[0],
    )
    fireEvent.click(screen.getByLabelText(/ISO second/))
    fireEvent.click(screen.getByRole('button', { name: 'Använd val' }))

    fireEvent.click(
      screen.getByRole('tab', { name: /Föreslagna normreferenser/ }),
    )
    expect(screen.getByText('proposal-resolved')).toBeVisible()
    const linkSelects = screen.getAllByLabelText('Länka befintlig normreferens')
    fireEvent.change(linkSelects[0], { target: { value: '31' } })
    expect(screen.getAllByText('Löst').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('tab', { name: /^Krav/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Kollapsa alla' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Expandera rad/ })[0])
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Ta bort från import' })[1],
    )

    confirmMock.mockResolvedValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
    confirmMock.mockResolvedValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false))
  })

  it('executes selected rows, cleans review state, and downloads a CSV receipt', async () => {
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:receipt')
    const revokeObjectUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)
    const onClose = vi.fn()
    const first = importPreviewRow(0)
    const second = importPreviewRow(1)
    second.selected = false
    second.values.description = 'Keep for later'
    vi.mocked(apiFetch).mockResolvedValueOnce({
      json: async () => ({
        createdRows: [
          {
            acceptanceCriteria: 'Contains "quotes"',
            categoryName: 'Category',
            createdDatabaseId: 9001,
            createdVisibleId: 'KRAV9001',
            description: 'Imported requirement',
            importMode: 'library',
            needsReferenceId: null,
            normReferences: ['ISO-A', 'ISO-B'],
            priorityLevelName: 'P4 – High',
            qualityCharacteristicName: 'Completeness',
            requirementPackageNames: ['Package A', 'Package B'],
            sourceIndex: 0,
            targetAreaId: 7,
            targetSpecificationId: null,
            typeName: 'Functional',
            verifiable: true,
            verificationMethod: 'Inspection',
          },
        ],
        summary: { createdCount: 1 },
      }),
      ok: true,
    } as Response)

    render(
      <RequirementsImportDialog
        areas={[
          {
            id: 7,
            name: 'Clinical systems',
            permissions: { canAuthor: true },
            prefix: 'Clinical',
          },
        ]}
        embedded
        initialImport={{
          areaId: 7,
          key: 'execute-preview',
          payload: JSON.parse(validImportPayload()),
          preview: {
            needsReferenceProposals: [],
            previewToken: 'execute-token',
            proposals: [
              {
                issuer: 'ISO',
                key: 'unused-after-import',
                name: 'Unused',
                normReferenceId: null,
                reference: 'ISO X',
                referencedCount: 1,
                resolvedNormReferenceDbId: null,
                type: 'standard',
                uri: null,
                version: null,
                warnings: [],
              },
            ],
            rows: [first, second],
            summary: { errorCount: 0, rowCount: 2, warningCount: 0 },
          },
        }}
        mode="library"
        onClose={onClose}
        open
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Importera valda' }),
    )
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/requirements/import/execute',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(await screen.findByText('Importerade rader: 1')).toBeVisible()
    expect(screen.getByText('Keep for later')).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: 'Ladda ner CSV-kvitto' }),
    )
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:receipt')

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort från import' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true))
  })

  it('renders the English review contract and edits unknown association IDs', async () => {
    importLocaleState.locale = 'en'
    mockReferenceDataFetch()
    const row = importPreviewRow(0)
    row.errors = [
      { code: 'error-a', level: 'error', message: 'Error A' },
      { code: 'error-b', level: 'error', message: 'Error B' },
    ]
    row.warnings = [
      { code: 'warning-a', level: 'warning', message: 'Warning A' },
      { code: 'warning-b', level: 'warning', message: 'Warning B' },
    ]
    row.infos = [{ code: 'info-a', level: 'info', message: 'Info A' }]
    row.values.description = `${'Long English requirement '.repeat(20)}\nmore`
    row.values.requirementPackageIds = [999, 998]
    row.values.normReferenceIds = [997, 996]
    const singular = importPreviewRow(1)
    singular.errors = [
      { code: 'single-error', level: 'error', message: 'Single error' },
    ]
    singular.warnings = [
      { code: 'single-warning', level: 'warning', message: 'Single warning' },
    ]
    singular.selected = false

    render(
      <RequirementsImportDialog
        embedded
        initialImport={{
          areaId: 7,
          key: 'english-preview',
          payload: JSON.parse(validImportPayload()),
          preview: {
            needsReferenceProposals: [],
            previewToken: 'english-token',
            proposals: [],
            rows: [row, singular],
            summary: { errorCount: 3, rowCount: 2, warningCount: 3 },
          },
        }}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )

    expect(
      await screen.findByText(/2 errors, 2 warnings, 1 info/),
    ).toBeVisible()
    expect(screen.getByText('1 error, 1 warning')).toBeVisible()
    const showMore = screen.getByRole('button', { name: 'Show more' })
    fireEvent.click(showMore)
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))

    const packageFirst = screen.getByLabelText('Package IDs 1')
    fireEvent.change(packageFirst, { target: { value: '-1' } })
    fireEvent.keyDown(packageFirst, { key: 'Escape' })
    fireEvent.keyDown(packageFirst, { key: 'Enter' })
    fireEvent.change(packageFirst, { target: { value: '123' } })
    fireEvent.keyDown(packageFirst, { key: 'Enter' })
    const packageSecond = screen.getByLabelText('Package IDs 2')
    fireEvent.change(packageSecond, { target: { value: '' } })
    fireEvent.blur(packageSecond)

    const normFirst = screen.getByLabelText('Norm reference IDs 1')
    fireEvent.change(normFirst, { target: { value: '321' } })
    fireEvent.keyDown(normFirst, { key: 'Enter' })
    const normSecond = screen.getByLabelText('Norm reference IDs 2')
    fireEvent.change(normSecond, { target: { value: '' } })
    fireEvent.blur(normSecond)

    fireEvent.click(screen.getByRole('button', { name: /^Collapse row #1$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Expand row #1$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
  })

  it('loads a large initial library review through the preview endpoint', async () => {
    const rows = Array.from({ length: 200 }, (_, index) =>
      importPreviewRow(index),
    )
    rows[0].warnings = [
      { code: 'warning-a', level: 'warning', message: 'Warning A' },
      { code: 'warning-b', level: 'warning', message: 'Warning B' },
    ]
    vi.mocked(apiFetch).mockResolvedValue(importPreviewResponse(rows))

    render(
      <RequirementsImportDialog
        areas={[
          {
            id: 7,
            name: 'Clinical systems',
            permissions: { canAuthor: true },
            prefix: 'Clinical',
          },
        ]}
        embedded
        initialImport={{
          areaId: 7,
          key: 'endpoint-preview',
          payload: JSON.parse(validImportPayload()),
        }}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )

    expect(
      await screen.findByText(/Filen innehåller 200 eller fler krav/),
    ).toBeVisible()
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/requirements/import/preview',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(screen.getByText(/200 valda, 2 varningar/)).toBeVisible()
  })

  it('reports initial preview transport and response failures', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      json: async () => ({ error: 'Preview rejected' }),
      ok: false,
    } as Response)

    const { unmount } = render(
      <RequirementsImportDialog
        embedded
        initialImport={{
          key: 'rejected-preview',
          payload: JSON.parse(validImportPayload()),
        }}
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Preview rejected',
    )
    unmount()

    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('network unavailable'))
    render(
      <RequirementsImportDialog
        embedded
        initialImport={{
          key: 'failed-preview',
          payload: JSON.parse(validImportPayload()),
        }}
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Något gick fel')
  })

  it('creates a proposed norm reference and refreshes the preview token', async () => {
    const row = importPreviewRow()
    row.proposedNormReferenceKeys = ['iso-proposal']
    row.warnings = [
      {
        code: 'import_proposed_norm_reference_unresolved',
        level: 'warning',
        message: 'Unresolved proposal',
        originalValue: 'iso-proposal',
      },
    ]
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        json: async () => ({
          id: 41,
          name: 'Created standard',
          normReferenceId: 'ISO-PROP',
        }),
        ok: true,
      } as Response)
      .mockResolvedValueOnce(importPreviewResponse([row]))

    render(
      <RequirementsImportDialog
        embedded
        initialImport={{
          areaId: 7,
          key: 'norm-proposal-preview',
          payload: JSON.parse(validImportPayload()),
          preview: {
            needsReferenceProposals: [],
            previewToken: 'proposal-token',
            proposals: [
              {
                issuer: 'ISO',
                key: 'iso-proposal',
                name: 'Created standard',
                normReferenceId: 'ISO-PROP',
                reference: 'ISO 123',
                referencedCount: 1,
                resolvedNormReferenceDbId: null,
                type: 'standard',
                uri: 'https://example.test/standard',
                version: '2026',
                warnings: row.warnings,
              },
            ],
            rows: [row],
            summary: { errorCount: 0, rowCount: 1, warningCount: 1 },
          },
        }}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )

    fireEvent.click(
      await screen.findByRole('tab', { name: /Föreslagna normreferenser/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Skapa normreferens' }))
    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/norm-references',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(await screen.findByText('Löst')).toBeVisible()
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/requirements/import/preview',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('handles artifact failures and warning-confirmed import rejection', async () => {
    const warningRow = importPreviewRow()
    warningRow.warnings = [
      { code: 'warning', level: 'warning', message: 'Review warning' },
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/requirements/import/schema')) {
        return {
          json: async () => ({ error: 'Schema unavailable' }),
          ok: false,
        } as Response
      }
      const body = url.includes('requirement-packages')
        ? { requirementPackages: [] }
        : url.includes('norm-references')
          ? { normReferences: [] }
          : url.includes('requirement-types')
            ? { types: [] }
            : url.includes('priority-levels')
              ? { priorityLevels: [] }
              : { categories: [] }
      return { json: async () => body, ok: true } as Response
    })
    global.fetch = fetchMock
    confirmMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    vi.mocked(apiFetch).mockResolvedValue({
      json: async () => ({ error: 'Import rejected' }),
      ok: false,
    } as Response)

    render(
      <RequirementsImportDialog
        embedded
        initialImport={{
          key: 'warning-preview',
          payload: JSON.parse(validImportPayload()),
          preview: {
            needsReferenceProposals: [],
            previewToken: 'warning-token',
            proposals: [],
            rows: [warningRow],
            summary: { errorCount: 0, rowCount: 1, warningCount: 1 },
          },
        }}
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Importera valda' }),
    )
    expect(apiFetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Importera valda' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Import rejected',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeNull())
  })

  it('explains every library preview blocker and accepts a selected JSON file', async () => {
    render(
      <RequirementsImportDialog
        areas={[
          {
            id: 7,
            name: 'Clinical systems',
            permissions: { canAuthor: true },
          },
        ]}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )
    const rawJson = screen.getByLabelText(/Import-JSON/)
    const preview = screen.getByRole('button', {
      name: 'Förhandsgranska krav',
    })
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(5))

    expect(screen.getByRole('status')).toHaveTextContent(
      'Välj kravområde och lägg till import-JSON',
    )
    fireEvent.change(rawJson, { target: { value: '{' } })
    expect(screen.getByRole('status')).toHaveTextContent('JSON kan inte läsas')
    fireEvent.change(rawJson, {
      target: {
        value: JSON.stringify({ requirements: [{}], schemaVersion: 'v1' }),
      },
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'schemaVersion måste vara requirement-import.v3',
    )
    fireEvent.change(rawJson, {
      target: {
        value: JSON.stringify({
          requirements: [],
          schemaVersion: 'requirement-import.v3',
        }),
      },
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'JSON följer inte importschemat',
    )
    fireEvent.change(rawJson, { target: { value: validImportPayload() } })
    expect(screen.getByRole('status')).toHaveTextContent('Välj kravområde')

    fireEvent.change(screen.getByLabelText(/^Kravområde/), {
      target: { value: '7' },
    })
    expect(preview).toBeEnabled()

    const dropZone = screen.getByRole('button', {
      name: 'Släpp en JSON-fil här, eller klicka för att välja fil.',
    })
    fireEvent.dragEnter(dropZone)
    fireEvent.dragOver(dropZone)
    fireEvent.dragLeave(dropZone)
    const filePayload = JSON.stringify({
      requirements: [{ description: 'Selected file requirement' }],
      schemaVersion: 'requirement-import.v3',
    })
    const file = new File([filePayload], 'selected.json', {
      type: 'application/json',
    })
    const fileInput =
      document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    if (!fileInput) throw new Error('Expected the JSON file input')
    fireEvent.change(fileInput, { target: { files: [file] } })
    await waitFor(() => expect(rawJson).toHaveValue(filePayload))
  })

  it('downloads specification artifacts and reports a failed schema request', async () => {
    let schemaFails = true
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/requirements/import/schema')) {
        return schemaFails
          ? ({
              json: async () => ({ error: 'Schema unavailable' }),
              ok: false,
            } as Response)
          : ({ blob: async () => new Blob(['schema']), ok: true } as Response)
      }
      if (url.includes('/api/requirements/import/instruction')) {
        return {
          blob: async () => new Blob(['instruction']),
          ok: true,
        } as Response
      }
      const body = url.includes('requirement-packages')
        ? { requirementPackages: [] }
        : url.includes('norm-references')
          ? { normReferences: [] }
          : url.includes('requirement-types')
            ? { types: [] }
            : url.includes('priority-levels')
              ? { priorityLevels: [] }
              : { categories: [] }
      return { json: async () => body, ok: true } as Response
    })
    global.fetch = fetchMock

    render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ladda ner schema' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Schema unavailable',
    )
    schemaFails = false
    fireEvent.click(screen.getByRole('button', { name: 'Ladda ner schema' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Ladda ner importinstruktion' }),
    )

    await waitFor(() => expect(downloadBlobMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/requirements/import/instruction?locale=sv&kind=requirements_specification&specificationId=8',
    )
  })

  it('tolerates partial taxonomy failures and stops fetching while closed', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('requirement-categories')) {
        return Promise.reject(new Error('categories unavailable'))
      }
      if (url.includes('requirement-types')) {
        return Promise.resolve({
          json: async () => ({
            types: [{ id: 1, nameEn: 'Functional', nameSv: 'Funktionellt' }],
          }),
          ok: true,
        } as unknown as Response)
      }
      if (url.includes('priority-levels')) {
        return Promise.resolve({ ok: false } as Response)
      }
      if (url.includes('requirement-packages')) {
        return Promise.resolve({
          json: async () => Promise.reject(new Error('invalid JSON')),
          ok: true,
        } as unknown as Response)
      }
      return Promise.resolve({ json: async () => ({}), ok: true } as Response)
    })
    global.fetch = fetchMock

    const { rerender } = render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationId={8}
      />,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    expect(screen.getByText('Importera lokala krav')).toBeVisible()

    rerender(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open={false}
        specificationId={8}
      />,
    )
    expect(screen.queryByText('Importera lokala krav')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})
