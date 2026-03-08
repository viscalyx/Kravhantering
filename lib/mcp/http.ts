import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { Database } from '@/lib/db'
import { createKravhanteringMcpServer } from '@/lib/mcp/server'
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
  db: Database,
) {
  if (!['DELETE', 'GET', 'POST'].includes(request.method)) {
    return createMethodNotAllowedResponse()
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
