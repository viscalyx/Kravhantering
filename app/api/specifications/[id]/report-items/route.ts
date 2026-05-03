import { type NextRequest, NextResponse } from 'next/server'
import { getRequirementById, STATUS_PUBLISHED } from '@/lib/dal/requirements'
import {
  getSpecificationById,
  getSpecificationBySlug,
  getSpecificationItemById,
  getSpecificationLocalRequirementDetail,
  parseSpecificationItemRef,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'

type Params = Promise<{ id: string }>

function mapSpecificationLocalRequirementToReportData(
  requirement: NonNullable<
    Awaited<ReturnType<typeof getSpecificationLocalRequirementDetail>>
  >,
): RequirementReportData {
  return {
    area: requirement.requirementArea
      ? {
          id: requirement.requirementArea.id,
          name: requirement.requirementArea.name,
          ownerName: null,
        }
      : null,
    createdAt: requirement.createdAt,
    id: requirement.id,
    isArchived: false,
    uniqueId: requirement.uniqueId,
    versions: [
      {
        acceptanceCriteria: requirement.acceptanceCriteria,
        archivedAt: null,
        archiveInitiatedAt: null,
        category: requirement.requirementCategory
          ? {
              id: requirement.requirementCategory.id,
              nameEn: requirement.requirementCategory.nameEn,
              nameSv: requirement.requirementCategory.nameSv,
            }
          : null,
        createdAt: requirement.createdAt,
        createdBy: null,
        description: requirement.description,
        editedAt:
          requirement.updatedAt !== requirement.createdAt
            ? requirement.updatedAt
            : null,
        id: requirement.id,
        publishedAt: requirement.createdAt,
        qualityCharacteristic: requirement.qualityCharacteristic
          ? {
              id: requirement.qualityCharacteristic.id,
              nameEn: requirement.qualityCharacteristic.nameEn,
              nameSv: requirement.qualityCharacteristic.nameSv,
            }
          : null,
        requiresTesting: requirement.requiresTesting,
        riskLevel: requirement.riskLevel
          ? {
              id: requirement.riskLevel.id,
              nameEn: requirement.riskLevel.nameEn,
              nameSv: requirement.riskLevel.nameSv,
            }
          : null,
        status: STATUS_PUBLISHED,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        type: requirement.requirementType
          ? {
              id: requirement.requirementType.id,
              nameEn: requirement.requirementType.nameEn,
              nameSv: requirement.requirementType.nameSv,
            }
          : null,
        verificationMethod: requirement.verificationMethod,
        versionNormReferences: requirement.normReferences.map(reference => ({
          normReference: {
            id: reference.id,
            name: reference.name,
            normReferenceId: reference.normReferenceId,
            reference: reference.normReferenceId,
            uri: reference.uri,
          },
        })),
        versionNumber: 1,
        versionScenarios: requirement.scenarios.map(scenario => ({
          scenario: {
            id: scenario.id,
            nameEn: scenario.nameEn,
            nameSv: scenario.nameSv,
          },
        })),
      },
    ],
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const refsParam = request.nextUrl.searchParams.get('refs')

  if (!refsParam) {
    return NextResponse.json({ error: 'Missing refs' }, { status: 400 })
  }

  const itemRefs = refsParam
    .split(',')
    .map(ref => decodeURIComponent(ref.trim()))
    .filter(Boolean)

  if (itemRefs.length === 0) {
    return NextResponse.json({ error: 'Missing refs' }, { status: 400 })
  }
  const db = await getRequestSqlServerDataSource()
  const spec = /^\d+$/.test(id)
    ? await getSpecificationById(db, Number(id))
    : await getSpecificationBySlug(db, id)

  if (!spec) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const reportItems: RequirementReportData[] = []

  for (const itemRef of itemRefs) {
    const parsed = parseSpecificationItemRef(itemRef)
    if (!parsed) {
      return NextResponse.json(
        { error: `Invalid item ref: ${itemRef}` },
        { status: 400 },
      )
    }

    if (parsed.kind === 'library') {
      const specificationItem = await getSpecificationItemById(db, parsed.id)
      if (!specificationItem || specificationItem.specificationId !== spec.id) {
        return NextResponse.json(
          { error: `Item not found in specification: ${itemRef}` },
          { status: 404 },
        )
      }

      const requirement = await getRequirementById(
        db,
        specificationItem.requirementId,
      )
      if (!requirement) {
        return NextResponse.json(
          { error: `Requirement not found: ${itemRef}` },
          { status: 404 },
        )
      }

      reportItems.push({
        ...requirement,
        area: requirement.area
          ? {
              id: requirement.area.id,
              name: requirement.area.name,
              ownerName: null,
            }
          : null,
      })
      continue
    }

    const localRequirement = await getSpecificationLocalRequirementDetail(
      db,
      spec.id,
      parsed.id,
    )
    if (!localRequirement) {
      return NextResponse.json(
        { error: `Item not found in specification: ${itemRef}` },
        { status: 404 },
      )
    }

    reportItems.push(
      mapSpecificationLocalRequirementToReportData(localRequirement),
    )
  }

  return NextResponse.json(reportItems)
}
