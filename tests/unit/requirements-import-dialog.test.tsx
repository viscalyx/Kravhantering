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
      color?: string
      id: number
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

describe('RequirementsImportDialog', () => {
  beforeEach(() => {
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
})
