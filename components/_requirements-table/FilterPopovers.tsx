'use client'

import { Filter, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  clampPopoverLeft,
  listenForTablePopoverKeys,
  POPOVER_VIEWPORT_MARGIN,
  useClientLayoutEffect,
} from '@/components/_requirements-table/shared'
import { devMarker } from '@/lib/developer-mode-markers'
import { modalPortalTarget } from '@/lib/modal-focus'

interface FilterLabelProps {
  developerModeValue: string
  label: string
}

const panelLayouts = {
  text: { className: 'p-2', minWidth: '12rem' },
  flat: { className: 'py-1 overflow-y-auto', minWidth: '10rem' },
  grouped: { className: 'py-1 overflow-y-auto', minWidth: '12rem' },
}

const viewportWidthLimit = `calc(100% - ${2 * POPOVER_VIEWPORT_MARGIN}px)`
// A 44px option row plus the selection panel's padding and border.
const minSelectionPanelHeight = 54
const openFilterByOwner = new WeakMap<HTMLElement, () => void>()

interface FilterPopoverProps extends FilterLabelProps {
  active: boolean
  activeCount?: number
  children: (close: () => void) => ReactNode
  initialFocusRef?: RefObject<HTMLInputElement | null>
  variant: keyof typeof panelLayouts
}

