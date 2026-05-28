'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useModalFocus } from '@/hooks/useModalFocus'
import { downloadBlob } from '@/lib/browser-download'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { filenameFromContentDisposition } from '@/lib/pdf/filename'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

const PROGRESS_DELAY_MS = 2000

interface ServerPdfDownloadRequest {
  fallbackFilename: string
  init?: RequestInit
  url: string
}

interface UseServerPdfDownloadResult {
  clearError: () => void
  dialog: ReactNode
  download: (request: ServerPdfDownloadRequest) => Promise<void>
  downloading: boolean
  error: string | null
}

function isApiMutation(url: string, init?: RequestInit): boolean {
  const method = (init?.method ?? 'GET').toUpperCase()
  return url.startsWith('/api/') && method !== 'GET' && method !== 'HEAD'
}

async function requestPdf({
  url,
  init,
}: Pick<ServerPdfDownloadRequest, 'init' | 'url'>): Promise<Response> {
  return isApiMutation(url, init) ? apiFetch(url, init) : fetch(url, init)
}

export function useServerPdfDownload(): UseServerPdfDownloadResult {
  const tr = useTranslations('reports')
  const [downloading, setDownloading] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const download = useCallback(
    async ({ fallbackFilename, init, url }: ServerPdfDownloadRequest) => {
      clearTimer()
      setError(null)
      setDownloading(true)
      setShowProgress(false)
      timerRef.current = window.setTimeout(() => {
        setShowProgress(true)
      }, PROGRESS_DELAY_MS)

      try {
        const response = await requestPdf({ init, url })
        if (!response.ok) {
          const message =
            (await readResponseMessage(response)) ?? tr('failedToLoadReport')
          throw new Error(message)
        }

        const blob = await response.blob()
        const filename =
          filenameFromContentDisposition(
            response.headers.get('Content-Disposition'),
          ) ?? fallbackFilename
        downloadBlob(blob, filename)
        setShowProgress(false)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : tr('failedToLoadReport')
        setError(message)
        setShowProgress(false)
      } finally {
        clearTimer()
        setDownloading(false)
      }
    },
    [clearTimer, tr],
  )

  useEffect(() => clearTimer, [clearTimer])

  const dialog = useMemo(
    () => (
      <ServerPdfDownloadDialog
        error={error}
        onCloseError={clearError}
        open={showProgress}
      />
    ),
    [clearError, error, showProgress],
  )

  return { clearError, dialog, download, downloading, error }
}

function ServerPdfDownloadDialog({
  error,
  onCloseError,
  open,
}: {
  error: string | null
  onCloseError: () => void
  open: boolean
}) {
  const tr = useTranslations('reports')
  const tc = useTranslations('common')
  const shouldReduceMotion = useReducedMotion()
  const progressRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const visible = open || error !== null
  const dialogRef = error ? errorRef : progressRef

  const { handleKeyDown } = useModalFocus({
    closeDisabled: !error,
    initialFocusRef: error ? closeButtonRef : dialogRef,
    modalRef: dialogRef,
    onClose: onCloseError,
    open: visible,
  })

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          key={error ? 'pdf-error' : 'pdf-progress'}
          {...fadeMotion(shouldReduceMotion)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          {error ? (
            <motion.div
              aria-describedby="pdf-download-error-message"
              aria-labelledby="pdf-download-error-title"
              aria-modal="true"
              className="relative z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-5 shadow-2xl dark:bg-secondary-900"
              {...devMarker({
                name: 'dialog',
                priority: 420,
                value: 'PDF download error',
              })}
              onKeyDown={handleKeyDown}
              ref={errorRef}
              role="alertdialog"
              {...dialogPanelMotion(shouldReduceMotion)}
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-red-500"
                />
                <div className="min-w-0 flex-1">
                  <h2
                    className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
                    id="pdf-download-error-title"
                  >
                    {tr('errorTitle')}
                  </h2>
                  <p
                    className="mt-1 text-sm text-secondary-700 dark:text-secondary-300"
                    id="pdf-download-error-message"
                  >
                    {error}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  className="btn-primary text-sm !px-4 !py-2"
                  onClick={onCloseError}
                  ref={closeButtonRef}
                  type="button"
                >
                  {tc('close')}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              aria-describedby="pdf-download-progress-message"
              aria-labelledby="pdf-download-progress-title"
              aria-modal="true"
              className="relative z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-5 shadow-2xl dark:bg-secondary-900"
              {...devMarker({
                name: 'dialog',
                priority: 420,
                value: 'Generating PDF',
              })}
              onKeyDown={handleKeyDown}
              ref={progressRef}
              role="dialog"
              tabIndex={-1}
              {...dialogPanelMotion(shouldReduceMotion)}
            >
              <div className="flex items-start gap-3">
                <FileText
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400"
                />
                <div className="min-w-0 flex-1">
                  <h2
                    className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
                    id="pdf-download-progress-title"
                  >
                    {tr('generatingPdfTitle')}
                  </h2>
                  <p
                    className="mt-1 text-sm text-secondary-700 dark:text-secondary-300"
                    id="pdf-download-progress-message"
                  >
                    {tr('generatingPdf')}
                  </p>
                </div>
              </div>
              <div
                aria-hidden="true"
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary-100 dark:bg-secondary-800"
              >
                <div className="h-full w-1/2 animate-pulse rounded-full bg-primary-600 dark:bg-primary-400" />
              </div>
            </motion.div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
