'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useServerPdfDownload } from '@/components/reports/pdf/useServerPdfDownload'
import { accessReviewExportFilename } from '@/lib/access-review/export-filenames'
import type {
  AccessReviewDelivery,
  AccessReviewExportV1,
} from '@/lib/access-review/types'
import { downloadBlob } from '@/lib/browser-download'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

interface UseAccessReviewExportDownloadOptions {
  locale: string
  reviewId: number | null
}

interface DownloadOptions {
  delivery: AccessReviewDelivery
}

interface UseAccessReviewExportDownloadResult {
  clearError: () => void
  dialog: ReactNode
  download: (options: DownloadOptions) => Promise<void>
  downloading: AccessReviewDelivery | null
  error: string | null
}

export function useAccessReviewExportDownload({
  locale,
  reviewId,
}: UseAccessReviewExportDownloadOptions): UseAccessReviewExportDownloadResult {
  const [downloading, setDownloading] = useState<AccessReviewDelivery | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const pdfDownload = useServerPdfDownload()
  const clearError = useCallback(() => setError(null), [])

  useEffect(() => {
    setError(current => (reviewId === null || current ? null : current))
  }, [reviewId])

  const download = useCallback(
    async ({ delivery }: DownloadOptions) => {
      if (!reviewId) return
      setDownloading(delivery)
      setError(null)

      try {
        if (delivery === 'pdf') {
          await pdfDownload.download({
            fallbackFilename: `access-review-${reviewId}.pdf`,
            init: {
              body: JSON.stringify({ delivery, locale }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST',
            },
            url: `/api/admin/access-reviews/${reviewId}/export`,
          })
          return
        }

        const response = await apiFetch(
          `/api/admin/access-reviews/${reviewId}/export`,
          {
            body: JSON.stringify({ delivery }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        )

        if (!response.ok) {
          setError((await readResponseMessage(response)) ?? 'Export failed')
          return
        }

        const exportData = (await response.json()) as AccessReviewExportV1
        const filename = accessReviewExportFilename(exportData, delivery)

        downloadBlob(
          new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json;charset=utf-8',
          }),
          filename,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed')
      } finally {
        setDownloading(null)
      }
    },
    [locale, pdfDownload, reviewId],
  )

  return {
    clearError,
    dialog: pdfDownload.dialog,
    download,
    downloading: downloading ?? (pdfDownload.downloading ? 'pdf' : null),
    error: error ?? pdfDownload.error,
  }
}
