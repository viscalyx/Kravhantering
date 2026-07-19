'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, Download, FileText } from 'lucide-react'
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
import { filenameFromContentDisposition } from '@/lib/pdf/filename'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

type GeneratedOutputKind = 'csv' | 'pdf'
type DownloadPhase = 'downloading' | 'generating'

interface ServerPdfDownloadRequest {
  fallbackFilename: string
  init?: RequestInit
  output?: GeneratedOutputKind
  url: string
}

interface UseServerPdfDownloadResult {
  clearError: () => void
  dialog: ReactNode
  download: (request: ServerPdfDownloadRequest) => Promise<void>
  downloading: boolean
  error: string | null
}

interface OutputErrorDetails {
  limit?: number
  limitKind?: 'bytes' | 'items'
  output: GeneratedOutputKind
  retryAfterSeconds?: number
  timeoutSeconds?: number
}

interface OutputDownloadError {
  code: string
  details: OutputErrorDetails
  retryAfterSeconds: number
}

interface PendingDownload extends ServerPdfDownloadRequest {
  output: GeneratedOutputKind
  restoreFocusTo: HTMLElement | null
}

const activeDownloadKeys = new Set<string>()

function isApiMutation(url: string, init?: RequestInit): boolean {
  const method = (init?.method ?? 'GET').toUpperCase()
  return url.startsWith('/api/') && method !== 'GET' && method !== 'HEAD'
}

async function requestOutput(
  request: PendingDownload,
  signal: AbortSignal,
): Promise<Response> {
  const init = { ...request.init, signal }
  return isApiMutation(request.url, init)
    ? apiFetch(request.url, init)
    : fetch(request.url, init)
}

function downloadKey(request: PendingDownload): string {
  return `${request.output}:${request.init?.method ?? 'GET'}:${request.url}`
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined
}

async function parseOutputError(
  response: Response,
  fallbackOutput: GeneratedOutputKind,
): Promise<OutputDownloadError> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  const record =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : undefined
  const rawDetails =
    record?.details && typeof record.details === 'object'
      ? (record.details as Record<string, unknown>)
      : undefined
  const output =
    rawDetails?.output === 'csv' || rawDetails?.output === 'pdf'
      ? rawDetails.output
      : fallbackOutput
  const retryHeader = Number(response.headers.get('Retry-After'))
  const retryAfterSeconds =
    boundedInteger(retryHeader, 0, 600) ??
    boundedInteger(rawDetails?.retryAfterSeconds, 0, 600) ??
    0
  const details: OutputErrorDetails = {
    output,
    limit: boundedInteger(rawDetails?.limit, 0, 2_147_483_647),
    limitKind:
      rawDetails?.limitKind === 'bytes' || rawDetails?.limitKind === 'items'
        ? rawDetails.limitKind
        : undefined,
    retryAfterSeconds,
    timeoutSeconds: boundedInteger(rawDetails?.timeoutSeconds, 0, 600),
  }
  return {
    code: typeof record?.code === 'string' ? record.code : 'unknown',
    details,
    retryAfterSeconds,
  }
}

