'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { fadeMotion } from '@/lib/reduced-motion'

interface RequirementAreaInfoProps {
  areaId: number
  developerModeContext?: string
  name: string
  ownerName: string | null
}

export default function RequirementAreaInfo({
  areaId,
  developerModeContext,
  name,
  ownerName,
}: RequirementAreaInfoProps) {
  const shouldReduceMotion = useReducedMotion()
  const supportsPopover =
    typeof HTMLElement !== 'undefined' &&
    typeof HTMLElement.prototype.showPopover === 'function'
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState<{
    description: string
    failed: boolean
  } | null>(null)
  const [position, setPosition] = useState<{
    left: number
    top?: number
    bottom?: number
  }>({ left: 16, top: 16 })

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setContent(null)
    async function load() {
      try {
        const response = await apiFetch(`/api/requirement-areas/${areaId}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Area read failed')
        const data = await response.json()
        if (!controller.signal.aborted)
          setContent({
            description: data.area.description?.trim() || '',
            failed: false,
          })
      } catch {
        if (!controller.signal.aborted)
          setContent({ description: '', failed: true })
      }
    }
    void load()
    return () => controller.abort()
  }, [areaId, open])

  useEffect(() => {
    if (!open) return
    function positionPanel() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - 352))
      setPosition(
        rect.bottom > window.innerHeight / 2
          ? { left, bottom: Math.max(16, window.innerHeight - rect.top + 8) }
          : { left, top: Math.max(16, rect.bottom + 8) },
      )
    }
    function dismiss(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !buttonRef.current?.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      )
        setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    positionPanel()
    const panel = panelRef.current
    if (supportsPopover) {
      try {
        panel?.showPopover()
      } catch {
        // Keep dismissal available if the native popover cannot be shown.
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', positionPanel)
    window.addEventListener('scroll', positionPanel, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', positionPanel)
      window.removeEventListener('scroll', positionPanel, true)
      if (supportsPopover) {
        try {
          panel?.hidePopover()
        } catch {
          // The panel may already have left the top layer during unmount.
        }
      }
    }
  }, [open, supportsPopover])

  return (
    <div className="inline-flex max-w-full items-center gap-1">
      <span className="min-w-0 wrap-anywhere">{name}</span>
      <button
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        aria-label={t('areaInfo', { name })}
        className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full text-secondary-600 hover:bg-secondary-100 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-secondary-400 dark:hover:bg-secondary-800"
        onClick={() => setOpen(value => !value)}
        ref={buttonRef}
        type="button"
        {...devMarker({
          context: developerModeContext,
          name: 'area information button',
          priority: 355,
        })}
      >
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.section
            aria-label={t('areaInfo', { name })}
            className="focus-visible:outline-2 focus-visible:outline-primary-500 fixed z-90 m-0 max-h-[50vh] w-84 max-w-[calc(100vw-32px)] overflow-auto rounded-lg border border-secondary-200 bg-white p-4 text-sm leading-5 text-secondary-800 shadow-lg wrap-anywhere dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
            id={id}
            popover={supportsPopover ? 'manual' : undefined}
            {...fadeMotion(shouldReduceMotion)}
            ref={panelRef}
            style={{
              ...position,
              top: position.top ?? 'auto',
              bottom: position.bottom ?? 'auto',
              right: 'auto',
            }}
            tabIndex={0}
            {...devMarker({
              context: developerModeContext,
              name: 'area information panel',
              priority: 355,
            })}
          >
            <p className="mb-2 font-semibold">{name}</p>
            <p
              className="whitespace-pre-wrap"
              role={content?.failed ? 'alert' : 'status'}
            >
              {content === null
                ? t('areaInfoLoading')
                : content.failed
                  ? t('areaInfoError')
                  : content.description || t('areaDescriptionEmpty')}
            </p>
            <dl className="mt-3 border-t border-secondary-200 pt-3 dark:border-secondary-700">
              <dt className="text-xs text-secondary-600 dark:text-secondary-400">
                {t('areaOwner')}
              </dt>
              <dd className="mt-1">{ownerName || tc('noneAvailable')}</dd>
            </dl>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
