import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  formatMcpRequestPayloadKiB,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'
import { McpAuthError, verifyMcpBearerToken } from '@/lib/auth/mcp-token'
import { getCachedMcpRuntimeSettings } from '@/lib/dal/ai-settings'
import type { SqlServerDatabase } from '@/lib/db'
import { createKravhanteringMcpServer } from '@/lib/mcp/server'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { createRequirementsRuntime } from '@/lib/requirements/server'

export const MCP_DEFAULT_REQUEST_BYTES = MCP_REQUEST_PAYLOAD_DEFAULT_BYTES

interface RequestPayloadSize {
  contentLength?: number
  measuredBytes?: number
}

function createMethodNotAllowedResponse() {
  return new Response(
    JSON.stringify({
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
      jsonrpc: '2.0',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      status: 405,
    },
  )
}

function createPayloadTooLargeResponse(limitBytes: number) {
  return new Response(
    JSON.stringify({
      error: {
        code: -32000,
        message: `MCP request payload exceeds the ${formatMcpRequestPayloadKiB(limitBytes)} KiB size limit.`,
      },
      id: null,
      jsonrpc: '2.0',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      status: 413,
    },
  )
}

function parseContentLength(request: Request): number | undefined {
  const value = request.headers.get('content-length')
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

async function inspectRequestPayloadSize(
  request: Request,
): Promise<RequestPayloadSize> {
  if (request.method !== 'POST') return {}
  const contentLength = parseContentLength(request)
  if (contentLength !== undefined) {
    return { contentLength }
  }
  if (!request.body) return {}

  const reader = request.clone().body?.getReader()
  if (!reader) return {}

  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      return { measuredBytes: totalBytes }
    }
    totalBytes += value.byteLength
  }
}

function requestPayloadExceedsLimit(
  payloadSize: RequestPayloadSize,
  limitBytes: number,
): boolean {
  return (
    (payloadSize.contentLength ?? payloadSize.measuredBytes ?? 0) > limitBytes
  )
}

export async function handleRequirementsMcpRequest(
  request: Request,
  db: SqlServerDatabase,
): Promise<Response> {
  if (!['DELETE', 'GET', 'POST'].includes(request.method)) {
    return createMethodNotAllowedResponse()
  }

  try {
    const verified = await verifyMcpBearerToken(request)
    attachVerifiedActor(request, verified.actor)
  } catch (err) {
    if (err instanceof McpAuthError) {
      return new Response(
        JSON.stringify({
          error: { code: -32000, message: err.message },
          id: null,
          jsonrpc: '2.0',
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer',
          },
          status: err.status,
        },
      )
    }
    throw err
  }

  const mcpSettings = await getCachedMcpRuntimeSettings(db)
  if (request.method === 'POST') {
    const payloadSize = await inspectRequestPayloadSize(request)
    if (
      requestPayloadExceedsLimit(payloadSize, mcpSettings.mcpMaxRequestBytes)
    ) {
      return createPayloadTooLargeResponse(mcpSettings.mcpMaxRequestBytes)
    }
  }

  const { service } = createRequirementsRuntime(db)
  const server = createKravhanteringMcpServer(service, request, mcpSettings)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)
  return transport.handleRequest(request)
}