export function useServerPdfDownload(): UseServerPdfDownloadResult {
  const t = useTranslations('generatedOutput')
  const [downloading, setDownloading] = useState(false)
  const [errorState, setErrorState] = useState<OutputDownloadError | null>(null)
  const [phase, setPhase] = useState<DownloadPhase | null>(null)
  const [output, setOutput] = useState<GeneratedOutputKind>('pdf')
  const [retrySeconds, setRetrySeconds] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const pendingRef = useRef<PendingDownload | null>(null)

  const restoreFocus = useCallback(() => {
    window.requestAnimationFrame(() =>
      pendingRef.current?.restoreFocusTo?.focus(),
    )
  }, [])

  const clearError = useCallback(() => {
    setErrorState(null)
    setRetrySeconds(0)
    restoreFocus()
  }, [restoreFocus])

  const runDownload = useCallback(
    async (pending: PendingDownload) => {
      const key = downloadKey(pending)
      if (activeDownloadKeys.has(key)) return
      activeDownloadKeys.add(key)
      pendingRef.current = pending
      setAnnouncement('')
      setErrorState(null)
      setRetrySeconds(0)
      setOutput(pending.output)
      setPhase('generating')
      setDownloading(true)
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await requestOutput(pending, controller.signal)
        if (!response.ok) {
          throw await parseOutputError(response, pending.output)
        }
        setPhase('downloading')
        const blob = await response.blob()
        if (controller.signal.aborted) return
        const filename =
          filenameFromContentDisposition(
            response.headers.get('Content-Disposition'),
          ) ?? pending.fallbackFilename
        downloadBlob(blob, filename)
        setPhase(null)
        setAnnouncement(t('downloadStarted'))
        restoreFocus()
      } catch (caught) {
        if (controller.signal.aborted) {
          setPhase(null)
          restoreFocus()
          return
        }
        const parsed =
          caught &&
          typeof caught === 'object' &&
          'code' in caught &&
          'details' in caught
            ? (caught as OutputDownloadError)
            : {
                code: 'unknown',
                details: { output: pending.output },
                retryAfterSeconds: 0,
              }
        setErrorState(parsed)
        setRetrySeconds(parsed.retryAfterSeconds)
        setPhase(null)
      } finally {
        activeDownloadKeys.delete(key)
        abortRef.current = null
        setDownloading(false)
      }
    },
    [restoreFocus, t],
  )

  const download = useCallback(
    async (request: ServerPdfDownloadRequest) => {
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      await runDownload({
        ...request,
        output: request.output ?? 'pdf',
        restoreFocusTo: activeElement,
      })
    },
    [runDownload],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const retry = useCallback(() => {
    const pending = pendingRef.current
    if (!pending || retrySeconds > 0) return
    void runDownload(pending)
  }, [retrySeconds, runDownload])

  useEffect(() => {
    if (retrySeconds <= 0) return
    const timer = window.setInterval(() => {
      setRetrySeconds(current => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [retrySeconds])

  useEffect(() => () => abortRef.current?.abort(), [])

  const error = useMemo(
    () => (errorState ? localizeOutputError(errorState, t) : null),
    [errorState, t],
  )
  const dialog = useMemo(
    () => (
      <GeneratedOutputDownloadDialog
        announcement={announcement}
        error={error}
        onCancel={cancel}
        onCloseError={clearError}
        onRetry={retry}
        output={output}
        phase={phase}
        retrySeconds={retrySeconds}
      />
    ),
    [
      announcement,
      cancel,
      clearError,
      error,
      output,
      phase,
      retry,
      retrySeconds,
    ],
  )

  return { clearError, dialog, download, downloading, error }
}

function localizeOutputError(
  error: OutputDownloadError,
  t: ReturnType<typeof useTranslations<'generatedOutput'>>,
): string {
  const { details } = error
  const outputKey = details.output === 'csv' ? 'csv' : 'pdf'
  if (error.code === 'output_limit_exceeded') {
    if (details.limitKind === 'items' && details.limit != null) {
      return t(`errors.${outputKey}.items`, { limit: details.limit })
    }
    if (details.limitKind === 'bytes' && details.limit != null) {
      return t(`errors.${outputKey}.bytes`, {
        limitMiB: details.limit / (1024 * 1024),
      })
    }
  }
  if (error.code === 'capacity_busy') {
    return t(`errors.${outputKey}.busy`, {
      retryAfter: error.retryAfterSeconds,
    })
  }
  if (error.code === 'generation_timeout' && details.timeoutSeconds != null) {
    return t(`errors.${outputKey}.timeout`, {
      timeoutSeconds: details.timeoutSeconds,
    })
  }
  if (error.code === 'temporary_storage_unavailable') {
    return t(`errors.${outputKey}.storage`)
  }
  if (details.output === 'pdf' && error.code === 'pdf_worker_memory_exceeded') {
    return t('errors.pdf.workerMemory')
  }
  if (details.output === 'pdf' && error.code === 'pdf_worker_failed') {
    return t('errors.pdf.workerFailed')
  }
  return t(`errors.${outputKey}.unknown`)
}

function GeneratedOutputDownloadDialog({
  announcement,
  error,
  onCancel,
  onCloseError,
  onRetry,
  output,
  phase,
  retrySeconds,
}: {
  announcement: string
  error: string | null
  onCancel: () => void
  onCloseError: () => void
  onRetry: () => void
  output: GeneratedOutputKind
  phase: DownloadPhase | null
  retrySeconds: number
}) {
  const t = useTranslations('generatedOutput')
  const tc = useTranslations('common')
  const shouldReduceMotion = useReducedMotion()
  const progressRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const visible = phase !== null || error !== null
  const dialogRef = error ? errorRef : progressRef
  const { handleKeyDown } = useModalFocus({
    initialFocusRef: error ? closeButtonRef : cancelButtonRef,
    modalRef: dialogRef,
    onClose: error ? onCloseError : onCancel,
    open: visible,
  })
  const phaseText =
    phase === 'generating'
      ? t(`phases.${output}.generating`)
      : t(`phases.${output}.downloading`)
  const progressBarClassName = [
    'h-full w-1/2 rounded-full bg-primary-600 dark:bg-primary-400',
    shouldReduceMotion ? null : 'animate-pulse',
  ]
    .filter(Boolean)
    .join(' ')

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {announcement ? (
        <p
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-secondary-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-secondary-100 dark:text-secondary-900"
          role="status"
        >
          {announcement}
        </p>
      ) : null}
      <AnimatePresence>
        {visible ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            key={error ? 'output-error' : 'output-progress'}
            {...fadeMotion(shouldReduceMotion)}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            {error ? (
              <motion.div
                aria-describedby="generated-output-error-message"
                aria-labelledby="generated-output-error-title"
                aria-modal="true"
                className="relative z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-5 shadow-2xl dark:bg-secondary-900"
                {...devMarker({
                  name: 'dialog',
                  priority: 420,
                  value: 'Generated output error',
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
                      id="generated-output-error-title"
                    >
                      {t('errorTitle')}
                    </h2>
                    <p
                      className="mt-1 text-sm text-secondary-700 dark:text-secondary-300"
                      id="generated-output-error-message"
                    >
                      {error}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    className="btn-secondary px-4! py-2! text-sm"
                    onClick={onCloseError}
                    ref={closeButtonRef}
                    type="button"
                  >
                    {tc('close')}
                  </button>
                  <button
                    className="btn-primary px-4! py-2! text-sm"
                    disabled={retrySeconds > 0}
                    onClick={onRetry}
                    type="button"
                  >
                    {retrySeconds > 0
                      ? t('retryCountdown', { seconds: retrySeconds })
                      : t('retry')}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                aria-labelledby="generated-output-progress-title"
                aria-modal="true"
                className="relative z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-5 shadow-2xl dark:bg-secondary-900"
                {...devMarker({
                  name: 'dialog',
                  priority: 420,
                  value: 'Generated output progress',
                })}
                onKeyDown={handleKeyDown}
                ref={progressRef}
                role="dialog"
                {...dialogPanelMotion(shouldReduceMotion)}
              >
                <div className="flex items-start gap-3">
                  {output === 'pdf' ? (
                    <FileText
                      aria-hidden="true"
                      className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400"
                    />
                  ) : (
                    <Download
                      aria-hidden="true"
                      className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2
                      aria-live="polite"
                      className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
                      id="generated-output-progress-title"
                    >
                      {phaseText}
                    </h2>
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary-100 dark:bg-secondary-800"
                >
                  <div className={progressBarClassName} />
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    className="btn-secondary px-4! py-2! text-sm"
                    onClick={onCancel}
                    ref={cancelButtonRef}
                    type="button"
                  >
                    {tc('cancel')}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>,
    document.body,
  )
}
