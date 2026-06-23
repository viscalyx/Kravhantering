'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import PrintReportRenderer from '@/components/reports/print/PrintReportRenderer'
import { devMarker } from '@/lib/developer-mode-markers'
import type { SpecificationTraceabilityData } from '@/lib/reports/data/specification-traceability'
import { buildSpecificationTraceabilityReport } from '@/lib/reports/templates/specification-traceability-template'
import type { ReportModel } from '@/lib/reports/types'

function extractErrorDetails(raw: string): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { error?: unknown }
    return typeof parsed.error === 'string' ? parsed.error : raw
  } catch {
    return raw
  }
}

export default function SpecificationTraceabilityPrintReportPage() {
  const params = useParams<{ slug?: string }>()
  const slug = params?.slug
  const searchParams = useSearchParams()
  const refs = searchParams.get('refs')
  const locale = useLocale()
  const t = useTranslations('reports')
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    setError(null)
    setModel(null)

    if (!slug || !refs) {
      setError(t('noRequirementsSelected'))
      setLoading(false)
      return
    }

    const controller = new AbortController()
    fetch(
      `/api/requirements-specifications/${encodeURIComponent(
        slug,
      )}/traceability-items?refs=${encodeURIComponent(refs)}`,
      { signal: controller.signal },
    )
      .then(async response => {
        const text = await response.text()
        if (!response.ok) {
          const details = extractErrorDetails(text)
          throw new Error(
            details
              ? t('specificationFetchFailedWithDetails', {
                  details,
                  status: response.status,
                })
              : t('specificationFetchFailed', { status: response.status }),
          )
        }

        return JSON.parse(text) as SpecificationTraceabilityData
      })
      .then(data => {
        if (requestIdRef.current !== requestId) return
        setModel(buildSpecificationTraceabilityReport(data, locale))
      })
      .catch(fetchError => {
        if (requestIdRef.current !== requestId) return
        if (
          fetchError instanceof DOMException &&
          fetchError.name === 'AbortError'
        ) {
          return
        }
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : t('failedToLoadReport'),
        )
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [locale, refs, slug, t])

  if (loading) {
    return (
      <div
        className="p-8"
        {...devMarker({
          context: 'requirements specification report',
          name: 'report state',
          priority: 300,
          value: 'traceability-print:loading',
        })}
      >
        {t('loading')}
      </div>
    )
  }

  if (error || !model) {
    return (
      <div
        className="p-8"
        {...devMarker({
          context: 'requirements specification report',
          name: 'report state',
          priority: 300,
          value: 'traceability-print:error',
        })}
      >
        <h1 className="mb-2 text-xl font-semibold">{t('errorTitle')}</h1>
        <p>{error ?? t('failedToLoadReport')}</p>
      </div>
    )
  }

  return (
    <div
      {...devMarker({
        context: 'requirements specification report',
        name: 'report state',
        priority: 300,
        value: 'traceability-print:renderer',
      })}
    >
      <PrintReportRenderer locale={locale} model={model} />
    </div>
  )
}
