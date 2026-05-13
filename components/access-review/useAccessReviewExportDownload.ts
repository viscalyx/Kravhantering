'use client'

import { createElement, useCallback, useEffect, useState } from 'react'
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

        if (delivery === 'json') {
          downloadBlob(
            new Blob([JSON.stringify(exportData, null, 2)], {
              type: 'application/json;charset=utf-8',
            }),
            filename,
          )
          return
        }

        const { pdf } = await import('@react-pdf/renderer')
        const { default: AccessReviewExportPdfRenderer } = await import(
          './AccessReviewExportPdfRenderer'
        )
        const element = createElement(AccessReviewExportPdfRenderer, {
          exportData,
          locale,
        })
        const blob = await pdf(
          element as unknown as React.ReactElement<
            import('@react-pdf/renderer').DocumentProps
          >,
        ).toBlob()
        downloadBlob(blob, filename)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed')
      } finally {
        setDownloading(null)
      }
    },
    [locale, reviewId],
  )

  return { clearError, download, downloading, error }
}
