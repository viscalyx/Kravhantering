import { NextResponse } from 'next/server'
import {
  countLinkedRequirementsByPackage,
  createRequirementPackage,
  listRequirementPackages,
} from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'

type CreateRequirementPackagePayload = Parameters<
  typeof createRequirementPackage
>[1]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(
  body: Record<string, unknown>,
  field: 'nameEn' | 'nameSv',
  details: string[],
): string {
  const value = body[field]
  if (typeof value !== 'string' || value.trim() === '') {
    details.push(`${field} must be a non-empty string`)
    return ''
  }
  return value
}

function optionalString(
  body: Record<string, unknown>,
  field: 'descriptionEn' | 'descriptionSv',
  details: string[],
): string | undefined {
  const value = body[field]
  if (value == null || value === '') return undefined
  if (typeof value !== 'string') {
    details.push(`${field} must be a string`)
    return undefined
  }
  return value
}

function optionalOwnerId(value: unknown, details: string[]): number | null {
  if (value == null || value === '') return null
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN
  if (!Number.isInteger(parsed) || parsed < 1) {
    details.push('ownerId must be a positive integer or null')
    return null
  }
  return parsed
}

function parseCreatePayload(body: unknown): {
  details: string[]
  payload?: CreateRequirementPackagePayload
} {
  const details: string[] = []
  if (!isRecord(body)) {
    return { details: ['payload must be an object'] }
  }

  const payload: CreateRequirementPackagePayload = {
    nameSv: requiredString(body, 'nameSv', details),
    nameEn: requiredString(body, 'nameEn', details),
    descriptionSv: optionalString(body, 'descriptionSv', details),
    descriptionEn: optionalString(body, 'descriptionEn', details),
    ownerId: optionalOwnerId(body.ownerId, details),
  }

  return details.length > 0 ? { details } : { details, payload }
}

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [requirementPackages, counts] = await Promise.all([
    listRequirementPackages(db),
    countLinkedRequirementsByPackage(db),
  ])
  return NextResponse.json({
    requirementPackages: requirementPackages.map(s => ({
      ...s,
      linkedRequirementCount: counts[s.id] ?? 0,
    })),
  })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid payload', details: ['payload must be valid JSON'] },
      { status: 400 },
    )
  }

  const { details, payload } = parseCreatePayload(body)
  if (!payload) {
    return NextResponse.json(
      { error: 'Invalid payload', details },
      { status: 400 },
    )
  }

  const db = await getRequestSqlServerDataSource()
  const requirementPackage = await createRequirementPackage(db, payload)
  return NextResponse.json(requirementPackage, { status: 201 })
}
