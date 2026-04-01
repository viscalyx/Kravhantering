'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import PrintReportRenderer from '@/components/reports/print/PrintReportRenderer'
import { fetchMultipleRequirements } from '@/lib/reports/data/fetch-requirement'
import { buildListReport } from '@/lib/reports/templates/list-template'
import type { ReportModel } from '@/lib/reports/types'

export default function PrintListReportPage() {
  const searchParams = useSearchParams()
  const params = useParams()
  const locale = useLocale()
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ids = searchParams.get('ids')
  const slug = typeof params.slug === 'string' ? params.slug : null

  const loadReport = useCallback(async () => {
    if (!ids) {
      setError('No requirement IDs provided')
      return
    }
    try {
      const idList = ids.split(',').filter(Boolean)
      if (idList.length === 0) {
        setError('No requirement IDs provided')
        return
      }
      const [requirements, pkgRes] = await Promise.all([
        fetchMultipleRequirements(idList, locale),
        slug
          ? fetch(`/api/requirement-packages/${slug}`)
          : Promise.resolve(null),
      ])
      const pkg = pkgRes?.ok
        ? ((await pkgRes.json()) as {
            name: string
            uniqueId: string
            responsibilityArea: { nameSv: string; nameEn: string } | null
            implementationType: { nameSv: string; nameEn: string } | null
            businessNeedsReference: string | null
          })
        : null
      const pickName = (obj: { nameSv: string; nameEn: string } | null) =>
        obj ? (locale === 'sv' ? obj.nameSv : obj.nameEn) : null
      setModel(
        buildListReport(
          requirements,
          locale,
          pkg
            ? {
                name: pkg.name,
                uniqueId: pkg.uniqueId,
                responsibilityArea: pickName(pkg.responsibilityArea),
                implementationType: pickName(pkg.implementationType),
                businessNeedsReference: pkg.businessNeedsReference,
              }
            : undefined,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    }
  }, [ids, locale, slug])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  useEffect(() => {
    if (model) {
      const timer = setTimeout(() => globalThis.print(), 500)
      return () => clearTimeout(timer)
    }
  }, [model])

  if (error) {
    return (
      <div style={{ padding: '2rem', color: '#991b1b' }}>
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (!model) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        Loading report...
      </div>
    )
  }

  return <PrintReportRenderer locale={locale} model={model} />
}
