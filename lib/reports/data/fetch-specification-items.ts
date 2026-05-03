import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'

export async function fetchSpecificationItemsForReport(
  specificationIdOrSlug: number | string,
  itemRefs: string[],
  locale: string,
): Promise<RequirementReportData[]> {
  const refs = itemRefs.map(ref => encodeURIComponent(ref)).join(',')
  const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000'
  const response = await fetch(
    `${baseUrl}/api/specifications/${encodeURIComponent(
      String(specificationIdOrSlug),
    )}/report-items?locale=${encodeURIComponent(locale)}&refs=${refs}`,
  )

  if (!response.ok) {
    throw new Error(
      `Failed to fetch report items for specification ${specificationIdOrSlug}: ${response.status}`,
    )
  }

  return response.json()
}
