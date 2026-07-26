import { NextResponse } from 'next/server'

const swaggerIndexPath = '/api-docs/hsa-person-lookup/index.html'

export function GET(request: Request) {
  const response = NextResponse.redirect(
    new URL(swaggerIndexPath, request.url),
    { status: 307 },
  )
  response.headers.set('Cache-Control', 'no-store')
  return response
}
