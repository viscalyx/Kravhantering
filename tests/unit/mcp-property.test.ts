import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import * as fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createKravhanteringMcpServer } from '@/lib/mcp/server'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import type {
  RequirementDetail,
  RequirementsService,
  RequirementVersionDetail,
} from '@/lib/requirements/service'

interface ToolCase {
  acceptsResponseFormat: boolean
  name: string
  valid: Record<string, unknown>
}

const TOOL_CASES: ToolCase[] = [
  {
    acceptsResponseFormat: true,
    name: 'requirements_query_catalog',
    valid: { catalog: 'requirements' },
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_get_requirement',
    valid: { uniqueId: 'INT0001' },
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_manage_requirement',
    valid: {
      operation: 'edit',
      requirement: {
        baseRevisionToken: '11111111-1111-4111-8111-111111111111',
        baseVersionId: 10,
        description: 'Updated description',
      },
      uniqueId: 'INT0001',
    },
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_transition_requirement',
    valid: { toStatusId: 2, uniqueId: 'INT0001' },
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_list_specifications',
    valid: {},
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_get_specification_items',
    valid: { specificationId: 7 },
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_add_to_specification',
    valid: { requirementIds: [1], specificationId: 7 },
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_remove_from_specification',
    valid: { requirementIds: [1], specificationId: 7 },
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_list_graduation_target_areas',
    valid: { localRequirementId: 1, specificationId: 7 },
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_graduate_local_requirement',
    valid: { localRequirementId: 1, requirementAreaId: 2, specificationId: 7 },
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_list_improvement_suggestions',
    valid: { requirementId: 1 },
  },
  {
    acceptsResponseFormat: true,
    name: 'requirements_manage_improvement_suggestion',
    valid: {
      content: 'Improve wording',
      operation: 'create',
      requirementId: 1,
    },
  },
  {
    acceptsResponseFormat: false,
    name: 'requirements_generate_requirements',
    valid: { topic: 'Security posture' },
  },
]

function createVersion(versionNumber = 2): RequirementVersionDetail {
  return {
    acceptanceCriteria: null,
    archivedAt: null,
    archiveInitiatedAt: null,
    category: null,
    createdAt: '2026-03-08T00:00:00.000Z',
    createdBy: null,
    description: 'Support secure integration',
    editedAt: null,
    id: 10,
    ownerName: null,
    publishedAt: null,
    qualityCharacteristic: null,
    requiresTesting: true,
    revisionToken: '11111111-1111-4111-8111-111111111111',
    priorityLevel: null,
    status: 1,
    statusColor: null,
    statusNameEn: 'Draft',
    statusNameSv: 'Utkast',
    type: null,
    verificationMethod: null,
    versionNormReferences: [],
    versionNumber,
    versionRequirementPackages: [],
  }
}

function createDetail(uniqueId = 'INT0001'): RequirementDetail {
  return {
    area: null,
    createdAt: '2026-03-08T00:00:00.000Z',
    id: 1,
    isArchived: false,
    specificationCount: 0,
    uniqueId,
    versions: [createVersion()],
  }
}

