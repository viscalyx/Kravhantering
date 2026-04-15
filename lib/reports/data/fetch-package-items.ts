import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'

export async function fetchPackageItemsForReport(
  packageIdOrSlug: number | string,
  itemRefs: string[],
  locale: string,
): Promise<RequirementReportData[]> {
  const refs = itemRefs.map(ref => encodeURIComponent(ref)).join(',')
  const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000'
  const response = await fetch(
    `${baseUrl}/api/requirement-packages/${encodeURIComponent(
      String(packageIdOrSlug),
    )}/report-items?locale=${encodeURIComponent(locale)}&refs=${refs}`,
  )

  if (!response.ok) {
    throw new Error(
      `Failed to fetch report items for package ${packageIdOrSlug}: ${response.status}`,
    )
  }

  return response.json()
}
