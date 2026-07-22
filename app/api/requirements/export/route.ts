import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { escapeCsvField } from '@/lib/export-csv'
import {
  createCsvItemLimitError,
  runBoundedCsvOutput,
} from '@/lib/generated-output/csv-runner'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  optionalQueryArraySchema,
  optionalSearchStringSchema,
  parseSearchParams,
  positiveIntegerStringSchema,
  queryBooleanStringSchema,
} from '@/lib/http/validation'
import {
  type RequirementListPageItem,
  traverseCompleteRequirementList,
} from '@/lib/requirements/list-query'
import {
  DEFAULT_REQUIREMENT_SORT,
  REQUIREMENT_SORT_FIELDS,
} from '@/lib/requirements/list-view'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'
import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

const REQUIREMENT_CSV_MESSAGES = {
  en: {
    headers: enMessages.requirements.libraryCsvHeaders,
    no: enMessages.common.no,
    yes: enMessages.common.yes,
  },
  sv: {
    headers: svMessages.requirements.libraryCsvHeaders,
    no: svMessages.common.no,
    yes: svMessages.common.yes,
  },
}

type RequirementCsvHeaderKey =
  keyof typeof enMessages.requirements.libraryCsvHeaders

const exportQuerySchema = z
  .object({
    areaIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    categoryIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    descriptionSearch: optionalSearchStringSchema,
    locale: z.enum(['en', 'sv']).optional().default('en'),
    normReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    priorityLevelIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    qualityCharacteristicIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    requirementPackageIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    sortBy: z.enum(REQUIREMENT_SORT_FIELDS).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    statuses: optionalQueryArraySchema(positiveIntegerStringSchema),
    typeIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    uniqueIdSearch: optionalSearchStringSchema,
    verifiable: optionalQueryArraySchema(queryBooleanStringSchema),
  })
  .strict()

function assertUnreachableRequirementCsvHeaderKey(key: never): never {
  throw new Error(`Unhandled requirement CSV header key: ${String(key)}`)
}

function getStaticCsvValue(
  row: RequirementListPageItem,
  key: RequirementCsvHeaderKey,
  locale: 'en' | 'sv',
): string {
  const isSv = locale === 'sv'

  switch (key) {
    case 'area':
      return row.area?.name ?? ''
    case 'category':
      return isSv
        ? (row.version?.categoryNameSv ?? '')
        : (row.version?.categoryNameEn ?? '')
    case 'description':
      return row.version?.description ?? ''
    case 'normReferenceUri':
      return (row.normReferenceUris ?? []).filter(Boolean).join(', ')
    case 'normReferences':
      return (row.normReferenceIds ?? []).join(', ')
    case 'priorityLevel':
      return isSv
        ? (row.version?.priorityLevelNameSv ?? '')
        : (row.version?.priorityLevelNameEn ?? '')
    case 'qualityCharacteristic':
      return isSv
        ? (row.version?.qualityCharacteristicNameSv ?? '')
        : (row.version?.qualityCharacteristicNameEn ?? '')
    case 'status':
      return isSv
        ? (row.version?.statusNameSv ?? '')
        : (row.version?.statusNameEn ?? '')
    case 'type':
      return isSv
        ? (row.version?.typeNameSv ?? '')
        : (row.version?.typeNameEn ?? '')
    case 'uniqueId':
      return row.uniqueId
    case 'verifiable':
      return row.version?.verifiable
        ? REQUIREMENT_CSV_MESSAGES[locale].yes
        : REQUIREMENT_CSV_MESSAGES[locale].no
    case 'version':
      return String(row.version?.versionNumber ?? 1)
    default:
      return assertUnreachableRequirementCsvHeaderKey(key)
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    exportQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response

  const query = parsedQuery.data
  try {
    const { authorization, context, db } =
      await createRequirementsRestRuntime(request)
    const headers = REQUIREMENT_CSV_MESSAGES[query.locale].headers
    const columns = Object.entries(headers).map(([key, header]) => ({
      header,
      key: key as RequirementCsvHeaderKey,
    }))
    const filename =
      query.locale === 'sv' ? 'kravbibliotek.csv' : 'requirements-library.csv'

    return await runBoundedCsvOutput({
      context,
      db,
      generateRows: async ({ maxItems, signal, writeRow }) => {
        await traverseCompleteRequirementList(
          db,
          {
            filters: {
              areaIds: query.areaIds,
              categoryIds: query.categoryIds,
              descriptionSearch: query.descriptionSearch,
              normReferenceIds: query.normReferenceIds,
              priorityLevelIds: query.priorityLevelIds,
              qualityCharacteristicIds: query.qualityCharacteristicIds,
              requirementPackageIds: query.requirementPackageIds,
              statuses: query.statuses,
              typeIds: query.typeIds,
              uniqueIdSearch: query.uniqueIdSearch,
              verifiable: query.verifiable,
            },
            locale: query.locale,
            sort: {
              by: query.sortBy ?? DEFAULT_REQUIREMENT_SORT.by,
              direction:
                query.sortDirection ?? DEFAULT_REQUIREMENT_SORT.direction,
            },
          },
          { authorization, context },
          async page => {
            for (const row of page) {
              await writeRow(
                columns
                  .map(column =>
                    escapeCsvField(
                      getStaticCsvValue(row, column.key, query.locale),
                    ),
                  )
                  .join(';'),
              )
            }
          },
          {
            createItemLimitError: createCsvItemLimitError,
            maxItems,
            signal,
          },
        )
      },
      headers: columns.map(column => column.header),
      operation: 'requirements.library_csv_export',
      requestSignal: request.signal,
      responseHeaders: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'text/csv; charset=utf-8',
      },
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    if (status >= 500) {
      logSanitizedError(
        '[API] Failed to export the requirements library',
        error,
      )
    }
    return Response.json(body, {
      headers: { 'Cache-Control': 'no-store' },
      status,
    })
  }
}
