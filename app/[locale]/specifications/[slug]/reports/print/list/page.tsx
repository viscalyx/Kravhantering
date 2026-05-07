'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import PrintReportRenderer from '@/components/reports/print/PrintReportRenderer'
import { devMarker } from '@/lib/developer-mode-markers'
import { fetchSpecificationItemsForReport } from '@/lib/reports/data/fetch-specification-items'
import { extractErrorDetails } from '@/lib/reports/extract-error-details'
import { buildListReport } from '@/lib/reports/templates/list-template'
import type { ReportModel } from '@/lib/reports/types'

interface SpecificationReportResponse {
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

  const refs = searchParams.get('refs')
  const slug = typeof params.slug === 'string' ? params.slug : null
  const reportContext = 'requirements specification list report'
  const tRef = useRef(t)
  tRef.current = t

  const loadReport = useCallback(async () => {
    const requestId = ++latestRequestRef.current
    const isLatestRequest = () =>
      isMountedRef.current && latestRequestRef.current === requestId

    setError(null)
    setModel(null)

    if (!refs) {
      if (isLatestRequest()) {
        setError(tRef.current('noRequirementsSelected'))
      }
      return
    }
    try {
      const itemRefs = refs
        .split(',')
        .map(ref => decodeURIComponent(ref.trim()))
        .filter(Boolean)
      if (itemRefs.length === 0) {
        if (isLatestRequest()) {
          setError(tRef.current('noRequirementsSelected'))
        }
        return
      }
      const [requirements, specRes] = await Promise.all([
        slug
          ? fetchSpecificationItemsForReport(slug, itemRefs, locale)
          : Promise.resolve([]),
        slug
          ? fetch(`/api/specifications/${encodeURIComponent(slug)}`)
          : Promise.resolve(null),
      ])
      if (!isLatestRequest()) {
        return
      }
      if (slug && specRes && !specRes.ok) {
        const details = extractErrorDetails((await specRes.text()).trim())
        if (!isLatestRequest()) {
          return
        }
        throw new Error(
          details
            ? tRef.current('specificationFetchFailedWithDetails', {
                details,
                status: specRes.status,
              })
            : tRef.current('specificationFetchFailed', {
                status: specRes.status,
              }),
        )
      }
      const spec = specRes
        ? ((await specRes.json()) as SpecificationReportResponse)
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
          spec
            ? {
                name: spec.name,
                uniqueId: spec.uniqueId,
                responsibilityArea: pickName(spec.responsibilityArea),
                implementationType: pickName(spec.implementationType),
                lifecycleStatus: pickName(spec.lifecycleStatus),
                businessNeedsReference: spec.businessNeedsReference,
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
  }, [locale, refs, slug])

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