function FilterPopover({
  active,
  activeCount,
  children,
  developerModeValue,
  initialFocusRef,
  label,
  variant,
}: FilterPopoverProps) {
  const tc = useTranslations('common')
  const layout = panelLayouts[variant]
  const triggerLabel = tc('filterBy', { label })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  useClientLayoutEffect(() => {
    const panel = panelRef.current
    const trigger = triggerRef.current
    if (!open || !panel || !trigger) return
    const positionPanel = () => {
      const anchor = trigger.getBoundingClientRect()
      const width = panel.getBoundingClientRect().width
      panel.style.left = `${clampPopoverLeft(anchor.left, width)}px`
      const below = window.innerHeight - anchor.bottom - 16
      const above = anchor.top - 16
      const flip =
        variant !== 'text' && below < minSelectionPanelHeight && above > below
      panel.style.top = flip ? 'auto' : `${anchor.bottom + 4}px`
      panel.style.bottom = flip
        ? `${window.innerHeight - anchor.top + 4}px`
        : 'auto'
      if (variant !== 'text')
        panel.style.maxHeight = `${Math.max(0, flip ? above : below)}px`
    }
    positionPanel()
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(positionPanel)
    observer?.observe(panel)
    window.addEventListener('resize', positionPanel)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', positionPanel)
    }
  }, [open, variant])

  useEffect(() => {
    if (!open) return
    const owner = modalPortalTarget(triggerRef.current)
    // Keyboard activation has no outside mousedown to dismiss the previous filter.
    openFilterByOwner.get(owner)?.()
    const dismiss = () => setOpen(false)
    openFilterByOwner.set(owner, dismiss)
    initialFocusRef?.current?.focus()
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node
      if (
        !wrapperRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      )
        close()
    }
    document.addEventListener('mousedown', onMouseDown)
    const stopListening = listenForTablePopoverKeys(
      triggerRef.current,
      event => {
        if (event.key === 'Escape') close()
      },
    )
    return () => {
      if (openFilterByOwner.get(owner) === dismiss)
        openFilterByOwner.delete(owner)
      document.removeEventListener('mousedown', onMouseDown)
      stopListening()
    }
  }, [open, close, initialFocusRef])

  return (
    <div className="relative inline-flex" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-label={triggerLabel}
        className={`inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${active ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        {...devMarker({
          name: 'filter button',
          priority: 300,
          value: developerModeValue,
        })}
        onClick={event => {
          event.stopPropagation()
          setOpen(previous => !previous)
        }}
        ref={triggerRef}
        title={triggerLabel}
        type="button"
      >
        {activeCount === undefined ? (
          <Filter aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <span
            className="relative inline-flex h-3.5 w-3.5 items-center justify-center"
            data-filter-icon-anchor="true"
          >
            <Filter aria-hidden="true" className="h-3.5 w-3.5" />
            {activeCount > 0 && (
              <span
                className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary-500 text-[8px] font-bold leading-none text-white"
                data-filter-count-badge="true"
              >
                {activeCount}
              </span>
            )}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            className={`fixed z-50 bg-white dark:bg-secondary-800 border rounded-lg shadow-lg ${layout.className}`}
            ref={panelRef}
            style={{
              width: 'max-content',
              maxWidth: viewportWidthLimit,
              minWidth: `min(${layout.minWidth}, ${viewportWidthLimit})`,
            }}
          >
            {children(close)}
          </div>,
          modalPortalTarget(triggerRef.current),
        )}
    </div>
  )
}

interface SearchFilterProps extends FilterLabelProps {
  activeValue: string
  onChange: (value: string | undefined) => void
}

export function SearchFilterPopover({
  activeValue,
  developerModeValue,
  label,
  onChange,
}: SearchFilterProps) {
  const tt = useTranslations('requirementsTable')
  const [local, setLocal] = useState(activeValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPendingCommit = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  useEffect(() => {
    setLocal(activeValue)
    return clearPendingCommit
  }, [activeValue, clearPendingCommit])

  function scheduleCommit(value: string) {
    clearPendingCommit()
    timer.current = setTimeout(() => {
      timer.current = null
      onChange(value || undefined)
    }, 400)
  }

  return (
    <FilterPopover
      active={!!activeValue}
      developerModeValue={developerModeValue}
      initialFocusRef={inputRef}
      label={label}
      variant="text"
    >
      {close => (
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary-400"
          />
          <input
            aria-label={label}
            className="w-full pl-7 pr-8 py-1.5 text-xs rounded-lg border bg-white dark:bg-secondary-800/50 placeholder:text-secondary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/50 focus:border-primary-500 transition-all"
            onChange={e => {
              setLocal(e.target.value)
              scheduleCommit(e.target.value)
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              // IME confirmation can still report key code 229 after compositionend.
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)
                return

              e.preventDefault()
              clearPendingCommit()
              onChange(local || undefined)
              close()
            }}
            placeholder={`${label}...`}
            ref={inputRef}
            type="text"
            value={local}
          />
          {local && (
            <button
              aria-label={tt('clear')}
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center text-secondary-400 hover:text-secondary-600"
              onClick={() => {
                setLocal('')
                clearPendingCommit()
                onChange(undefined)
                inputRef.current?.focus()
              }}
              type="button"
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </FilterPopover>
  )
}

interface SelectionFilterProps<Option extends { id: number }>
  extends FilterLabelProps {
  getLabel: (option: Option) => string
  getParentId?: (option: Option) => number | null
  onChange: (ids: number[]) => void
  options: Option[]
  value: number[]
}

export default function MultiSelectFilterPopover<
  Option extends { id: number },
>({
  developerModeValue,
  getLabel,
  getParentId,
  label,
  onChange,
  options,
  value,
}: SelectionFilterProps<Option>) {
  const tt = useTranslations('requirementsTable')
  const [clearedPanel, setClearedPanel] = useState<{
    panel: HTMLElement | null
    close: () => void
  } | null>(null)
  useClientLayoutEffect(() => {
    if (!clearedPanel) return
    const first = clearedPanel.panel?.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )
    if (first) first.focus()
    else clearedPanel.close()
    setClearedPanel(null)
  }, [clearedPanel])
  function renderOption(option: Option) {
    const checked = value.includes(option.id)
    return (
      <label
        className={`flex min-h-11 cursor-pointer items-center gap-2 py-1.5 text-xs hover:bg-secondary-50 dark:hover:bg-secondary-700/50 ${getParentId ? 'pl-5 pr-2.5' : 'px-2.5'}`}
        key={option.id}
      >
        <input
          checked={checked}
          className="rounded border-secondary-300"
          onChange={() =>
            onChange(
              checked
                ? value.filter(id => id !== option.id)
                : [...value, option.id],
            )
          }
          type="checkbox"
        />
        <span className="truncate">{getLabel(option)}</span>
      </label>
    )
  }
  return (
    <FilterPopover
      active={value.length > 0}
      activeCount={value.length}
      developerModeValue={developerModeValue}
      label={label}
      variant={getParentId ? 'grouped' : 'flat'}
    >
      {close => (
        <>
          {value.length > 0 && (
            <button
              className="min-h-11 w-full border-b px-2.5 py-1.5 pb-1.5 text-left text-xs text-secondary-500 hover:text-red-600 dark:hover:text-red-400"
              onClick={event => {
                setClearedPanel({
                  panel: event.currentTarget.parentElement,
                  close,
                })
                onChange([])
              }}
              type="button"
            >
              <X aria-hidden="true" className="h-3 w-3 inline mr-1" />
              {tt('clear')}
            </button>
          )}

          {getParentId
            ? options
                .filter(option => getParentId(option) === null)
                .map(parent => (
                  <div key={parent.id}>
                    <div className="wrap-anywhere whitespace-normal px-2.5 pt-2 pb-0.5 text-[11px] font-semibold text-secondary-400 dark:text-secondary-500 uppercase tracking-wide">
                      {getLabel(parent)}
                    </div>
                    {options
                      .filter(option => getParentId(option) === parent.id)
                      .map(renderOption)}
                  </div>
                ))
            : options.map(renderOption)}
        </>
      )}
    </FilterPopover>
  )
}
