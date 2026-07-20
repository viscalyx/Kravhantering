import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getApplicationSettings } from '@/lib/dal/application-settings'
import {
  GeneratedOutputError,
  generatedOutputErrorResponse,
  isGeneratedOutputError,
} from '@/lib/generated-output/errors'
import {
  ClientCancelledGeneratedOutputError,
  createGeneratedOutputTerminalRecorder,
  createGenerationDeadline,
  GeneratedOutputTimeoutError,
  generatedOutputErrorFromTimeout,
  throwIfGenerationAborted,
} from '@/lib/generated-output/operation'
import {
  acquireGeneratedOutputSpool,
  createGeneratedOutputFileResponse,
  type GeneratedOutputSpool,
  generatedOutputCapacitySnapshot,
} from '@/lib/generated-output/spool'
import {
  optionalQueryArraySchema,
  optionalSearchStringSchema,
  parseSearchParams,
  positiveIntegerStringSchema,
  queryBooleanStringSchema,
} from '@/lib/http/validation'
import { pdfContentDisposition } from '@/lib/pdf/filename'
import { renderReportInWorker } from '@/lib/pdf/report-worker'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'
import {
  collectMultipleRequirementListItemsForReport,
  ReportDataError,
} from '@/lib/reports/data/server'
import { getReportLabels } from '@/lib/reports/report-labels'
import { buildListReport } from '@/lib/reports/templates/list-template'
import {
  type RequirementListPageItem,
  traverseCompleteRequirementList,
} from '@/lib/requirements/list-query'
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

const listReportQuerySchema = z
  .object({
    areaIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    categoryIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    descriptionSearch: optionalSearchStringSchema,
    ids: z.string().optional(),
    locale: z.enum(['en', 'sv']).optional(),
    needsReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    normReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
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
  requirement: RequirementListPageItem,
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
  maxRequirements: number,
  signal: AbortSignal,
): Promise<RequirementReportData[]> {
  const requirements: RequirementReportData[] = []
  await traverseCompleteRequirementList(
    runtime.db,
    {
      filters: filtersFromQuery(query),
      locale,
      sort: sortFromQuery(query),
    },
    { authorization: runtime.authorization, context: runtime.context },
    async page => {
      for (const requirement of page) {
        await authorizeRequirementReportRead(
          runtime.authorization,
          runtime.context,
          String(requirement.id),
          'detail',
        )
        throwIfGenerationAborted(signal)
        requirements.push(listQueryRequirementToReportData(requirement))
      }
    },
    {
      createItemLimitError: limit =>
        new GeneratedOutputError(
          'output_limit_exceeded',
          'item_limit_exceeded',
          { limit, limitKind: 'items', output: 'pdf' },
        ),
      maxItems: maxRequirements,
      signal,
    },
  )

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
  let spool: GeneratedOutputSpool | undefined
  let deadline: ReturnType<typeof createGenerationDeadline> | undefined

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
    const settings = await getApplicationSettings(runtime.db)
    const terminal = createGeneratedOutputTerminalRecorder(
      'requirements.list_pdf_report',
      runtime.context,
    )
    let byteCount = 0
    let itemCount = 0
    const terminalMetrics = () => ({
      activeCount: generatedOutputCapacitySnapshot().activePdf,
      byteCount,
      concurrencyLimit: settings.pdfReportConcurrencyPerNode,
      itemCount,
      itemLimit: settings.pdfReportMaxRequirements,
      timeoutMs: settings.pdfReportTimeoutSeconds * 1000,
      workerMemoryLimitBytes: settings.pdfWorkerMemoryMib * 1024 * 1024,
    })

    try {
      spool = await acquireGeneratedOutputSpool({
        concurrencyLimit: settings.pdfReportConcurrencyPerNode,
        maxFileBytes: settings.pdfReportMaxFileBytes,
        output: 'pdf',
      })
      deadline = createGenerationDeadline(
        settings.pdfReportTimeoutSeconds,
        request.signal,
      )
      const ids = splitCsvParam(parsedQuery.data.ids ?? null)
      const uniqueIds = [...new Set(ids)]
      const requirements =
        parsedQuery.data.ids == null
          ? await collectFilteredRequirementsForListReport(
              runtime,
              parsedQuery.data,
              reportLocale(locale),
              settings.pdfReportMaxRequirements,
              deadline.signal,
            )
          : await (async () => {
              if (ids.length === 0) {
                throw new ReportDataError('No requirement IDs provided', 400)
              }
              if (uniqueIds.length > settings.pdfReportMaxRequirements) {
                throw new GeneratedOutputError(
                  'output_limit_exceeded',
                  'item_limit_exceeded',
                  {
                    limit: settings.pdfReportMaxRequirements,
                    limitKind: 'items',
                    output: 'pdf',
                  },
                )
              }
              for (const id of uniqueIds) {
                throwIfGenerationAborted(deadline?.signal ?? request.signal)
                await authorizeRequirementReportRead(
                  runtime.authorization,
                  runtime.context,
                  id,
                  'detail',
                )
              }
              return collectMultipleRequirementListItemsForReport(
                runtime.db,
                uniqueIds,
              )
            })()
      itemCount = requirements.length
      throwIfGenerationAborted(deadline.signal)
      byteCount = await renderReportInWorker({
        locale,
        maxBytes: settings.pdfReportMaxFileBytes,
        memoryLimitMib: settings.pdfWorkerMemoryMib,
        model: buildListReport(requirements, locale),
        outputPath: spool.filePath,
        signal: deadline.signal,
      })
      throwIfGenerationAborted(deadline.signal)
      deadline.dispose()
      deadline = undefined

      const label = getReportLabels(locale).filenames.list
      const filename = `${label} ${timestampForFilename()}.pdf`
      const response = await createGeneratedOutputFileResponse(
        spool,
        {
          'Content-Disposition': pdfContentDisposition(filename),
          'Content-Type': 'application/pdf',
        },
        {
          onCancel: () => terminal.cancelled(terminalMetrics()),
          onComplete: () => terminal.completed(terminalMetrics()),
          onError: () =>
            terminal.failed(
              new Error('PDF response stream failed'),
              terminalMetrics(),
            ),
        },
      )
      spool = undefined
      return response
    } catch (error) {
      deadline?.dispose()
      deadline = undefined
      spool?.releaseGeneration()
      await spool?.releaseSpool().catch(() => {})
      spool = undefined
      terminal.failed(error, terminalMetrics())

      if (error instanceof GeneratedOutputTimeoutError) {
        return generatedOutputErrorResponse(
          generatedOutputErrorFromTimeout('pdf', error),
        )
      }
      if (isGeneratedOutputError(error)) {
        return generatedOutputErrorResponse(error)
      }
      if (error instanceof ClientCancelledGeneratedOutputError) {
        return new Response(null, {
          headers: { 'Cache-Control': 'no-store' },
          status: 499,
        })
      }
      throw error
    }
  } catch (error) {
    return reportErrorResponse(error)
  } finally {
    deadline?.dispose()
    spool?.releaseGeneration()
    await spool?.releaseSpool().catch(() => {})
  }
}
