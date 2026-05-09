import { execFile } from 'node:child_process'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  expect,
  request as playwrightRequest,
  type TestInfo,
  test,
} from '@playwright/test'

const execFileAsync = promisify(execFile)
const SCAN_DIR = 'test-results/mcp-seeded'
const EVENTS_PATH = `${SCAN_DIR}/events.ndjson`
const SUMMARY_PATH = `${SCAN_DIR}/summary.md`

type UnknownRecord = Record<string, unknown>
type ToolCallResult = Awaited<ReturnType<Client['callTool']>>

test.describe.configure({ mode: 'serial' })
test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  await mkdir(SCAN_DIR, { recursive: true })
  await writeFile(EVENTS_PATH, '')
})

function getBaseUrl(testInfo: TestInfo): string {
  return String(
    testInfo.project.use.baseURL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      'http://localhost:3001',
  ).replace(/\/$/, '')
}

function getMcpUrl(testInfo: TestInfo): URL {
  const baseUrl = getBaseUrl(testInfo)
  if (baseUrl !== 'http://localhost:3001') {
    throw new Error(`Refusing to run MCP seeded scan against ${baseUrl}`)
  }
  return new URL('/api/mcp', baseUrl)
}

function redactSensitive(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      '[JWT_REDACTED]',
    )
    .replace(/sk-or-v1-[A-Za-z0-9]+/g, '[OPENROUTER_KEY_REDACTED]')
    .replace(/dev-only-mcp-secret/g, '[MCP_CLIENT_SECRET_REDACTED]')
}

async function recordEvent(event: UnknownRecord) {
  await mkdir(SCAN_DIR, { recursive: true })
  await appendFile(
    EVENTS_PATH,
    `${JSON.stringify({
      ...event,
      at: new Date().toISOString(),
    })}\n`,
  )
}

function asRecord(value: unknown, label: string): UnknownRecord {
  expect(value, `${label} must be an object`).toEqual(expect.any(Object))
  expect(Array.isArray(value), `${label} must not be an array`).toBe(false)
  return value as UnknownRecord
}

function recordField(record: UnknownRecord, key: string, label: string) {
  return asRecord(record[key], `${label}.${key}`)
}

function arrayField(record: UnknownRecord, key: string, label: string) {
  const value = record[key]
  expect(Array.isArray(value), `${label}.${key} must be an array`).toBe(true)
  return value as unknown[]
}

function firstRecord(values: unknown[], label: string) {
  expect(values.length, `${label} must not be empty`).toBeGreaterThan(0)
  return asRecord(values[0], `${label}[0]`)
}

function numberField(record: UnknownRecord, key: string, label: string) {
  const value = record[key]
  expect(typeof value, `${label}.${key} must be a number`).toBe('number')
  return value as number
}

function stringField(record: UnknownRecord, key: string, label: string) {
  const value = record[key]
  expect(typeof value, `${label}.${key} must be a string`).toBe('string')
  return value as string
}

function contentText(result: ToolCallResult): string {
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  return content
    .map(item => {
      if (typeof item !== 'object' || item === null) return ''
      const text = (item as { text?: unknown }).text
      return typeof text === 'string' ? text : ''
    })
    .join('\n')
}

function assertNoSensitiveLeak(value: unknown, label: string) {
  const text = JSON.stringify(value)
  expect(text, `${label} leaked a bearer token`).not.toMatch(
    /Bearer\s+[A-Za-z0-9._~+/-]+=*/i,
  )
  expect(text, `${label} leaked a JWT-like value`).not.toMatch(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  )
  expect(text, `${label} leaked an OpenRouter key`).not.toMatch(/sk-or-v1-/)
  expect(text, `${label} leaked a client secret`).not.toContain(
    'dev-only-mcp-secret',
  )
  expect(text, `${label} leaked SQL internals`).not.toMatch(/\bSELECT\b/i)
  expect(text, `${label} leaked stack text`).not.toMatch(/stack trace/i)
}

function structuredRecord(result: ToolCallResult, label: string) {
  return asRecord(
    (result as { structuredContent?: unknown }).structuredContent,
    `${label}.structuredContent`,
  )
}

function expectToolOk(result: ToolCallResult, label: string) {
  expect(result.isError, `${label} returned MCP isError`).not.toBe(true)
  assertNoSensitiveLeak(result, label)
  return structuredRecord(result, label)
}

function expectToolError(result: ToolCallResult, label: string) {
  expect(result.isError, `${label} should return MCP isError`).toBe(true)
  assertNoSensitiveLeak(result, label)
  return contentText(result)
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as UnknownRecord
}

async function loadExpectedTools() {
  const fixture = await readJson(
    'tests/fixtures/mcp-requests/expected-tools.json',
  )
  return arrayField(fixture, 'tools', 'expected-tools').map(tool => {
    expect(typeof tool).toBe('string')
    return tool as string
  })
}

