import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const serviceState = vi.hoisted(() => ({
  getService: vi.fn(),
}))

vi.mock('@/lib/requirements/service', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/requirements/service')
  >('@/lib/requirements/service')

  return {
    ...actual,
    createRequirementsService: serviceState.getService,
  }
})

vi.mock('@/lib/auth/mcp-token', () => ({
  McpAuthError: class McpAuthError extends Error {},
  verifyMcpBearerToken: vi.fn(async () => ({
    actor: {
      id: 'mcp-test-actor',
      displayName: 'MCP Test Actor',
      hsaId: 'mcp-client:tests',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'mcp' as const,
    },
    expiresAt: null,
  })),
}))

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { handleRequirementsMcpRequest } from '@/lib/mcp/http'
import { createKravhanteringMcpServer } from '@/lib/mcp/server'
import { normalizeUiTerminology } from '@/lib/ui-terminology'

function createFakeService(
  normReferences: Array<{
    normReference?: { name?: string; reference?: string; uri?: string | null }
  }> = [],
  requiresTesting = true,
) {
  return {
    addToPackage: vi.fn().mockResolvedValue({
      addedCount: 1,
      message: 'Requirement added to package',
      skippedCount: 0,
      skippedIds: [],
    }),
    getRequirement: vi.fn().mockResolvedValue({
      message: 'Requirement detail',
      requirement: {
        area: { id: 1, name: 'Integration' },
        createdAt: '2026-03-08T00:00:00.000Z',
        id: 1,
        isArchived: false,
        packageCount: 2,
        uniqueId: 'INT0001',
        versions: [
          {
            acceptanceCriteria: 'Must respond in 2s',
            category: {
              id: 1,
              nameEn: 'Business requirement',
              nameSv: 'Verksamhetskrav',
            },
            description: 'Support secure integration',
            id: 10,
            revisionToken: '11111111-1111-4111-8111-111111111111',
            versionNormReferences: normReferences,
            requiresTesting,
            statusNameEn: 'Draft',
            statusNameSv: 'Utkast',
            type: {
              id: 1,
              nameEn: 'Functional',
              nameSv: 'Funktionellt',
            },
            qualityCharacteristic: {
              id: 9,
              nameEn: 'Security',
              nameSv: 'Sakerhet',
            },
            versionNumber: 2,
            versionScenarios: [],
          },
        ],
      },
      requirementResourceUri: 'requirements://requirement/INT0001?version=2',
      requirementViewUri:
        'ui://requirements/requirement-detail/INT0001?version=2',
      version: {
        acceptanceCriteria: 'Must respond in 2s',
        category: {
          id: 1,
          nameEn: 'Business requirement',
          nameSv: 'Verksamhetskrav',
        },
        description: 'Support secure integration',
        id: 10,
        revisionToken: '11111111-1111-4111-8111-111111111111',
        versionNormReferences: normReferences,
        requiresTesting,
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
        type: {
          id: 1,
          nameEn: 'Functional',
          nameSv: 'Funktionellt',
        },
        qualityCharacteristic: {
          id: 9,
          nameEn: 'Security',
          nameSv: 'Sakerhet',
        },
        versionNumber: 2,
        versionScenarios: [],
      },
    }),
    manageRequirement: vi.fn().mockResolvedValue({
      detail: {
        uniqueId: 'INT0001',
        versions: [
          {
            id: 10,
            revisionToken: '22222222-2222-4222-8222-222222222222',
            versionNumber: 2,
          },
        ],
      },
      message: 'Requirement updated',
      operation: 'edit',
      result: {
        id: 10,
        versionNumber: 2,
      },
    }),
    queryCatalog: vi.fn().mockResolvedValue({
      catalog: 'requirements',
      items: [
        {
          uniqueId: 'INT0001',
          version: {
            description: 'Support secure integration',
            revisionToken: '11111111-1111-4111-8111-111111111111',
            versionNumber: 2,
          },
        },
      ],
      message: 'Requirement catalog',
      pagination: {
        count: 1,
        hasMore: false,
        limit: 20,
        nextOffset: null,
        offset: 0,
        total: 1,
      },
    }),
    getPackageItems: vi.fn().mockResolvedValue({
      items: [],
      message: 'Package items',
      packageId: 7,
    }),
    listPackages: vi.fn().mockResolvedValue({
      message: 'Packages',
      packages: [],
    }),
    removeFromPackage: vi.fn().mockResolvedValue({
      message: 'Requirement removed from package',
      removedCount: 1,
    }),
    transitionRequirement: vi.fn().mockResolvedValue({
      detail: {
        uniqueId: 'INT0001',
      },
      message: 'Requirement transitioned',
      version: {
        revisionToken: '11111111-1111-4111-8111-111111111111',
        versionNumber: 2,
      },
    }),
  }
}

