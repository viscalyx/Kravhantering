import { type NextRequest, NextResponse } from 'next/server'
import {
  getPackageById,
  getPackageBySlug,
  getPackageItemById,
  getPackageLocalRequirementDetail,
  parsePackageItemRef,
} from '@/lib/dal/requirement-packages'
import { getRequirementById, STATUS_PUBLISHED } from '@/lib/dal/requirements'
import { getRequestDatabase } from '@/lib/db'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'

type Params = Promise<{ id: string }>

function mapPackageLocalRequirementToReportData(
  requirement: NonNullable<
    Awaited<ReturnType<typeof getPackageLocalRequirementDetail>>
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
  const db = await getRequestDatabase()
  const pkg = /^\d+$/.test(id)
    ? await getPackageById(db, Number(id))
    : await getPackageBySlug(db, id)

  if (!pkg) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const reportItems: RequirementReportData[] = []

  for (const itemRef of itemRefs) {
    const parsed = parsePackageItemRef(itemRef)
    if (!parsed) {
      return NextResponse.json(
        { error: `Invalid item ref: ${itemRef}` },
        { status: 400 },
      )
    }

    if (parsed.kind === 'library') {
      const packageItem = await getPackageItemById(db, parsed.id)
      if (!packageItem || packageItem.packageId !== pkg.id) {
        return NextResponse.json(
          { error: `Item not found in package: ${itemRef}` },
          { status: 404 },
        )
      }

      const requirement = await getRequirementById(
        db,
        packageItem.requirementId,
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

    const localRequirement = await getPackageLocalRequirementDetail(
      db,
      pkg.id,
      parsed.id,
    )
    if (!localRequirement) {
      return NextResponse.json(
        { error: `Item not found in package: ${itemRef}` },
        { status: 404 },
      )
    }

    reportItems.push(mapPackageLocalRequirementToReportData(localRequirement))
  }

  return NextResponse.json(reportItems)
}
