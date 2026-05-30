import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createKravhanteringMcpServer } from '@/lib/mcp/server'
import {
  attachVerifiedActor,
  type RequestContext,
} from '@/lib/requirements/auth'
import type {
  RequirementDetail,
  RequirementsService,
  RequirementVersionDetail,
} from '@/lib/requirements/service'

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
  const queryCatalog = vi.fn(async (_context: RequestContext) => ({
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
  }))
  const getRequirement = vi.fn(async (_context: RequestContext) => ({
    message: 'Requirement detail',
    requirement: createDetail(),
    requirementResourceUri: 'requirements://requirement/INT0001?version=2',
    requirementViewUri:
      'ui://requirements/requirement-detail/INT0001?version=2',
    version: createVersion(),
  }))
  const manageRequirement = vi.fn(async (_context: RequestContext) => ({
    detail: createDetail(),
    message: 'Requirement updated',
    operation: 'edit' as const,
    result: { id: 10 },
  }))
  const transitionRequirement = vi.fn(async (_context: RequestContext) => ({
    detail: createDetail(),
    message: 'Requirement transitioned',
    version: createVersion(),
  }))
  const listSpecifications = vi.fn(async (_context: RequestContext) => ({
    message: 'Specifications',
    specifications: [],
  }))
  const getSpecificationItems = vi.fn(async (_context: RequestContext) => ({
    items: [],
    message: 'Requirement applications',
    specificationId: 7,
  }))
  const listGraduationTargetAreas = vi.fn(async (_context: RequestContext) => ({
    areas: [{ id: 2, name: 'Security', prefix: 'SEC' }],
    message: 'Target requirement areas',
  }))
  const graduateSpecificationLocalRequirement = vi.fn(
    async (_context: RequestContext) => ({
      detail: createDetail('SEC0001'),
      message: 'Requirement graduated',
      requirementResourceUri: 'requirements://requirement/SEC0001?version=1',
      requirementViewUri:
        'ui://requirements/requirement-detail/SEC0001?version=1',
      result: {
        requirement: {
          id: 2,
          requirementAreaId: 2,
          sequenceNumber: 1,
          uniqueId: 'SEC0001',
        },
        sourceLocalRequirement: {
          id: 12,
          specificationId: 7,
          uniqueId: 'KRAV0001',
        },
        version: {
          id: 20,
          requirementId: 2,
          statusId: 1,
          versionNumber: 1,
        },
      },
    }),
  )
  const addToSpecification = vi.fn(async (_context: RequestContext) => ({
    addedCount: 0,
    message: 'Requirements skipped',
    skippedCount: 1,
    skippedIds: [99],
  }))
  const removeFromSpecification = vi.fn(async (_context: RequestContext) => ({
    message: 'Requirements removed',
    removedCount: 0,
  }))
  const listSuggestions = vi.fn(async (_context: RequestContext) => ({
    counts: {
      dismissed: 0,
      pending: 0,
      resolved: 0,
      total: 0,
    },
    message: 'Suggestions',
    suggestions: [],
  }))
  const manageSuggestion = vi.fn(async (_context: RequestContext) => ({
    message: 'Suggestion updated',
    result: { id: 3 },
  }))
  const generateRequirements = vi.fn(async (_context: RequestContext) => ({
    message: 'Generated requirements',
    model: 'test-model',
    requirements: [
      {
        description: 'Generated requirement',
        rationale: 'Matches the topic',
        requiresTesting: true,
        typeId: 1,
      },
    ],
    stats: {
      completionTokens: 1,
      cost: 0,
      promptTokens: 1,
      reasoningTokens: 0,
      totalTokens: 2,
    },
    thinking: '',
  }))

  const service = {
    addToSpecification,
    generateRequirements,
    getRequirement,
    getSpecificationItems,
    graduateSpecificationLocalRequirement,
    listDeviations: vi.fn(),
    listGraduationTargetAreas,
    listSpecifications,
    listSuggestions,
    manageDeviation: vi.fn(),
    manageRequirement,
    manageSuggestion,
    queryCatalog,
    removeFromSpecification,
    transitionRequirement,
  } satisfies RequirementsService

  return {
    addToSpecification,
    generateRequirements,
    getRequirement,
    graduateSpecificationLocalRequirement,
    listGraduationTargetAreas,
    manageRequirement,
    manageSuggestion,
    queryCatalog,
    removeFromSpecification,
    service,
    transitionRequirement,
  }
}

