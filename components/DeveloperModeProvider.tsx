'use client'

import { useTranslations } from 'next-intl'
import {
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from '@/i18n/routing'
import {
  buildDeveloperModeCopyText,
  type DeveloperModeTarget,
  findDeveloperModeTargetAt,
  isEditableTarget,
  matchesDeveloperModeShortcut,
} from '@/lib/developer-mode'

async function copyTextToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy copy path.
  }

  const textarea = document.createElement('textarea')
  try {
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    const didCopy = document.execCommand('copy')
    return didCopy
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

export default function DeveloperModeProvider({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
  const t = useTranslations('developerMode')
  const [mounted, setMounted] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [hoveredTarget, setHoveredTarget] =
    useState<DeveloperModeTarget | null>(null)
  const [toast, setToast] = useState<{
    message: string
    tone: 'error' | 'success'
  } | null>(null)
  const enabledRef = useRef(false)
  const mountedRef = useRef(false)
  const lastElementRef = useRef<HTMLElement | null>(null)
  const scanFrameRef = useRef<number | null>(null)
  const toastTimeoutRef = useRef<number | null>(null)

  const clearToastTimer = useCallback(() => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }
  }, [])

  const clearScanFrame = useCallback(() => {
    if (scanFrameRef.current !== null) {
      window.cancelAnimationFrame(scanFrameRef.current)
      scanFrameRef.current = null
    }
  }, [])

  const showToast = useCallback(
    (message: string, tone: 'error' | 'success') => {
      clearToastTimer()
      setToast({ message, tone })
      toastTimeoutRef.current = window.setTimeout(() => {
        setToast(null)
        toastTimeoutRef.current = null
      }, 2200)
    },
    [clearToastTimer],
  )

  const resolveTarget = useCallback(() => {
    if (!mountedRef.current || !enabledRef.current) {
      return
    }

    if (scanFrameRef.current !== null) {
      return
    }

    scanFrameRef.current = window.requestAnimationFrame(() => {
      scanFrameRef.current = null
      const el = lastElementRef.current

      if (!el || !el.isConnected) {
        startTransition(() => setHoveredTarget(null))
        return
      }

      const target = findDeveloperModeTargetAt(el)
      startTransition(() => setHoveredTarget(target))
    })
  }, [])

  const handleCopy = useCallback(
    async (target: DeveloperModeTarget) => {
      const payload = buildDeveloperModeCopyText(target)
      const copied = await copyTextToClipboard(payload)

      showToast(
        `${copied ? t('copied') : t('copyFailed')}: ${payload}`,
        copied ? 'success' : 'error',
      )
    },
    [showToast, t],
  )

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    mountedRef.current = mounted
  }, [mounted])

  useEffect(() => {
    setMounted(true)
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      clearScanFrame()
      clearToastTimer()
    }
  }, [clearScanFrame, clearToastTimer])

  useEffect(() => {
    if (!mounted) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!matchesDeveloperModeShortcut(event)) {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
      setEnabled(current => !current)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mounted])

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname clears stale hover on client navigation
  useEffect(() => {
    if (!mounted) {
      return
    }

    if (!enabled) {
      clearScanFrame()
    }

    lastElementRef.current = null
    setHoveredTarget(null)
  }, [clearScanFrame, enabled, mounted, pathname])

  useEffect(() => {
    if (!mounted || !enabled) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const el = event.target as HTMLElement | null
      if (el?.closest('[data-developer-mode-overlay-root="true"]')) {
        return
      }

      lastElementRef.current = el
      resolveTarget()
    }

    const handlePointerLeave = () => {
      lastElementRef.current = null
      startTransition(() => setHoveredTarget(null))
    }

    const handleViewportChange = () => resolveTarget()
    const observer = new MutationObserver(() => resolveTarget())

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerleave', handlePointerLeave)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })

    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerleave', handlePointerLeave)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
      observer.disconnect()
    }
  }, [enabled, mounted, resolveTarget])

  return (
    <>
      {children}
      {mounted &&
        (enabled || toast) &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-0 z-[100]"
            data-developer-mode-overlay-root="true"
          >
            {hoveredTarget ? (
              <div
                aria-hidden="true"
                className="fixed rounded-lg border-2 border-primary-500/80 bg-primary-500/8 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]"
                style={{
                  height: hoveredTarget.bounds.height,
                  left: hoveredTarget.bounds.left,
                  top: hoveredTarget.bounds.top,
                  width: hoveredTarget.bounds.width,
                }}
              />
            ) : null}

            {enabled ? (
              <div
                className="pointer-events-none fixed right-4 top-20 rounded-full border border-primary-300/70 bg-white/92 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700 shadow-sm backdrop-blur-sm dark:border-primary-700/60 dark:bg-secondary-900/92 dark:text-primary-300"
                data-testid="developer-mode-badge"
              >
                {t('badge')}
              </div>
            ) : null}

            {enabled && hoveredTarget ? (
              <button
                aria-label={hoveredTarget.payload}
                className="pointer-events-auto fixed max-w-64 truncate rounded-full border border-primary-300/80 bg-white/96 px-2.5 py-1 text-[11px] font-medium text-primary-900 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.65)] backdrop-blur-sm transition hover:-translate-y-px hover:z-10 hover:border-primary-500 hover:bg-primary-50 focus-visible:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-primary-700/70 dark:bg-secondary-900/96 dark:text-primary-200 dark:hover:bg-secondary-800"
                data-developer-mode-overlay-chip="true"
                data-developer-mode-overlay-label={hoveredTarget.label}
                onClick={() => void handleCopy(hoveredTarget)}
                style={{
                  left: hoveredTarget.anchorLeft,
                  top: hoveredTarget.anchorTop,
                }}
                type="button"
              >
                {hoveredTarget.label}
              </button>
            ) : null}

            {toast ? (
              <div
                className={`pointer-events-none fixed bottom-4 right-4 max-w-md rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${
                  toast.tone === 'success'
                    ? 'border-emerald-300/80 bg-emerald-50/95 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/85 dark:text-emerald-100'
                    : 'border-red-300/80 bg-red-50/95 text-red-900 dark:border-red-700/60 dark:bg-red-950/85 dark:text-red-100'
                }`}
                data-developer-mode-toast="true"
              >
                {toast.message}
              </div>
            ) : null}
          </div>,
          document.body,
        )}
    </>
  )
}