async function loadSeededCaseTools() {
  const fixture = await readJson(
    'tests/fixtures/mcp-requests/seeded-cases.json',
  )
  return arrayField(fixture, 'cases', 'seeded-cases').map(item =>
    stringField(asRecord(item, 'seeded-cases item'), 'tool', 'case'),
  )
}

async function getBearerToken() {
  const fromEnv = process.env.MCP_BEARER_TOKEN?.trim()
  if (fromEnv) return fromEnv

  const { stderr, stdout } = await execFileAsync(
    process.execPath,
    ['scripts/security/get-mcp-token.mjs'],
    {
      env: {
        ...process.env,
        AUTH_OIDC_ISSUER_URL:
          process.env.AUTH_OIDC_ISSUER_URL ??
          'http://localhost:8080/realms/kravhantering-dev',
      },
    },
  )
  const token = stdout.trim()
  if (!token) {
    throw new Error(
      `get-mcp-token returned an empty token: ${redactSensitive(stderr)}`,
    )
  }
  return token
}

async function createMcpClient(targetUrl: URL, token: string) {
  const fetchWithStatusGuard = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const response = await fetch(input, init)
    if (response.status >= 500) {
      throw new Error(
        `Unexpected ${response.status} response from ${targetUrl.toString()}`,
      )
    }
    return response
  }
  const transport = new StreamableHTTPClientTransport(targetUrl, {
    fetch: fetchWithStatusGuard,
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })
  const client = new Client({
    name: 'phase-6-mcp-seeded-scan',
    version: '1.0.0',
  })
  await client.connect(transport)
  return { client, transport }
}

async function callToolOk(client: Client, name: string, args: UnknownRecord) {
  const result = await client.callTool({ arguments: args, name })
  await recordEvent({ name, status: result.isError ? 'error' : 'ok' })
  return expectToolOk(result, name)
}

async function findUnlinkedSpecification(
  client: Client,
  specifications: UnknownRecord[],
  requirementUniqueId: string,
) {
  for (const specification of specifications) {
    const specificationId = numberField(specification, 'id', 'specification')
    const items = await callToolOk(
      client,
      'requirements_get_specification_items',
      {
        responseFormat: 'json',
        specificationId,
      },
    )
    const linked = arrayField(items, 'items', 'specification items').some(
      item =>
        stringField(
          asRecord(item, 'specification item'),
          'uniqueId',
          'item',
        ) === requirementUniqueId,
    )
    if (!linked) {
      return specification
    }
  }
  throw new Error(
    `No seeded specification was unlinked from ${requirementUniqueId}`,
  )
}

async function writeSummary(status: string, details: string[]) {
  await mkdir(SCAN_DIR, { recursive: true })
  await writeFile(
    SUMMARY_PATH,
    [
      '# MCP Seeded Scan',
      '',
      `Status: ${status}`,
      '',
      ...details.map(detail => `- ${detail}`),
      '',
    ].join('\n'),
  )
}

