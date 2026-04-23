import { getRequestSqlServerDataSource } from '@/lib/db'
import { handleRequirementsMcpRequest } from '@/lib/mcp/http'

async function handleRequest(request: Request) {
  const db = await getRequestSqlServerDataSource()
  return handleRequirementsMcpRequest(request, db)
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
