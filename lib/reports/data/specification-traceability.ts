import {
  getSpecificationById,
  listSpecificationTraceabilityItems,
  type SpecificationItemRef,
  type TraceabilityReportItem,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { ReportDataError } from '@/lib/reports/data/server'
import { traverseCompleteSpecificationItemResult } from '@/lib/requirements/specification-item-page'
import {
  type SpecificationItemQueryState,
  toSpecificationItemPageInput,
} from '@/lib/requirements/specification-item-query'

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
  query: SpecificationItemQueryState,
): Promise<SpecificationTraceabilityData> {
  const specification =
    typeof specificationInput === 'object'
      ? specificationInput
      : await resolveSpecification(db, specificationInput)
  const items: TraceabilityReportItem[] = []
  await traverseCompleteSpecificationItemResult(
    db,
    toSpecificationItemPageInput(specification.id, query),
    async pageItems => {
      const itemRefs = pageItems.flatMap(item =>
        item.itemRef ? [item.itemRef as SpecificationItemRef] : [],
      )
      const pageDetails = await listSpecificationTraceabilityItems(
        db,
        specification.id,
        itemRefs,
      )
      const detailsByRef = new Map(
        pageDetails.map(item => [item.itemRef, item]),
      )
      const orderedPage = itemRefs.flatMap(itemRef => {
        const item = detailsByRef.get(itemRef)
        return item ? [item] : []
      })

      if (orderedPage.length !== itemRefs.length) {
        throw new ReportDataError(
          'A requirement application changed while the report was generated',
          409,
        )
      }
      items.push(...orderedPage)
    },
  )

  return { items, specification }
}
