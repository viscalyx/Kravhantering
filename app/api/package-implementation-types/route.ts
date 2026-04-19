import { NextResponse } from 'next/server'
import {
  createPackageImplementationType,
  listPackageImplementationTypes,
} from '@/lib/dal/package-implementation-types'
import { getRequestDatabase } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabase()
  const types = await listPackageImplementationTypes(db)
  return NextResponse.json({ types })
}

export async function POST(request: Request) {
  const db = await getRequestDatabase()
  const body = (await request.json()) as Parameters<
    typeof createPackageImplementationType
  >[1]
  const type = await createPackageImplementationType(db, body)
  return NextResponse.json(type, { status: 201 })
}
