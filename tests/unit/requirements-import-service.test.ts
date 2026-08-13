import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_APPLICATION_SETTINGS } from '@/lib/application-settings'
import {
  getAiGenerationSettings,
  getCachedMcpRuntimeSettings,
} from '@/lib/dal/ai-settings'
import {
  getApplicationSettings,
  getApplicationSettingsForUpdate,
} from '@/lib/dal/application-settings'
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
  listSpecificationNeedsReferences,
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

const auditState = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: auditState.getRequestSqlServerDataSource,
}))

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
  getAiGenerationSettings: vi.fn(),
  getCachedMcpRuntimeSettings: vi.fn(),
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: vi.fn(),
  getApplicationSettingsForUpdate: vi.fn(),
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
  listSpecificationsForActor: vi.fn(),
  listSpecificationNeedsReferences: vi.fn(),
}))

function extractReferenceData(instruction: string) {
  const referenceDataJson = instruction.match(
    /## Reference Data\n\n```json\n([\s\S]*?)\n```/,
  )?.[1]
  expect(referenceDataJson).toBeTruthy()
  return JSON.parse(referenceDataJson ?? '{}') as {
    categories: Array<{ id: number; name: string }>
    needsReferences?: Array<{
      description: string | null
      id: number
      text: string
    }>
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
    auditState.query.mockReset().mockResolvedValue([])
    auditState.transaction
      .mockReset()
      .mockImplementation(
        async (
          callback: (manager: { query: typeof auditState.query }) => unknown,
        ) => callback({ query: auditState.query }),
      )
    auditState.getRequestSqlServerDataSource.mockReset().mockResolvedValue({
      transaction: auditState.transaction,
    })
    vi.mocked(listCategories).mockResolvedValue([])
    vi.mocked(listRequirementPackages).mockResolvedValue([])
    vi.mocked(listPriorityLevels).mockResolvedValue([])
    vi.mocked(listTypes).mockResolvedValue([])
    vi.mocked(listNormReferences).mockResolvedValue([])
    vi.mocked(listSpecificationNeedsReferences).mockResolvedValue([])
    vi.mocked(getCachedMcpRuntimeSettings).mockResolvedValue({
      mcpImportMaxRows: 500,
      mcpImportValidationTtlMinutes: 60,
      mcpMaxRequestBytes: 10 * 1024 * 1024,
    })
    vi.mocked(getAiGenerationSettings).mockResolvedValue({
      aiSafetyForensicLoggingEnabled: true,
      aiSafetyRuleCacheTtlSeconds: 600,
      mcpImportMaxRows: 500,
      mcpImportValidationTtlMinutes: 60,
      mcpMaxRequestBytes: 10 * 1024 * 1024,
      requirementGenerationEnabled: true,
    })
    vi.mocked(getApplicationSettings).mockResolvedValue(
      DEFAULT_APPLICATION_SETTINGS,
    )
    vi.mocked(getApplicationSettingsForUpdate).mockResolvedValue(
      DEFAULT_APPLICATION_SETTINGS,
    )
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

  it('rejects REST preview content above the current application budget', async () => {
    vi.mocked(getApplicationSettings).mockResolvedValueOnce({
      ...DEFAULT_APPLICATION_SETTINGS,
      requirementImportMaxRows: 1,
    })
    const workflow = createRequirementsImportWorkflow({
      authorization: { assertAuthorized: vi.fn() },
      db: {} as never,
    })
    const payload = requirementsImportPayloadSchema.parse({
      requirements: [
        { description: 'First requirement.' },
        { description: 'Second requirement.' },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })
    const referenceReadsBefore = vi.mocked(listCategories).mock.calls.length

    await expect(
      workflow.previewLibraryImport({} as never, {
        areaId: 7,
        locale: 'en',
        payload,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: {
        actual: 2,
        limit: 1,
        path: '/requirements',
        reason: 'import_row_count_cap_exceeded',
      },
    })
    expect(listCategories).toHaveBeenCalledTimes(referenceReadsBefore)
  })

  it('ignores needs-reference fields for library import preview', async () => {
    const payload = requirementsImportPayloadSchema.parse({
      proposedNeedsReferences: [
        {
          key: 'gdpr-need',
          text: 'Personuppgiftsbehandling behöver tekniskt skydd',
        },
      ],
      requirements: [
        {
          description: 'Systemet ska skydda personuppgifter.',
          needsReferenceId: 12,
          needsReferenceKey: 'gdpr-need',
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

    expect(preview.needsReferenceProposals).toEqual([])
    expect(preview.rows[0]).toMatchObject({
      infos: [
        expect.objectContaining({
          code: 'import_needs_references_ignored_for_library',
          field: 'needsReferenceId',
          level: 'info',
        }),
      ],
      values: { needsReferenceId: null },
    })
  })

  it('resolves proposed needs references for specification-local import preview', async () => {
    vi.mocked(getSpecificationById).mockResolvedValue({ id: 8 } as never)
    vi.mocked(listSpecificationNeedsReferences).mockResolvedValue([
      {
        createdAt: '2026-07-05T10:00:00.000Z',
        description: null,
        id: 12,
        libraryItemCount: 0,
        linkedItemCount: 0,
        specificationLocalRequirementCount: 0,
        text: 'Personuppgiftsbehandling behöver tekniskt skydd',
        updatedAt: '2026-07-05T10:00:00.000Z',
      },
    ])
    const payload = requirementsImportPayloadSchema.parse({
      proposedNeedsReferences: [
        {
          key: 'gdpr-need',
          text: 'Personuppgiftsbehandling behöver tekniskt skydd',
        },
      ],
      requirements: [
        {
          description: 'Systemet ska skydda personuppgifter.',
          needsReferenceKey: 'gdpr-need',
        },
        {
          description: 'Systemet ska logga åtkomst.',
          needsReferenceId: 12,
          needsReferenceKey: 'unknown-need',
        },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const preview = await workflow.previewSpecificationLocalImport(
      {} as never,
      {
        locale: 'sv',
        payload,
        specificationId: 8,
      },
    )

    expect(preview.needsReferenceProposals).toEqual([
      expect.objectContaining({
        key: 'gdpr-need',
        referencedCount: 1,
        resolvedNeedsReferenceId: 12,
      }),
    ])
    expect(preview.rows[0]).toMatchObject({
      errors: [],
      proposedNeedsReferenceKey: 'gdpr-need',
      values: { needsReferenceId: 12 },
    })
    expect(preview.rows[1]).toMatchObject({
      errors: [],
      infos: [
        expect.objectContaining({
          code: 'import_needs_reference_key_ignored_for_id',
          originalValue: 'unknown-need',
        }),
      ],
      proposedNeedsReferenceKey: 'unknown-need',
      values: { needsReferenceId: 12 },
    })
  })

  it('blocks unresolved or invalid needs references for specification-local import preview', async () => {
    vi.mocked(getSpecificationById).mockResolvedValue({ id: 8 } as never)
    vi.mocked(listSpecificationNeedsReferences).mockResolvedValue([
      {
        createdAt: '2026-07-05T10:00:00.000Z',
        description: null,
        id: 12,
        libraryItemCount: 0,
        linkedItemCount: 0,
        specificationLocalRequirementCount: 0,
        text: 'Befintlig behovsreferens',
        updatedAt: '2026-07-05T10:00:00.000Z',
      },
    ])
    const payload = requirementsImportPayloadSchema.parse({
      proposedNeedsReferences: [
        {
          key: 'new-need',
          text: 'Ny behovsreferens',
        },
      ],
      requirements: [
        {
          description: 'Systemet ska skydda personuppgifter.',
          needsReferenceKey: 'new-need',
        },
        {
          description: 'Systemet ska logga åtkomst.',
          needsReferenceId: 99,
        },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const preview = await workflow.previewSpecificationLocalImport(
      {} as never,
      {
        locale: 'sv',
        payload,
        specificationId: 8,
      },
    )

    expect(preview.rows[0]?.errors).toEqual([
      expect.objectContaining({
        code: 'import_needs_reference_unresolved',
        originalValue: 'new-need',
      }),
    ])
    expect(preview.rows[1]?.errors).toEqual([
      expect.objectContaining({
        code: 'import_needs_reference_id_invalid',
        originalValue: '99',
      }),
    ])
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
      destination: {
        kind: 'requirements_library',
      },
      locale: 'en',
    })

    expect(result.importInstruction).toContain(
      '# Create JSON for requirements import',
    )
    expect(result.importInstruction).toContain(
      'at most 500 requirements, 500 proposed norm references',
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
      assertAuthorized: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(denied),
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

    expect(authorization.assertAuthorized).toHaveBeenNthCalledWith(
      2,
      {
        areaId: 987_654,
        kind: 'manage_requirement',
        operation: 'create',
      },
      context,
    )
    expect(auditState.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO action_audit_events'),
      expect.arrayContaining([
        'requirement.create.denied',
        'denied',
        'policy_missing',
      ]),
    )
    expect(getAreaById).not.toHaveBeenCalled()
  })

  it('fails closed when MCP destination-denial evidence cannot persist', async () => {
    const denied = forbiddenError('Blocked by destination policy', {
      reason: 'area_author_required',
    })
    const authorization = {
      assertAuthorized: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(denied),
    }
    auditState.query.mockRejectedValueOnce(
      new Error('DATABASE_URL password=supersecret rejected the audit insert'),
    )
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: makeManageImportDb().db as never,
    })
    const context = makeContext('requirements_manage_import')

    await expect(
      workflow.manageImport(context, {
        destination: { areaId: 7, kind: 'requirements_library' },
        operation: 'validate',
        payload: {
          requirements: [{ description: 'Systemet ska logga händelser.' }],
          schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
        },
      }),
    ).rejects.toMatchObject({
      code: 'internal',
      message: 'An internal error occurred',
      status: 500,
    })

    expect(authorization.assertAuthorized).toHaveBeenNthCalledWith(
      2,
      {
        areaId: 7,
        kind: 'manage_requirement',
        operation: 'create',
      },
      context,
    )
    expect(auditState.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO action_audit_events'),
      expect.arrayContaining([
        'requirement.create.denied',
        'denied',
        'area_author_required',
      ]),
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

    vi.mocked(getCachedMcpRuntimeSettings).mockResolvedValue({
      mcpImportMaxRows: 1,
      mcpImportValidationTtlMinutes: 60,
      mcpMaxRequestBytes: 10 * 1024 * 1024,
    })
    const exactBoundary = await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
        requirements: [{ description: 'One' }],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
    })
    expect(exactBoundary).toMatchObject({ hasErrors: false })
    expect(createRequirementImportValidationSession).toHaveBeenCalledOnce()
    vi.mocked(createRequirementImportValidationSession).mockClear()

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
    expect(createRequirementImportValidationSession).not.toHaveBeenCalled()

    const payloadCap = await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
        padding: 'A'.repeat(8 * 1024 * 1024),
        requirements: [{ description: 'Requirement' }],
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

  it('keeps unused proposal warnings scoped to the proposal item path', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: makeManageImportDb().db as never,
    })
    const context = makeContext('requirements_manage_import')

    const libraryResult = await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
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
        requirements: [{ description: 'Systemet ska logga händelser.' }],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
    })

    if (!('issues' in libraryResult)) {
      throw new Error('Expected validation issues')
    }
    expect(libraryResult.issues).toContainEqual(
      expect.objectContaining({
        code: 'import_proposed_norm_reference_unused',
        path: '/proposedNormReferences/0',
        severity: 'warning',
      }),
    )

    vi.mocked(getSpecificationById).mockResolvedValue({ id: 8 } as never)
    const specificationResult = await workflow.manageImport(context, {
      destination: { kind: 'requirements_specification', specificationId: 8 },
      operation: 'validate',
      payload: {
        proposedNeedsReferences: [
          {
            key: 'gdpr-need',
            text: 'Personuppgiftsbehandling behöver tekniskt skydd',
          },
        ],
        requirements: [{ description: 'Systemet ska logga händelser.' }],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
    })

    if (!('issues' in specificationResult)) {
      throw new Error('Expected validation issues')
    }
    expect(specificationResult.issues).toContainEqual(
      expect.objectContaining({
        code: 'import_proposed_needs_reference_unused',
        path: '/proposedNeedsReferences/0',
        severity: 'warning',
      }),
    )
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
      'needsReferences',
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
    expect(validation.rows?.[0]?.resolvedRow).toHaveProperty(
      'needsReferenceId',
      null,
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

  it('rejects MCP execute before reference or mutation work when the budget changed', async () => {
    const { db } = makeManageImportDb()
    const workflow = createRequirementsImportWorkflow({
      authorization: { assertAuthorized: vi.fn() },
      db: db as never,
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
    vi.mocked(
      getRequirementImportValidationSessionByTokenHash,
    ).mockResolvedValue(makeSessionRecord(createData))
    const referenceReadsBeforeExecute =
      vi.mocked(listCategories).mock.calls.length
    vi.mocked(getApplicationSettings).mockResolvedValue({
      ...DEFAULT_APPLICATION_SETTINGS,
      requirementImportMaxRows: 499,
    })

    const result = await workflow.manageImport(context, {
      operation: 'execute',
      validationToken: 'opaque-validation-token',
    })

    expect(result).toMatchObject({
      hasErrors: true,
      issues: [expect.objectContaining({ code: 'import_budget_stale' })],
    })
    expect(listCategories).toHaveBeenCalledTimes(referenceReadsBeforeExecute)
    expect(createRequirementsBatchWithExecutor).not.toHaveBeenCalled()
  })

  it('rejects MCP execute when the budget changes after the transaction lock is acquired', async () => {
    const { db } = makeManageImportDb()
    const workflow = createRequirementsImportWorkflow({
      authorization: { assertAuthorized: vi.fn() },
      db: db as never,
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
    vi.mocked(getApplicationSettings)
      .mockResolvedValueOnce(DEFAULT_APPLICATION_SETTINGS)
      .mockResolvedValueOnce({
        ...DEFAULT_APPLICATION_SETTINGS,
        requirementImportMaxRows: 499,
      })

    const result = await workflow.manageImport(context, {
      operation: 'execute',
      validationToken: 'opaque-validation-token',
    })

    expect(result).toMatchObject({
      hasErrors: true,
      issues: [expect.objectContaining({ code: 'import_budget_stale' })],
    })
    expect(createRequirementsBatchWithExecutor).not.toHaveBeenCalled()
  })

  it('fails closed and logs a diagnostic when the locked MCP session disappears', async () => {
    const { db } = makeManageImportDb()
    const logger = { error: vi.fn(), info: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization: { assertAuthorized: vi.fn() },
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
    vi.mocked(getRequirementImportValidationSessionByTokenHash)
      .mockResolvedValueOnce(makeSessionRecord(createData))
      .mockResolvedValueOnce(null)
    vi.mocked(
      purgeExpiredRequirementImportValidationSessions,
    ).mockRejectedValueOnce(new Error('cleanup unavailable'))

    await expect(
      workflow.manageImport(context, {
        operation: 'execute',
        validationToken: 'opaque-validation-token',
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      details: { reason: 'validation_session_not_found_or_expired' },
    })

    expect(logger.error).toHaveBeenCalledWith(
      'requirements.manage_import.validation_session_diagnostic',
      expect.objectContaining({
        error_name: 'RequirementsServiceError',
        reason: 'execution_failed',
      }),
    )
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
    const createdResult = {
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
    }
    vi.mocked(createRequirementsBatchWithExecutor).mockImplementationOnce(
      async (executor, _rows, options) => {
        await options?.audit?.(executor, createdResult as never, 0)
        await options?.batchAudit?.(executor, [createdResult] as never)
        return [createdResult] as never
      },
    )

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

  it('does not rewrite an execution result when every validated row was already imported', async () => {
    const { db } = makeManageImportDb()
    const workflow = createRequirementsImportWorkflow({
      authorization: { assertAuthorized: vi.fn() },
      db: db as never,
    })
    const context = makeContext('requirements_manage_import')

    await workflow.manageImport(context, {
      destination: { areaId: 7, kind: 'requirements_library' },
      operation: 'validate',
      payload: {
        requirements: [{ description: 'Systemet ska redan vara importerat.' }],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
    })
    const createData = vi
      .mocked(createRequirementImportValidationSession)
      .mock.calls.at(-1)?.[1]
    if (!createData) throw new Error('Expected validation session data')
    const session = makeSessionRecord({
      ...createData,
      executionResultJson: JSON.stringify({
        importedRows: [
          {
            importedAt: '2026-08-05T08:00:00.000Z',
            kravId: 'TEST0001',
            reviewRowId: 'row-0',
            sourceIndex: 0,
            uniqueId: 'TEST0001',
          },
        ],
        schemaVersion: 'mcp-requirement-import-execution.v1',
      }),
    })
    vi.mocked(
      getRequirementImportValidationSessionByTokenHash,
    ).mockResolvedValue(session)
    vi.mocked(
      updateRequirementImportValidationSessionExecutionResult,
    ).mockClear()
    vi.mocked(createRequirementsBatchWithExecutor).mockClear()

    const result = await workflow.manageImport(context, {
      operation: 'execute',
      validationToken: 'opaque-validation-token',
    })

    expect(result).toMatchObject({
      importedRows: [],
      notImportedRows: [],
      summary: {
        importedCount: 0,
        notImportedCount: 0,
        totalRowCount: 1,
      },
    })
    expect(createRequirementsBatchWithExecutor).not.toHaveBeenCalled()
    expect(
      updateRequirementImportValidationSessionExecutionResult,
    ).not.toHaveBeenCalled()
  })

  it('executes a validated specification-local MCP import in the locked transaction', async () => {
    vi.mocked(getSpecificationById).mockResolvedValue({ id: 8 } as never)
    const { db, manager } = makeManageImportDb()
    const workflow = createRequirementsImportWorkflow({
      authorization: { assertAuthorized: vi.fn() },
      db: db as never,
    })
    const context = makeContext('requirements_manage_import')

    await workflow.manageImport(context, {
      destination: { kind: 'requirements_specification', specificationId: 8 },
      operation: 'validate',
      payload: {
        requirements: [{ description: 'Det lokala kravet ska loggas.' }],
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
    vi.mocked(
      createSpecificationLocalRequirementsBatchWithExecutor,
    ).mockResolvedValue([{ id: 301, uniqueId: 'LOCAL-301' }] as never)

    const result = await workflow.manageImport(context, {
      operation: 'execute',
      validationToken: 'opaque-validation-token',
    })

    expect(result).toMatchObject({
      importedRows: [
        expect.objectContaining({
          localKravId: 'LOCAL-301',
          uniqueId: 'LOCAL-301',
        }),
      ],
      summary: {
        importedCount: 1,
        notImportedCount: 0,
        totalRowCount: 1,
      },
    })
    expect(
      createSpecificationLocalRequirementsBatchWithExecutor,
    ).toHaveBeenCalledWith(manager, 8, [
      expect.objectContaining({ description: 'Det lokala kravet ska loggas.' }),
    ])
    expect(
      updateRequirementImportValidationSessionExecutionResult,
    ).toHaveBeenCalledWith(
      manager,
      session.id,
      expect.stringContaining('LOCAL-301'),
      expect.any(Date),
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

    const instructionEn = await workflow.buildImportInstruction('en', {
      kind: 'requirements_library',
    })
    const instructionSv = await workflow.buildImportInstruction('sv', {
      kind: 'requirements_library',
    })

    expect(instructionEn).toContain('Do not use U+2013 EN DASH in JSON values')
    expect(instructionSv).toContain('Använd inte U+2013 EN DASH i JSON-värden')
    expect(instructionEn).toContain(
      "Write free-text values, such as `description`, `acceptanceCriteria`, `verificationMethod`, proposed norm references, and proposed needs references, in English unless the user's input explicitly requests another language.",
    )
    expect(instructionSv).toContain(
      'Skriv fria textvärden, till exempel `description`, `acceptanceCriteria`, `verificationMethod`, föreslagna normreferenser och föreslagna behovsreferenser på svenska om inte användarens indata uttryckligen anger ett annat språk.',
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

    const instruction = await workflow.buildImportInstruction('en', {
      kind: 'requirements_library',
    })
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

  it('adds needs-reference guidance and reference data for specification import instructions', async () => {
    vi.mocked(listSpecificationNeedsReferences).mockResolvedValue([
      {
        createdAt: '2026-07-05T10:00:00.000Z',
        description: 'Stödjer införande av GDPR artikel 32.',
        id: 12,
        libraryItemCount: 1,
        linkedItemCount: 1,
        specificationLocalRequirementCount: 0,
        text: 'Personuppgiftsbehandling behöver tekniskt skydd',
        updatedAt: '2026-07-05T10:00:00.000Z',
      },
    ])
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const instruction = await workflow.buildImportInstruction('sv', {
      kind: 'requirements_specification',
      specificationId: 8,
    })
    const referenceData = extractReferenceData(instruction)

    expect(instruction).toContain(
      'Använd `needsReferenceId` med värden från `needsReferences[].id` bara när kravet har en tydlig saklig matchning',
    )
    expect(instruction).toContain('Föreslå ett fåtal `proposedNeedsReferences`')
    expect(instruction).toContain('Skapa inte en behovsreferens per kravrad.')
    expect(instruction).toContain(
      'Använd `proposedNeedsReferences[].text` som en kort återanvändbar behovsrubrik',
    )
    expect(instruction).toContain(
      'utelämna fälten när kopplingen vore en gissning',
    )
    expect(instruction).toContain(
      'Hitta inte på affärsmål, externa källor, kundnamn eller ärendenummer.',
    )
    expect(instruction).toContain(
      'Beskriv behovsreferenser utan namn eller andra uppgifter som identifierar en levande person.',
    )
    expect(instruction).toContain(
      'Om både `needsReferenceId` och `needsReferenceKey` anges på samma rad används `needsReferenceId`',
    )
    expect(referenceData.needsReferences).toEqual([
      {
        description: 'Stödjer införande av GDPR artikel 32.',
        id: 12,
        text: 'Personuppgiftsbehandling behöver tekniskt skydd',
      },
    ])
    expect(listSpecificationNeedsReferences).toHaveBeenCalledWith({}, 8)
  })

  it('includes an empty needsReferences array for specification import instructions without needs references', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const instruction = await workflow.buildImportInstruction('sv', {
      kind: 'requirements_specification',
      specificationId: 8,
    })
    const referenceData = extractReferenceData(instruction)

    expect(referenceData).toHaveProperty('needsReferences')
    expect(referenceData.needsReferences).toEqual([])
    expect(listSpecificationNeedsReferences).toHaveBeenCalledWith({}, 8)
  })

  it('omits needs-reference reference data for library import instructions', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })

    const instruction = await workflow.buildImportInstruction('en', {
      kind: 'requirements_library',
    })
    const referenceData = extractReferenceData(instruction)

    expect(instruction).toContain(
      'Do not produce needs references: do not set `needsReferenceId` or `needsReferenceKey`, and return `proposedNeedsReferences` as an empty array.',
    )
    expect(instruction).not.toContain(
      'Propose a small number of `proposedNeedsReferences`',
    )
    expect(referenceData).not.toHaveProperty('needsReferences')
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
    vi.mocked(getSpecificationById).mockResolvedValue({ id: 42 } as never)
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
        specificationId: 7,
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
      specificationId: 7,
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
      await workflow.buildImportInstruction('en', {
        kind: 'requirements_library',
      }),
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
      await workflow.buildImportInstruction('sv', {
        kind: 'requirements_library',
      }),
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
      priorityLevel: 'P4 – Hög',
      qualityCharacteristic: 'Tidsbeteende',
      type: 'Icke-funktionellt',
    })
    expect(preview.rows[0]?.resolvedPriorityLevel).toEqual({
      code: 'P4',
      color: '#f97316',
      iconName: 'AlertCircle',
      name: 'Hög',
    })
  })

  it('lists and searches authorized import destinations across both kinds', async () => {
    vi.mocked(listSpecificationsForActor).mockResolvedValue([
      {
        id: 9,
        name: 'Zulu procurement',
        specificationCode: 'SPEC-009',
      },
      {
        id: 3,
        name: 'Alpha procurement',
        specificationCode: 'SPEC-003',
      },
    ] as never)
    vi.mocked(listAreasActorCanAuthor).mockResolvedValue([
      {
        id: 7,
        name: 'Clinical systems',
        prefix: 'Clinical',
      },
      {
        id: 8,
        name: 'Administrative systems',
        prefix: 'ADMIN',
      },
    ] as never)
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })
    const context = makeContext('requirements_manage_import')

    const all = await workflow.manageImport(context, {
      operation: 'list_destinations',
    })
    expect(all).toMatchObject({
      result: [
        { name: 'Alpha procurement', specificationCode: 'SPEC-003' },
        { name: 'Zulu procurement', specificationCode: 'SPEC-009' },
        { name: 'Administrative systems', prefix: 'ADMIN' },
        { name: 'Clinical systems', prefix: 'Clinical' },
      ],
    })

    const libraries = await workflow.manageImport(context, {
      kind: 'requirements_library',
      operation: 'list_destinations',
    })
    expect(libraries).toMatchObject({
      result: [
        { areaId: 8, kind: 'requirements_library' },
        { areaId: 7, kind: 'requirements_library' },
      ],
    })

    const specificationSearch = await workflow.manageImport(context, {
      kind: 'requirements_specification',
      operation: 'search_destinations',
      search: 'SPEC-009',
    })
    expect(specificationSearch).toMatchObject({
      result: [
        {
          match: expect.any(Object),
          specificationId: 9,
        },
      ],
    })

    const areaSearch = await workflow.manageImport(context, {
      operation: 'search_destinations',
      search: 'clinical',
    })
    expect(areaSearch).toMatchObject({
      result: [{ areaId: 7, match: expect.any(Object) }],
    })

    await expect(
      workflow.manageImport(context, {
        operation: 'search_destinations',
        search: '   ',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('lists destinations with admin-wide visibility', async () => {
    vi.mocked(listSpecificationsForActor).mockResolvedValue([])
    vi.mocked(listAreasActorCanAuthor).mockResolvedValue([])
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })
    const context = makeContext('requirements_manage_import')
    context.actor.roles = ['Admin']

    await workflow.manageImport(context, { operation: 'list_destinations' })

    expect(listSpecificationsForActor).toHaveBeenCalledWith(
      {},
      {
        actorHsaId: context.actor.hsaId,
        canReadAll: true,
      },
    )
    expect(listAreasActorCanAuthor).toHaveBeenCalledWith(
      {},
      context.actor.hsaId,
      true,
    )
  })

  it('executes a successful library import and invokes row and batch audits', async () => {
    vi.mocked(listCategories).mockResolvedValue([
      { id: 1, nameEn: 'Security', nameSv: 'Säkerhet' },
    ])
    vi.mocked(listPriorityLevels).mockResolvedValue([
      {
        assessmentCriteriaEn: 'High',
        assessmentCriteriaSv: 'Hög',
        code: 'P4',
        color: '#ef4444',
        descriptionEn: 'High',
        descriptionSv: 'Hög',
        iconName: 'AlertCircle',
        id: 4,
        nameEn: 'High',
        nameSv: 'Hög',
        sortOrder: 1,
      },
    ])
    vi.mocked(listTypes).mockResolvedValue([
      {
        id: 10,
        nameEn: 'Functional',
        nameSv: 'Funktionellt',
        qualityCharacteristics: [
          {
            chapterId: '1',
            id: 101,
            nameEn: 'Completeness',
            nameSv: 'Fullständighet',
            parentId: null,
            requirementTypeId: 10,
          },
        ],
      },
    ])
    vi.mocked(listRequirementPackages).mockResolvedValue([
      {
        coAuthors: [],
        createdAt: '2026-08-01T00:00:00.000Z',
        id: 5,
        isArchived: false,
        leadDisplayName: 'Package lead',
        leadEmail: null,
        leadHsaId: 'SE5560000001-package',
        name: 'Security package',
        purposeAndScope: 'Security scope',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ])
    vi.mocked(listNormReferences).mockResolvedValue([
      {
        createdAt: '2026-08-01T00:00:00.000Z',
        id: 30,
        isArchived: false,
        issuer: 'ISO',
        name: 'Active',
        normReferenceId: 'ISO-ACTIVE',
        reference: 'ISO A',
        type: 'standard',
        updatedAt: '2026-08-01T00:00:00.000Z',
        uri: null,
        version: null,
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
          acceptanceCriteria: '  Accepted after inspection  ',
          categoryId: 1,
          description: '  Systemet ska logga händelser.  ',
          normReferenceIds: ['ISO-ACTIVE'],
          priorityLevelId: 4,
          qualityCharacteristicId: 101,
          requirementPackageIds: [5],
          typeId: 10,
          verifiable: true,
          verificationMethod: '  Inspection  ',
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
    if (!row) throw new Error('Expected preview row')
    const createdResult = {
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
    }
    vi.mocked(createRequirementsBatch).mockImplementationOnce(
      async (_db, _rows, options) => {
        const executor = { query: vi.fn().mockResolvedValue([]) }
        await options?.beforeWrite?.(executor as never)
        await options?.audit?.(executor as never, createdResult as never, 0)
        await options?.batchAudit?.(executor as never, [createdResult] as never)
        return [createdResult] as never
      },
    )

    const result = await workflow.executeLibraryImport(makeContext('rest'), {
      areaId: 7,
      locale: 'sv',
      previewToken: preview.previewToken,
      rows: [
        {
          ...row.values,
          reviewRowId: row.reviewRowId,
          sourceIndex: row.sourceIndex,
        },
      ],
    })

    expect(result).toMatchObject({
      createdRows: [{ createdVisibleId: 'TEST0001' }],
      mode: 'library',
      summary: { createdCount: 1 },
    })
    expect(createRequirementsBatch).toHaveBeenCalledWith(
      {},
      [
        expect.objectContaining({
          acceptanceCriteria: 'Accepted after inspection',
          description: 'Systemet ska logga händelser.',
          normReferenceIds: [30],
          requirementPackageIds: [5],
          verificationMethod: 'Inspection',
        }),
      ],
      expect.objectContaining({
        audit: expect.any(Function),
        batchAudit: expect.any(Function),
        beforeWrite: expect.any(Function),
      }),
    )
    expect(getApplicationSettingsForUpdate).toHaveBeenCalledOnce()
    vi.mocked(getApplicationSettingsForUpdate).mockResolvedValueOnce({
      ...DEFAULT_APPLICATION_SETTINGS,
      requirementImportMaxRows: 499,
    })
    const writeOptions = vi.mocked(createRequirementsBatch).mock.calls[0]?.[2]
    await expect(
      writeOptions?.beforeWrite?.({ query: vi.fn() } as never),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'stale_requirement_import_preview' },
    })
  })

  it('invokes per-row and batch audit for specification-local import', async () => {
    vi.mocked(getSpecificationById).mockResolvedValue({ id: 8 } as never)
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })
    const payload = requirementsImportPayloadSchema.parse({
      requirements: [{ description: 'Lokalt krav.' }],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })
    const preview = await workflow.previewSpecificationLocalImport(
      {} as never,
      { locale: 'sv', payload, specificationId: 8 },
    )
    const row = preview.rows[0]
    if (!row) throw new Error('Expected preview row')
    const executor = { query: vi.fn().mockResolvedValue([]) }
    vi.mocked(createSpecificationLocalRequirementsBatch).mockImplementationOnce(
      async (_db, _specificationId, _rows, options) => {
        await options?.beforeWrite?.(executor as never)
        await options?.batchAudit?.(executor as never, [301, 302])
        return [
          { id: 301, uniqueId: 'LOCAL-301' },
          { id: 302, uniqueId: 'LOCAL-302' },
        ] as never
      },
    )

    const result = await workflow.executeSpecificationLocalImport(
      makeContext('rest'),
      {
        locale: 'sv',
        previewToken: preview.previewToken,
        rows: [
          {
            ...row.values,
            reviewRowId: row.reviewRowId,
            sourceIndex: row.sourceIndex,
          },
        ],
        specificationId: 8,
      },
    )

    expect(result.summary.createdCount).toBe(1)
    expect(getApplicationSettingsForUpdate).toHaveBeenLastCalledWith(executor)
  })

  it('rejects stale REST preview tokens after normalizing row order', async () => {
    vi.mocked(getSpecificationById).mockResolvedValue({ id: 8 } as never)
    const workflow = createRequirementsImportWorkflow({
      authorization: { assertAuthorized: vi.fn() },
      db: {} as never,
    })
    const payload = requirementsImportPayloadSchema.parse({
      requirements: [
        { description: 'First requirement.' },
        { description: 'Second requirement.' },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })
    const libraryPreview = await workflow.previewLibraryImport({} as never, {
      areaId: 7,
      locale: 'en',
      payload,
    })
    const specificationPreview = await workflow.previewSpecificationLocalImport(
      {} as never,
      {
        locale: 'en',
        payload,
        specificationId: 8,
      },
    )
    const toExecuteRows = (preview: typeof libraryPreview) =>
      [...preview.rows].reverse().map(row => ({
        ...row.values,
        reviewRowId: row.reviewRowId,
        sourceIndex: row.sourceIndex,
      }))

    await expect(
      workflow.executeLibraryImport(makeContext('rest'), {
        areaId: 7,
        locale: 'en',
        previewToken: 'stale-library-token',
        rows: toExecuteRows(libraryPreview),
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'stale_requirement_import_preview' },
    })
    await expect(
      workflow.executeSpecificationLocalImport(makeContext('rest'), {
        locale: 'en',
        previewToken: 'stale-specification-token',
        rows: toExecuteRows(specificationPreview),
        specificationId: 8,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'stale_requirement_import_preview' },
    })
  })

  it('reviews conflicting, ambiguous, missing, archived, and duplicate references', async () => {
    vi.mocked(listCategories).mockResolvedValue([
      { id: 1, nameEn: 'Security', nameSv: 'Säkerhet' },
      { id: 2, nameEn: 'Duplicate', nameSv: 'Dubblett' },
      { id: 3, nameEn: 'Duplicate', nameSv: 'Dubblett' },
    ])
    vi.mocked(listPriorityLevels).mockResolvedValue([
      {
        assessmentCriteriaEn: 'Low',
        assessmentCriteriaSv: 'Låg',
        code: 'P1',
        color: '#22c55e',
        descriptionEn: 'Low',
        descriptionSv: 'Låg',
        iconName: null,
        id: 1,
        nameEn: 'Low',
        nameSv: 'Låg',
        sortOrder: 1,
      },
      {
        assessmentCriteriaEn: 'High',
        assessmentCriteriaSv: 'Hög',
        code: 'P4',
        color: '#ef4444',
        descriptionEn: 'High',
        descriptionSv: 'Hög',
        iconName: 'AlertCircle',
        id: 4,
        nameEn: 'High',
        nameSv: 'Hög',
        sortOrder: 2,
      },
    ])
    vi.mocked(listTypes).mockResolvedValue([
      {
        id: 10,
        nameEn: 'Functional',
        nameSv: 'Funktionellt',
        qualityCharacteristics: [
          {
            chapterId: '1',
            id: 101,
            nameEn: 'Completeness',
            nameSv: 'Fullständighet',
            parentId: null,
            requirementTypeId: 10,
          },
        ],
      },
      {
        id: 20,
        nameEn: 'Non-functional',
        nameSv: 'Icke-funktionellt',
        qualityCharacteristics: [
          {
            chapterId: '2',
            id: 201,
            nameEn: 'Performance',
            nameSv: 'Prestanda',
            parentId: null,
            requirementTypeId: 20,
          },
        ],
      },
    ])
    vi.mocked(listRequirementPackages).mockResolvedValue([
      {
        coAuthors: [],
        createdAt: '2026-08-01T00:00:00.000Z',
        id: 5,
        isArchived: false,
        leadDisplayName: 'Package lead',
        leadEmail: null,
        leadHsaId: 'SE5560000001-package',
        name: 'Common package',
        purposeAndScope: 'Common scope',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        coAuthors: [],
        createdAt: '2026-08-01T00:00:00.000Z',
        id: 6,
        isArchived: false,
        leadDisplayName: 'Package lead',
        leadEmail: null,
        leadHsaId: 'SE5560000001-package',
        name: 'Ambiguous package',
        purposeAndScope: 'Ambiguous scope',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        coAuthors: [],
        createdAt: '2026-08-01T00:00:00.000Z',
        id: 7,
        isArchived: false,
        leadDisplayName: 'Package lead',
        leadEmail: null,
        leadHsaId: 'SE5560000001-package',
        name: 'Ambiguous package',
        purposeAndScope: 'Ambiguous scope',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ])
    vi.mocked(listNormReferences).mockResolvedValue([
      {
        createdAt: '2026-08-01T00:00:00.000Z',
        id: 30,
        isArchived: false,
        issuer: 'ISO',
        name: 'Active',
        normReferenceId: 'ISO-ACTIVE',
        reference: 'ISO A',
        type: 'standard',
        updatedAt: '2026-08-01T00:00:00.000Z',
        uri: null,
        version: null,
      },
      {
        createdAt: '2026-08-01T00:00:00.000Z',
        id: 31,
        isArchived: true,
        issuer: 'ISO',
        name: 'Archived',
        normReferenceId: 'ISO-ARCHIVED',
        reference: 'ISO B',
        type: 'standard',
        updatedAt: '2026-08-01T00:00:00.000Z',
        uri: null,
        version: null,
      },
    ])
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: {} as never,
    })
    const payload = requirementsImportPayloadSchema.parse({
      proposedNormReferences: [
        {
          issuer: 'ISO',
          key: 'ISO-ACTIVE',
          name: 'Already active',
          normReferenceId: 'ISO-ACTIVE',
          reference: 'A',
          type: 'standard',
        },
        {
          issuer: 'ISO',
          key: 'archived-key',
          name: 'Archived',
          normReferenceId: 'ISO-ARCHIVED',
          reference: 'B',
          type: 'standard',
        },
        {
          issuer: 'ISO',
          key: 'unused-key',
          name: 'Missing',
          normReferenceId: 'MISSING',
          reference: 'C',
          type: 'standard',
        },
      ],
      requirements: [
        {
          categoryId: 1,
          categoryName: 'Duplicate',
          description: 'First',
          normReferenceIds: [
            'ISO-ACTIVE',
            'ISO-ACTIVE',
            'ISO-ARCHIVED',
            'UNKNOWN',
          ],
          priorityLevelId: 999,
          priorityLevelName: 'P4',
          proposedNormReferenceKeys: [
            'ISO-ACTIVE',
            'archived-key',
            'missing-key',
          ],
          requirementPackageIds: [5, 5, 999],
          requirementPackageNames: [
            'Common package',
            'Ambiguous package',
            'Missing package',
          ],
          typeId: 999,
          typeName: 'Functional',
          verifiable: false,
          verificationMethod: 'ignored',
        },
        {
          categoryId: 999,
          categoryName: 'Unknown',
          description: 'Second',
          priorityLevelId: 1,
          priorityLevelName: 'High',
          qualityCharacteristicId: 201,
          qualityCharacteristicName: 'Unknown',
          typeName: 'Missing type',
        },
        {
          categoryName: 'Duplicate',
          description: 'Third',
          qualityCharacteristicName: 'Performance',
          typeId: 20,
          verifiable: true,
        },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })

    const preview = await workflow.previewLibraryImport({} as never, {
      areaId: 7,
      locale: 'en',
      payload,
    })

    const codes = [
      ...preview.proposals.flatMap(proposal =>
        proposal.warnings.map(message => message.code),
      ),
      ...preview.rows.flatMap(row => [
        ...row.errors.map(message => message.code),
        ...row.warnings.map(message => message.code),
      ]),
    ]
    expect(codes).toEqual(
      expect.arrayContaining([
        'import_name_disagrees_with_id',
        'import_invalid_id_name_used',
        'import_invalid_id_omitted',
        'import_name_ambiguous',
        'import_name_unresolved',
        'import_invalid_requirement_package_id',
        'import_requirement_package_name_ambiguous',
        'import_requirement_package_name_unresolved',
        'import_duplicate_requirement_packages_collapsed',
        'import_norm_reference_archived',
        'import_norm_reference_unresolved',
        'import_proposed_norm_reference_key_missing',
        'import_proposed_norm_reference_archived',
        'import_duplicate_norm_references_collapsed',
        'import_proposed_norm_reference_unused',
        'import_proposed_norm_reference_business_id_unresolved',
        'import_verification_method_ignored_for_non_verifiable',
        'import_verification_method_required',
      ]),
    )
  })

  it('inspects validation sessions and projects already imported rows', async () => {
    const { db } = makeManageImportDb()
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
        requirements: [{ description: 'Systemet ska logga.' }],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
    })
    const createData = vi
      .mocked(createRequirementImportValidationSession)
      .mock.calls.at(-1)?.[1]
    if (!createData) throw new Error('Expected validation session data')
    const session = makeSessionRecord({
      ...createData,
      executionResultJson: JSON.stringify({
        importedRows: [
          {
            importedAt: '2026-08-05T08:00:00.000Z',
            kravId: 'TEST0001',
            reviewRowId: 'row-0',
            sourceIndex: 0,
            uniqueId: 'TEST0001',
          },
        ],
        schemaVersion: 'mcp-requirement-import-execution.v1',
      }),
    })
    vi.mocked(
      getRequirementImportValidationSessionByTokenHash,
    ).mockResolvedValue(session)

    const result = await workflow.manageImport(context, {
      operation: 'inspect_validation',
      validationToken: ' opaque-token ',
    })

    expect(result).toMatchObject({
      destination: { areaId: 7, kind: 'requirements_library' },
      referenceData: {
        currentFingerprint: expect.any(String),
        isStale: false,
        storedFingerprint: session.referenceDataFingerprint,
      },
      rows: [
        {
          imported: true,
          importedAt: '2026-08-05T08:00:00.000Z',
          kravId: 'TEST0001',
          uniqueId: 'TEST0001',
        },
      ],
      submittedPayload: {
        requirements: [{ description: 'Systemet ska logga.' }],
      },
    })
  })

  it('rejects blank, expired, and corrupt validation sessions', async () => {
    const { db } = makeManageImportDb()
    const authorization = { assertAuthorized: vi.fn() }
    const workflow = createRequirementsImportWorkflow({
      authorization,
      db: db as never,
    })
    const context = makeContext('requirements_manage_import')

    await expect(
      workflow.manageImport(context, {
        operation: 'inspect_validation',
        validationToken: '   ',
      }),
    ).rejects.toMatchObject({ code: 'validation' })

    vi.mocked(
      getRequirementImportValidationSessionByTokenHash,
    ).mockResolvedValueOnce(null)
    await expect(
      workflow.manageImport(context, {
        operation: 'inspect_validation',
        validationToken: 'expired',
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      details: { reason: 'validation_session_not_found_or_expired' },
    })

    vi.mocked(
      getRequirementImportValidationSessionByTokenHash,
    ).mockResolvedValueOnce(
      makeSessionRecord({
        destinationId: 7,
        destinationKind: 'requirements_library',
        destinationSnapshotJson: '{bad-json',
        expiresAt: new Date('2026-08-05T09:00:00.000Z'),
        payloadHash: 'payload',
        referenceDataFingerprint: 'fingerprint',
        submittedPayloadJson: '{}',
        tokenHash: 'token',
        validationResultJson: '{}',
      }),
    )
    await expect(
      workflow.manageImport(context, {
        operation: 'inspect_validation',
        validationToken: 'corrupt',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
  })
})
