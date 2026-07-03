import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  formatMcpRequestPayloadKiB,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
  MCP_REQUEST_PAYLOAD_MAX_BYTES,
} from '@/lib/ai/generation-availability'
import { McpAuthError, verifyMcpBearerToken } from '@/lib/auth/mcp-token'
import { getCachedMcpMaxRequestBytes } from '@/lib/dal/ai-settings'
import type { SqlServerDatabase } from '@/lib/db'
import { createKravhanteringMcpServer } from '@/lib/mcp/server'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { createRequirementsRuntime } from '@/lib/requirements/server'

export const MCP_DEFAULT_REQUEST_BYTES = MCP_REQUEST_PAYLOAD_DEFAULT_BYTES

interface RequestPayloadSize {
  contentLength?: number
  exceededAbsoluteMax: boolean
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
  if (request.method !== 'POST') return { exceededAbsoluteMax: false }
  const contentLength = parseContentLength(request)
  if (contentLength !== undefined) {
    return {
      contentLength,
      exceededAbsoluteMax: contentLength > MCP_REQUEST_PAYLOAD_MAX_BYTES,
    }
  }
  if (!request.body) return { exceededAbsoluteMax: false }

  const reader = request.clone().body?.getReader()
  if (!reader) return { exceededAbsoluteMax: false }

  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      return {
        exceededAbsoluteMax: false,
        measuredBytes: totalBytes,
      }
    }
    totalBytes += value.byteLength
    if (totalBytes > MCP_REQUEST_PAYLOAD_MAX_BYTES) {
      await reader.cancel().catch(() => undefined)
      return { exceededAbsoluteMax: true }
    }
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

  const payloadSize = await inspectRequestPayloadSize(request)
  if (payloadSize.exceededAbsoluteMax) {
    return createPayloadTooLargeResponse(MCP_REQUEST_PAYLOAD_MAX_BYTES)
  }
  if (request.method === 'POST') {
    const maxRequestBytes = await getCachedMcpMaxRequestBytes(db)
    if (requestPayloadExceedsLimit(payloadSize, maxRequestBytes)) {
      return createPayloadTooLargeResponse(maxRequestBytes)
    }
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

  const { service } = createRequirementsRuntime(db)
  const server = createKravhanteringMcpServer(service, request)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)
  return transport.handleRequest(request)
}
