import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCachedMcpRuntimeSettings } from '@/lib/dal/ai-settings'
import {
  listNormReferences,
  type NormReferenceRow,
} from '@/lib/dal/norm-references'
import { listPriorityLevels } from '@/lib/dal/priority-levels'
import {
  getAreaById,
  listAreasActorCanAuthor,
} from '@/lib/dal/requirement-areas'
import { listCategories } from '@/lib/dal/requirement-categories'
import {
  createRequirementImportValidationSession,
  getRequirementImportValidationSessionByTokenHash,
  purgeExpiredRequirementImportValidationSessions,
  type RequirementImportValidationSessionRecord,
  updateRequirementImportValidationSessionExecutionResult,
} from '@/lib/dal/requirement-import-validation-sessions'
import { listRequirementPackages } from '@/lib/dal/requirement-packages'
import { listTypes } from '@/lib/dal/requirement-types'
import {
  createRequirementsBatch,
  createRequirementsBatchWithExecutor,
} from '@/lib/dal/requirements'
import {
  createSpecificationLocalRequirementsBatch,
  createSpecificationLocalRequirementsBatchWithExecutor,
  getSpecificationById,
  getSpecificationBySlug,
  listSpecificationsForActor,
} from '@/lib/dal/requirements-specifications'
import type { RequestContext } from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'
import {
  buildRequirementsImportJsonSchema,
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

vi.mock('@/lib/dal/ai-settings', () => ({
  getCachedMcpRuntimeSettings: vi.fn(),
}))

vi.mock('@/lib/dal/requirement-areas', () => ({
  getAreaById: vi.fn(),
  listAreasActorCanAuthor: vi.fn(),
}))

vi.mock('@/lib/dal/requirement-import-validation-sessions', () => ({
  createRequirementImportValidationSession: vi.fn(),
  getRequirementImportValidationSessionByTokenHash: vi.fn(),
  purgeExpiredRequirementImportValidationSessions: vi.fn(),
  updateRequirementImportValidationSessionExecutionResult: vi.fn(),
}))

vi.mock('@/lib/dal/requirements', () => ({
  createRequirementsBatch: vi.fn(),
  createRequirementsBatchWithExecutor: vi.fn(),
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  createSpecificationLocalRequirementsBatch: vi.fn(),
  createSpecificationLocalRequirementsBatchWithExecutor: vi.fn(),
  getSpecificationById: vi.fn(),
  getSpecificationBySlug: vi.fn(),
  listSpecificationsForActor: vi.fn(),
}))

function extractReferenceData(instruction: string) {
  const referenceDataJson = instruction.match(
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
    requirementPackages?: Array<{
      id: number
      leadDisplayName: string | null
      name: string
      purposeAndScope: string | null
    }>
  }
}

function makeContext(toolName: string): RequestContext {
  return {
    actor: {
      displayName: 'Import Service Actor',
      hsaId: 'SE5560000001-import1',
      id: 'actor-import',
      isAuthenticated: true,
      roles: ['Reviewer'],
      source: 'mcp',
    },
    correlationId: 'corr-import-service',
    requestId: 'req-import-service',
    source: 'mcp',
    toolName,
  }
}

function makeSessionRecord(
  data: {
    destinationId: number
    destinationKind: string
    destinationSnapshotJson: string
    executionResultJson?: string | null
    expiresAt: Date
    payloadHash: string
    referenceDataFingerprint: string
    submittedPayloadJson: string
    tokenHash: string
    validationResultJson: string
  },
  id = 101,
): RequirementImportValidationSessionRecord {
  return {
    createdAt: '2026-07-05T10:00:00.000Z',
    destinationId: data.destinationId,
    destinationKind: data.destinationKind,
    destinationSnapshotJson: data.destinationSnapshotJson,
    executionResultJson: data.executionResultJson ?? null,
    expiresAt: data.expiresAt.toISOString(),
    id,
    payloadHash: data.payloadHash,
    referenceDataFingerprint: data.referenceDataFingerprint,
    submittedPayloadJson: data.submittedPayloadJson,
    tokenHash: data.tokenHash,
    updatedAt: '2026-07-05T10:00:00.000Z',
    validationResultJson: data.validationResultJson,
  }
}

function makeManageImportDb() {
  const manager = { query: vi.fn() }
  return {
    db: {
      query: vi.fn(),
      transaction: vi.fn(
        async (
          _isolation: string,
          callback: (executor: typeof manager) => Promise<unknown>,
        ) => callback(manager),
      ),
    },
    manager,
  }
}

describe('requirements import service', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.mocked(listCategories).mockResolvedValue([])
    vi.mocked(listRequirementPackages).mockResolvedValue([])
    vi.mocked(listPriorityLevels).mockResolvedValue([])
    vi.mocked(listTypes).mockResolvedValue([])
    vi.mocked(listNormReferences).mockResolvedValue([])
    vi.mocked(getCachedMcpRuntimeSettings).mockResolvedValue({
      mcpImportMaxRows: 500,
      mcpImportValidationTtlMinutes: 60,
      mcpMaxRequestBytes: 10 * 1024 * 1024,
    })
    vi.mocked(getAreaById).mockResolvedValue({
      createdAt: '2026-07-05T10:00:00.000Z',
      description: null,
      id: 7,
      name: 'Clinical systems',
      nextSequence: 1,
      ownerHsaId: 'SE5560000001-owner1',
      prefix: 'TEST',
      updatedAt: '2026-07-05T10:00:00.000Z',
    })
    vi.mocked(listAreasActorCanAuthor).mockResolvedValue([])
    vi.mocked(listSpecificationsForActor).mockResolvedValue([])
    vi.mocked(getSpecificationById).mockReset()
    vi.mocked(getSpecificationById).mockResolvedValue(null)
    vi.mocked(createRequirementImportValidationSession).mockReset()
    vi.mocked(createRequirementImportValidationSession).mockImplementation(
      async (_db, data) => makeSessionRecord(data),
    )
    vi.mocked(getRequirementImportValidationSessionByTokenHash).mockReset()
    vi.mocked(
      purgeExpiredRequirementImportValidationSessions,
    ).mockResolvedValue(undefined)
    vi.mocked(
      updateRequirementImportValidationSessionExecutionResult,
    ).mockResolvedValue(undefined)
    vi.mocked(createRequirementsBatch).mockReset()
    vi.mocked(createRequirementsBatchWithExecutor).mockReset()
    vi.mocked(createSpecificationLocalRequirementsBatch).mockReset()
    vi.mocked(createSpecificationLocalRequirementsBatchWithExecutor).mockReset()
    vi.mocked(getSpecificationBySlug).mockReset()
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

  it('returns the import JSON Schema through the authorized service method', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
      logger,
    })
    const context = makeContext('requirements_get_import_schema')

    const schema = await workflow.getImportSchema(context, { locale: 'sv' })

    expect(schema).toEqual(buildRequirementsImportJsonSchema('sv'))
    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'get_import_schema' },
      context,
    )
    expect(logger.info).toHaveBeenCalledWith(
      'requirements.get_import_schema',
      expect.objectContaining({
        actor_id: 'actor-import',
        correlation_id: 'corr-import-service',
        locale: 'sv',
        request_id: 'req-import-service',
        source: 'mcp',
        tool_name: 'requirements_get_import_schema',
      }),
    )
  })

  it('returns the import instruction through the authorized service method', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
      logger,
    })
    const context = makeContext('requirements_get_import_instruction')

    const result = await workflow.getImportInstruction(context, {
      locale: 'en',
    })

    expect(result.importInstruction).toContain(
      '# Create JSON for requirements import',
    )
    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'get_import_instruction' },
      context,
    )
    expect(logger.info).toHaveBeenCalledWith(
      'requirements.get_import_instruction',
      expect.objectContaining({
        actor_id: 'actor-import',
        correlation_id: 'corr-import-service',
        locale: 'en',
        request_id: 'req-import-service',
        source: 'mcp',
        tool_name: 'requirements_get_import_instruction',
      }),
    )
  })

  it('authorizes MCP validate destinations before resolving destination existence', async () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('DB_HOST', '')
    vi.stubEnv('DB_NAME', '')
    vi.stubEnv('DB_USER', '')
    vi.stubEnv('DB_PASSWORD', '')
    vi.stubEnv('MSSQL_SA_PASSWORD', '')

    const denied = forbiddenError('Blocked by policy', {
      reason: 'policy_missing',
    })
    const authorization = {
      assertAuthorized: vi.fn(async () => {
        throw denied
      }),
    }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: makeManageImportDb().db as never,
    })
    const context = makeContext('requirements_manage_import')

    await expect(
      workflow.manageImport(context, {
        destination: { areaId: 987_654, kind: 'requirements_library' },
        operation: 'validate',
        payload: {
          requirements: [{ description: 'Systemet ska logga händelser.' }],
          schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
        },
      }),
    ).rejects.toBe(denied)

    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      {
        kind: 'manage_import',
        operation: 'validate',
      },
      context,
    )
    expect(getAreaById).not.toHaveBeenCalled()
  })

  it('maps MCP import schema failures to the public issue-code set', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: makeManageImportDb().db as never,
    })
    const context = makeContext('requirements_manage_import')

    const invalidShape = await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
        requirements: [{ description: 123, unexpected: true }],
        schemaVersion: 'wrong-version',
      },
    })

    expect(invalidShape).toMatchObject({
      hasErrors: true,
      hasWarnings: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'import_schema_invalid_enum',
          path: '/schemaVersion',
        }),
        expect.objectContaining({
          code: 'import_schema_invalid_type',
          path: '/requirements/0/description',
        }),
        expect.objectContaining({
          code: 'import_schema_unrecognized_field',
          path: '/requirements/0',
        }),
      ]),
    })

    const missingRequired = await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: { schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION },
    })

    expect(missingRequired).toMatchObject({
      issues: [
        expect.objectContaining({
          code: 'import_schema_missing_required',
          path: '/requirements',
        }),
      ],
    })
    expect(createRequirementImportValidationSession).not.toHaveBeenCalled()
  })

  it('returns pinned MCP import cap codes and JSON Pointer paths', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: makeManageImportDb().db as never,
    })
    const context = makeContext('requirements_manage_import')

    vi.mocked(getCachedMcpRuntimeSettings).mockResolvedValueOnce({
      mcpImportMaxRows: 1,
      mcpImportValidationTtlMinutes: 60,
      mcpMaxRequestBytes: 10 * 1024 * 1024,
    })
    const rowCap = await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
        requirements: [{ description: 'One' }, { description: 'Two' }],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
    })

    expect(rowCap).toMatchObject({
      issues: [
        expect.objectContaining({
          code: 'import_row_count_cap_exceeded',
          path: '/requirements',
        }),
      ],
    })

    vi.mocked(getCachedMcpRuntimeSettings).mockResolvedValueOnce({
      mcpImportMaxRows: 500,
      mcpImportValidationTtlMinutes: 60,
      mcpMaxRequestBytes: 120,
    })
    const payloadCap = await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
        requirements: [{ description: 'A'.repeat(500) }],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
    })

    expect(payloadCap).toMatchObject({
      issues: [
        expect.objectContaining({
          code: 'import_payload_size_cap_exceeded',
          path: '',
        }),
      ],
    })
  })

  it('validates type and quality characteristic compatibility before MCP execute', async () => {
    vi.mocked(listTypes).mockResolvedValue([
      {
        id: 1,
        nameEn: 'Functional',
        nameSv: 'Funktionellt',
        qualityCharacteristics: [
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
      db: makeManageImportDb().db as never,
    })

    const result = await workflow.manageImport(
      makeContext('requirements_manage_import'),
      {
        destination: { areaId: 7, kind: 'requirements_library' },
        operation: 'validate',
        payload: {
          requirements: [
            {
              description: 'Systemet ska stödja inloggning.',
              qualityCharacteristicId: 21,
              typeId: 1,
              verifiable: false,
              verificationMethod: 'Inspection',
            },
          ],
          schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
        },
      },
    )

    expect(result).toMatchObject({
      hasErrors: true,
      hasWarnings: true,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'import_quality_characteristic_type_mismatch',
          path: '/requirements/0/qualityCharacteristicId',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'import_verification_method_ignored_for_non_verifiable',
          path: '/requirements/0/verificationMethod',
          severity: 'warning',
        }),
      ]),
    })
    const createData = vi
      .mocked(createRequirementImportValidationSession)
      .mock.calls.at(-1)?.[1]
    expect(createData).toBeDefined()
    const validation = JSON.parse(createData?.validationResultJson ?? '{}') as {
      referenceData?: { includes?: string[] }
      rows?: Array<{
        resolvedRow: Record<string, unknown>
        submittedRow?: unknown
      }>
    }
    expect(validation.referenceData?.includes).toEqual([
      'categories',
      'normReferences',
      'priorityLevels',
      'qualityCharacteristics',
      'requirementPackages',
      'types',
    ])
    expect(validation.rows?.[0]).not.toHaveProperty('submittedRow')
    expect(validation.rows?.[0]?.resolvedRow).toMatchObject({
      acceptanceCriteria: null,
      description: 'Systemet ska stödja inloggning.',
      normReferenceIds: [],
      requirementPackageIds: [],
      typeId: 1,
      verifiable: false,
    })
    expect(validation.rows?.[0]?.resolvedRow).not.toHaveProperty(
      'qualityCharacteristicId',
    )
    expect(validation.rows?.[0]?.resolvedRow).not.toHaveProperty(
      'verificationMethod',
    )
    expect(validation.rows?.[0]?.resolvedRow).not.toHaveProperty(
      'needsReferenceId',
    )
  })

  it('logs a safe diagnostic when MCP execute sees stale reference data', async () => {
    const { db } = makeManageImportDb()
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: db as never,
      logger,
    })
    const context = makeContext('requirements_manage_import')
    await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
        requirements: [
          { description: 'Systemet ska logga viktiga händelser.' },
        ],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
    })
    const createData = vi
      .mocked(createRequirementImportValidationSession)
      .mock.calls.at(-1)?.[1]
    if (!createData) throw new Error('Expected validation session data')
    const session = makeSessionRecord(createData)
    vi.mocked(
      getRequirementImportValidationSessionByTokenHash,
    ).mockResolvedValue(session)
    vi.mocked(listCategories).mockResolvedValue([
      { id: 3, nameEn: 'Supplier', nameSv: 'Leverantör' },
    ])

    const result = await workflow.manageImport(context, {
      operation: 'execute',
      validationToken: 'opaque-validation-token',
    })

    expect(result).toMatchObject({
      hasErrors: true,
      issues: [
        expect.objectContaining({
          code: 'import_reference_data_stale',
          path: '',
        }),
      ],
    })
    expect(logger.error).toHaveBeenCalledWith(
      'requirements.manage_import.validation_session_diagnostic',
      expect.objectContaining({
        consumed_row_count: 0,
        destination_id: 7,
        issue_codes: null,
        reason: 'reference_data_stale',
        row_count: 1,
        token_hash_prefix: expect.any(String),
      }),
    )
    expect(JSON.stringify(logger.error.mock.calls[0]?.[1])).not.toContain(
      'Systemet ska logga viktiga händelser.',
    )
    expect(createRequirementsBatchWithExecutor).not.toHaveBeenCalled()
  })

  it('re-checks the stored destination before MCP execute imports rows', async () => {
    const { db } = makeManageImportDb()
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: db as never,
      logger,
    })
    const context = makeContext('requirements_manage_import')
    await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
        requirements: [{ description: 'Systemet ska vara spårbart.' }],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
    })
    const createData = vi
      .mocked(createRequirementImportValidationSession)
      .mock.calls.at(-1)?.[1]
    if (!createData) throw new Error('Expected validation session data')
    const session = makeSessionRecord(createData)
    vi.mocked(
      getRequirementImportValidationSessionByTokenHash,
    ).mockResolvedValue(session)
    vi.mocked(getAreaById).mockResolvedValue(null)

    const result = await workflow.manageImport(context, {
      operation: 'execute',
      validationToken: 'opaque-validation-token',
    })

    expect(result).toMatchObject({
      hasErrors: true,
      issues: [
        expect.objectContaining({
          code: 'import_destination_invalid',
          path: '/destination',
        }),
      ],
    })
    expect(logger.error).toHaveBeenCalledWith(
      'requirements.manage_import.validation_session_diagnostic',
      expect.objectContaining({
        reason: 'destination_invalid',
        row_count: 1,
      }),
    )
    expect(createRequirementsBatchWithExecutor).not.toHaveBeenCalled()
  })

  it('executes a validated library import and stores the execution result in the same transaction', async () => {
    const { db, manager } = makeManageImportDb()
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: db as never,
    })
    const context = makeContext('requirements_manage_import')

    await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
        requirements: [
          { description: 'Systemet ska logga viktiga händelser.' },
        ],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
    })
    const createData = vi
      .mocked(createRequirementImportValidationSession)
      .mock.calls.at(-1)?.[1]
    if (!createData) throw new Error('Expected validation session data')
    const session = makeSessionRecord(createData)
    vi.mocked(
      getRequirementImportValidationSessionByTokenHash,
    ).mockResolvedValue(session)
    vi.mocked(createRequirementsBatchWithExecutor).mockResolvedValue([
      {
        requirement: {
          id: 101,
          requirementAreaId: 7,
          sequenceNumber: 1,
          uniqueId: 'TEST0001',
        },
        version: {
          id: 201,
          requirementId: 101,
          statusId: 1,
          versionNumber: 1,
        },
      },
    ] as never)

    const result = await workflow.manageImport(context, {
      operation: 'execute',
      validationToken: 'opaque-validation-token',
    })

    expect(result).toMatchObject({
      importedRows: [
        expect.objectContaining({
          kravId: 'TEST0001',
          uniqueId: 'TEST0001',
        }),
      ],
      summary: {
        importedCount: 1,
        notImportedCount: 0,
        totalRowCount: 1,
      },
    })
    expect(listCategories).toHaveBeenLastCalledWith(manager)
    expect(createRequirementsBatchWithExecutor).toHaveBeenCalledWith(
      manager,
      [
        expect.objectContaining({
          description: 'Systemet ska logga viktiga händelser.',
        }),
      ],
      expect.objectContaining({
        audit: expect.any(Function),
        batchAudit: expect.any(Function),
      }),
    )
    expect(
      updateRequirementImportValidationSessionExecutionResult,
    ).toHaveBeenCalledWith(
      manager,
      session.id,
      expect.stringContaining('TEST0001'),
      expect.any(Date),
    )
    expect(
      vi.mocked(createRequirementsBatchWithExecutor).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(updateRequirementImportValidationSessionExecutionResult).mock
        .invocationCallOrder[0],
    )
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

  it('reports archived proposed norm-reference matches as archived by key', async () => {
    const archivedNormReference: NormReferenceRow = {
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 910034,
      isArchived: true,
      issuer: 'National Electrical Manufacturers Association (NEMA)',
      name: 'Digital Imaging and Communications in Medicine Part 3',
      normReferenceId: 'DICOM-PS3.3',
      reference: 'DICOM PS3.3',
      type: 'Standard',
      updatedAt: '2026-01-01T00:00:00.000Z',
      uri: 'https://dicom.nema.org/medical/dicom/current/output/html/part03.html',
      version: null,
    }
    vi.mocked(listNormReferences).mockResolvedValue([archivedNormReference])
    const payload = requirementsImportPayloadSchema.parse({
      proposedNormReferences: [
        {
          issuer: 'National Electrical Manufacturers Association (NEMA)',
          key: 'DICOM-PS3.3',
          name: 'Digital Imaging and Communications in Medicine Part 3',
          normReferenceId: null,
          reference: 'DICOM PS3.3',
          type: 'Standard',
          uri: 'https://dicom.nema.org/medical/dicom/current/output/html/part03.html',
          version: null,
        },
      ],
      requirements: [
        {
          description: 'Leverantören ska bifoga DICOM Conformance Statement.',
          proposedNormReferenceKeys: ['DICOM-PS3.3'],
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
        key: 'DICOM-PS3.3',
        resolvedIsArchived: true,
        resolvedNormReferenceDbId: null,
        warnings: [
          expect.objectContaining({
            code: 'import_proposed_norm_reference_archived',
          }),
        ],
      }),
    ])
    expect(preview.rows[0]?.values.normReferenceIds).toEqual([])
    expect(preview.rows[0]?.warnings.map(item => item.code)).toContain(
      'import_proposed_norm_reference_archived',
    )
    expect(preview.rows[0]?.warnings.map(item => item.code)).not.toContain(
      'import_proposed_norm_reference_unresolved',
    )
  })

  it('builds the import instruction without EN DASH in JSON values', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const instructionEn = await workflow.buildImportInstruction('en')
    const instructionSv = await workflow.buildImportInstruction('sv')

    expect(instructionEn).toContain('Do not use U+2013 EN DASH in JSON values')
    expect(instructionSv).toContain('Använd inte U+2013 EN DASH i JSON-värden')
    expect(instructionEn).toContain(
      "Write free-text values, such as `description`, `acceptanceCriteria`, `verificationMethod`, and proposed norm references, in English unless the user's input explicitly requests another language.",
    )
    expect(instructionSv).toContain(
      'Skriv fria textvärden, till exempel `description`, `acceptanceCriteria`, `verificationMethod` och föreslagna normreferenser på svenska om inte användarens indata uttryckligen anger ett annat språk.',
    )
    expect(instructionEn).toContain(
      '- Choose `typeId` before `qualityCharacteristicId`:\n  - Use the functional type for required system behavior or capability',
    )
    expect(instructionSv).toContain(
      '- Välj `typeId` innan `qualityCharacteristicId`:\n  - Använd funktionell typ för krav på systembeteende eller förmåga',
    )
    expect(instructionEn).toContain(
      "Choose `qualityCharacteristicId` only from the selected type's `qualityCharacteristics`",
    )
    expect(instructionSv).toContain(
      'Välj bara `qualityCharacteristicId` från den valda typens `qualityCharacteristics`',
    )
    expect(instructionEn).toContain(
      'Use `acceptanceCriteria` for the conditions and fulfillment level that must be met',
    )
    expect(instructionSv).toContain(
      'Använd `acceptanceCriteria` för villkor och nivå av uppfyllelse som måste vara uppnådda',
    )
    expect(instructionEn).toContain(
      'Use ID fields from the reference data: `categoryId`, `typeId`, `qualityCharacteristicId`, `priorityLevelId`, and `requirementPackageIds`',
    )
    expect(instructionEn).toContain('## Conflicts')
    expect(instructionSv).toContain('## Konflikter')
    expect(instructionEn).toContain(
      "Follow the user's input for factual need, scope, requirement content, and factual values.",
    )
    expect(instructionSv).toContain(
      'Följ användarens indata för sakligt behov, omfattning, kravinnehåll och sakvärden.',
    )
    expect(instructionEn).toContain(
      'Follow JSON Schema for allowed fields, data types, required fields, and result format.',
    )
    expect(instructionSv).toContain(
      'Följ JSON Schema för tillåtna fält, datatyper, obligatoriska fält och resultatformat.',
    )
    expect(instructionEn).toContain(
      'Follow reference data for requirement structure, classification, IDs, and labels.',
    )
    expect(instructionSv).toContain(
      'Följ referensdata för kravstruktur, klassificering, ID:n och benämningar.',
    )
    expect(instructionEn).toContain(
      'Choose `priorityLevelId` from `priorityLevels[].id`; compare the requirement with `priorityLevels[].assessmentCriteria` and choose the best match',
    )
    expect(instructionSv).toContain(
      'Välj `priorityLevelId` från `priorityLevels[].id`; jämför kravet med `priorityLevels[].assessmentCriteria` och välj bästa matchning',
    )
    expect(instructionEn).toContain(
      'Return only a JSON object that follows the separate JSON Schema sent as the mandatory response format',
    )
    expect(instructionSv).toContain(
      'Returnera endast ett JSON-objekt som följer det separata JSON Schema som skickas som tvingande svarsformat',
    )
    expect(instructionEn).not.toContain('## JSON Schema')
    expect(instructionSv).not.toContain('## JSON Schema')
    expect(instructionEn).not.toContain('"$schema"')
    expect(instructionSv).not.toContain('"$schema"')
    expect(instructionEn).toContain(
      `Set the top-level \`schemaVersion\` field to \`${REQUIREMENTS_IMPORT_SCHEMA_VERSION}\``,
    )
    expect(instructionSv).toContain(
      `Sätt toppnivåfältet \`schemaVersion\` till \`${REQUIREMENTS_IMPORT_SCHEMA_VERSION}\``,
    )
    expect(instructionSv).toContain(
      'Använd `normReferenceIds` med värden från `normReferences[].normReferenceId`',
    )
    expect(instructionEn).toContain(
      'Set `verifiable` to `true` when the requirement version has objective conditions that can be checked; then provide `verificationMethod`',
    )
  })

  it('keeps requirement package guidance in the shared import instruction', async () => {
    vi.mocked(listRequirementPackages).mockResolvedValue([
      {
        coAuthors: [],
        createdAt: '2026-06-01T00:00:00.000Z',
        id: 3,
        isArchived: false,
        leadDisplayName: 'Paketansvarig',
        leadEmail: null,
        leadHsaId: 'SE5560000001-pkg1',
        name: 'Integration med andra system',
        purposeAndScope: 'Integrationskrav.',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ])
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const instruction = await workflow.buildImportInstruction('en')
    const referenceData = extractReferenceData(instruction)

    expect(instruction).toContain(
      "Choose `requirementPackageIds` from the reference data by comparing the requirement's need, requirement text, and acceptance criteria with `requirementPackages[].purposeAndScope`",
    )
    expect(instruction).toContain(
      'Omit `requirementPackageIds` or use `[]` when no requirement package clearly fits; weak keyword matches against package names are not enough.',
    )
    expect(instruction).toContain(
      'When importing specification-local requirements, `requirementPackageIds` is ignored.',
    )
    expect(referenceData.requirementPackages).toEqual([
      {
        id: 3,
        leadDisplayName: 'Paketansvarig',
        name: 'Integration med andra system',
        purposeAndScope: 'Integrationskrav.',
      },
    ])
  })

  it('ignores requirement package ids for specification-local import execution', async () => {
    vi.mocked(listRequirementPackages).mockResolvedValue([
      {
        coAuthors: [],
        createdAt: '2026-06-01T00:00:00.000Z',
        id: 3,
        isArchived: false,
        leadDisplayName: 'Paketansvarig',
        leadEmail: null,
        leadHsaId: 'SE5560000001-pkg1',
        name: 'Integration med andra system',
        purposeAndScope: 'Integrationskrav.',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ])
    vi.mocked(getSpecificationBySlug).mockResolvedValue({ id: 42 } as never)
    vi.mocked(createSpecificationLocalRequirementsBatch).mockResolvedValue([
      { id: 101, uniqueId: 'REQ0001' },
    ] as never)
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })
    const payload = requirementsImportPayloadSchema.parse({
      requirements: [
        {
          description: 'Kravunderlagslokalt krav.',
          requirementPackageIds: [3],
        },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })

    const preview = await workflow.previewSpecificationLocalImport(
      {} as never,
      {
        locale: 'sv',
        payload,
        specificationIdOrSlug: 'upphandling',
      },
    )
    const row = preview.rows[0]
    expect(row).toBeDefined()
    if (!row) throw new Error('Expected preview row')
    expect(row.values.requirementPackageIds).toEqual([])
    expect(row.infos).toEqual([
      expect.objectContaining({
        code: 'import_requirement_packages_ignored_for_specification_local',
        field: 'requirementPackageIds',
        level: 'info',
      }),
    ])
    expect(row.warnings).toEqual([])
    const result = await workflow.executeSpecificationLocalImport({} as never, {
      locale: 'sv',
      previewToken: preview.previewToken,
      rows: [
        {
          ...row.values,
          requirementPackageIds: [3],
          reviewRowId: row.reviewRowId,
          sourceIndex: row.sourceIndex,
        },
      ],
      specificationIdOrSlug: 'upphandling',
    })

    const mutationRows = vi.mocked(createSpecificationLocalRequirementsBatch)
      .mock.calls[0]?.[2]
    expect(mutationRows?.[0]).not.toHaveProperty('requirementPackageIds')
    expect(result.createdRows[0]?.requirementPackageIds).toEqual([])
    expect(result.createdRows[0]?.requirementPackageNames).toEqual([])
  })

  it('rejects library execute rows whose quality characteristic no longer matches the selected type', async () => {
    vi.mocked(listTypes).mockResolvedValue([
      {
        id: 1,
        nameEn: 'Functional',
        nameSv: 'Funktionellt',
        qualityCharacteristics: [
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
    const payload = requirementsImportPayloadSchema.parse({
      requirements: [
        {
          description: 'Systemet ska stödja grundläggande inloggning.',
          qualityCharacteristicId: 11,
          verifiable: true,
          typeId: 1,
          verificationMethod: 'Test',
        },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })
    const preview = await workflow.previewLibraryImport({} as never, {
      areaId: 7,
      locale: 'sv',
      payload,
    })
    const row = preview.rows[0]
    expect(row).toBeDefined()
    if (!row) throw new Error('Expected preview row')

    await expect(
      workflow.executeLibraryImport({} as never, {
        areaId: 7,
        locale: 'sv',
        previewToken: preview.previewToken,
        rows: [
          {
            ...row.values,
            reviewRowId: row.reviewRowId,
            sourceIndex: row.sourceIndex,
            typeId: 2,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'qualityCharacteristicId must belong to the selected typeId',
    })
    expect(createRequirementsBatch).not.toHaveBeenCalled()
  })

  it('rejects library execute rows that are verifiable without verification method', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })
    const payload = requirementsImportPayloadSchema.parse({
      requirements: [
        {
          description: 'Systemet ska logga viktiga händelser.',
          verifiable: true,
          verificationMethod: 'Inspection',
        },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })
    const preview = await workflow.previewLibraryImport({} as never, {
      areaId: 7,
      locale: 'sv',
      payload,
    })
    const row = preview.rows[0]
    expect(row).toBeDefined()
    if (!row) throw new Error('Expected preview row')

    await expect(
      workflow.executeLibraryImport({} as never, {
        areaId: 7,
        locale: 'sv',
        previewToken: preview.previewToken,
        rows: [
          {
            ...row.values,
            reviewRowId: row.reviewRowId,
            sourceIndex: row.sourceIndex,
            verificationMethod: null,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'verificationMethod is required when verifiable is true',
    })
    expect(createRequirementsBatch).not.toHaveBeenCalled()
  })

  it('nests selectable quality characteristics under their allowed type in import instruction reference data', async () => {
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
      await workflow.buildImportInstruction('en'),
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

  it('localizes import instruction taxonomy reference names to the requested language', async () => {
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
      await workflow.buildImportInstruction('sv'),
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

  it('returns localized taxonomy labels in preview rows', async () => {
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
            chapterId: '3.2.1',
            id: 21,
            nameEn: 'Time behaviour',
            nameSv: 'Tidsbeteende',
            parentId: null,
            requirementTypeId: 2,
          },
        ],
      },
    ])
    const payload = requirementsImportPayloadSchema.parse({
      requirements: [
        {
          categoryId: 3,
          description: 'Svarstiden ska vara kort.',
          priorityLevelId: 4,
          qualityCharacteristicId: 21,
          typeId: 2,
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

    expect(preview.rows[0]?.labels).toEqual({
      category: 'Leverantörskrav',
      priorityLevel: 'P4 - Hög',
      qualityCharacteristic: 'Tidsbeteende',
      type: 'Icke-funktionellt',
    })
  })
})
