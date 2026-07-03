import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'
import {
  nonNegativeIntegerStringSchema,
  optionalQueryArraySchema,
  optionalSearchStringSchema,
  parseSearchParams,
  positiveIntegerStringSchema,
  queryBooleanStringSchema,
} from '@/lib/http/validation'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'
import {
  collectMultipleRequirementListItemsForReport,
  ReportDataError,
} from '@/lib/reports/data/server'
import { getReportLabels } from '@/lib/reports/report-labels'
import { buildListReport } from '@/lib/reports/templates/list-template'
import { queryRequirementList } from '@/lib/requirements/list-query'
import {
  DEFAULT_REQUIREMENT_SORT,
  type FilterValues,
  REQUIREMENT_SORT_FIELDS,
  type RequirementSortState,
} from '@/lib/requirements/list-view'
import {
  authorizeRequirementReportRead,
  createReportRuntime,
  type ReportRouteParams,
  type ReportRuntime,
  reportErrorResponse,
  splitCsvParam,
  timestampForFilename,
} from '../route-helpers'

export const dynamic = 'force-dynamic'

const REPORT_QUERY_PAGE_SIZE = 200

const listReportQuerySchema = z
  .object({
    areaIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    categoryIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    descriptionSearch: optionalSearchStringSchema,
    ids: z.string().optional(),
    limit: positiveIntegerStringSchema.optional(),
    locale: z.enum(['en', 'sv']).optional(),
    needsReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    normReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    offset: nonNegativeIntegerStringSchema.optional(),
    priorityLevelIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    qualityCharacteristicIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    requirementPackageIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    verifiable: optionalQueryArraySchema(queryBooleanStringSchema),
    sortBy: z.enum(REQUIREMENT_SORT_FIELDS).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    specificationItemStatusIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    statuses: optionalQueryArraySchema(positiveIntegerStringSchema),
    typeIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    uniqueIdSearch: optionalSearchStringSchema,
  })
  .strict()

type ListReportQuery = z.infer<typeof listReportQuerySchema>
type ListQueryRequirement = Awaited<
  ReturnType<typeof queryRequirementList>
>['requirements'][number]

function reportLocale(locale: string): 'en' | 'sv' {
  return locale === 'sv' ? 'sv' : 'en'
}

function filtersFromQuery(query: ListReportQuery): FilterValues {
  return {
    areaIds: query.areaIds,
    categoryIds: query.categoryIds,
    descriptionSearch: query.descriptionSearch,
    needsReferenceIds: query.needsReferenceIds,
    normReferenceIds: query.normReferenceIds,
    priorityLevelIds: query.priorityLevelIds,
    qualityCharacteristicIds: query.qualityCharacteristicIds,
    requirementPackageIds: query.requirementPackageIds,
    verifiable: query.verifiable,
    specificationItemStatusIds: query.specificationItemStatusIds,
    statuses: query.statuses,
    typeIds: query.typeIds,
    uniqueIdSearch: query.uniqueIdSearch,
  }
}

function sortFromQuery(query: ListReportQuery): RequirementSortState {
  return {
    by: query.sortBy ?? DEFAULT_REQUIREMENT_SORT.by,
    direction: query.sortDirection ?? DEFAULT_REQUIREMENT_SORT.direction,
  }
}

function listQueryRequirementToReportData(
  requirement: ListQueryRequirement,
): RequirementReportData {
  const version = requirement.version

  return {
    area: requirement.area
      ? {
          id: requirement.area.id,
          name: requirement.area.name,
          ownerHsaId: '',
          ownerName: null,
        }
      : null,
    createdAt: requirement.createdAt,
    id: requirement.id,
    isArchived: requirement.isArchived,
    uniqueId: requirement.uniqueId,
    versions: [
      {
        acceptanceCriteria: version.acceptanceCriteria,
        archivedAt: null,
        archiveInitiatedAt: version.archiveInitiatedAt,
        category: null,
        createdAt: version.versionCreatedAt,
        createdBy: null,
        description: version.description,
        editedAt: null,
        id: version.id,
        priorityLevel:
          version.priorityLevelId == null
            ? null
            : {
                color: version.priorityLevelColor,
                iconName: version.priorityLevelIconName,
                id: version.priorityLevelId,
                nameEn: version.priorityLevelNameEn ?? '',
                nameSv: version.priorityLevelNameSv ?? '',
              },
        publishedAt: null,
        qualityCharacteristic: null,
        verifiable: version.verifiable,
        status: version.status,
        statusColor: version.statusColor,
        statusIconName: version.statusIconName,
        statusNameEn: version.statusNameEn,
        statusNameSv: version.statusNameSv,
        type: null,
        verificationMethod: null,
        versionNormReferences: [],
        versionNumber: version.versionNumber,
        versionRequirementPackages: requirement.requirementPackages.map(
          requirementPackage => ({
            requirementPackage: {
              id: requirementPackage.id,
              name: requirementPackage.name,
            },
          }),
        ),
      },
    ],
  }
}

async function collectFilteredRequirementsForListReport(
  runtime: ReportRuntime,
  query: ListReportQuery,
  locale: 'en' | 'sv',
): Promise<RequirementReportData[]> {
  const requirements: RequirementReportData[] = []
  let offset = 0

  for (;;) {
    const result = await queryRequirementList(
      runtime.db,
      {
        filters: filtersFromQuery(query),
        limit: REPORT_QUERY_PAGE_SIZE,
        locale,
        offset,
        sort: sortFromQuery(query),
      },
      { authorization: runtime.authorization, context: runtime.context },
    )

    for (const requirement of result.requirements) {
      await authorizeRequirementReportRead(
        runtime.authorization,
        runtime.context,
        String(requirement.id),
        'detail',
      )
      requirements.push(listQueryRequirementToReportData(requirement))
    }

    if (!result.pagination.hasMore || result.pagination.nextOffset == null) {
      break
    }

    if (result.pagination.nextOffset <= offset) {
      throw new ReportDataError('Invalid requirement list pagination', 500)
    }
    offset = result.pagination.nextOffset
  }

  if (requirements.length === 0) {
    throw new ReportDataError('No requirements matched report filters', 400)
  }

  return requirements
}

export async function GET(
  request: NextRequest,
  { params }: { params: ReportRouteParams },
) {
  const { locale } = await params

  try {
    const parsedQuery = parseSearchParams(
      request.nextUrl.searchParams,
      listReportQuerySchema,
    )
    if (!parsedQuery.ok) {
      parsedQuery.response.headers.set('Cache-Control', 'no-store')
      return parsedQuery.response
    }

    const runtime = await createReportRuntime(request)
    const ids = splitCsvParam(parsedQuery.data.ids ?? null)
    const requirements =
      parsedQuery.data.ids == null
        ? await collectFilteredRequirementsForListReport(
            runtime,
            parsedQuery.data,
            reportLocale(locale),
          )
        : await (async () => {
            if (ids.length === 0) {
              throw new ReportDataError('No requirement IDs provided', 400)
            }
            for (const id of ids) {
              await authorizeRequirementReportRead(
                runtime.authorization,
                runtime.context,
                id,
                'detail',
              )
            }
            return collectMultipleRequirementListItemsForReport(runtime.db, ids)
          })()
    const label = getReportLabels(locale).filenames.list
    return renderReportModelPdfResponse(
      buildListReport(requirements, locale),
      locale,
      `${label} ${timestampForFilename()}.pdf`,
    )
  } catch (error) {
    return reportErrorResponse(error)
  }
}
