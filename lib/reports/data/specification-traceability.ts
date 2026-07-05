import {
  getSpecificationById,
  listSpecificationTraceabilityItems,
  type SpecificationItemRef,
  type TraceabilityReportItem,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { ReportDataError } from '@/lib/reports/data/server'

export interface SpecificationTraceabilityData {
  items: TraceabilityReportItem[]
  specification: SpecificationTraceabilitySpecification
}

export type SpecificationTraceabilitySpecification = NonNullable<
  Awaited<ReturnType<typeof getSpecificationById>>
>

type SpecificationTraceabilitySource =
  | SpecificationTraceabilitySpecification
  | number

async function resolveSpecification(
  db: SqlServerDatabase,
  specificationId: number,
) {
  const specification = await getSpecificationById(db, specificationId)

  if (!specification) {
    throw new ReportDataError(
      `Specification not found: ${specificationId}`,
      404,
    )
  }

  return specification
}

export async function collectSpecificationTraceabilityData(
  db: SqlServerDatabase,
  specificationInput: SpecificationTraceabilitySource,
  itemRefs: SpecificationItemRef[],
): Promise<SpecificationTraceabilityData> {
  const specification =
    typeof specificationInput === 'object'
      ? specificationInput
      : await resolveSpecification(db, specificationInput)
  const items = await listSpecificationTraceabilityItems(
    db,
    specification.id,
    itemRefs,
  )
  const itemsByRef = new Map(items.map(item => [item.itemRef, item]))
  const orderedItems = itemRefs.flatMap(itemRef => {
    const item = itemsByRef.get(itemRef)
    return item ? [item] : []
  })

  if (orderedItems.length !== itemRefs.length) {
    throw new ReportDataError(
      'One or more item refs were not found in this specification',
      404,
    )
  }

  return { items: orderedItems, specification }
}