test.describe('MCP seeded HTTP security gate', () => {
  test('rejects missing and invalid bearer tokens over HTTP', async ({
    request: _request,
  }, testInfo) => {
    const baseUrl = getBaseUrl(testInfo)
    const targetUrl = getMcpUrl(testInfo)
    const context = await playwrightRequest.newContext({ baseURL: baseUrl })
    const initializeBody = {
      id: 'phase-6-auth-negative',
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: {
          name: 'phase-6-negative',
          version: '1.0.0',
        },
        protocolVersion: '2025-03-26',
      },
    }

    try {
      const missing = await context.post(targetUrl.pathname, {
        data: initializeBody,
      })
      expect(missing.status()).toBe(401)
      expect(missing.headers()['www-authenticate']).toBe('Bearer')
      await expect(missing.json()).resolves.toMatchObject({
        error: expect.objectContaining({
          message: expect.any(String),
        }),
        jsonrpc: '2.0',
      })

      const invalid = await context.post(targetUrl.pathname, {
        data: initializeBody,
        headers: {
          Authorization: 'Bearer invalid.phase6.token',
        },
      })
      expect(invalid.status()).toBe(401)
      expect(invalid.headers()['www-authenticate']).toBe('Bearer')

      await recordEvent({
        name: 'mcp_bearer_negative_boundary',
        status: 'ok',
      })
    } finally {
      await context.dispose()
    }
  })

  test('runs the authenticated seeded MCP corpus', async (_fixtures, testInfo) => {
    const events: string[] = []
    const targetUrl = getMcpUrl(testInfo)
    const expectedTools = await loadExpectedTools()
    const fixtureTools = new Set(await loadSeededCaseTools())
    const token = await getBearerToken()
    const { client, transport } = await createMcpClient(targetUrl, token)

    try {
      expect([...fixtureTools].sort()).toEqual(expectedTools.sort())

      const listed = await client.listTools()
      const actualTools = listed.tools.map(tool => tool.name).sort()
      expect(actualTools).toEqual(expectedTools.sort())
      events.push(`allowlist:${actualTools.length}`)
      await recordEvent({
        count: actualTools.length,
        name: 'requirements_tool_allowlist',
        status: 'ok',
      })

      let unknownTool: ToolCallResult | undefined
      let unknownToolError: unknown
      try {
        unknownTool = await client.callTool({
          arguments: {},
          name: 'phase_6_unknown_tool',
        })
      } catch (err) {
        unknownToolError = err
      }
      if (unknownTool) {
        expectToolError(unknownTool, 'unknown tool')
      } else {
        const message =
          unknownToolError instanceof Error
            ? unknownToolError.message
            : String(unknownToolError)
        expect(message).toMatch(/tool|unknown|not found/i)
        assertNoSensitiveLeak(message, 'unknown tool thrown error')
      }
      events.push('unknown-tool:rejected')
      await recordEvent({
        name: 'phase_6_unknown_tool',
        status: 'expected-error',
      })

      const areas = await callToolOk(client, 'requirements_query_catalog', {
        catalog: 'areas',
        responseFormat: 'json',
      })
      const areaId = numberField(
        firstRecord(arrayField(areas, 'items', 'areas'), 'areas'),
        'id',
        'area',
      )

      const statuses = await callToolOk(client, 'requirements_query_catalog', {
        catalog: 'statuses',
        responseFormat: 'json',
      })
      const statusItems = arrayField(statuses, 'items', 'statuses').map(item =>
        asRecord(item, 'status'),
      )
      const draftStatus = statusItems.find(item => item.nameEn === 'Draft')
      const reviewStatus = statusItems.find(item => item.nameEn === 'Review')
      const publishedStatus = statusItems.find(
        item => item.nameEn === 'Published',
      )
      expect(draftStatus).toBeDefined()
      expect(reviewStatus).toBeDefined()
      expect(publishedStatus).toBeDefined()

      const transitions = await callToolOk(
        client,
        'requirements_query_catalog',
        {
          catalog: 'transitions',
          responseFormat: 'json',
        },
      )
      const transitionItems = arrayField(
        transitions,
        'items',
        'transitions',
      ).map(item => asRecord(item, 'transition'))
      const draftToReview = transitionItems.find(
        item =>
          item.fromStatusId === draftStatus?.id &&
          item.toStatusId === reviewStatus?.id,
      )
      const reviewToPublished = transitionItems.find(
        item =>
          item.fromStatusId === reviewStatus?.id &&
          item.toStatusId === publishedStatus?.id,
      )
      expect(draftToReview).toBeDefined()
      expect(reviewToPublished).toBeDefined()

      const publishedRequirements = await callToolOk(
        client,
        'requirements_query_catalog',
        {
          catalog: 'requirements',
          limit: 10,
          responseFormat: 'json',
          statuses: [numberField(publishedStatus ?? {}, 'id', 'published')],
        },
      )
      const publishedRequirement = firstRecord(
        arrayField(publishedRequirements, 'items', 'published requirements'),
        'published requirements',
      )
      const publishedRequirementId = numberField(
        publishedRequirement,
        'id',
        'published requirement',
      )
      const publishedRequirementUniqueId = stringField(
        publishedRequirement,
        'uniqueId',
        'published requirement',
      )

      await callToolOk(client, 'requirements_get_requirement', {
        responseFormat: 'json',
        uniqueId: publishedRequirementUniqueId,
        view: 'detail',
      })

      const specifications = await callToolOk(
        client,
        'requirements_list_specifications',
        {
          responseFormat: 'json',
        },
      )
      const specification = await findUnlinkedSpecification(
        client,
        arrayField(specifications, 'specifications', 'specifications').map(
          item => asRecord(item, 'specification'),
        ),
        publishedRequirementUniqueId,
      )
      const specificationId = numberField(specification, 'id', 'specification')

      const created = await callToolOk(
        client,
        'requirements_manage_requirement',
        {
          operation: 'create',
          requirement: {
            acceptanceCriteria:
              'The Phase 6 seeded MCP scan can create disposable data.',
            areaId,
            createdBy: 'phase-6-mcp-seeded-scan',
            description: `Phase 6 disposable MCP requirement ${Date.now()}`,
            requiresTesting: false,
          },
          responseFormat: 'json',
        },
      )
      const createdDetail = recordField(created, 'detail', 'created')
      const disposableId = numberField(
        createdDetail,
        'id',
        'disposable requirement',
      )
      const disposableUniqueId = stringField(
        createdDetail,
        'uniqueId',
        'disposable requirement',
      )
      const createdVersion = firstRecord(
        arrayField(createdDetail, 'versions', 'created detail'),
        'created versions',
      )
      const baseVersionId = numberField(createdVersion, 'id', 'created version')
      const baseRevisionToken = stringField(
        createdVersion,
        'revisionToken',
        'created version',
      )

      await callToolOk(client, 'requirements_get_requirement', {
        responseFormat: 'json',
        uniqueId: disposableUniqueId,
        view: 'history',
      })

      const edited = await callToolOk(
        client,
        'requirements_manage_requirement',
        {
          operation: 'edit',
          requirement: {
            baseRevisionToken,
            baseVersionId,
            description: 'Phase 6 disposable MCP requirement edited',
          },
          responseFormat: 'json',
          uniqueId: disposableUniqueId,
        },
      )
      const editedVersion = firstRecord(
        arrayField(
          recordField(edited, 'detail', 'edited'),
          'versions',
          'edited detail',
        ),
        'edited versions',
      )
      const editedRevisionToken = stringField(
        editedVersion,
        'revisionToken',
        'edited version',
      )
      expect(editedRevisionToken).not.toBe(baseRevisionToken)

      const staleEdit = await client.callTool({
        arguments: {
          operation: 'edit',
          requirement: {
            baseRevisionToken,
            baseVersionId,
            description: 'Phase 6 stale edit must not overwrite',
          },
          responseFormat: 'json',
          uniqueId: disposableUniqueId,
        },
        name: 'requirements_manage_requirement',
      })
      const staleText = expectToolError(staleEdit, 'stale edit')
      expect(staleText).toMatch(/changed|stale|conflict/i)
      await recordEvent({
        name: 'requirements_manage_requirement_stale_edit',
        status: 'expected-error',
      })

      await callToolOk(client, 'requirements_transition_requirement', {
        responseFormat: 'json',
        toStatusId: numberField(
          draftToReview ?? {},
          'toStatusId',
          'draft to review',
        ),
        uniqueId: disposableUniqueId,
      })
      await callToolOk(client, 'requirements_transition_requirement', {
        responseFormat: 'json',
        toStatusId: numberField(
          reviewToPublished ?? {},
          'toStatusId',
          'review to published',
        ),
        uniqueId: disposableUniqueId,
      })

      const addResult = await callToolOk(
        client,
        'requirements_add_to_specification',
        {
          requirementIds: [publishedRequirementId],
          responseFormat: 'json',
          specificationId,
        },
      )
      expect(numberField(addResult, 'addedCount', 'add result')).toBe(1)

      const removeResult = await callToolOk(
        client,
        'requirements_remove_from_specification',
        {
          requirementIds: [publishedRequirementId],
          responseFormat: 'json',
          specificationId,
        },
      )
      expect(numberField(removeResult, 'removedCount', 'remove result')).toBe(1)

      await callToolOk(client, 'requirements_list_improvement_suggestions', {
        requirementId: disposableId,
        responseFormat: 'json',
      })
      const createdSuggestion = await callToolOk(
        client,
        'requirements_manage_improvement_suggestion',
        {
          content: 'Phase 6 disposable MCP improvement suggestion',
          createdBy: 'phase-6-mcp-seeded-scan',
          operation: 'create',
          requirementId: disposableId,
          responseFormat: 'json',
        },
      )
      const suggestionId = numberField(
        recordField(createdSuggestion, 'result', 'created suggestion'),
        'id',
        'suggestion result',
      )
      await callToolOk(client, 'requirements_manage_improvement_suggestion', {
        content: 'Phase 6 disposable MCP improvement suggestion edited',
        operation: 'edit',
        responseFormat: 'json',
        suggestionId,
      })

      await callToolOk(client, 'requirements_manage_requirement', {
        operation: 'archive',
        responseFormat: 'json',
        uniqueId: disposableUniqueId,
      })

      const aiResult = await client.callTool({
        arguments: {
          areaId,
          locale: 'en',
          topic: 'Phase 6 OpenRouter disabled smoke',
        },
        name: 'requirements_generate_requirements',
      })
      const aiText = expectToolError(aiResult, 'AI generation disabled')
      expect(aiText).toBe('Error: An internal error occurred')
      await recordEvent({
        name: 'requirements_generate_requirements',
        status: 'expected-error',
      })

      events.push('seeded-corpus:ok')
      await writeSummary('passed', events)
    } catch (err) {
      await writeSummary('failed', [
        redactSensitive(err instanceof Error ? err.message : String(err)),
      ])
      throw err
    } finally {
      await client.close().catch(() => undefined)
      await transport.close().catch(() => undefined)
    }
  })
})
