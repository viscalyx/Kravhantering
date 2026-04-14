import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackageLocalRequirement,
  getPackageById,
  getPackageBySlug,
  getPackageLocalRequirementDetail,
  updatePackageLocalRequirement,
} from '@/lib/dal/requirement-packages'
import type { Database } from '@/lib/db'
import { getDb } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string; localRequirementId: string }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOptionalPositiveInteger(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error('Expected a positive integer')
  }

  return Number(value)
}

function parseOptionalIntegerArray(value: unknown): number[] {
  if (value === undefined || value === null) {
    return []
  }

  if (
    !Array.isArray(value) ||
    value.some(entry => !Number.isInteger(entry) || Number(entry) < 1)
  ) {
    throw new Error('Expected an array of positive integers')
  }

  return value.map(entry => Number(entry))
}

async function resolvePackageId(
  db: Database,
  idOrSlug: string,
): Promise<number | null> {
  if (/^\d+$/.test(idOrSlug)) {
    return (await getPackageById(db, Number(idOrSlug)))?.id ?? null
  }

  return (await getPackageBySlug(db, idOrSlug))?.id ?? null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id, localRequirementId } = await params
  const numericLocalRequirementId = Number(localRequirementId)
  if (
    !Number.isInteger(numericLocalRequirementId) ||
    numericLocalRequirementId < 1
  ) {
    return NextResponse.json(
      { error: 'Invalid localRequirementId' },
      { status: 400 },
    )
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const packageId = await resolvePackageId(db, id)
  if (packageId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const requirement = await getPackageLocalRequirementDetail(
    db,
    packageId,
    numericLocalRequirementId,
  )
  if (!requirement) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(requirement)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id, localRequirementId } = await params
  const numericLocalRequirementId = Number(localRequirementId)
  if (
    !Number.isInteger(numericLocalRequirementId) ||
    numericLocalRequirementId < 1
  ) {
    return NextResponse.json(
      { error: 'Invalid localRequirementId' },
      { status: 400 },
    )
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const packageId = await resolvePackageId(db, id)
  if (packageId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isRecord(rawBody) || typeof rawBody.description !== 'string') {
    return NextResponse.json(
      { error: 'description (string) is required' },
      { status: 400 },
    )
  }

  try {
    const localRequirement = await updatePackageLocalRequirement(
      db,
      packageId,
      numericLocalRequirementId,
      {
        acceptanceCriteria:
          typeof rawBody.acceptanceCriteria === 'string'
            ? rawBody.acceptanceCriteria
            : null,
        description: rawBody.description,
        needsReferenceId: parseOptionalPositiveInteger(
          rawBody.needsReferenceId,
        ),
        normReferenceIds: parseOptionalIntegerArray(rawBody.normReferenceIds),
        qualityCharacteristicId: parseOptionalPositiveInteger(
          rawBody.qualityCharacteristicId,
        ),
        requirementAreaId:
          parseOptionalPositiveInteger(rawBody.requirementAreaId) ?? null,
        requirementCategoryId: parseOptionalPositiveInteger(
          rawBody.requirementCategoryId,
        ),
        requirementTypeId: parseOptionalPositiveInteger(
          rawBody.requirementTypeId,
        ),
        requiresTesting:
          typeof rawBody.requiresTesting === 'boolean'
            ? rawBody.requiresTesting
            : false,
        riskLevelId: parseOptionalPositiveInteger(rawBody.riskLevelId),
        scenarioIds: parseOptionalIntegerArray(rawBody.scenarioIds),
        verificationMethod:
          typeof rawBody.verificationMethod === 'string'
            ? rawBody.verificationMethod
            : null,
      },
    )

    return NextResponse.json({ localRequirement, ok: true })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Expected')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    console.error('Failed to update package-local requirement', error)
    return NextResponse.json(
      { error: 'Failed to update package-local requirement' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id, localRequirementId } = await params
  const numericLocalRequirementId = Number(localRequirementId)
  if (
    !Number.isInteger(numericLocalRequirementId) ||
    numericLocalRequirementId < 1
  ) {
    return NextResponse.json(
      { error: 'Invalid localRequirementId' },
      { status: 400 },
    )
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const packageId = await resolvePackageId(db, id)
  if (packageId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const deleted = await deletePackageLocalRequirement(
    db,
    packageId,
    numericLocalRequirementId,
  )
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
