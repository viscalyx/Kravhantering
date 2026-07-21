import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsImportDialog from '@/components/RequirementsImportDialog'
import { apiFetch } from '@/lib/http/api-fetch'

const confirmMock = vi.hoisted(() => vi.fn())
const downloadBlobMock = vi.hoisted(() => vi.fn())
const importDialogTranslate = vi.hoisted(() => {
  const messages: Record<string, string> = {
    descriptionRequired: 'Kravtext måste anges innan raden kan importeras.',
    importTitleWithDestination: '{title} för {destination}',
    loadingInitialImport: 'Förbereder importgranskning...',
    verificationMethodRequired:
      'Verifieringsmetod måste anges för verifierbara krav.',
  }
  return (key: string, params?: Record<string, string>) => {
    const template = messages[key] ?? key
    return Object.entries(params ?? {}).reduce(
      (result, [name, value]) => result.replaceAll(`{${name}}`, value),
      template,
    )
  }
})

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
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

function importPreviewRow(sourceIndex = 0) {
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
})