function createService() {
  return {
    addToSpecification: vi.fn(async () => ({
      addedCount: 1,
      message: 'Requirement added',
      skippedCount: 0,
      skippedIds: [],
    })),
    buildImportAiPrompt: vi.fn(async () => ''),
    executeLibraryImport: vi.fn(async () => ({
      createdRows: [],
      mode: 'library' as const,
      summary: { createdCount: 0 },
    })),
    executeSpecificationLocalImport: vi.fn(async () => ({
      createdRows: [],
      mode: 'specification-local' as const,
      summary: { createdCount: 0 },
    })),
    generateRequirements: vi.fn(async () => ({
      message: 'Generated requirements',
      model: 'test-model',
      requirements: [],
      stats: {
        completionTokens: 1,
        cost: 0,
        promptTokens: 1,
        reasoningTokens: 0,
        totalTokens: 2,
      },
      thinking: '',
    })),
    getRequirement: vi.fn(async () => ({
      message: 'Requirement detail',
      requirement: createDetail(),
      requirementResourceUri: 'requirements://requirement/INT0001?version=2',
      requirementViewUri:
        'ui://requirements/requirement-detail/INT0001?version=2',
      version: createVersion(),
    })),
    getSpecificationItems: vi.fn(async () => ({
      items: [],
      message: 'Requirement applications',
      specificationId: 7,
    })),
    graduateSpecificationLocalRequirement: vi.fn(async () => ({
      detail: createDetail('SEC0001'),
      message: 'Unique requirement graduated to library draft',
      requirementResourceUri: 'requirements://requirement/SEC0001?version=1',
      requirementViewUri:
        'ui://requirements/requirement-detail/SEC0001?version=1',
      result: {
        requirement: {
          id: 12,
          requirementAreaId: 2,
          sequenceNumber: 1,
          uniqueId: 'SEC0001',
        },
        sourceLocalRequirement: {
          id: 1,
          specificationId: 7,
          uniqueId: 'LOCAL0001',
        },
        version: {
          id: 22,
          requirementId: 12,
          statusId: 1,
          versionNumber: 1,
        },
      },
    })),
    listDeviations: vi.fn(),
    listGraduationTargetAreas: vi.fn(async () => ({
      areas: [{ id: 2, name: 'Security', prefix: 'SEC' }],
      message: 'Graduation target requirement areas',
    })),
    listSpecifications: vi.fn(async () => ({
      message: 'Specifications',
      specifications: [],
    })),
    listSuggestions: vi.fn(async () => ({
      counts: {
        dismissed: 0,
        pending: 0,
        resolved: 0,
        total: 0,
      },
      message: 'Suggestions',
      suggestions: [],
    })),
    manageDeviation: vi.fn(),
    manageRequirement: vi.fn(async () => ({
      detail: createDetail(),
      message: 'Requirement updated',
      operation: 'edit' as const,
      result: { id: 10 },
    })),
    manageSuggestion: vi.fn(async () => ({
      message: 'Suggestion updated',
      result: { id: 3 },
    })),
    previewLibraryImport: vi.fn(async () => ({
      mode: 'library' as const,
      previewToken: 'token',
      proposals: [],
      rows: [],
      summary: { errorCount: 0, rowCount: 0, warningCount: 0 },
    })),
    previewSpecificationLocalImport: vi.fn(async () => ({
      mode: 'specification-local' as const,
      previewToken: 'token',
      proposals: [],
      rows: [],
      summary: { errorCount: 0, rowCount: 0, warningCount: 0 },
    })),
    queryCatalog: vi.fn(async () => ({
      catalog: 'requirements' as const,
      items: [],
      message: 'Requirements Library',
      pagination: {
        count: 0,
        hasMore: false,
        limit: 20,
        nextOffset: null,
        offset: 0,
        total: 0,
      },
    })),
    removeFromSpecification: vi.fn(async () => ({
      message: 'Requirements removed',
      removedCount: 1,
    })),
    transitionRequirement: vi.fn(async () => ({
      detail: createDetail(),
      message: 'Requirement transitioned',
      version: createVersion(),
    })),
  } satisfies RequirementsService
}

async function createClient(service: RequirementsService) {
  const request = new Request('https://example.test/api/mcp')
  attachVerifiedActor(request, {
    displayName: 'MCP Property Test',
    hsaId: 'SE5560000001-mcp1',
    id: 'svc-property-test',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'mcp',
  })

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  const server = createKravhanteringMcpServer(service, request)
  const client = new Client({
    name: 'mcp-property-test-client',
    version: '1.0.0',
  })
  await server.connect(serverTransport)
  await client.connect(clientTransport)

  return { client, server }
}

async function expectInvalidToolCall(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  const result = await client.callTool({ arguments: args, name })
  expect(result.isError).toBe(true)
}

