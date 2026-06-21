import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { exportToCsv } from '@/lib/export-csv'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  businessTextSchema,
  nonNegativeIntegerStringSchema,
  optionalBusinessTextSchema,
  optionalQueryArraySchema,
  optionalSearchStringSchema,
  parseSearchParams,
  positiveIntegerSchema,
  positiveIntegerStringSchema,
  queryBooleanStringSchema,
  uniquePositiveIntegerArraySchema,
} from '@/lib/http/validation'
import { queryRequirementList } from '@/lib/requirements/list-query'
import {
  DEFAULT_REQUIREMENT_SORT,
  REQUIREMENT_SORT_FIELDS,
} from '@/lib/requirements/list-view'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'
import { withUtf8Bom } from '@/lib/text-export'
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
type RequirementListCsvRow = Awaited<
  ReturnType<typeof queryRequirementList>
>['requirements'][number]

function assertUnreachableRequirementCsvHeaderKey(key: never): never {
  throw new Error(
    `Unhandled RequirementCsvHeaderKey in getStaticCsvValue: ${String(key)}`,
  )
}

function getStaticCsvColumns(locale: 'en' | 'sv') {
  const headers = REQUIREMENT_CSV_MESSAGES[locale].headers
  return Object.entries(headers).map(([key, header]) => ({
    header,
    key: key as RequirementCsvHeaderKey,
  }))
}

function getStaticCsvValue(
  row: RequirementListCsvRow,
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
    case 'qualityCharacteristic':
      return isSv
        ? (row.version?.qualityCharacteristicNameSv ?? '')
        : (row.version?.qualityCharacteristicNameEn ?? '')
    case 'requiresTesting':
      return row.version?.requiresTesting
        ? REQUIREMENT_CSV_MESSAGES[locale].yes
        : REQUIREMENT_CSV_MESSAGES[locale].no
    case 'riskLevel':
      return isSv
        ? (row.version?.riskLevelNameSv ?? '')
        : (row.version?.riskLevelNameEn ?? '')
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
    case 'version':
      return String(row.version?.versionNumber ?? 1)
    default:
      return assertUnreachableRequirementCsvHeaderKey(key)
  }
}

const optionalBodyIdSchema = positiveIntegerSchema
  .nullable()
  .optional()
  .transform(value => value ?? undefined)

const optionalBodyIdArraySchema = uniquePositiveIntegerArraySchema()
  .nullable()
  .optional()
  .transform(value => value ?? undefined)

const requirementsQuerySchema = z
  .object({
    areaIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    categoryIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    descriptionSearch: optionalSearchStringSchema,
    format: z.enum(['csv']).optional(),
    limit: positiveIntegerStringSchema
      .refine(value => value <= 200, {
        message: 'Expected a page size no greater than 200',
      })
      .optional(),
    locale: z.enum(['en', 'sv']).optional().default('en'),
    needsReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    normReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    offset: nonNegativeIntegerStringSchema.optional(),
    qualityCharacteristicIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    requirementPackageIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    requiresTesting: optionalQueryArraySchema(queryBooleanStringSchema),
    riskLevelIds: optionalQueryArraySchema(positiveIntegerStringSchema),
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

const requirementMutationSchema = z
  .object({
    acceptanceCriteria: optionalBusinessTextSchema,
    areaId: positiveIntegerSchema,
    categoryId: optionalBodyIdSchema,
    description: businessTextSchema,
    normReferenceIds: optionalBodyIdArraySchema,
    qualityCharacteristicId: optionalBodyIdSchema,
    requirementPackageIds: optionalBodyIdArraySchema,
    requiresTesting: z.boolean().optional().default(false),
    riskLevelId: optionalBodyIdSchema,
    typeId: optionalBodyIdSchema,
    verificationMethod: optionalBusinessTextSchema,
  })
  .strict()

type RequirementMutationBody = z.infer<typeof requirementMutationSchema>

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const parsedQuery = parseSearchParams(
    url.searchParams,
    requirementsQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response

  const {
    areaIds = [],
    categoryIds = [],
    descriptionSearch,
    format,
    limit,
    locale,
    normReferenceIds = [],
    offset,
    qualityCharacteristicIds = [],
    requirementPackageIds = [],
    requiresTesting = [],
    riskLevelIds = [],
    sortBy,
    sortDirection,
    statuses = [],
    typeIds = [],
    uniqueIdSearch,
  } = parsedQuery.data

  try {
    const { authorization, context, db } =
      await createRequirementsRestRuntime(request)
    const result = await queryRequirementList(
      db,
      {
        filters: {
          areaIds: areaIds.length > 0 ? areaIds : undefined,
          categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
          descriptionSearch,
          normReferenceIds:
            normReferenceIds.length > 0 ? normReferenceIds : undefined,
          qualityCharacteristicIds:
            qualityCharacteristicIds.length > 0
              ? qualityCharacteristicIds
              : undefined,
          requirementPackageIds:
            requirementPackageIds.length > 0
              ? requirementPackageIds
              : undefined,
          requiresTesting:
            requiresTesting.length > 0 ? requiresTesting : undefined,
          riskLevelIds: riskLevelIds.length > 0 ? riskLevelIds : undefined,
          statuses: statuses.length > 0 ? statuses : undefined,
          typeIds: typeIds.length > 0 ? typeIds : undefined,
          uniqueIdSearch,
        },
        limit,
        locale,
        offset,
        sort: {
          by: sortBy ?? DEFAULT_REQUIREMENT_SORT.by,
          direction: sortDirection ?? DEFAULT_REQUIREMENT_SORT.direction,
        },
      },
      { authorization, context },
    )
    const requirements = result.requirements

    if (format === 'csv') {
      const isSv = locale === 'sv'
      const columns = getStaticCsvColumns(locale)
      const headers = columns.map(column => column.header)

      const data = requirements.map(r => {
        return Object.fromEntries(
          columns.map(column => [
            column.header,
            getStaticCsvValue(r, column.key, locale),
          ]),
        )
      })

      const csv = exportToCsv(headers, data)

      const filename = isSv ? 'kravbibliotek.csv' : 'requirements-library.csv'

      return new NextResponse(withUtf8Bom(csv), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    return NextResponse.json({
      pagination: result.pagination,
      requirements,
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const POST = secureMutationRoute<RequirementMutationBody>({
  bodySchema: requirementMutationSchema,
  policy: requirementsMutationPolicy<RequirementMutationBody>(({ body }) => ({
    areaId: body.areaId,
    kind: 'manage_requirement',
    operation: 'create',
  })),
  handler: async ({ body, context, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const result = await service.manageRequirement(context, {
        operation: 'create',
        requirement: {
          acceptanceCriteria: body.acceptanceCriteria,
          areaId: body.areaId,
          categoryId: body.categoryId,
          description: body.description,
          normReferenceIds: body.normReferenceIds,
          requiresTesting: body.requiresTesting,
          verificationMethod: body.verificationMethod,
          requirementPackageIds: body.requirementPackageIds,
          qualityCharacteristicId: body.qualityCharacteristicId,
          riskLevelId: body.riskLevelId,
          typeId: body.typeId,
        },
      })

      return NextResponse.json(result.result, { status: 201 })
    } catch (error) {
      logSanitizedError('[API] Failed to create requirement', error)
      const { body: errorBody, status } = toHttpErrorPayload(error)
      return NextResponse.json(errorBody, { status })
    }
  },
})
