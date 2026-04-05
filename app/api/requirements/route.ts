import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { createUiSettingsLoader } from '@/lib/dal/ui-settings'
import { getDb } from '@/lib/db'
import { exportToCsv } from '@/lib/export-csv'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  isRequirementSortDirection,
  isRequirementSortField,
} from '@/lib/requirements/list-view'
import {
  createRequirementsService,
  type RequirementListItem,
  toHttpErrorPayload,
} from '@/lib/requirements/service'
import { getRequirementCsvHeaders } from '@/lib/ui-terminology'

export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const uiSettings = createUiSettingsLoader(db)
  const service = createRequirementsService(db, { uiSettings })
  const context = createRequestContext(request, 'rest')

  const url = new URL(request.url)
  const format = url.searchParams.get('format')
  const localeParam = url.searchParams.get('locale')
  const locale: 'en' | 'sv' = localeParam === 'sv' ? 'sv' : 'en'
  const uniqueIdSearch = url.searchParams.get('uniqueIdSearch') ?? undefined
  const descriptionSearch =
    url.searchParams.get('descriptionSearch') ?? undefined
  const sortByParam = url.searchParams.get('sortBy')
  const sortDirectionParam = url.searchParams.get('sortDirection')
  const areaIds = url.searchParams
    .getAll('areaIds')
    .map(Number)
    .filter(n => !Number.isNaN(n))
  const categoryIds = url.searchParams
    .getAll('categoryIds')
    .map(Number)
    .filter(n => !Number.isNaN(n))
  const typeIds = url.searchParams
    .getAll('typeIds')
    .map(Number)
    .filter(n => !Number.isNaN(n))
  const qualityCharacteristicIds = url.searchParams
    .getAll('qualityCharacteristicIds')
    .map(Number)
    .filter(n => !Number.isNaN(n))
  const requiresTestingParams = url.searchParams.getAll('requiresTesting')
  const requiresTesting = requiresTestingParams
    .map(v => (v === 'true' ? true : v === 'false' ? false : null))
    .filter((v): v is boolean => v !== null)
  const statusParams = url.searchParams.getAll('statuses')
  const statuses = statusParams.map(Number).filter(n => !Number.isNaN(n))
  const normReferenceIds = url.searchParams
    .getAll('normReferenceIds')
    .filter(v => v.trim() !== '')
    .map(Number)
    .filter(n => Number.isInteger(n) && n > 0)
  const usageScenarioIds = url.searchParams
    .getAll('usageScenarioIds')
    .map(Number)
    .filter(n => !Number.isNaN(n))
  const includeArchived = statuses.length === 0 || statuses.includes(4)

  try {
    const result = await service.queryCatalog(context, {
      areaIds: areaIds.length > 0 ? areaIds : undefined,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
      catalog: 'requirements',
      descriptionSearch,
      includeArchived,
      limit: url.searchParams.get('limit')
        ? Number(url.searchParams.get('limit'))
        : undefined,
      locale,
      offset: url.searchParams.get('offset')
        ? Number(url.searchParams.get('offset'))
        : undefined,
      requiresTesting: requiresTesting.length > 0 ? requiresTesting : undefined,
      sortBy:
        sortByParam && isRequirementSortField(sortByParam)
          ? sortByParam
          : undefined,
      sortDirection:
        sortDirectionParam && isRequirementSortDirection(sortDirectionParam)
          ? sortDirectionParam
          : undefined,
      statuses: statuses.length > 0 ? statuses : undefined,
      qualityCharacteristicIds:
        qualityCharacteristicIds.length > 0
          ? qualityCharacteristicIds
          : undefined,
      typeIds: typeIds.length > 0 ? typeIds : undefined,
      uniqueIdSearch,
      normReferenceIds:
        normReferenceIds.length > 0 ? normReferenceIds : undefined,
      usageScenarioIds:
        usageScenarioIds.length > 0 ? usageScenarioIds : undefined,
    })

    const requirements = result.items as RequirementListItem[]

    if (format === 'csv') {
      const isSv = locale === 'sv'
      const terminology = await uiSettings.getTerminology()
      const headers = getRequirementCsvHeaders(locale, terminology)

      const data = requirements.map(r => {
        const values = [
          r.uniqueId,
          r.version?.description ?? '',
          r.area?.name ?? '',
          isSv
            ? (r.version?.categoryNameSv ?? '')
            : (r.version?.categoryNameEn ?? ''),
          isSv ? (r.version?.typeNameSv ?? '') : (r.version?.typeNameEn ?? ''),
          isSv
            ? (r.version?.qualityCharacteristicNameSv ?? '')
            : (r.version?.qualityCharacteristicNameEn ?? ''),
          isSv
            ? (r.version?.statusNameSv ?? '')
            : (r.version?.statusNameEn ?? ''),
          r.version?.requiresTesting
            ? isSv
              ? 'Ja'
              : 'Yes'
            : isSv
              ? 'Nej'
              : 'No',
          String(r.version?.versionNumber ?? 1),
          (r.normReferenceIds ?? []).join(', '),
        ]
        return Object.fromEntries(headers.map((h, i) => [h, values[i]]))
      })

      const csv = exportToCsv(headers, data)

      const filename = isSv ? 'kravkatalog.csv' : 'requirements.csv'

      return new NextResponse(csv, {
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

export async function POST(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const service = createRequirementsService(db)
  const context = createRequestContext(request, 'rest')
  const body = (await request.json()) as Record<string, unknown>

  try {
    const result = await service.manageRequirement(context, {
      operation: 'create',
      requirement: {
        acceptanceCriteria: body.acceptanceCriteria
          ? String(body.acceptanceCriteria)
          : undefined,
        areaId: Number(body.areaId),
        categoryId: body.categoryId ? Number(body.categoryId) : undefined,
        createdBy: body.ownerId ? String(body.ownerId) : undefined,
        description: String(body.description ?? ''),
        references: Array.isArray(body.references)
          ? body.references
              .filter(
                (
                  reference,
                ): reference is {
                  id?: number
                  name?: string
                  owner?: string
                  uri?: string
                } =>
                  typeof reference === 'object' &&
                  reference !== null &&
                  typeof reference.name === 'string',
              )
              .map(reference => ({
                id: reference.id,
                name: reference.name ?? '',
                owner: reference.owner,
                uri: reference.uri,
              }))
          : undefined,
        normReferenceIds: Array.isArray(body.normReferenceIds)
          ? body.normReferenceIds
              .filter((value: unknown) => String(value).trim() !== '')
              .map((value: unknown) => Number(value))
              .filter((value: number) => Number.isInteger(value) && value > 0)
          : undefined,
        requiresTesting: (body.requiresTesting as boolean) ?? false,
        verificationMethod: body.verificationMethod
          ? String(body.verificationMethod)
          : undefined,
        scenarioIds: Array.isArray(body.scenarioIds)
          ? body.scenarioIds
              .map(value => Number(value))
              .filter(value => !Number.isNaN(value))
          : undefined,
        qualityCharacteristicId: body.qualityCharacteristicId
          ? Number(body.qualityCharacteristicId)
          : undefined,
        typeId: body.typeId ? Number(body.typeId) : undefined,
      },
    })

    return NextResponse.json(result.result, { status: 201 })
  } catch (error) {
    const { body: errorBody, status } = toHttpErrorPayload(error)
    return NextResponse.json(errorBody, { status })
  }
}
