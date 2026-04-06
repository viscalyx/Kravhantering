'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import PrintReportRenderer from '@/components/reports/print/PrintReportRenderer'
import { devMarker } from '@/lib/developer-mode-markers'
import { fetchMultipleRequirements } from '@/lib/reports/data/fetch-requirement'
import { extractErrorDetails } from '@/lib/reports/extract-error-details'
import { buildListReport } from '@/lib/reports/templates/list-template'
import type { ReportModel } from '@/lib/reports/types'

interface PackageReportResponse {
  businessNeedsReference: string | null
  implementationType: { nameSv: string; nameEn: string } | null
  lifecycleStatus: { nameSv: string; nameEn: string } | null
  name: string
  responsibilityArea: { nameSv: string; nameEn: string } | null
  uniqueId: string
}

export default function PrintListReportPage() {
  const searchParams = useSearchParams()
  const params = useParams()
  const locale = useLocale()
  const t = useTranslations('reports')
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latestRequestRef = useRef(0)
  const isMountedRef = useRef(true)

  const ids = searchParams.get('ids')
  const slug = typeof params.slug === 'string' ? params.slug : null
  const reportContext = 'requirement package list report'
  const tRef = useRef(t)
  tRef.current = t

  const loadReport = useCallback(async () => {
    const requestId = ++latestRequestRef.current
    const isLatestRequest = () =>
      isMountedRef.current && latestRequestRef.current === requestId

    setError(null)
    setModel(null)

    if (!ids) {
      if (isLatestRequest()) {
        setError(tRef.current('noRequirementIds'))
      }
      return
    }
    try {
      const idList = ids.replace(/\s+/g, '').split(',').filter(Boolean)
      if (idList.length === 0) {
        if (isLatestRequest()) {
          setError(tRef.current('noRequirementIds'))
        }
        return
      }
      const [requirements, pkgRes] = await Promise.all([
        fetchMultipleRequirements(idList, locale),
        slug
          ? fetch(`/api/requirement-packages/${encodeURIComponent(slug)}`)
          : Promise.resolve(null),
      ])
      if (!isLatestRequest()) {
        return
      }
      if (slug && pkgRes && !pkgRes.ok) {
        const details = extractErrorDetails((await pkgRes.text()).trim())
        if (!isLatestRequest()) {
          return
        }
        throw new Error(
          details
            ? tRef.current('packageFetchFailedWithDetails', {
                details,
                status: pkgRes.status,
              })
            : tRef.current('packageFetchFailed', { status: pkgRes.status }),
        )
      }
      const pkg = pkgRes
        ? ((await pkgRes.json()) as PackageReportResponse)
        : null
      if (!isLatestRequest()) {
        return
      }
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
                lifecycleStatus: pickName(pkg.lifecycleStatus),
                businessNeedsReference: pkg.businessNeedsReference,
              }
            : undefined,
        ),
      )
    } catch (err) {
      if (!isLatestRequest()) {
        return
      }
      setError(
        err instanceof Error ? err.message : tRef.current('failedToLoadReport'),
      )
    }
  }, [ids, locale, slug])

  useEffect(() => {
    void loadReport()
    return () => {
      latestRequestRef.current += 1
    }
  }, [loadReport])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      latestRequestRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (model) {
      const timer = setTimeout(() => globalThis.print(), 500)
      return () => clearTimeout(timer)
    }
  }, [model])

  if (error) {
    return (
      <div
        {...devMarker({
          context: reportContext,
          name: 'report state',
          priority: 340,
          value: 'report-print:error',
        })}
        style={{ padding: '2rem', color: '#991b1b' }}
      >
        <h1>{t('errorTitle')}</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (!model) {
    return (
      <div
        {...devMarker({
          context: reportContext,
          name: 'report state',
          priority: 340,
          value: 'report-print:loading',
        })}
        style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}
      >
        {t('loading')}
      </div>
    )
  }

  return (
    <div
      {...devMarker({
        context: reportContext,
        name: 'report state',
        priority: 340,
        value: 'report-print:renderer',
      })}
    >
      <PrintReportRenderer locale={locale} model={model} />
    </div>
  )
}
