'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import StatusIcon from '@/components/StatusIcon'
import { useModalFocus } from '@/hooks/useModalFocus'
import {
  isStatusIconName,
  STATUS_ICON_NAMES,
} from '@/lib/icons/status-icon-allowlist'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

interface ComponentProps {
  disabled?: boolean
  id?: string
  label: string
  onChange: (value: string | null) => void
  value: string | null | undefined
}

const GRID_COLUMNS = 5
const MARGIN = 16

const ICON_ALIASES: Record<string, string[]> = {
  AlertCircle: ['alert', 'info', 'notice', 'risk', 'varning', 'obs', 'risk'],
  AlertTriangle: ['warning', 'alert', 'risk', 'varning', 'triangel', 'fara'],
  Archive: ['archive', 'archived', 'arkiv', 'arkiverad'],
  CheckCircle2: ['check', 'done', 'approved', 'klar', 'godkand', 'godkänd'],
  Circle: ['circle', 'dot', 'included', 'cirkel', 'punkt', 'inkluderad'],
  CircleDot: ['dot', 'selected', 'target', 'punkt', 'markerad'],
  Clock: ['clock', 'time', 'pending', 'klocka', 'tid', 'vantar', 'väntar'],
  Eye: ['eye', 'review', 'inspect', 'oga', 'öga', 'granskning'],
  Flag: ['flag', 'goal', 'important', 'flagga', 'mal', 'mål', 'viktig'],
  Hourglass: ['hourglass', 'waiting', 'progress', 'timglas', 'pagaende'],
  Lock: ['lock', 'locked', 'secure', 'las', 'lås', 'sparrad', 'spärrad'],
  PenLine: ['pen', 'draft', 'edit', 'penna', 'utkast', 'redigera'],
  Play: ['play', 'start', 'progress', 'spela', 'starta', 'pagaende'],
  ShieldAlert: ['shield', 'warning', 'risk', 'skold', 'sköld', 'varning'],
  ShieldCheck: ['shield', 'secure', 'verified', 'skold', 'sköld', 'verifierad'],
  Sparkles: ['sparkles', 'new', 'magic', 'stjarnor', 'stjärnor', 'ny'],
  Star: ['star', 'favorite', 'priority', 'stjarna', 'stjärna', 'prioritet'],
  ThumbsUp: ['thumbs', 'ok', 'approved', 'tumme', 'godkand', 'godkänd'],
  XCircle: ['x', 'cancel', 'reject', 'not applicable', 'avvisa', 'ej'],
  Zap: ['zap', 'fast', 'critical', 'blixt', 'snabb', 'kritisk'],
}

function formatIconName(iconName: string) {
  return iconName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
}

function searchableIconValues(iconName: string) {
  const label = formatIconName(iconName)
  return [
    iconName,
    label,
    label.replaceAll(' ', '-'),
    ...(ICON_ALIASES[iconName] ?? []),
  ]
}

function computePosition(anchorEl: HTMLElement, width: number, height: number) {
  const rect = anchorEl.getBoundingClientRect()
  let left = rect.left
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN))

  const spaceBelow = window.innerHeight - rect.bottom
  let top =
    spaceBelow >= height + MARGIN ? rect.bottom + 8 : rect.top - height - 8
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN))

  return { left, top }
}

function iconMatches(iconName: string, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return searchableIconValues(iconName).some(value =>
    value.toLowerCase().includes(normalized),
  )
}

