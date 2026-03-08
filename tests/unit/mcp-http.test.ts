import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { handleRequirementsMcpRequest } from '@/lib/mcp/http'

function createFakeService() {
  return {
    getRequirement: vi.fn().mockResolvedValue({
      message: 'Requirement detail',
      requirement: {
        area: { id: 1, name: 'Integration' },
        createdAt: '2026-03-08T00:00:00.000Z',
        id: 1,
        isArchived: false,
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
            references: [],
            requiresTesting: true,
            statusNameEn: 'Draft',
            statusNameSv: 'Utkast',
            type: {
              id: 1,
              nameEn: 'Functional',
              nameSv: 'Funktionellt',
            },
            typeCategory: {
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
        'ui://kravhantering/requirement-detail/INT0001?version=2',
      version: {
        acceptanceCriteria: 'Must respond in 2s',
        category: {
          id: 1,
          nameEn: 'Business requirement',
          nameSv: 'Verksamhetskrav',
        },
        description: 'Support secure integration',
        id: 10,
        references: [],
        requiresTesting: true,
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
        type: {
          id: 1,
          nameEn: 'Functional',
          nameSv: 'Funktionellt',
        },
        typeCategory: {
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
        versions: [{ versionNumber: 2 }],
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
    transitionRequirement: vi.fn().mockResolvedValue({
      detail: {
        uniqueId: 'INT0001',
      },
      message: 'Requirement transitioned',
      version: {
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

describe('handleRequirementsMcpRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceState.getService.mockReturnValue(createFakeService())
  })

  it('lists the MCP tools and serves the requirement detail resource', async () => {
    const { client, transport } = await createClient()
    const fakeService = serviceState.getService.mock.results[0]?.value

    const tools = await client.listTools()
    expect(tools.tools.map(tool => tool.name)).toEqual(
      expect.arrayContaining([
        'kravhantering_get_requirement',
        'kravhantering_manage_requirement',
        'kravhantering_query_catalog',
        'kravhantering_transition_requirement',
      ]),
    )

    const resource = await client.readResource({
      uri: 'requirements://requirement/INT0001?version=2',
    })
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
      uri: 'ui://kravhantering/requirement-detail/INT0001?version=2',
    })
    const firstViewResource =
      'contents' in viewResource ? viewResource.contents[0] : undefined
    const viewText =
      firstViewResource && 'text' in firstViewResource
        ? firstViewResource.text
        : undefined
    expect(viewText).toContain('<!doctype html>')
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
      name: 'kravhantering_get_requirement',
    })

    expect(result.isError).not.toBe(true)
    expect(result._meta).toMatchObject({
      'openai/outputTemplate':
        'ui://kravhantering/requirement-detail/INT0001?version=2',
    })
    const content = result.content as Array<{
      type: string
      uri?: string
    }>
    expect(content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource_link',
          uri: 'ui://kravhantering/requirement-detail/INT0001?version=2',
        }),
      ]),
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
      name: 'kravhantering_get_requirement',
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
})
