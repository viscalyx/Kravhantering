import { getMcpAuthConfig } from '@/lib/auth/config'
import { McpAuthError } from '@/lib/auth/mcp-token'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  createMcpAuthenticationErrorResponse,
  handleRequirementsMcpRequest,
} from '@/lib/mcp/http'

async function handleRequest(request: Request) {
  try {
    if (getMcpAuthConfig() === null) {
      return new Response(null, { status: 404 })
    }
  } catch {
    return createMcpAuthenticationErrorResponse(
      new McpAuthError('auth_configuration_invalid'),
    )
  }
  return handleRequirementsMcpRequest(request, getRequestSqlServerDataSource)
}

export async function GET(request: Request) {
  return handleRequest(request)
}

export async function POST(request: Request) {
  return handleRequest(request)
}

export async function DELETE(request: Request) {
  return handleRequest(request)
}
