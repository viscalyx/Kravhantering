'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePdfDownload } from '@/components/reports/pdf/usePdfDownload'
import { fetchMultipleRequirements } from '@/lib/reports/data/fetch-requirement'
import { extractErrorDetails } from '@/lib/reports/extract-error-details'
import { buildListReport } from '@/lib/reports/templates/list-template'
import type { ReportModel } from '@/lib/reports/types'

interface PackageReportResponse {
  businessNeedsReference: string | null
  implementationType: { nameSv: string; nameEn: string } | null
  name: string
  responsibilityArea: { nameSv: string; nameEn: string } | null
  uniqueId: string
}

export default function PdfListReportPage() {
  const searchParams = useSearchParams()
  const params = useParams()
  const locale = useLocale()
  const t = useTranslations('reports')
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const latestRequestRef = useRef(0)
  const isMountedRef = useRef(true)

  const ids = searchParams.get('ids')
  const slug = typeof params.slug === 'string' ? params.slug : null
  const [filename, setFilename] = useState('list-report.pdf')
  const tRef = useRef(t)
  tRef.current = t

  const {
    download,
    downloading,
    error: pdfError,
  } = usePdfDownload({
    model,
    locale,
    filename,
  })

  const loadReport = useCallback(async () => {
    const requestId = ++latestRequestRef.current
    const isLatestRequest = () =>
      isMountedRef.current && latestRequestRef.current === requestId

    if (isLatestRequest()) {
      setError(null)
      setModel(null)
      setLoading(true)
    }

    if (!ids) {
      if (isLatestRequest()) {
        setError(tRef.current('noRequirementIds'))
        setLoading(false)
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
      const now = new Date()
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`
      setFilename(tRef.current('listPdfFilename', { stamp }))
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
      if (!isLatestRequest()) {
        return
      }
      setError(
        err instanceof Error ? err.message : tRef.current('failedToLoadReport'),
      )
    } finally {
      if (isLatestRequest()) {
        setLoading(false)
      }
    }
  }, [ids, locale, slug])

  useEffect(() => {
    void loadReport()
    return () => {
      latestRequestRef.current += 1
    }
  }, [loadReport])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      latestRequestRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (model) {
      void download()
    }
  }, [model, download])

  const displayError = error || pdfError
  const downloadLabel = downloading ? t('generatingPdf') : t('downloadAgain')

  return (
    <div
      style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}
    >
      {displayError ? (
        <div style={{ color: '#991b1b' }}>
          <h2>{t('errorTitle')}</h2>
          <p>{displayError}</p>
        </div>
      ) : loading ? (
        <p style={{ color: '#64748b' }}>{t('loadingData')}</p>
      ) : (
        <div>
          <p style={{ color: '#166534', marginBottom: '1rem' }}>
            {downloading ? t('generatingPdf') : t('pdfDownloadStarted')}
          </p>
          <button
            aria-busy={downloading}
            aria-label={downloadLabel}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#312e81] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={downloading}
            onClick={() => {
              if (downloading) return
              void download()
            }}
            style={{
              backgroundColor: '#4338ca',
              border: 'none',
              borderRadius: '0.375rem',
              color: 'white',
              cursor: downloading ? 'not-allowed' : 'pointer',
              minHeight: '44px',
              minWidth: '44px',
              padding: '0.5rem 1rem',
            }}
            type="button"
          >
            {downloadLabel}
          </button>
        </div>
      )}
    </div>
  )
}
