import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listNormReferences,
  type NormReferenceRow,
} from '@/lib/dal/norm-references'
import { listPriorityLevels } from '@/lib/dal/priority-levels'
import { listCategories } from '@/lib/dal/requirement-categories'
import { listRequirementPackages } from '@/lib/dal/requirement-packages'
import { listTypes } from '@/lib/dal/requirement-types'
import {
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  requirementsImportPayloadSchema,
} from '@/lib/requirements/import-schema'
import { createRequirementsImportWorkflow } from '@/lib/requirements/import-service'

vi.mock('@/lib/dal/norm-references', () => ({
  listNormReferences: vi.fn(),
}))

vi.mock('@/lib/dal/requirement-categories', () => ({
  listCategories: vi.fn(),
}))

vi.mock('@/lib/dal/requirement-packages', () => ({
  listRequirementPackages: vi.fn(),
}))

vi.mock('@/lib/dal/requirement-types', () => ({
  listTypes: vi.fn(),
}))

vi.mock('@/lib/dal/priority-levels', () => ({
  listPriorityLevels: vi.fn(),
}))

function extractReferenceData(prompt: string) {
  const referenceDataJson = prompt.match(
    /## Reference Data\n\n```json\n([\s\S]*?)\n```/,
  )?.[1]
  expect(referenceDataJson).toBeTruthy()
  return JSON.parse(referenceDataJson ?? '{}') as {
    categories: Array<{ id: number; name: string }>
    qualityCharacteristics?: unknown
    priorityLevels: Array<{
      assessmentCriteria: string
      code: string
      description: string
      id: number
      name: string
    }>
    types: Array<{
      id: number
      name: string
      qualityCharacteristics: Array<{
        chapterId: string
        id: number
        name: string
      }>
    }>
  }
}

