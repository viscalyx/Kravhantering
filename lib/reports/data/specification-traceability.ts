import {
  getSpecificationById,
  getSpecificationBySlug,
  listSpecificationTraceabilityItems,
  type SpecificationItemRef,
  type TraceabilityReportItem,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { ReportDataError } from '@/lib/reports/data/server'

export interface SpecificationTraceabilityData {
  items: TraceabilityReportItem[]
  specification: NonNullable<Awaited<ReturnType<typeof getSpecificationBySlug>>>
}

function decodeSegment(value: string | number): string {
  const raw = String(value)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

async function resolveSpecification(
  db: SqlServerDatabase,
  specificationIdOrSlug: string | number,
) {
  const decoded = decodeSegment(specificationIdOrSlug)
  const specification = /^\d+$/.test(decoded)
    ? await getSpecificationById(db, Number(decoded))
    : await getSpecificationBySlug(db, decoded)

  if (!specification) {
    throw new ReportDataError(
      `Specification not found: ${specificationIdOrSlug}`,
      404,
    )
  }

  return specification
}

export async function collectSpecificationTraceabilityData(
  db: SqlServerDatabase,
  specificationIdOrSlug: string | number,
  itemRefs: SpecificationItemRef[],
): Promise<SpecificationTraceabilityData> {
  const specification = await resolveSpecification(db, specificationIdOrSlug)
  const items = await listSpecificationTraceabilityItems(
    db,
    specification.id,
    itemRefs,
  )

  if (items.length !== itemRefs.length) {
    throw new ReportDataError(
      'One or more item refs were not found in this specification',
      404,
    )
  }

  return { items, specification }
}
