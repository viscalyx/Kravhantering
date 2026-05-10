import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createOwner, listOwners } from '@/lib/dal/owners'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

const ownerCreateSchema = z
  .object({
    email: boundedDbStringSchema,
    firstName: boundedDbStringSchema,
    lastName: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const ownersList = await listOwners(db)
  return NextResponse.json({
    owners: ownersList.map(o => ({
      id: o.id,
      name: `${o.firstName} ${o.lastName}`,
    })),
  })
}

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(request, ownerCreateSchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const owner = await createOwner(db, parsedBody.data)
  return NextResponse.json(owner, { status: 201 })
}