async function createClient(service: RequirementsService) {
  const request = new Request('https://example.test/api/mcp', {
    headers: {
      'x-correlation-id': 'corr-mcp-authz',
      'x-request-id': 'req-mcp-authz',
    },
  })
  attachVerifiedActor(request, {
    displayName: 'MCP Service Account',
    hsaId: 'SE5560000001-mcp1',
    id: 'svc-mcp-authz',
    isAuthenticated: true,
    roles: ['Reviewer'],
    source: 'mcp',
  })

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  const server = createKravhanteringMcpServer(service, request)
  const client = new Client({
    name: 'mcp-authz-test-client',
    version: '1.0.0',
  })
  await server.connect(serverTransport)
  await client.connect(clientTransport)

  return { client, server }
}

function expectContext(fn: ReturnType<typeof vi.fn>, toolName: string): void {
  const context = fn.mock.calls[0]?.[0] as RequestContext | undefined

  expect(context).toMatchObject({
    actor: {
      hsaId: 'SE5560000001-mcp1',
      id: 'svc-mcp-authz',
      roles: ['Reviewer'],
      source: 'mcp',
    },
    correlationId: 'corr-mcp-authz',
    requestId: 'req-mcp-authz',
    source: 'mcp',
    toolName,
  })
}

describe('MCP authorization seams', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes verified actor context through representative MCP tools', async () => {
    const service = createService()
    const { client, server } = await createClient(service.service)

    await client.callTool({
      arguments: { catalog: 'requirements' },
      name: 'requirements_query_catalog',
    })
    await client.callTool({
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
    await client.callTool({
      arguments: { toStatusId: 2, uniqueId: 'INT0001' },
      name: 'requirements_transition_requirement',
    })
    await client.callTool({
      arguments: { requirementIds: [1], specificationId: 7 },
      name: 'requirements_add_to_specification',
    })
    await client.callTool({
      arguments: {
        localRequirementId: 12,
        specificationId: 7,
      },
      name: 'requirements_list_graduation_target_areas',
    })
    await client.callTool({
      arguments: {
        localRequirementId: 12,
        requirementAreaId: 2,
        specificationId: 7,
      },
      name: 'requirements_graduate_local_requirement',
    })
    await client.callTool({
      arguments: {
        content: 'Improve wording',
        operation: 'create',
        requirementId: 1,
      },
      name: 'requirements_manage_improvement_suggestion',
    })
    await client.callTool({
      arguments: { topic: 'Secure audit logging' },
      name: 'requirements_generate_requirements',
    })

    expectContext(service.queryCatalog, 'requirements_query_catalog')
    expectContext(service.manageRequirement, 'requirements_manage_requirement')
    expectContext(
      service.transitionRequirement,
      'requirements_transition_requirement',
    )
    expectContext(
      service.addToSpecification,
      'requirements_add_to_specification',
    )
    expectContext(
      service.listGraduationTargetAreas,
      'requirements_list_graduation_target_areas',
    )
    expectContext(
      service.graduateSpecificationLocalRequirement,
      'requirements_graduate_local_requirement',
    )
    expectContext(
      service.manageSuggestion,
      'requirements_manage_improvement_suggestion',
    )
    expectContext(
      service.generateRequirements,
      'requirements_generate_requirements',
    )

    await Promise.allSettled([client.close(), server.close()])
  })

  it('returns generated requirements without persisting them through manage_requirement', async () => {
    const service = createService()
    const { client, server } = await createClient(service.service)

    const result = await client.callTool({
      arguments: { topic: 'Disposable local scan targets' },
      name: 'requirements_generate_requirements',
    })

    expect(result.isError).not.toBe(true)
    expect(service.generateRequirements).toHaveBeenCalledTimes(1)
    expect(service.manageRequirement).not.toHaveBeenCalled()

    await Promise.allSettled([client.close(), server.close()])
  })
})