export default function IconPicker({
  disabled = false,
  id,
  label,
  onChange,
  value,
}: ComponentProps) {
  const t = useTranslations('iconPicker')
  const shouldReduceMotion = useReducedMotion()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const selectedValue = isStatusIconName(value) ? value : null

  const visibleIcons = useMemo(
    () => STATUS_ICON_NAMES.filter(iconName => iconMatches(iconName, query)),
    [query],
  )

  const { handleKeyDown } = useModalFocus({
    initialFocusRef: searchRef,
    modalRef: dialogRef,
    onClose: () => setOpen(false),
    open,
  })

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const trigger = triggerRef.current
      const dialog = dialogRef.current
      if (!trigger || !dialog) return
      const { width, height } = dialog.getBoundingClientRect()
      setPos(computePosition(trigger, width, height))
    }

    requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  const selectIcon = (iconName: string | null) => {
    onChange(iconName)
    setOpen(false)
    setQuery('')
  }

  const handleGridKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const currentIndex = visibleIcons.findIndex(
      iconName =>
        document.activeElement instanceof HTMLElement &&
        document.activeElement.dataset.iconName === iconName,
    )
    if (currentIndex < 0) return

    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex += 1
    if (event.key === 'ArrowLeft') nextIndex -= 1
    if (event.key === 'ArrowDown') nextIndex += GRID_COLUMNS
    if (event.key === 'ArrowUp') nextIndex -= GRID_COLUMNS
    if (nextIndex === currentIndex) return

    event.preventDefault()
    const boundedIndex = Math.max(
      0,
      Math.min(visibleIcons.length - 1, nextIndex),
    )
    dialogRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-icon-name="${visibleIcons[boundedIndex]}"]`,
      )
      ?.focus()
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={label}
        className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-secondary-800/50 dark:hover:bg-secondary-700"
        disabled={disabled}
        id={id}
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        {selectedValue ? (
          <StatusIcon className="h-4 w-4" name={selectedValue} />
        ) : (
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border border-dashed border-secondary-400"
          />
        )}
        <span>{selectedValue ?? t('none')}</span>
      </button>
      {typeof window !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="fixed inset-0 z-50"
                key="icon-picker-backdrop"
                {...fadeMotion(shouldReduceMotion)}
              >
                <button
                  aria-label={t('close')}
                  className="absolute inset-0 h-full w-full cursor-default bg-black/20"
                  onClick={() => setOpen(false)}
                  type="button"
                />
                <motion.div
                  aria-label={t('title')}
                  aria-modal="true"
                  className="fixed z-50 w-88 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-4 shadow-2xl dark:bg-secondary-900"
                  onKeyDown={event => {
                    handleKeyDown(event)
                    handleGridKeyDown(event)
                  }}
                  ref={dialogRef}
                  role="dialog"
                  style={{ left: pos.left, top: pos.top }}
                  {...dialogPanelMotion(shouldReduceMotion)}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">{t('title')}</h2>
                    <button
                      aria-label={t('close')}
                      className="inline-flex h-9 min-h-11 w-9 min-w-11 items-center justify-center rounded-lg border hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:hover:bg-secondary-800"
                      onClick={() => setOpen(false)}
                      type="button"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                  <label className="mb-3 block text-sm">
                    <span className="sr-only">{t('searchLabel')}</span>
                    <span className="relative block">
                      <Search
                        aria-hidden="true"
                        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-500"
                      />
                      <input
                        className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800"
                        onChange={event => setQuery(event.target.value)}
                        placeholder={t('searchPlaceholder')}
                        ref={searchRef}
                        value={query}
                      />
                    </span>
                  </label>
                  <div className="mb-3 flex justify-between">
                    <button
                      className="min-h-11 min-w-11 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:hover:bg-secondary-800"
                      onClick={() => selectIcon(null)}
                      type="button"
                    >
                      {t('clear')}
                    </button>
                  </div>
                  {visibleIcons.length === 0 ? (
                    <p className="py-6 text-center text-sm text-secondary-500">
                      {t('noResults')}
                    </p>
                  ) : (
                    <div className="grid max-h-72 grid-cols-5 gap-2 overflow-y-auto pr-1">
                      {visibleIcons.map(iconName => (
                        <button
                          aria-label={formatIconName(iconName)}
                          aria-pressed={selectedValue === iconName}
                          className="inline-flex aspect-square min-h-11 min-w-11 items-center justify-center rounded-lg border text-secondary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:text-secondary-200 dark:hover:bg-primary-950/30"
                          data-icon-name={iconName}
                          key={iconName}
                          onClick={() => selectIcon(iconName)}
                          title={iconName}
                          type="button"
                        >
                          <StatusIcon className="h-5 w-5" name={iconName} />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