describe('MCP property-based input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid locale enum values for every tool', async () => {
    const { client, server } = await createClient(createService())

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(value => value !== 'en' && value !== 'sv'),
          async locale => {
            for (const tool of TOOL_CASES) {
              await expectInvalidToolCall(client, tool.name, {
                ...tool.valid,
                locale,
              })
            }
          },
        ),
        { numRuns: 8 },
      )
    } finally {
      await Promise.allSettled([client.close(), server.close()])
    }
  })

  it('rejects invalid responseFormat enum values where supported', async () => {
    const { client, server } = await createClient(createService())
    const cases = TOOL_CASES.filter(tool => tool.acceptsResponseFormat)

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(value => value !== 'json' && value !== 'markdown'),
          async responseFormat => {
            for (const tool of cases) {
              await expectInvalidToolCall(client, tool.name, {
                ...tool.valid,
                responseFormat,
              })
            }
          },
        ),
        { numRuns: 8 },
      )
    } finally {
      await Promise.allSettled([client.close(), server.close()])
    }
  })

  it('rejects unknown fields consistently', async () => {
    const { client, server } = await createClient(createService())

    try {
      for (const tool of TOOL_CASES) {
        await expectInvalidToolCall(client, tool.name, {
          ...tool.valid,
          __unexpected: true,
        })
      }
    } finally {
      await Promise.allSettled([client.close(), server.close()])
    }
  })

  it('rejects overlong bounded strings', async () => {
    const { client, server } = await createClient(createService())

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 65, maxLength: 80 }),
          async uniqueId => {
            await expectInvalidToolCall(
              client,
              'requirements_get_requirement',
              { uniqueId },
            )
            await expectInvalidToolCall(
              client,
              'requirements_manage_requirement',
              {
                operation: 'delete_draft',
                uniqueId,
              },
            )
          },
        ),
        { numRuns: 8 },
      )

      await expectInvalidToolCall(
        client,
        'requirements_generate_requirements',
        { topic: 'x'.repeat(1001) },
      )
      await expectInvalidToolCall(client, 'requirements_query_catalog', {
        descriptionSearch: 'x'.repeat(201),
      })
    } finally {
      await Promise.allSettled([client.close(), server.close()])
    }
  })

  it('rejects malformed numeric IDs, version numbers, and status IDs', async () => {
    const { client, server } = await createClient(createService())

    try {
      await expectInvalidToolCall(client, 'requirements_get_requirement', {
        id: 0,
      })
      await expectInvalidToolCall(client, 'requirements_get_requirement', {
        uniqueId: 'INT0001',
        versionNumber: -1,
        view: 'version',
      })
      await expectInvalidToolCall(
        client,
        'requirements_transition_requirement',
        { toStatusId: 0, uniqueId: 'INT0001' },
      )
      await expectInvalidToolCall(client, 'requirements_add_to_specification', {
        requirementIds: [],
        specificationId: 7,
      })
      await expectInvalidToolCall(client, 'requirements_add_to_specification', {
        needsReferenceId: 12,
        needsReferenceText: 'Duplicate meaning',
        requirementIds: [1],
        specificationId: 7,
      })
      await expectInvalidToolCall(client, 'requirements_add_to_specification', {
        needsReferenceId: 12,
        needsReferenceText: '',
        requirementIds: [1],
        specificationId: 7,
      })
      await expectInvalidToolCall(client, 'requirements_add_to_specification', {
        needsReferenceDescription: 'Description without a new reference',
        requirementIds: [1],
        specificationId: 7,
      })
      await expectInvalidToolCall(client, 'requirements_add_to_specification', {
        needsReferenceDescription: '',
        requirementIds: [1],
        specificationId: 7,
      })
      await expectInvalidToolCall(
        client,
        'requirements_remove_from_specification',
        { requirementIds: [0], specificationId: 7 },
      )
      await expectInvalidToolCall(
        client,
        'requirements_list_graduation_target_areas',
        { localRequirementId: 0, specificationId: 7 },
      )
      await expectInvalidToolCall(client, 'requirements_manage_requirement', {
        operation: 'edit',
        requirement: {
          baseRevisionToken: 'not-a-uuid',
          baseVersionId: 0,
          description: 'Updated description',
        },
        uniqueId: 'INT0001',
      })
      await expectInvalidToolCall(
        client,
        'requirements_manage_improvement_suggestion',
        {
          content: 'Improve wording',
          operation: 'create',
          requirementId: 0,
        },
      )
    } finally {
      await Promise.allSettled([client.close(), server.close()])
    }
  })
})
