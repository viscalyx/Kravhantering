import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isHsaId } from '@/lib/auth/hsa-id'
import { deleteOwner, updateOwner } from '@/lib/dal/owners'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const ownerUpdateSchema = z
  .object({
    email: boundedDbStringSchema.nullable().optional(),
    firstName: boundedDbStringSchema.optional(),
    hsaId: boundedDbStringSchema
      .refine(isHsaId, {
        message:
          'HSA-ID must use format SE<10-digit org no>-<alphanumeric suffix>.',
      })
      .nullable()
      .optional(),
    lastName: boundedDbStringSchema.optional(),
  })
  .strict()

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, ownerUpdateSchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const owner = await updateOwner(db, parsedParams.data.id, parsedBody.data)
  if (!owner) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(owner)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()
  const deleted = await deleteOwner(db, parsedParams.data.id)
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
