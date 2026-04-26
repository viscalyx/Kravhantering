import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { McpAuthError, verifyMcpBearerToken } from '@/lib/auth/mcp-token'
import type { SqlServerDatabase } from '@/lib/db'
import { createKravhanteringMcpServer } from '@/lib/mcp/server'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { createRequirementsLogger } from '@/lib/requirements/logging'
import { createRequirementsService } from '@/lib/requirements/service'

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

  const logger = createRequirementsLogger()
  const service = createRequirementsService(db, { logger })
  const server = createKravhanteringMcpServer(service, request)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)
  return transport.handleRequest(request)
}
