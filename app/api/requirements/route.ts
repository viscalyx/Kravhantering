import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { exportToCsv } from '@/lib/export-csv'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  createRequirementsService,
  type RequirementListItem,
  toHttpErrorPayload,
} from '@/lib/requirements/service'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const service = createRequirementsService(db)
  const context = createRequestContext(request, 'rest')

  const url = new URL(request.url)
  const format = url.searchParams.get('format')
  const uniqueIdSearch = url.searchParams.get('uniqueIdSearch') ?? undefined
  const descriptionSearch =
    url.searchParams.get('descriptionSearch') ?? undefined
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
  const typeCategoryIds = url.searchParams
    .getAll('typeCategoryIds')
    .map(Number)
    .filter(n => !Number.isNaN(n))
  const requiresTestingParams = url.searchParams.getAll('requiresTesting')
  const requiresTesting = requiresTestingParams
    .map(v => (v === 'true' ? true : v === 'false' ? false : null))
    .filter((v): v is boolean => v !== null)
  const statusParams = url.searchParams.getAll('statuses')
  const statuses = statusParams.map(Number).filter(n => !Number.isNaN(n))
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
      offset: url.searchParams.get('offset')
        ? Number(url.searchParams.get('offset'))
        : undefined,
      requiresTesting: requiresTesting.length > 0 ? requiresTesting : undefined,
      statuses: statuses.length > 0 ? statuses : undefined,
      typeCategoryIds: typeCategoryIds.length > 0 ? typeCategoryIds : undefined,
      typeIds: typeIds.length > 0 ? typeIds : undefined,
      uniqueIdSearch,
    })

    const requirements = result.items as RequirementListItem[]

    if (format === 'csv') {
      const locale = url.searchParams.get('locale') ?? 'sv'
      const isSv = locale === 'sv'

      const headers = isSv
        ? [
            'Krav-ID',
            'Beskrivning',
            'Kravområde',
            'Kravkategori',
            'Kravtyp',
            'ISO-kategori',
            'Kravstatus',
            'Kräver testning',
            'Version',
          ]
        : [
            'Requirement ID',
            'Description',
            'Requirement area',
            'Requirement category',
            'Requirement type',
            'ISO category',
            'Status',
            'Testable',
            'Version',
          ]

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
            ? (r.version?.typeCategoryNameSv ?? '')
            : (r.version?.typeCategoryNameEn ?? ''),
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
  const { env } = await getCloudflareContext()
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
        requiresTesting: (body.requiresTesting as boolean) ?? false,
        scenarioIds: Array.isArray(body.scenarioIds)
          ? body.scenarioIds
              .map(value => Number(value))
              .filter(value => !Number.isNaN(value))
          : undefined,
        typeCategoryId: body.typeCategoryId
          ? Number(body.typeCategoryId)
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
