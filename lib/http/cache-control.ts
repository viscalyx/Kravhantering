import type { NextResponse } from 'next/server'

export const noStore = <T extends NextResponse>(response: T): T => {
  response.headers.set('Cache-Control', 'no-store')
  return response
}
