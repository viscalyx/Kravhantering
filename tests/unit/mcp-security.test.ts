import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createKravhanteringMcpServer } from '@/lib/mcp/server'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { RequirementsServiceError } from '@/lib/requirements/errors'
import type {
  RequirementDetail,
  RequirementsService,
  RequirementVersionDetail,
} from '@/lib/requirements/service'

const EXPECTED_TOOLS = [
  'requirements_add_to_specification',
  'requirements_generate_requirements',
  'requirements_get_requirement',
  'requirements_get_specification_items',
  'requirements_graduate_local_requirement',
  'requirements_list_improvement_suggestions',
  'requirements_list_graduation_target_areas',
  'requirements_list_specifications',
  'requirements_manage_improvement_suggestion',
  'requirements_manage_requirement',
  'requirements_query_catalog',
  'requirements_remove_from_specification',
  'requirements_transition_requirement',
].sort()

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
    riskLevel: null,
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
  const service = {
    addToSpecification: vi.fn(async () => ({
      addedCount: 0,
      message: 'Requirements skipped',
      skippedCount: 1,
      skippedIds: [99],
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
      message: 'Specification items',
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
      message: 'Graduation target areas',
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
      removedCount: 0,
    })),
    transitionRequirement: vi.fn(async () => ({
      detail: createDetail(),
      message: 'Requirement transitioned',
      version: createVersion(),
    })),
  } satisfies RequirementsService

  return service
}

async function createClient(service: RequirementsService) {
  const request = new Request('https://example.test/api/mcp')
  attachVerifiedActor(request, {
    displayName: 'MCP Security Test',
    hsaId: 'SE5560000001-mcp1',
    id: 'svc-security-test',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'mcp',
  })

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  const server = createKravhanteringMcpServer(service, request)
  const client = new Client({
    name: 'mcp-security-test-client',
    version: '1.0.0',
  })
  await server.connect(serverTransport)
  await client.connect(clientTransport)

  return { client, server }
}

function textFrom(result: Awaited<ReturnType<Client['callTool']>>) {
  const content = result.content as Array<{ text?: string; type: string }>
  return content.map(item => item.text ?? '').join('\n')
}

function expectNoServiceCalls(service: ReturnType<typeof createService>): void {
  for (const fn of Object.values(service)) {
    expect(fn).not.toHaveBeenCalled()
  }
}

describe('MCP security posture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes exactly the documented tool allowlist', async () => {
    const service = createService()
    const { client, server } = await createClient(service)

    const tools = await client.listTools()

    expect(tools.tools.map(tool => tool.name).sort()).toEqual(EXPECTED_TOOLS)

    await Promise.allSettled([client.close(), server.close()])
  })

  it('rejects unknown tool names without invoking the requirements service', async () => {
    const service = createService()
    const { client, server } = await createClient(service)

    let result: Awaited<ReturnType<Client['callTool']>> | undefined
    let rejected: unknown
    try {
      result = await client.callTool({
        arguments: {},
        name: 'requirements_drop_database',
      })
    } catch (error) {
      rejected = error
    }

    expect(rejected ?? result?.isError).toBeTruthy()
    if (result) {
      expect(textFrom(result)).toMatch(/not found|unknown/i)
    }
    expectNoServiceCalls(service)

    await Promise.allSettled([client.close(), server.close()])
  })

  it('sanitizes unexpected MCP tool exception details', async () => {
    const service = createService()
    service.getRequirement.mockRejectedValueOnce(
      new Error(
        'SELECT * FROM requirements; Authorization: Bearer eyJhbGci.secret; code=abc&state=state&nonce=nonce&verifier=pkce',
      ),
    )
    const { client, server } = await createClient(service)

    const result = await client.callTool({
      arguments: { uniqueId: 'INT0001' },
      name: 'requirements_get_requirement',
    })
    const text = textFrom(result)

    expect(result.isError).toBe(true)
    expect(text).toBe('Error: An internal error occurred')
    expect(text).not.toMatch(/SELECT|Bearer|eyJ|code=|state|nonce|verifier/)

    await Promise.allSettled([client.close(), server.close()])
  })

  it('keeps validation and conflict service errors readable', async () => {
    const service = createService()
    service.manageRequirement
      .mockRejectedValueOnce(
        new RequirementsServiceError('conflict', 'Requirement has changed'),
      )
      .mockRejectedValueOnce(
        new RequirementsServiceError(
          'validation',
          'Cannot delete a published or archived version',
        ),
      )
    const { client, server } = await createClient(service)

    const staleEdit = await client.callTool({
      arguments: {
        operation: 'edit',
        requirement: {
          baseRevisionToken: '11111111-1111-4111-8111-111111111111',
          baseVersionId: 10,
          description: 'Updated description',
        },
        uniqueId: 'INT0001',
      },
      name: 'requirements_manage_requirement',
    })
    const invalidDelete = await client.callTool({
      arguments: {
        operation: 'delete_draft',
        uniqueId: 'INT0001',
      },
      name: 'requirements_manage_requirement',
    })

    expect(staleEdit.isError).toBe(true)
    expect(textFrom(staleEdit)).toBe('Error: Requirement has changed')
    expect(invalidDelete.isError).toBe(true)
    expect(textFrom(invalidDelete)).toBe(
      'Error: Cannot delete a published or archived version',
    )
    expect(service.manageRequirement).toHaveBeenCalledTimes(2)

    await Promise.allSettled([client.close(), server.close()])
  })

  it('returns idempotent specification add and remove service results', async () => {
    const service = createService()
    const { client, server } = await createClient(service)

    const addResult = await client.callTool({
      arguments: { requirementIds: [99], specificationId: 7 },
      name: 'requirements_add_to_specification',
    })
    const removeResult = await client.callTool({
      arguments: { requirementIds: [99], specificationId: 7 },
      name: 'requirements_remove_from_specification',
    })

    expect(addResult.isError).not.toBe(true)
    expect(addResult.structuredContent).toMatchObject({
      addedCount: 0,
      skippedCount: 1,
      skippedIds: [99],
    })
    expect(removeResult.isError).not.toBe(true)
    expect(removeResult.structuredContent).toMatchObject({ removedCount: 0 })

    await Promise.allSettled([client.close(), server.close()])
  })
})