describe('requirements import service', () => {
  beforeEach(() => {
    vi.mocked(listCategories).mockResolvedValue([])
    vi.mocked(listRequirementPackages).mockResolvedValue([])
    vi.mocked(listPriorityLevels).mockResolvedValue([])
    vi.mocked(listTypes).mockResolvedValue([])
    vi.mocked(listNormReferences).mockResolvedValue([])
  })

  it('carries proposed norm reference form fields into preview', async () => {
    const payload = requirementsImportPayloadSchema.parse({
      proposedNormReferences: [
        {
          issuer: 'National Electrical Manufacturers Association (NEMA)',
          key: 'DICOM-PS3.2',
          name: 'Digital Imaging and Communications in Medicine Part 2',
          normReferenceId: null,
          reference: 'DICOM PS3.2',
          type: 'Standard',
          uri: 'https://dicom.nema.org/medical/dicom/current/output/html/part02.html',
          version: null,
        },
      ],
      requirements: [
        {
          description: 'Leverantören ska bifoga DICOM Conformance Statement.',
          proposedNormReferenceKeys: ['DICOM-PS3.2'],
        },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const preview = await workflow.previewLibraryImport({} as never, {
      areaId: 7,
      locale: 'sv',
      payload,
    })

    expect(preview.proposals).toEqual([
      expect.objectContaining({
        issuer: 'National Electrical Manufacturers Association (NEMA)',
        key: 'DICOM-PS3.2',
        name: 'Digital Imaging and Communications in Medicine Part 2',
        normReferenceId: null,
        reference: 'DICOM PS3.2',
        referencedCount: 1,
        resolvedNormReferenceDbId: null,
        type: 'Standard',
        uri: 'https://dicom.nema.org/medical/dicom/current/output/html/part02.html',
        version: null,
      }),
    ])
    expect(preview.rows[0]).toMatchObject({
      proposedNormReferenceKeys: ['DICOM-PS3.2'],
      warnings: [
        expect.objectContaining({
          code: 'import_proposed_norm_reference_unresolved',
          originalValue: 'DICOM-PS3.2',
        }),
      ],
    })
  })

  it('resolves proposed norm references by key when norm reference id is omitted', async () => {
    const existingNormReference: NormReferenceRow = {
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 910033,
      isArchived: false,
      issuer: 'National Electrical Manufacturers Association (NEMA)',
      name: 'Digital Imaging and Communications in Medicine Part 2',
      normReferenceId: 'DICOM-PS3.2',
      reference: 'DICOM PS3.2',
      type: 'Standard',
      updatedAt: '2026-01-01T00:00:00.000Z',
      uri: 'https://dicom.nema.org/medical/dicom/current/output/html/part02.html',
      version: null,
    }
    vi.mocked(listNormReferences).mockResolvedValue([existingNormReference])
    const payload = requirementsImportPayloadSchema.parse({
      proposedNormReferences: [
        {
          issuer: 'National Electrical Manufacturers Association (NEMA)',
          key: 'DICOM-PS3.2',
          name: 'Digital Imaging and Communications in Medicine Part 2',
          normReferenceId: null,
          reference: 'DICOM PS3.2',
          type: 'Standard',
          uri: 'https://dicom.nema.org/medical/dicom/current/output/html/part02.html',
          version: null,
        },
      ],
      requirements: [
        {
          description: 'Leverantören ska bifoga DICOM Conformance Statement.',
          proposedNormReferenceKeys: ['DICOM-PS3.2'],
        },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const preview = await workflow.previewLibraryImport({} as never, {
      areaId: 7,
      locale: 'sv',
      payload,
    })

    expect(preview.proposals).toEqual([
      expect.objectContaining({
        key: 'DICOM-PS3.2',
        normReferenceId: null,
        resolvedNormReferenceDbId: 910033,
        warnings: [],
      }),
    ])
    expect(preview.rows[0]?.values.normReferenceIds).toEqual([910033])
    expect(preview.rows[0]?.warnings.map(item => item.code)).not.toContain(
      'import_proposed_norm_reference_unresolved',
    )
  })

  it('instructs AI prompts to avoid EN DASH in JSON values', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const promptEn = await workflow.buildImportAiPrompt('en')
    const promptSv = await workflow.buildImportAiPrompt('sv')

    expect(promptEn).toContain('Do not use U+2013 EN DASH in JSON values')
    expect(promptSv).toContain('Använd inte U+2013 EN DASH i JSON-värden')
    expect(promptEn).toContain(
      '- Choose `typeId` before `qualityCharacteristicId`:\n  - Use the functional type for required system behavior or capability',
    )
    expect(promptSv).toContain(
      '- Välj `typeId` innan `qualityCharacteristicId`:\n  - Använd funktionell typ för krav på systembeteende eller förmåga',
    )
    expect(promptEn).toContain(
      "Choose `qualityCharacteristicId` only from the selected type's `qualityCharacteristics`",
    )
    expect(promptSv).toContain(
      'Välj bara `qualityCharacteristicId` från den valda typens `qualityCharacteristics`',
    )
    expect(promptEn).toContain(
      'Use `acceptanceCriteria` for the conditions and fulfillment level that must be met',
    )
    expect(promptSv).toContain(
      'Använd `acceptanceCriteria` för villkor och nivå av uppfyllelse som måste vara uppnådda',
    )
    expect(promptEn).toContain(
      'Use ID fields from the reference data: `categoryId`, `typeId`, `qualityCharacteristicId`, `priorityLevelId`, and `requirementPackageIds`',
    )
    expect(promptEn).toContain(
      'Choose `priorityLevelId` from `priorityLevels[].id`; compare the requirement with `priorityLevels[].assessmentCriteria` and choose the best match',
    )
    expect(promptSv).toContain(
      'Välj `priorityLevelId` från `priorityLevels[].id`; jämför kravet med `priorityLevels[].assessmentCriteria` och välj bästa matchning',
    )
    expect(promptEn).toContain(
      'Return only a JSON object that follows the JSON Schema below',
    )
    expect(promptSv).toContain(
      'Returnera endast ett JSON-objekt som följer JSON Schema nedan',
    )
    expect(promptEn).toContain(
      'Set the top-level `schemaVersion` field to `requirement-import.v1`',
    )
    expect(promptSv).toContain(
      'Sätt toppnivåfältet `schemaVersion` till `requirement-import.v1`',
    )
    expect(promptEn).not.toContain('requirements-import.v1')
    expect(promptSv).not.toContain('requirements-import.v1')
    expect(promptEn).not.toContain('destination fields')
    expect(promptSv).not.toContain('destinationsfält')
    expect(promptEn).not.toContain('only when IDs are unavailable')
    expect(promptSv).toContain(
      'Använd `normReferenceIds` med värden från `normReferences[].normReferenceId`',
    )
    expect(promptEn).toContain(
      'Set `requiresTesting` to `true` when the requirement should be verified; then provide `verificationMethod`',
    )
  })

  it('nests selectable quality characteristics under their allowed type in AI prompt reference data', async () => {
    vi.mocked(listTypes).mockResolvedValue([
      {
        id: 1,
        nameEn: 'Functional',
        nameSv: 'Funktionellt',
        qualityCharacteristics: [
          {
            chapterId: '3.1',
            id: 10,
            nameEn: 'Functional suitability',
            nameSv: 'Funktionell lämplighet',
            parentId: null,
            requirementTypeId: 1,
          },
          {
            chapterId: '3.1.1',
            id: 11,
            nameEn: 'Functional completeness',
            nameSv: 'Funktionell fullständighet',
            parentId: 10,
            requirementTypeId: 1,
          },
        ],
      },
      {
        id: 2,
        nameEn: 'Non-functional',
        nameSv: 'Icke-funktionellt',
        qualityCharacteristics: [
          {
            chapterId: '3.2',
            id: 20,
            nameEn: 'Performance efficiency',
            nameSv: 'Prestandaeffektivitet',
            parentId: null,
            requirementTypeId: 2,
          },
          {
            chapterId: '3.2.1',
            id: 21,
            nameEn: 'Time behaviour',
            nameSv: 'Tidsbeteende',
            parentId: 20,
            requirementTypeId: 2,
          },
        ],
      },
    ])
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const referenceData = extractReferenceData(
      await workflow.buildImportAiPrompt('en'),
    )

    expect(referenceData).not.toHaveProperty('qualityCharacteristics')
    expect(referenceData.types).toEqual([
      {
        id: 1,
        name: 'Functional',
        qualityCharacteristics: [
          { chapterId: '3.1.1', id: 11, name: 'Functional completeness' },
        ],
      },
      {
        id: 2,
        name: 'Non-functional',
        qualityCharacteristics: [
          { chapterId: '3.2.1', id: 21, name: 'Time behaviour' },
        ],
      },
    ])
  })

  it('localizes AI prompt taxonomy reference names to the requested language', async () => {
    vi.mocked(listCategories).mockResolvedValue([
      { id: 3, nameEn: 'Supplier requirement', nameSv: 'Leverantörskrav' },
    ])
    vi.mocked(listPriorityLevels).mockResolvedValue([
      {
        assessmentCriteriaEn: 'High importance',
        assessmentCriteriaSv: 'Stor betydelse',
        code: 'P4',
        color: '#f97316',
        descriptionEn: 'High priority',
        descriptionSv: 'Hög prioritet',
        iconName: 'AlertCircle',
        id: 4,
        nameEn: 'High',
        nameSv: 'Hög',
        sortOrder: 2,
      },
    ])
    vi.mocked(listTypes).mockResolvedValue([
      {
        id: 2,
        nameEn: 'Non-functional',
        nameSv: 'Icke-funktionellt',
        qualityCharacteristics: [
          {
            chapterId: '3.2',
            id: 20,
            nameEn: 'Performance efficiency',
            nameSv: 'Prestandaeffektivitet',
            parentId: null,
            requirementTypeId: 2,
          },
          {
            chapterId: '3.2.1',
            id: 21,
            nameEn: 'Time behaviour',
            nameSv: 'Tidsbeteende',
            parentId: 20,
            requirementTypeId: 2,
          },
        ],
      },
    ])
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const referenceData = extractReferenceData(
      await workflow.buildImportAiPrompt('sv'),
    )
    const referenceDataText = JSON.stringify(referenceData)

    expect(referenceData.categories).toEqual([
      { id: 3, name: 'Leverantörskrav' },
    ])
    expect(referenceData.priorityLevels).toEqual([
      {
        assessmentCriteria: 'Stor betydelse',
        code: 'P4',
        description: 'Hög prioritet',
        id: 4,
        name: 'Hög',
      },
    ])
    expect(referenceData.types).toEqual([
      {
        id: 2,
        name: 'Icke-funktionellt',
        qualityCharacteristics: [
          {
            chapterId: '3.2.1',
            id: 21,
            name: 'Tidsbeteende',
          },
        ],
      },
    ])
    expect(referenceDataText).not.toContain('nameEn')
    expect(referenceDataText).not.toContain('nameSv')
  })
})
