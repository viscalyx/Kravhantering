'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Filter, FilterX, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'
import { devMarker } from '@/lib/developer-mode-markers'
import { offsetPanelMotion } from '@/lib/reduced-motion'
import type { RequirementPackageOption } from '@/lib/requirements/list-view'

interface ComponentProps {
  catalogStatus: 'failed' | 'loaded' | 'loading'
  locale: string
  onChange: (requirementPackageIds: number[] | undefined) => void
  requirementPackages: RequirementPackageOption[]
  selectedIds: number[]
}

interface ChooserPosition {
  left: number
  maxHeight: number
  top: number
  width: number
}

interface PendingFocus {
  id?: number
  surface: 'available' | 'selected' | 'trigger'
}

const VIEWPORT_MARGIN = 8
const HOVER_CLOSE_DELAY_MS = 80

function packageName(requirementPackage: RequirementPackageOption): string {
  return requirementPackage.name.trim() || String(requirementPackage.id)
}

function packageTooltip(requirementPackage: RequirementPackageOption): string {
  const name = packageName(requirementPackage)
  const purposeAndScope = requirementPackage.purposeAndScope?.trim()
  return purposeAndScope ? `${name}\n${purposeAndScope}` : name
}

export default function RequirementsPackageFilter({
  catalogStatus,
  locale,
  onChange,
  requirementPackages,
  selectedIds,
}: ComponentProps) {
  const t = useTranslations('requirement')
  const shouldReduceMotion = useReducedMotion()
  const chooserId = useId()
  const bandRef = useRef<HTMLFieldSetElement>(null)
  const chooserRef = useRef<HTMLFieldSetElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selectedButtonRefs = useRef(new Map<number, HTMLButtonElement>())
  const availableButtonRefs = useRef(new Map<number, HTMLButtonElement>())
  const pendingFocusRef = useRef<PendingFocus | null>(null)
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverSuppressedRef = useRef(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [chooserPosition, setChooserPosition] =
    useState<ChooserPosition | null>(null)
  const [supportsPopover, setSupportsPopover] = useState(false)

  const collator = useMemo(
    () =>
      new Intl.Collator(locale.startsWith('sv') ? 'sv' : 'en', {
        sensitivity: 'base',
        usage: 'sort',
      }),
    [locale],
  )
  const sortedPackages = useMemo(
    () =>
      [...requirementPackages].sort((left, right) => {
        const nameComparison = collator.compare(
          packageName(left),
          packageName(right),
        )
        return nameComparison || left.id - right.id
      }),
    [collator, requirementPackages],
  )
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedPackages = useMemo(
    () =>
      sortedPackages.filter(requirementPackage =>
        selectedIdSet.has(requirementPackage.id),
      ),
    [selectedIdSet, sortedPackages],
  )
  const availablePackages = useMemo(
    () =>
      sortedPackages.filter(
        requirementPackage => !selectedIdSet.has(requirementPackage.id),
      ),
    [selectedIdSet, sortedPackages],
  )
  const hasPackages = requirementPackages.length > 0
  const isOpen = hasPackages && (isPinned || isHovered)
  const shouldShowChooserPopover = isOpen && chooserPosition !== null
  const triggerLabel =
    selectedPackages.length > 0
      ? t('requirementPackageFilterButtonActive', {
          count: selectedPackages.length,
        })
      : t('requirementPackageFilterButton')

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    setSupportsPopover(typeof HTMLElement.prototype.showPopover === 'function')
  }, [])

  const closeChooser = useCallback(
    (suppressHover = false) => {
      clearHoverCloseTimer()
      hoverSuppressedRef.current = suppressHover
      setIsHovered(false)
      setIsPinned(false)
    },
    [clearHoverCloseTimer],
  )

  const updateChooserPosition = useCallback(() => {
    if (!bandRef.current || typeof window === 'undefined') return

    const rect = bandRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const width = Math.max(
      0,
      Math.min(rect.width, viewportWidth - VIEWPORT_MARGIN * 2),
    )
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      viewportWidth - VIEWPORT_MARGIN - width,
    )
    const top = rect.bottom

    setChooserPosition({
      left,
      maxHeight: Math.max(0, window.innerHeight - top - VIEWPORT_MARGIN),
      top,
      width,
    })
  }, [])

  const scheduleTransientClose = useCallback(() => {
    clearHoverCloseTimer()
    hoverCloseTimerRef.current = setTimeout(() => {
      hoverCloseTimerRef.current = null
      hoverSuppressedRef.current = false
      setIsHovered(false)
    }, HOVER_CLOSE_DELAY_MS)
  }, [clearHoverCloseTimer])

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') return
      clearHoverCloseTimer()
      if (!hoverSuppressedRef.current && hasPackages) {
        setIsHovered(true)
      }
    },
    [clearHoverCloseTimer, hasPackages],
  )

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') return
      const relatedTarget = event.relatedTarget
      if (
        relatedTarget instanceof Node &&
        (bandRef.current?.contains(relatedTarget) ||
          chooserRef.current?.contains(relatedTarget))
      ) {
        return
      }
      scheduleTransientClose()
    },
    [scheduleTransientClose],
  )

  useEffect(() => {
    if (!isOpen) {
      setChooserPosition(null)
      return
    }

    updateChooserPosition()
    const band = bandRef.current
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateChooserPosition)
    if (band) {
      resizeObserver?.observe(band)
    }
    window.addEventListener('resize', updateChooserPosition)
    window.addEventListener('scroll', updateChooserPosition, true)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateChooserPosition)
      window.removeEventListener('scroll', updateChooserPosition, true)
    }
  }, [isOpen, updateChooserPosition])

  useEffect(() => {
    const chooser = chooserRef.current
    if (
      !shouldShowChooserPopover ||
      !chooser ||
      typeof chooser.showPopover !== 'function'
    ) {
      return
    }

    try {
      chooser.showPopover()
    } catch {
      return
    }

    return () => {
      try {
        chooser.hidePopover()
      } catch {
        // The chooser may already have left the top layer during unmount.
      }
    }
  }, [shouldShowChooserPopover])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        !bandRef.current?.contains(target) &&
        !chooserRef.current?.contains(target)
      ) {
        closeChooser(true)
      }
    }
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        !bandRef.current?.contains(target) &&
        !chooserRef.current?.contains(target)
      ) {
        closeChooser(true)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeChooser(true)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeChooser, isOpen])

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current
    if (!pendingFocus) return

    pendingFocusRef.current = null
    if (pendingFocus.surface === 'trigger') {
      triggerRef.current?.focus()
      return
    }

    const refs =
      pendingFocus.surface === 'selected'
        ? selectedButtonRefs.current
        : availableButtonRefs.current
    refs.get(pendingFocus.id ?? -1)?.focus()
  })

  useEffect(
    () => () => {
      clearHoverCloseTimer()
    },
    [clearHoverCloseTimer],
  )

  if (catalogStatus !== 'loaded') {
    return null
  }

  const addPackage = (
    requirementPackage: RequirementPackageOption,
    index: number,
  ) => {
    const nextFocus =
      availablePackages[index + 1] ?? availablePackages[index - 1]
    pendingFocusRef.current = nextFocus
      ? { id: nextFocus.id, surface: 'available' }
      : { surface: 'trigger' }
    onChange([...selectedPackages.map(item => item.id), requirementPackage.id])
    setAnnouncement(
      t('requirementPackageAdded', {
        package: packageName(requirementPackage),
      }),
    )
  }

  const removePackage = (
    requirementPackage: RequirementPackageOption,
    index: number,
  ) => {
    const nextFocus = selectedPackages[index + 1] ?? selectedPackages[index - 1]
    pendingFocusRef.current = nextFocus
      ? { id: nextFocus.id, surface: 'selected' }
      : { surface: 'trigger' }
    const nextIds = selectedPackages
      .filter(item => item.id !== requirementPackage.id)
      .map(item => item.id)
    onChange(nextIds.length > 0 ? nextIds : undefined)
    setAnnouncement(
      t('requirementPackageRemoved', {
        package: packageName(requirementPackage),
      }),
    )
  }

  const clearPackages = () => {
    pendingFocusRef.current = { surface: 'trigger' }
    onChange(undefined)
    setAnnouncement(t('requirementPackageFilterCleared'))
  }

  const chooser = (
    <AnimatePresence>
      {isOpen && chooserPosition ? (
        <motion.fieldset
          className="fixed z-50 m-0 overflow-y-auto border border-secondary-300 bg-white p-2 shadow-lg dark:border-secondary-600 dark:bg-secondary-900"
          id={chooserId}
          onKeyDownCapture={event => {
            if (
              event.key === 'Tab' &&
              event.shiftKey &&
              event.target ===
                availableButtonRefs.current.get(availablePackages[0]?.id ?? -1)
            ) {
              event.preventDefault()
              triggerRef.current?.focus()
            }
          }}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          popover={supportsPopover ? 'manual' : undefined}
          ref={chooserRef}
          style={{
            bottom: 'auto',
            left: chooserPosition.left,
            margin: 0,
            maxHeight: chooserPosition.maxHeight,
            right: 'auto',
            top: chooserPosition.top,
            width: chooserPosition.width,
          }}
          {...offsetPanelMotion(shouldReduceMotion, {
            duration: 0.12,
            offset: -4,
          })}
          {...devMarker({
            context: 'requirements table',
            name: 'requirements package chooser',
            priority: 325,
          })}
        >
          <legend className="sr-only">{t('requirementPackageChooser')}</legend>
          {availablePackages.length > 0 ? (
            <div className="flex min-w-0 flex-wrap gap-1">
              {availablePackages.map((requirementPackage, index) => (
                <RequirementPackagePurposeTooltip
                  key={requirementPackage.id}
                  maxWidth={360}
                  purposeAndScope={packageTooltip(requirementPackage)}
                  wrapperClassName="inline-flex min-w-0 max-w-full"
                >
                  <button
                    aria-label={t('addRequirementPackageToFilter', {
                      package: packageName(requirementPackage),
                    })}
                    aria-pressed="false"
                    className="inline-flex h-6 min-h-6 min-w-6 max-w-64 items-center rounded-full border-2 border-secondary-300 bg-secondary-50 px-2 text-[10px] leading-none font-medium text-secondary-700 transition-colors hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-200 dark:hover:bg-secondary-700"
                    data-requirement-package={requirementPackage.id}
                    onClick={() => addPackage(requirementPackage, index)}
                    ref={node => {
                      if (node) {
                        availableButtonRefs.current.set(
                          requirementPackage.id,
                          node,
                        )
                      } else {
                        availableButtonRefs.current.delete(
                          requirementPackage.id,
                        )
                      }
                    }}
                    type="button"
                  >
                    <span className="truncate">
                      {packageName(requirementPackage)}
                    </span>
                  </button>
                </RequirementPackagePurposeTooltip>
              ))}
            </div>
          ) : (
            <p className="text-xs text-secondary-600 dark:text-secondary-300">
              {t('allRequirementPackagesSelected')}
            </p>
          )}
        </motion.fieldset>
      ) : null}
    </AnimatePresence>
  )

  return (
    <>
      <fieldset
        className="relative m-0 min-w-0 border-x-0 border-t-0 border-b border-secondary-200 bg-white/80 px-3 py-2 text-sm backdrop-blur-sm dark:border-secondary-700 dark:bg-secondary-900/80"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        ref={bandRef}
        {...devMarker({
          context: 'requirements table',
          name: 'requirements package filter',
          priority: 320,
        })}
      >
        <legend className="sr-only">{t('requirementPackages')}</legend>
        <div
          className="grid min-w-0 grid-cols-[auto_1px_minmax(0,1fr)] items-center gap-2"
          data-requirement-package-filter-layout="split"
        >
          <div className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="text-sm font-medium text-secondary-700 dark:text-secondary-300"
              data-requirement-package-filter-title="true"
            >
              {t('requirementPackages')}
            </span>
            <RequirementPackagePurposeTooltip
              purposeAndScope={
                hasPackages
                  ? triggerLabel
                  : t('noRequirementPackagesAvailableToFilter')
              }
              wrapperClassName="inline-flex"
            >
              <button
                aria-controls={chooserId}
                aria-expanded={isOpen}
                aria-label={triggerLabel}
                className={`inline-flex h-6 min-h-6 w-6 min-w-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-45 ${
                  selectedPackages.length > 0
                    ? 'text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/50'
                    : isOpen
                      ? 'bg-secondary-100 text-secondary-500 dark:bg-secondary-800 dark:text-secondary-300'
                      : 'text-secondary-400 hover:bg-secondary-100 hover:text-secondary-600 dark:text-secondary-500 dark:hover:bg-secondary-800 dark:hover:text-secondary-300'
                }`}
                disabled={!hasPackages}
                {...devMarker({
                  context: 'requirements package filter',
                  name: 'filter button',
                  priority: 325,
                  value: 'requirement package',
                })}
                onClick={event => {
                  event.preventDefault()
                  if (isPinned) {
                    closeChooser(true)
                    return
                  }
                  clearHoverCloseTimer()
                  hoverSuppressedRef.current = false
                  setIsPinned(true)
                }}
                onKeyDownCapture={event => {
                  if (
                    event.key === 'Tab' &&
                    !event.shiftKey &&
                    isOpen &&
                    availablePackages.length > 0
                  ) {
                    event.preventDefault()
                    availableButtonRefs.current
                      .get(availablePackages[0]?.id ?? -1)
                      ?.focus()
                  }
                }}
                ref={triggerRef}
                type="button"
              >
                <span
                  className="relative inline-flex h-3.5 w-3.5 items-center justify-center"
                  data-filter-icon-anchor="true"
                >
                  <Filter aria-hidden="true" className="h-3.5 w-3.5" />
                  {selectedPackages.length > 0 ? (
                    <span
                      className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary-600 px-0.5 text-[8px] font-bold leading-none text-white dark:bg-primary-500"
                      data-filter-count-badge="true"
                    >
                      {selectedPackages.length}
                    </span>
                  ) : null}
                </span>
              </button>
            </RequirementPackagePurposeTooltip>
          </div>
          <div
            aria-hidden="true"
            className="h-full min-h-6 w-px bg-secondary-200 dark:bg-secondary-700"
            data-requirement-package-filter-divider="true"
          />
          <div
            className="min-w-0"
            data-requirement-package-filter-selections="true"
          >
            {hasPackages ? (
              selectedPackages.length > 0 ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {selectedPackages.map((requirementPackage, index) => (
                    <RequirementPackagePurposeTooltip
                      key={requirementPackage.id}
                      maxWidth={360}
                      purposeAndScope={packageTooltip(requirementPackage)}
                      wrapperClassName="inline-flex min-w-0 max-w-full"
                    >
                      <button
                        aria-label={t('removeRequirementPackageFromFilter', {
                          package: packageName(requirementPackage),
                        })}
                        aria-pressed="true"
                        className="inline-flex h-6 min-h-6 min-w-6 max-w-64 items-center gap-1 rounded-full bg-primary-100 px-2 text-[10px] leading-none font-medium text-primary-700 transition-colors hover:bg-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 dark:bg-primary-900/40 dark:text-primary-300 dark:hover:bg-primary-900/60"
                        data-requirement-package={requirementPackage.id}
                        onClick={() => removePackage(requirementPackage, index)}
                        ref={node => {
                          if (node) {
                            selectedButtonRefs.current.set(
                              requirementPackage.id,
                              node,
                            )
                          } else {
                            selectedButtonRefs.current.delete(
                              requirementPackage.id,
                            )
                          }
                        }}
                        type="button"
                      >
                        <span className="truncate">
                          {packageName(requirementPackage)}
                        </span>
                        <X aria-hidden="true" className="h-3 w-3 shrink-0" />
                      </button>
                    </RequirementPackagePurposeTooltip>
                  ))}
                  {selectedPackages.length >= 2 ? (
                    <RequirementPackagePurposeTooltip
                      purposeAndScope={t('clearRequirementPackageFilter')}
                      wrapperClassName="inline-flex"
                    >
                      <button
                        aria-label={t('clearRequirementPackageFilter')}
                        className="inline-flex h-6 min-h-6 w-6 min-w-6 items-center justify-center rounded text-secondary-500 transition-colors hover:bg-secondary-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-secondary-300 dark:hover:bg-secondary-800 dark:hover:text-red-400"
                        onClick={clearPackages}
                        type="button"
                      >
                        <FilterX aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </RequirementPackagePurposeTooltip>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-secondary-500 dark:text-secondary-400">
                  {t('noRequirementPackageFilterActive')}
                </p>
              )
            ) : (
              <p className="text-xs text-secondary-500 dark:text-secondary-400">
                {t('noRequirementPackagesAvailableToFilter')}
              </p>
            )}
          </div>
        </div>
      </fieldset>
      {chooser}
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>
    </>
  )
}
