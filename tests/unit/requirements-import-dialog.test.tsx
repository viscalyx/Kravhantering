import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsImportDialog from '@/components/RequirementsImportDialog'
import { apiFetch } from '@/lib/http/api-fetch'

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({
    confirm: vi.fn().mockResolvedValue(true),
  }),
}))

vi.mock('@/lib/http/api-fetch', () => ({
  apiFetch: vi.fn(),
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

async function expandFirstImportRow() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Expandera rad #1' }),
  )
}

describe('RequirementsImportDialog', () => {
  beforeEach(() => {
    mockReferenceDataFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requires valid import JSON and kravområde before starting import', async () => {
    render(
      <RequirementsImportDialog
        areas={[{ id: 7, name: 'Bilddiagnostik', permissions: {} }]}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )

    const loadButton = screen.getByRole('button', { name: 'Starta import' })
    const jsonField = screen.getByLabelText(/Import-JSON/)
    const areaSelect = screen.getByLabelText(/Kravområde/)

    expect(loadButton).toBeDisabled()
    expect(
      screen.getByText(
        'Välj kravområde och lägg till import-JSON för att starta importen.',
      ),
    ).toBeInTheDocument()
    expect(jsonField).toHaveAttribute(
      'placeholder',
      'Klistra in import-JSON här.',
    )
    expect(
      screen.getByRole('button', { name: 'Ladda ner JSON-instruktion' }),
    ).toHaveAttribute('aria-describedby', 'requirements-import-download-help')
    expect(screen.queryByText('Ladda ner AI-prompt')).not.toBeInTheDocument()
    expect(
      screen.getByText(/JSON-instruktionen är bara formatdelen för AI-arbete/),
    ).toBeInTheDocument()

    fireEvent.change(jsonField, { target: { value: '{' } })
    expect(
      screen.getByText(
        'Välj kravområde för att starta importen. JSON kan inte läsas. Kontrollera syntaxen innan importen startas.',
      ),
    ).toBeInTheDocument()

    fireEvent.change(jsonField, { target: { value: '' } })
    fireEvent.change(areaSelect, { target: { value: '7' } })
    expect(
      screen.getByText(
        'Klistra in import-JSON eller välj en JSON-fil för att starta importen.',
      ),
    ).toBeInTheDocument()

    fireEvent.change(jsonField, { target: { value: '{' } })
    expect(loadButton).toBeDisabled()
    expect(
      screen.getByText(
        'JSON kan inte läsas. Kontrollera syntaxen innan importen startas.',
      ),
    ).toBeInTheDocument()

    fireEvent.change(jsonField, { target: { value: '{}' } })
    expect(loadButton).toBeDisabled()
    expect(
      screen.getByText('schemaVersion måste vara requirement-import.v1.'),
    ).toBeInTheDocument()

    fireEvent.change(jsonField, {
      target: {
        value: JSON.stringify({
          schemaVersion: 'requirement-import.v1',
        }),
      },
    })
    expect(loadButton).toBeDisabled()
    expect(
      screen.getByText(
        'JSON följer inte importschemat. Kontrollera obligatoriska fält och fältnamn.',
      ),
    ).toBeInTheDocument()

    fireEvent.change(jsonField, {
      target: {
        value: JSON.stringify({
          requirements: [{ description: 'Kravtext' }],
          schemaVersion: 'requirement-import.v1',
        }),
      },
    })

    await waitFor(() => expect(loadButton).toBeEnabled())
    expect(
      screen.queryByText(
        'Klistra in import-JSON eller välj en JSON-fil för att starta importen.',
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'JSON följer inte importschemat. Kontrollera obligatoriska fält och fältnamn.',
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('schemaVersion måste vara requirement-import.v1.'),
    ).not.toBeInTheDocument()
  })

  it('clears selected kravområde when closing the dialog', async () => {
    render(
      <RequirementsImportDialog
        areas={[{ id: 7, name: 'Bilddiagnostik', permissions: {} }]}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )

    const areaSelect = screen.getByLabelText(/Kravområde/)
    fireEvent.change(areaSelect, { target: { value: '7' } })
    expect(areaSelect).toHaveValue('7')

    fireEvent.click(screen.getByLabelText('Stäng'))

    await waitFor(() => expect(areaSelect).toHaveValue(''))
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
      schemaVersion: 'requirement-import.v1',
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

  it('starts loaded rows collapsed with a switch and priority summary', async () => {
    mockReferenceDataFetch({
      priorityLevels: [
        {
          color: '#f97316',
          id: 4,
          nameEn: 'High',
          nameSv: 'Hög',
        },
      ],
    })
    vi.mocked(apiFetch).mockResolvedValue({
      json: async () => ({
        previewToken: 'preview-token',
        proposals: [],
        rows: [
          {
            errors: [],
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
              qualityCharacteristicId: null,
              requirementPackageIds: [],
              requiresTesting: false,
              priorityLevelId: 4,
              typeId: null,
              verificationMethod: null,
            },
            warnings: [],
          },
        ],
        summary: { errorCount: 0, rowCount: 1, warningCount: 0 },
      }),
      ok: true,
    } as Response)

    render(
      <RequirementsImportDialog
        areas={[{ id: 7, name: 'Bilddiagnostik', permissions: {} }]}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )

    fireEvent.change(screen.getByLabelText(/Kravområde/), {
      target: { value: '7' },
    })
    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: {
        value: JSON.stringify({
          requirements: [{ description: 'Kravtext' }],
          schemaVersion: 'requirement-import.v1',
        }),
      },
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Starta import' }),
      ).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Starta import' }))

    const rowSwitch = await screen.findByRole('switch', {
      name: 'Välj inte rad #1 för import',
    })
    expect(rowSwitch).toHaveAttribute('aria-checked', 'true')
    expect(await screen.findByText('Hög')).toBeVisible()
    expect(
      screen.queryByRole('textbox', { name: /Kravtext/ }),
    ).not.toBeInTheDocument()
    const expandAllButton = screen.getByRole('button', {
      name: 'Expandera alla',
    })
    const collapseAllButton = screen.getByRole('button', {
      name: 'Kollapsa alla',
    })
    expect(expandAllButton).toBeEnabled()
    expect(collapseAllButton).toBeDisabled()

    fireEvent.click(rowSwitch)
    expect(rowSwitch).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('0 valda')).toBeInTheDocument()

    await expandFirstImportRow()
    expect(expandAllButton).toBeDisabled()
    expect(collapseAllButton).toBeEnabled()
    expect(
      await screen.findByRole('textbox', { name: /Kravtext/ }),
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Kollapsa rad #1' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: /Kravtext/ }),
      ).not.toBeInTheDocument(),
    )
    expect(expandAllButton).toBeEnabled()
    expect(collapseAllButton).toBeDisabled()
  })

  it('uses compact resolved ID rows in the loaded review', async () => {
    mockReferenceDataFetch({
      normReferences: [
        {
          id: 910034,
          name: 'Digital Imaging and Communications in Medicine Part 2',
          normReferenceId: 'DICOM-PS3.2',
        },
      ],
      requirementPackages: [{ id: 3, name: 'Integration med andra system' }],
    })
    vi.mocked(apiFetch).mockResolvedValue({
      json: async () => ({
        previewToken: 'preview-token',
        proposals: [],
        rows: [
          {
            errors: [],
            proposedNormReferenceKeys: [],
            reviewRowId: 'row-0',
            selected: true,
            sourceIndex: 0,
            values: {
              acceptanceCriteria: null,
              categoryId: null,
              description: 'Kravtext',
              needsReferenceId: null,
              normReferenceIds: [910034],
              qualityCharacteristicId: null,
              requirementPackageIds: [3],
              requiresTesting: false,
              priorityLevelId: null,
              typeId: null,
              verificationMethod: null,
            },
            warnings: [],
          },
        ],
        summary: { errorCount: 0, rowCount: 1, warningCount: 0 },
      }),
      ok: true,
    } as Response)

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
      schemaVersion: 'requirement-import.v1',
    })
    fireEvent.change(screen.getByLabelText(/Kravområde/), {
      target: { value: '7' },
    })
    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: { value: payload },
    })

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Starta import' }),
      ).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Starta import' }))

    expect(
      await screen.findByRole('button', { name: 'Expandera rad #1' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Integration med andra system'),
    ).not.toBeInTheDocument()
    await expandFirstImportRow()

    const packageLabel = await screen.findByText('Integration med andra system')
    const normReferenceLabel = await screen.findByText(
      'DICOM-PS3.2 - Digital Imaging and Communications in Medicine Part 2',
    )

    expect(packageLabel.closest('div')?.className).toContain(
      'grid-cols-[minmax(0,1fr)_2.75rem]',
    )
    expect(normReferenceLabel.closest('div')?.className).toContain(
      'grid-cols-[minmax(0,1fr)_2.75rem]',
    )
    expect(
      within(packageLabel.closest('div') as HTMLElement).queryByText('3'),
    ).not.toBeInTheDocument()
    expect(
      within(normReferenceLabel.closest('div') as HTMLElement).queryByText(
        '910034',
      ),
    ).not.toBeInTheDocument()
    expect(
      within(packageLabel.closest('div') as HTMLElement).queryByRole(
        'spinbutton',
      ),
    ).not.toBeInTheDocument()
    expect(
      within(normReferenceLabel.closest('div') as HTMLElement).queryByRole(
        'spinbutton',
      ),
    ).not.toBeInTheDocument()
    const verifiableLabel = screen.getByText('Verifierbar')
    const packageHeading = screen.getByText('Kravpakets-ID:n')
    const normReferenceHeading = screen.getByText('Normreferens-ID:n')
    const typeLabel = screen.getByText('Typ')
    const qualityCharacteristicLabel = screen.getByText('Kvalitetsegenskap')

    expect(
      typeLabel.compareDocumentPosition(qualityCharacteristicLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      verifiableLabel.compareDocumentPosition(packageHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      verifiableLabel.compareDocumentPosition(normReferenceHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('hides requirement package controls for specification-local imports', async () => {
    mockReferenceDataFetch({
      requirementPackages: [{ id: 3, name: 'Integration med andra system' }],
    })
    vi.mocked(apiFetch).mockResolvedValue({
      json: async () => ({
        previewToken: 'preview-token',
        proposals: [],
        rows: [
          {
            errors: [],
            infos: [
              {
                code: 'import_requirement_packages_ignored_for_specification_local',
                field: 'requirementPackageIds',
                level: 'info',
                message:
                  'Requirement packages in the import file are not used for specification-local requirements.',
              },
            ],
            proposedNormReferenceKeys: [],
            reviewRowId: 'row-0',
            selected: true,
            sourceIndex: 0,
            values: {
              acceptanceCriteria: null,
              categoryId: null,
              description: 'Lokalt krav',
              needsReferenceId: null,
              normReferenceIds: [],
              qualityCharacteristicId: null,
              requirementPackageIds: [],
              requiresTesting: false,
              priorityLevelId: null,
              typeId: null,
              verificationMethod: null,
            },
            warnings: [],
          },
        ],
        summary: { errorCount: 0, rowCount: 1, warningCount: 0 },
      }),
      ok: true,
    } as Response)

    render(
      <RequirementsImportDialog
        mode="specification-local"
        onClose={vi.fn()}
        open
        specificationSlug="spec"
      />,
    )

    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: {
        value: JSON.stringify({
          requirements: [{ description: 'Lokalt krav' }],
          schemaVersion: 'requirement-import.v1',
        }),
      },
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Starta import' }),
      ).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Starta import' }))
    await expandFirstImportRow()

    expect(screen.queryByText('Kravpakets-ID:n')).not.toBeInTheDocument()
    expect(screen.getByText('Normreferens-ID:n')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Kravpaket i importfilen används inte för kravunderlagslokala krav.',
      ),
    ).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/requirements-specifications/spec/local-requirements/import/preview',
      expect.any(Object),
    )
  })

  it('groups quality characteristics by parent and clears them when type is emptied', async () => {
    mockReferenceDataFetch({
      types: [
        {
          id: 2,
          nameEn: 'Non-functional',
          nameSv: 'Icke-funktionellt',
          qualityCharacteristics: [
            {
              id: 10,
              nameEn: 'Compatibility',
              nameSv: 'Kompatibilitet',
              parentId: null,
              requirementTypeId: 2,
            },
            {
              id: 11,
              nameEn: 'Interoperability',
              nameSv: 'Interoperabilitet',
              parentId: 10,
              requirementTypeId: 2,
            },
          ],
        },
      ],
    })
    vi.mocked(apiFetch).mockResolvedValue({
      json: async () => ({
        previewToken: 'preview-token',
        proposals: [],
        rows: [
          {
            errors: [],
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
              qualityCharacteristicId: 11,
              requirementPackageIds: [],
              requiresTesting: false,
              priorityLevelId: null,
              typeId: 2,
              verificationMethod: null,
            },
            warnings: [],
          },
        ],
        summary: { errorCount: 0, rowCount: 1, warningCount: 0 },
      }),
      ok: true,
    } as Response)

    render(
      <RequirementsImportDialog
        areas={[{ id: 7, name: 'Bilddiagnostik', permissions: {} }]}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )

    fireEvent.change(screen.getByLabelText(/Kravområde/), {
      target: { value: '7' },
    })
    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: {
        value: JSON.stringify({
          requirements: [{ description: 'Kravtext' }],
          schemaVersion: 'requirement-import.v1',
        }),
      },
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Starta import' }),
      ).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Starta import' }))
    await expandFirstImportRow()

    const typeSelect = await screen.findByLabelText('Typ')
    const qualityCharacteristicSelect =
      screen.getByLabelText('Kvalitetsegenskap')

    expect(qualityCharacteristicSelect).toHaveValue('11')
    expect(
      qualityCharacteristicSelect.querySelector(
        'optgroup[label="Kompatibilitet"]',
      ),
    ).not.toBeNull()

    fireEvent.change(typeSelect, { target: { value: '' } })

    await waitFor(() =>
      expect(screen.getByLabelText('Kvalitetsegenskap')).toBeDisabled(),
    )
    expect(screen.getByLabelText('Kvalitetsegenskap')).toHaveValue('')
  })

  it('selects requirement packages and norm references from overview modals', async () => {
    mockReferenceDataFetch({
      normReferences: [
        {
          id: 910034,
          name: 'Digital Imaging and Communications in Medicine Part 2',
          normReferenceId: 'DICOM-PS3.2',
        },
        {
          id: 910035,
          name: 'Digital Imaging and Communications in Medicine Part 3',
          normReferenceId: 'DICOM-PS3.3',
        },
      ],
      requirementPackages: [
        { id: 3, name: 'Integration med andra system' },
        { id: 1004, name: 'API och informationsutbyte' },
      ],
    })
    vi.mocked(apiFetch).mockResolvedValue({
      json: async () => ({
        previewToken: 'preview-token',
        proposals: [],
        rows: [
          {
            errors: [],
            proposedNormReferenceKeys: [],
            reviewRowId: 'row-0',
            selected: true,
            sourceIndex: 0,
            values: {
              acceptanceCriteria: null,
              categoryId: null,
              description: 'Kravtext',
              needsReferenceId: null,
              normReferenceIds: [910034],
              qualityCharacteristicId: null,
              requirementPackageIds: [3],
              requiresTesting: false,
              priorityLevelId: null,
              typeId: null,
              verificationMethod: null,
            },
            warnings: [],
          },
        ],
        summary: { errorCount: 0, rowCount: 1, warningCount: 0 },
      }),
      ok: true,
    } as Response)

    render(
      <RequirementsImportDialog
        areas={[{ id: 7, name: 'Bilddiagnostik', permissions: {} }]}
        mode="library"
        onClose={vi.fn()}
        open
      />,
    )

    fireEvent.change(screen.getByLabelText(/Kravområde/), {
      target: { value: '7' },
    })
    fireEvent.change(screen.getByLabelText(/Import-JSON/), {
      target: {
        value: JSON.stringify({
          requirements: [{ description: 'Kravtext' }],
          schemaVersion: 'requirement-import.v1',
        }),
      },
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Starta import' }),
      ).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Starta import' }))

    await expandFirstImportRow()
    await screen.findByText('Integration med andra system')

    fireEvent.click(screen.getByRole('button', { name: 'Välj kravpaket' }))
    await screen.findByRole('dialog', { name: 'Välj kravpaket' })
    fireEvent.click(screen.getByLabelText('API och informationsutbyte'))
    fireEvent.click(screen.getByRole('button', { name: 'Använd val' }))
    expect(await screen.findByText('API och informationsutbyte')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Välj normreferenser' }))
    await screen.findByRole('dialog', { name: 'Välj normreferenser' })
    fireEvent.click(
      screen.getByLabelText(
        /Digital Imaging and Communications in Medicine Part 3/,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Använd val' }))

    expect(
      await screen.findByText(
        'DICOM-PS3.3 - Digital Imaging and Communications in Medicine Part 3',
      ),
    ).toBeVisible()
  })
})
