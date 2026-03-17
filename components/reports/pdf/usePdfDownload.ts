'use client'

import { createElement, useCallback, useState } from 'react'
import type { ReportModel } from '@/lib/reports/types'

interface UsePdfDownloadOptions {
  filename: string
  locale: string
  model: ReportModel | null
}

interface UsePdfDownloadResult {
  download: () => Promise<void>
  downloading: boolean
  error: string | null
}

export function usePdfDownload({
  model,
  locale,
  filename,
}: UsePdfDownloadOptions): UsePdfDownloadResult {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = useCallback(async () => {
    if (!model) return

    setDownloading(true)
    setError(null)

    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { default: PdfReportRenderer } = await import('./PdfReportRenderer')

      const element = createElement(PdfReportRenderer, { model, locale })
      // PdfReportRenderer returns a <Document> but createElement types it
      // generically — cast via unknown to satisfy pdf()'s DocumentProps constraint.
      const blob = await pdf(
        element as unknown as React.ReactElement<
          import('@react-pdf/renderer').DocumentProps
        >,
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setDownloading(false)
    }
  }, [model, locale, filename])

  return { download, downloading, error }
}
