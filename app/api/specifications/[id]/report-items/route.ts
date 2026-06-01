import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequirementById } from '@/lib/dal/requirements'
import {
  getSpecificationById,
  getSpecificationBySlug,
  getSpecificationItemById,
  getSpecificationLocalRequirementDetail,
  parseSpecificationItemRef,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  ARRAY_INPUT_MAX_ITEMS,
  businessTextSchema,
  invalidRequestResponse,
  parseRouteParams,
  parseSearchParams,
  parseWithSchema,
  routeSegmentSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
import { observeCapacity } from '@/lib/observability/capacity'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'
import { MAX_REPORT_ITEM_COUNT } from '@/lib/reports/limits'
import { requirementPackageName } from '@/lib/reports/package-name'
import { createRequestContext } from '@/lib/requirements/auth'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

const reportItemsQuerySchema = z
  .object({
    refs: businessTextSchema,
  })
  .strict()

const itemRefsSchema = z
  .array(routeSegmentSchema)
  .min(1)
  .max(Math.min(ARRAY_INPUT_MAX_ITEMS, MAX_REPORT_ITEM_COUNT))

function mapSpecificationLocalRequirementToReportData(
  requirement: NonNullable<
    Awaited<ReturnType<typeof getSpecificationLocalRequirementDetail>>
  >,
): RequirementReportData {
  return {
    area: null,
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
              color: requirement.riskLevel.color,
              iconName: requirement.riskLevel.iconName,
              nameEn: requirement.riskLevel.nameEn,
              nameSv: requirement.riskLevel.nameSv,
            }
          : null,
        status: STATUS_PUBLISHED,
        statusColor: '#22c55e',
        statusIconName: 'CheckCircle2',
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
        versionRequirementPackages: requirement.requirementPackages.map(
          requirementPackage => ({
            requirementPackage: {
              id: requirementPackage.id,
              name: requirementPackageName(requirementPackage),
            },
          }),
        ),
      },
    ],
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const context = await createRequestContext(request, 'rest')
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const parsedQuery = parseSearchParams(
    request.nextUrl.searchParams,
    reportItemsQuerySchema,
  )
  if (!parsedQuery.ok) {
    return parsedQuery.response
  }
  let decodedRefs: string[]
  try {
    decodedRefs = parsedQuery.data.refs
      .split(',')
      .map(ref => decodeURIComponent(ref.trim()))
      .filter(Boolean)
  } catch (error) {
    if (error instanceof URIError) {
      return invalidRequestResponse([
        {
          code: 'invalid_format',
          message: 'Invalid refs',
          path: 'refs',
        },
      ])
    }
    throw error
  }
  const parsedItemRefs = parseWithSchema(itemRefsSchema, decodedRefs)
  if (!parsedItemRefs.ok) {
    return parsedItemRefs.response
  }
  const { id } = parsedParams.data
  const itemRefs = parsedItemRefs.data
  return observeCapacity(
    {
      correlationId: context.correlationId,
      metrics: { item_count: itemRefs.length },
      operation: 'reports.specification_items',
      requestId: context.requestId,
      slowThresholdMs: 10_000,
      source: 'rest',
    },
    async () => {
      const db = await getRequestSqlServerDataSource()
      const spec = /^\d+$/.test(id)
        ? await getSpecificationById(db, Number(id))
        : await getSpecificationBySlug(db, id)

      if (!spec) {
        return applyResponseCorrelationHeaders(
          NextResponse.json({ error: 'Not found' }, { status: 404 }),
          context,
        )
      }

      const reportItems: RequirementReportData[] = []

      for (const itemRef of itemRefs) {
        const parsed = parseSpecificationItemRef(itemRef)
        if (!parsed) {
          return applyResponseCorrelationHeaders(
            NextResponse.json(
              { error: `Invalid item ref: ${itemRef}` },
              { status: 400 },
            ),
            context,
          )
        }

        if (parsed.kind === 'library') {
          const specificationItem = await getSpecificationItemById(
            db,
            parsed.id,
          )
          if (
            !specificationItem ||
            specificationItem.specificationId !== spec.id
          ) {
            return applyResponseCorrelationHeaders(
              NextResponse.json(
                { error: `Item not found in specification: ${itemRef}` },
                { status: 404 },
              ),
              context,
            )
          }

          const requirement = await getRequirementById(
            db,
            specificationItem.requirementId,
          )
          if (!requirement) {
            return applyResponseCorrelationHeaders(
              NextResponse.json(
                { error: `Requirement not found: ${itemRef}` },
                { status: 404 },
              ),
              context,
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
          return applyResponseCorrelationHeaders(
            NextResponse.json(
              { error: `Item not found in specification: ${itemRef}` },
              { status: 404 },
            ),
            context,
          )
        }

        reportItems.push(
          mapSpecificationLocalRequirementToReportData(localRequirement),
        )
      }

      return applyResponseCorrelationHeaders(
        NextResponse.json(reportItems),
        context,
      )
    },
  )
}