async function createClient() {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const request =
      input instanceof Request ? input : new Request(url, init ?? undefined)
    return handleRequirementsMcpRequest(request, {} as never)
  })

  const transport = new StreamableHTTPClientTransport(
    new URL('https://example.test/api/mcp'),
    { fetch },
  )
  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  })
  await client.connect(transport)

  return { client, fetch, transport }
}

async function createInMemoryClient(
  server: ReturnType<typeof createKravhanteringMcpServer>,
) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  })

  await server.connect(serverTransport)
  await client.connect(clientTransport)

  return { client, server }
}

describe('handleRequirementsMcpRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceState.getService.mockReturnValue(createFakeService())
  })

  describe('tool schemas', () => {
    let toolSchemaClient: Awaited<ReturnType<typeof createClient>> | undefined
    let tools: Awaited<ReturnType<Client['listTools']>>['tools'] = []

    beforeAll(async () => {
      serviceState.getService.mockReturnValue(createFakeService())
      toolSchemaClient = await createClient()
      const response = await toolSchemaClient.client.listTools()
      tools = response.tools
    })

    afterAll(async () => {
      if (!toolSchemaClient) {
        return
      }

      try {
        await toolSchemaClient.client.close()
      } finally {
        await toolSchemaClient.transport.close()
      }
    })

    function getTool(name: string) {
      return tools.find(tool => tool.name === name)
    }

    it('lists the core MCP tools', async () => {
      expect(tools.map(tool => tool.name)).toEqual(
        expect.arrayContaining([
          'requirements_get_requirement',
          'requirements_manage_requirement',
          'requirements_query_catalog',
          'requirements_transition_requirement',
        ]),
      )
    })

    it('describes requirements_query_catalog filters and pagination', async () => {
      const queryTool = getTool('requirements_query_catalog')

      expect(queryTool).toBeDefined()
      expect(queryTool?.description).toContain('risk_levels')
      const queryInputSchemaText = JSON.stringify(queryTool?.inputSchema)
      expect(queryInputSchemaText).toContain('risk_levels')
      expect(queryInputSchemaText).toContain('normReferenceIds')
      expect(queryInputSchemaText).toContain('usageScenarioIds')
      expect(queryInputSchemaText).toContain('sortBy')
      expect(JSON.stringify(queryTool?.outputSchema)).toContain('pagination')
    })

    it('describes requirements_get_requirement history edit tokens', async () => {
      const getRequirementTool = getTool('requirements_get_requirement')

      expect(getRequirementTool).toBeDefined()
      expect(getRequirementTool?.description).toContain('view: "history"')
      const getRequirementInputSchemaText = JSON.stringify(
        getRequirementTool?.inputSchema,
      )
      expect(getRequirementInputSchemaText).toContain('history')
      expect(getRequirementInputSchemaText).toContain('before editing')
      const getRequirementOutputSchemaText = JSON.stringify(
        getRequirementTool?.outputSchema,
      )
      expect(getRequirementOutputSchemaText).toContain('revisionToken')
      expect(getRequirementOutputSchemaText).toContain('baseRevisionToken')
    })

    it('describes requirements_manage_requirement create and edit inputs', async () => {
      const manageTool = getTool('requirements_manage_requirement')

      expect(manageTool).toBeDefined()
      expect(manageTool?.description).toContain('requirement.baseVersionId')
      expect(manageTool?.description).toContain('requirement.baseRevisionToken')
      expect(manageTool?.description).toContain('operation "create"')
      expect(manageTool?.description).toContain('requirement.areaId')
      expect(manageTool?.description).toContain('requirement.description')
      expect(manageTool?.description).toContain('view: "history"')
      const manageInputSchemaText = JSON.stringify(manageTool?.inputSchema)
      expect(manageInputSchemaText).toContain('For create')
      expect(manageInputSchemaText).toContain('acceptanceCriteria')
      expect(manageInputSchemaText).toContain('requirement.versions[0].id')
      expect(manageInputSchemaText).toContain(
        'requirement.versions[0].revisionToken',
      )
    })

    it('describes requirements_transition_requirement revision output', async () => {
      const transitionTool = getTool('requirements_transition_requirement')

      expect(transitionTool).toBeDefined()
      expect(transitionTool?.description).toContain('rotates the version')
      expect(JSON.stringify(transitionTool?.outputSchema)).toContain(
        'revisionToken',
      )
    })

    it('describes requirements_list_improvement_suggestions output', async () => {
      const listSuggestionsTool = getTool(
        'requirements_list_improvement_suggestions',
      )

      expect(listSuggestionsTool).toBeDefined()
      expect(JSON.stringify(listSuggestionsTool?.outputSchema)).toContain(
        'suggestions',
      )
    })

    it('describes requirements_manage_improvement_suggestion resolution input', async () => {
      const manageSuggestionTool = getTool(
        'requirements_manage_improvement_suggestion',
      )

      expect(manageSuggestionTool).toBeDefined()
      const manageSuggestionInputSchemaText = JSON.stringify(
        manageSuggestionTool?.inputSchema,
      )
      expect(manageSuggestionInputSchemaText).toContain('resolutionMotivation')
      expect(JSON.stringify(manageSuggestionTool?.outputSchema)).toContain(
        'result',
      )
    })

    it('describes requirements_generate_requirements limits and output', async () => {
      const generateTool = getTool('requirements_generate_requirements')

      expect(generateTool).toBeDefined()
      const generateInputSchemaText = JSON.stringify(generateTool?.inputSchema)
      expect(generateInputSchemaText).toContain('"maxLength":1000')
      expect(generateTool?.description).toContain('using the generated fields')
      expect(JSON.stringify(generateTool?.outputSchema)).toContain('stats')
    })
  })

  it('serves the requirement detail resource', async () => {
    const { client, transport } = await createClient()
    const resource = await client.readResource({
      uri: 'requirements://requirement/INT0001?version=2',
    })
    const fakeService = serviceState.getService.mock.results[0]?.value
    const firstResource =
      'contents' in resource ? resource.contents[0] : undefined
    const text =
      firstResource && 'text' in firstResource ? firstResource.text : undefined
    expect(text).toContain('"uniqueId": "INT0001"')
    expect(fakeService.getRequirement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        uniqueId: 'INT0001',
        versionNumber: 2,
        view: 'version',
      }),
    )

    const viewResource = await client.readResource({
      uri: 'ui://requirements/requirement-detail/INT0001?version=2',
    })
    const firstViewResource =
      'contents' in viewResource ? viewResource.contents[0] : undefined
    const viewText =
      firstViewResource && 'text' in firstViewResource
        ? firstViewResource.text
        : undefined
    expect(viewText).toContain('<!doctype html>')
    expect(viewText).toContain('MCP Requirement View')
    expect(viewText).toContain('Requirement text')
    expect(viewText).toContain('References')
    expect(viewText).toContain('Used in packages')
    expect(viewText).toContain('>2<')
    expect(fakeService.getRequirement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        uniqueId: 'INT0001',
        versionNumber: 2,
        view: 'version',
      }),
    )

    await client.close()
    await transport.close()
  })

  it('returns app metadata and resource links on get_requirement', async () => {
    const { client, transport } = await createClient()

    const result = await client.callTool({
      arguments: {
        uniqueId: 'INT0001',
        view: 'detail',
      },
      name: 'requirements_get_requirement',
    })

    expect(result.isError).not.toBe(true)
    expect(result._meta).toMatchObject({
      'openai/outputTemplate':
        'ui://requirements/requirement-detail/INT0001?version=2',
    })
    const content = result.content as Array<{
      type: string
      uri?: string
    }>
    expect(content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource_link',
          uri: 'ui://requirements/requirement-detail/INT0001?version=2',
        }),
      ]),
    )

    await client.close()
    await transport.close()
  })

  it('passes requirement catalog filters and sorting through the MCP schema', async () => {
    const { client, transport } = await createClient()
    const fakeService = serviceState.getService.mock.results[0]?.value

    const result = await client.callTool({
      arguments: {
        catalog: 'requirements',
        normReferenceIds: [4],
        riskLevelIds: [2],
        sortBy: 'riskLevel',
        sortDirection: 'desc',
        usageScenarioIds: [3],
      },
      name: 'requirements_query_catalog',
    })

    expect(result.isError).not.toBe(true)
    expect(fakeService.queryCatalog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        normReferenceIds: [4],
        riskLevelIds: [2],
        sortBy: 'riskLevel',
        sortDirection: 'desc',
        usageScenarioIds: [3],
      }),
    )

    await client.close()
    await transport.close()
  })

  it('returns tool-level errors as isError results instead of protocol failures', async () => {
    const fakeService = createFakeService()
    fakeService.getRequirement.mockRejectedValueOnce(new Error('Boom'))
    serviceState.getService.mockReturnValue(fakeService)

    const { client, transport } = await createClient()
    const result = await client.callTool({
      arguments: {
        uniqueId: 'INT0001',
      },
      name: 'requirements_get_requirement',
    })

    expect(result.isError).toBe(true)
    const content = result.content as Array<{
      text?: string
      type: string
    }>
    expect(content[0]).toMatchObject({
      text: 'Error: Boom',
      type: 'text',
    })

    await client.close()
    await transport.close()
  })

  it('rejects package tools unless exactly one package identifier is provided', async () => {
    const { client, transport } = await createClient()

    const missingIdentifier = await client.callTool({
      arguments: {},
      name: 'requirements_get_package_items',
    })
    expect(missingIdentifier.isError).toBe(true)
    expect(missingIdentifier.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining(
            'Provide exactly one of packageId or packageSlug.',
          ),
        }),
      ]),
    )

    const duplicateIdentifier = await client.callTool({
      arguments: {
        packageId: 7,
        packageSlug: 'IAM-PACKAGE',
      },
      name: 'requirements_get_package_items',
    })
    expect(duplicateIdentifier.isError).toBe(true)
    expect(duplicateIdentifier.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining(
            'Provide exactly one of packageId or packageSlug.',
          ),
        }),
      ]),
    )

    await client.close()
    await transport.close()
  })

  it('falls back to default terminology when loading stored terminology fails for the HTML resource', async () => {
    const getTerminology = vi
      .fn()
      .mockRejectedValueOnce(new Error('settings unavailable'))
    const server = createKravhanteringMcpServer(
      createFakeService() as never,
      new Request('https://example.test/api/mcp'),
      { getTerminology },
    )

    const { client } = await createInMemoryClient(server)
    const viewResource = await client.readResource({
      uri: 'ui://requirements/requirement-detail/INT0001?version=2',
    })
    const firstViewResource =
      'contents' in viewResource ? viewResource.contents[0] : undefined
    const viewText =
      firstViewResource && 'text' in firstViewResource
        ? firstViewResource.text
        : undefined

    expect(viewText).toContain('<!doctype html>')
    expect(viewText).toContain('MCP Requirement View')
    expect(viewText).toContain('Requirement text')
    expect(viewText).toContain('References')
    expect(getTerminology).toHaveBeenCalledTimes(1)

    await Promise.allSettled([client.close(), server.close()])
  })

  it('localizes empty reference and scenario sections in Swedish HTML resources', async () => {
    const { client, transport } = await createClient()
    const viewResource = await client.readResource({
      uri: 'ui://requirements/requirement-detail/INT0001?version=2&locale=sv',
    })
    const firstViewResource =
      'contents' in viewResource ? viewResource.contents[0] : undefined
    const viewText =
      firstViewResource && 'text' in firstViewResource
        ? firstViewResource.text
        : undefined

    expect(viewText).toContain('<h2>Referenser</h2><p>Inga</p>')
    expect(viewText).toContain('<h2>Användningsscenarier</h2><p>Inga</p>')

    await client.close()
    await transport.close()
  })

  it('localizes unnamed references in Swedish HTML resources', async () => {
    serviceState.getService.mockReturnValue(
      createFakeService([{ normReference: {} }]),
    )

    const { client, transport } = await createClient()
    const viewResource = await client.readResource({
      uri: 'ui://requirements/requirement-detail/INT0001?version=2&locale=sv',
    })
    const firstViewResource =
      'contents' in viewResource ? viewResource.contents[0] : undefined
    const viewText =
      firstViewResource && 'text' in firstViewResource
        ? firstViewResource.text
        : undefined

    expect(viewText).toContain('<li>Referens</li>')
    expect(viewText).toContain('<h2>Användningsscenarier</h2><p>Inga</p>')

    await client.close()
    await transport.close()
  })

  it('uses the dedicated false-state terminology in Swedish HTML resources', async () => {
    const getTerminology = vi.fn().mockResolvedValue(
      normalizeUiTerminology([
        {
          en: {
            definitePlural: 'Testable',
            plural: 'Testable',
            singular: 'Testable',
          },
          key: 'requiresTesting',
          sv: {
            definitePlural: 'Provbar',
            plural: 'Provbar',
            singular: 'Provbar',
          },
        },
        {
          en: {
            definitePlural: 'Cannot be tested',
            plural: 'Cannot be tested',
            singular: 'Cannot be tested',
          },
          key: 'requiresTestingOff',
          sv: {
            definitePlural: 'Kan inte provas',
            plural: 'Kan inte provas',
            singular: 'Kan inte provas',
          },
        },
      ]),
    )
    const server = createKravhanteringMcpServer(
      createFakeService([], false) as never,
      new Request('https://example.test/api/mcp'),
      { getTerminology },
    )

    const { client } = await createInMemoryClient(server)
    const viewResource = await client.readResource({
      uri: 'ui://requirements/requirement-detail/INT0001?version=2&locale=sv',
    })
    const firstViewResource =
      'contents' in viewResource ? viewResource.contents[0] : undefined
    const viewText =
      firstViewResource && 'text' in firstViewResource
        ? firstViewResource.text
        : undefined

    expect(viewText).toContain('<span class="pill">Kan inte provas</span>')
    expect(viewText).not.toContain('<span class="pill">Inte provbar</span>')
    expect(getTerminology).toHaveBeenCalledTimes(1)

    await Promise.allSettled([client.close(), server.close()])
  })

  it('renders unsafe reference URIs as plain text instead of clickable links', async () => {
    serviceState.getService.mockReturnValue(
      createFakeService([
        {
          normReference: {
            name: 'Dangerous reference',
            uri: 'javascript:alert(1)',
          },
        },
      ]),
    )

    const { client, transport } = await createClient()
    const viewResource = await client.readResource({
      uri: 'ui://requirements/requirement-detail/INT0001?version=2',
    })
    const firstViewResource =
      'contents' in viewResource ? viewResource.contents[0] : undefined
    const viewText =
      firstViewResource && 'text' in firstViewResource
        ? firstViewResource.text
        : undefined

    expect(viewText).toContain('Dangerous reference: javascript:alert(1)')
    expect(viewText).not.toContain('href="javascript:alert(1)"')

    await client.close()
    await transport.close()
  })

  it('accepts normReferenceIds in manage_requirement', async () => {
    const { client, transport } = await createClient()
    const fakeService = serviceState.getService.mock.results[0]?.value

    const result = await client.callTool({
      arguments: {
        operation: 'edit',
        uniqueId: 'INT0001',
        requirement: {
          baseRevisionToken: '11111111-1111-4111-8111-111111111111',
          baseVersionId: 10,
          description: 'Updated description',
          normReferenceIds: [1, 2],
        },
      },
      name: 'requirements_manage_requirement',
    })

    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      detail: {
        versions: [
          expect.objectContaining({
            revisionToken: '22222222-2222-4222-8222-222222222222',
          }),
        ],
      },
    })
    expect(fakeService.manageRequirement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requirement: expect.objectContaining({
          baseRevisionToken: '11111111-1111-4111-8111-111111111111',
          baseVersionId: 10,
          normReferenceIds: [1, 2],
        }),
      }),
    )

    await client.close()
    await transport.close()
  })

  it('rejects the old references field in manage_requirement due to strict schema', async () => {
    const { client, transport } = await createClient()

    const result = await client.callTool({
      arguments: {
        operation: 'edit',
        uniqueId: 'INT0001',
        requirement: {
          baseRevisionToken: '11111111-1111-4111-8111-111111111111',
          baseVersionId: 10,
          description: 'Updated description',
          references: [1],
        },
      },
      name: 'requirements_manage_requirement',
    })

    expect(result.isError).toBe(true)
    const content = result.content as Array<{
      text?: string
      type: string
    }>
    expect(content[0]?.text).toMatch(/unrecognized/i)

    await client.close()
    await transport.close()
  })
})
