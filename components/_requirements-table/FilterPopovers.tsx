'use client'

import { Filter, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  listenForTablePopoverKeys,
  useClientLayoutEffect,
} from '@/components/_requirements-table/shared'
import { devMarker } from '@/lib/developer-mode-markers'
import { modalPortalTarget } from '@/lib/modal-focus'

interface FilterLabelProps {
  developerModeValue: string
  label: string
}

type FilterVariant = 'text' | 'flat' | 'grouped'
type FilterPosition = CSSProperties & { '--filter-anchor-left': string }

// A 44px option row plus the selection panel's padding and border.
const minSelectionPanelHeight = 54
const openFilterByOwner = new WeakMap<HTMLElement, () => void>()

interface FilterPopoverProps extends FilterLabelProps {
  active: boolean
  activeCount?: number
  children: (close: () => void) => ReactNode
  focusOnOpen: (panel: HTMLDivElement, keyboard: boolean) => void
  variant: FilterVariant
}

function FilterPopover({
  active,
  activeCount,
  children,
  developerModeValue,
  focusOnOpen,
  label,
  variant,
}: FilterPopoverProps) {
  const tc = useTranslations('common')
  const triggerLabel = tc('filterBy', { label })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const openedWithKeyboard = useRef(false)
  const [position, setPosition] = useState<FilterPosition | null>(null)
  const close = useCallback(() => {
    setPosition(null)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!position) return
    const owner = modalPortalTarget(triggerRef.current)
    // Keyboard activation has no outside mousedown to dismiss the previous filter.
    openFilterByOwner.get(owner)?.()
    const dismiss = () => setPosition(null)
    openFilterByOwner.set(owner, dismiss)
    if (panelRef.current)
      focusOnOpen(panelRef.current, openedWithKeyboard.current)
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
  }, [position, close, focusOnOpen])

  return (
    <div className="relative inline-flex" ref={wrapperRef}>
      <button
        aria-expanded={position !== null}
        aria-label={triggerLabel}
        className={`requirement-filter-trigger min-h-7 min-w-7 ${active ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        {...devMarker({
          name: 'filter button',
          priority: 300,
          value: developerModeValue,
        })}
        onClick={event => {
          event.stopPropagation()
          if (position) {
            setPosition(null)
            return
          }
          // Native button activation from the keyboard produces a click with zero detail.
          openedWithKeyboard.current = event.detail === 0
          const anchor = event.currentTarget.getBoundingClientRect()
          const below = window.innerHeight - anchor.bottom - 16
          const above = anchor.top - 16
          const flip =
            variant !== 'text' &&
            below < minSelectionPanelHeight &&
            above > below
          setPosition({
            '--filter-anchor-left': `${anchor.left}px`,
            top: flip ? undefined : anchor.bottom + 4,
            bottom: flip ? window.innerHeight - anchor.top + 4 : undefined,
            maxHeight:
              variant === 'text'
                ? undefined
                : Math.max(0, flip ? above : below),
          })
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
                className="requirement-filter-count"
                data-filter-count-badge="true"
              >
                {activeCount}
              </span>
            )}
          </span>
        )}
      </button>
      {position &&
        createPortal(
          <div
            className="requirement-filter-panel fixed z-50"
            data-filter-variant={variant}
            ref={panelRef}
            style={position}
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
  const focusInput = useCallback(() => inputRef.current?.focus(), [])
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
      focusOnOpen={focusInput}
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

const selectableCheckbox = 'input[type="checkbox"]:enabled'

function focusSelectionOnOpen(panel: HTMLDivElement, keyboard: boolean) {
  if (!keyboard) return
  const target =
    panel.querySelector<HTMLInputElement>(`${selectableCheckbox}:checked`) ??
    panel.querySelector<HTMLInputElement>(selectableCheckbox) ??
    panel.querySelector<HTMLButtonElement>(':scope > button:enabled')
  target?.focus()
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
    const first =
      clearedPanel.panel?.querySelector<HTMLInputElement>(selectableCheckbox)
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
      focusOnOpen={focusSelectionOnOpen}
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
