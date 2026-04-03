'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

/* ---------- Types ---------- */

export interface HelpSection {
  /** Discriminator for how this help section should render */
  kind: 'text' | 'visual'
}

export interface HelpTextSection extends HelpSection {
  /** Key relative to the 'help' namespace, e.g. 'requirements.overview.body' */
  bodyKey: string
  /** Key relative to the 'help' namespace, e.g. 'requirements.overview.heading' */
  headingKey: string
  kind: 'text'
}

export type HelpVisualId = 'requirementLifecycle'

export interface HelpVisualSection extends HelpSection {
  /** Optional explanatory text rendered above the visual */
  bodyKey?: string
  /** Key relative to the 'help' namespace, e.g. 'requirements.lifecycleVisual.heading' */
  headingKey: string
  kind: 'visual'
  /** Visual renderer identifier */
  visualId: HelpVisualId
}

export type HelpContentSection = HelpTextSection | HelpVisualSection

export interface HelpContent {
  sections: HelpContentSection[]
  /** Key relative to the 'help' namespace, e.g. 'requirements.title' */
  titleKey: string
}

type HelpRegistrationOwner = symbol

interface HelpRegistration {
  content: HelpContent
  owner: HelpRegistrationOwner
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/* ---------- Context ---------- */

interface HelpContextValue {
  close: () => void
  content: HelpContent | null
  isOpen: boolean
  register: (owner: HelpRegistrationOwner, content: HelpContent) => void
  toggle: () => void
  unregister: (owner: HelpRegistrationOwner) => void
}

const HelpContext = createContext<HelpContextValue | null>(null)
const TEST_HELP_FALLBACK: HelpContextValue = {
  close: () => {},
  content: null,
  isOpen: false,
  register: () => {},
  toggle: () => {},
  unregister: () => {},
}

/* ---------- Provider ---------- */

export function HelpProvider({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState<HelpRegistration[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const content = registrations[registrations.length - 1]?.content ?? null

  const register = useCallback(
    (owner: HelpRegistrationOwner, content: HelpContent) => {
      setRegistrations(previous => [
        ...previous.filter(registration => registration.owner !== owner),
        { owner, content },
      ])
    },
    [],
  )

  const unregister = useCallback((owner: HelpRegistrationOwner) => {
    setRegistrations(previous =>
      previous.filter(registration => registration.owner !== owner),
    )
  }, [])

  const toggle = useCallback(() => setIsOpen(v => !v), [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    if (content === null) {
      setIsOpen(false)
    }
  }, [content])

  return (
    <HelpContext.Provider
      value={{ content, isOpen, toggle, close, register, unregister }}
    >
      {children}
      {typeof window !== 'undefined' &&
        createPortal(
          <HelpPanelInner content={content} isOpen={isOpen} onClose={close} />,
          document.body,
        )}
    </HelpContext.Provider>
  )
}

/* ---------- Hooks ---------- */

export function useHelp() {
  const ctx = useContext(HelpContext)
  if (!ctx) {
    if (process.env.NODE_ENV === 'test') {
      return TEST_HELP_FALLBACK
    }
    throw new Error('useHelp must be used within HelpProvider')
  }
  return ctx
}

/**
 * Register help content for the current view. Call at the top of each client
 * component. Define the content constant at module scope (not inside the
 * component) to ensure a stable reference and avoid re-registration on every
 * render.
 *
 * Pass `null` to opt out of registration (e.g. when a component is rendered
 * inline inside another view that already owns the help content). The
 * currently-registered content from the parent view is preserved.
 */
export function useHelpContent(content: HelpContent | null): void {
  const { register, unregister } = useHelp()
  const ownerRef = useRef<HelpRegistrationOwner>(Symbol('help-content'))

  useEffect(() => {
    if (content === null) return
    register(ownerRef.current, content)
    return () => unregister(ownerRef.current)
  }, [register, unregister, content])
}

function RequirementLifecycleVisual() {
  const t = useTranslations('help')

  const steps: Array<{
    colorClassName: string
    descriptionKey: string
    noteKey?: string
    titleKey: string
    transitionKey?: string
  }> = [
    {
      colorClassName:
        'border-sky-200 bg-sky-50/90 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300',
      descriptionKey: 'requirements.lifecycleVisual.steps.draft.description',
      titleKey: 'requirements.lifecycleVisual.steps.draft.title',
      transitionKey: 'requirements.lifecycleVisual.transitions.create',
    },
    {
      colorClassName:
        'border-amber-200 bg-amber-50/90 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300',
      descriptionKey: 'requirements.lifecycleVisual.steps.review.description',
      noteKey: 'requirements.lifecycleVisual.transitions.returnToDraft',
      titleKey: 'requirements.lifecycleVisual.steps.review.title',
      transitionKey: 'requirements.lifecycleVisual.transitions.sendForReview',
    },
    {
      colorClassName:
        'border-emerald-200 bg-emerald-50/90 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300',
      descriptionKey:
        'requirements.lifecycleVisual.steps.published.description',
      noteKey: 'requirements.lifecycleVisual.transitions.editCreatesDraft',
      titleKey: 'requirements.lifecycleVisual.steps.published.title',
      transitionKey: 'requirements.lifecycleVisual.transitions.publish',
    },
    {
      colorClassName:
        'border-orange-200 bg-orange-50/90 text-orange-700 dark:border-orange-800/70 dark:bg-orange-950/40 dark:text-orange-300',
      descriptionKey:
        'requirements.lifecycleVisual.steps.archivingReview.description',
      noteKey: 'requirements.lifecycleVisual.transitions.cancelArchiving',
      titleKey: 'requirements.lifecycleVisual.steps.archivingReview.title',
      transitionKey: 'requirements.lifecycleVisual.transitions.archive',
    },
    {
      colorClassName:
        'border-slate-200 bg-slate-50/90 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-300',
      descriptionKey: 'requirements.lifecycleVisual.steps.archived.description',
      noteKey: 'requirements.lifecycleVisual.transitions.restoreCreatesDraft',
      titleKey: 'requirements.lifecycleVisual.steps.archived.title',
      transitionKey:
        'requirements.lifecycleVisual.transitions.approveArchiving',
    },
  ]

  return (
    <div className="rounded-2xl border border-secondary-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-4 shadow-sm dark:border-secondary-700/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.84))]">
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div className="space-y-3" key={step.titleKey}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary-500 dark:text-secondary-400">
              <div className="h-px flex-1 bg-secondary-200 dark:bg-secondary-700" />
              <span>{t(step.transitionKey as Parameters<typeof t>[0])}</span>
              <div className="h-px flex-1 bg-secondary-200 dark:bg-secondary-700" />
            </div>

            <article className="rounded-xl border border-secondary-200/80 bg-white/90 p-3 shadow-sm dark:border-secondary-700/70 dark:bg-secondary-900/75">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex shrink-0 flex-col items-center">
                  <span
                    className={`inline-flex min-w-[7.5rem] justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${step.colorClassName}`}
                  >
                    {t(step.titleKey as Parameters<typeof t>[0])}
                  </span>
                  {index < steps.length - 1 ? (
                    <div className="mt-2 flex flex-col items-center text-secondary-300 dark:text-secondary-600">
                      <div className="h-5 w-px bg-current" />
                      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                    </div>
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                  <p className="text-sm leading-relaxed text-secondary-700 dark:text-secondary-300">
                    {t(step.descriptionKey as Parameters<typeof t>[0])}
                  </p>
                  {step.noteKey ? (
                    <div className="inline-flex max-w-full rounded-lg border border-secondary-200/80 bg-secondary-50 px-2.5 py-1.5 text-xs font-medium leading-relaxed text-secondary-600 dark:border-secondary-700/80 dark:bg-secondary-800/70 dark:text-secondary-300">
                      {t(step.noteKey as Parameters<typeof t>[0])}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Panel ---------- */

function HelpPanelInner({
  isOpen,
  content,
  onClose,
}: {
  isOpen: boolean
  content: HelpContent | null
  onClose: () => void
}) {
  const t = useTranslations('help')
  const tc = useTranslations('common')
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRegionRef = useRef<HTMLDivElement>(null)
  const [showScrollIndicator, setShowScrollIndicator] = useState(false)
  const previousFocusedElementRef = useRef<HTMLElement | null>(null)

  const getFocusableElements = useCallback(() => {
    if (!panelRef.current) {
      return []
    }

    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(element => {
      if (element.tabIndex < 0) {
        return false
      }

      if (element.hasAttribute('hidden')) {
        return false
      }

      return element.getAttribute('aria-hidden') !== 'true'
    })
  }, [])

  // Trap focus and restore it when the drawer closes.
  useEffect(() => {
    if (!isOpen) return

    previousFocusedElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    requestAnimationFrame(() => panelRef.current?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      const focusIsInsidePanel =
        activeElement !== null && panelRef.current?.contains(activeElement)

      if (!focusIsInsidePanel) {
        event.preventDefault()
        ;(event.shiftKey ? lastElement : firstElement).focus()
        return
      }

      if (activeElement === panelRef.current) {
        event.preventDefault()
        ;(event.shiftKey ? lastElement : firstElement).focus()
        return
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
        return
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusedElementRef.current?.focus()
      previousFocusedElementRef.current = null
    }
  }, [getFocusableElements, isOpen, onClose])

  // Lock background scrolling while the help drawer is open so wheel/touch
  // scrolling stays on the drawer content instead of the dimmed page behind it.
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return
    }

    const html = document.documentElement
    const { body } = document
    const previousBodyOverflow = body.style.overflow
    const previousHtmlOverflow = html.style.overflow
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior
    const previousHtmlOverscrollBehavior = html.style.overscrollBehavior

    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'contain'
    html.style.overscrollBehavior = 'contain'

    return () => {
      body.style.overflow = previousBodyOverflow
      html.style.overflow = previousHtmlOverflow
      body.style.overscrollBehavior = previousBodyOverscrollBehavior
      html.style.overscrollBehavior = previousHtmlOverscrollBehavior
    }
  }, [isOpen])

  // Hide background siblings from assistive tech and interaction while modal.
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const container = containerRef.current
    const parent = container?.parentElement

    if (
      !(container instanceof HTMLElement) ||
      !(parent instanceof HTMLElement)
    ) {
      return
    }

    const siblings = Array.from(parent.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== container,
    )

    const previousState = siblings.map(element => ({
      ariaHidden: element.getAttribute('aria-hidden'),
      hadInert: element.hasAttribute('inert'),
      element,
    }))

    for (const { element } of previousState) {
      element.setAttribute('aria-hidden', 'true')
      element.setAttribute('inert', '')
    }

    return () => {
      for (const { ariaHidden, hadInert, element } of previousState) {
        if (ariaHidden === null) {
          element.removeAttribute('aria-hidden')
        } else {
          element.setAttribute('aria-hidden', ariaHidden)
        }

        if (!hadInert) {
          element.removeAttribute('inert')
        }
      }
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setShowScrollIndicator(false)
      return
    }

    const scrollRegion = scrollRegionRef.current
    if (!scrollRegion) {
      return
    }

    const updateScrollIndicator = () => {
      const hasOverflow =
        scrollRegion.scrollHeight - scrollRegion.clientHeight > 8
      const hasMoreBelow =
        scrollRegion.scrollTop + scrollRegion.clientHeight <
        scrollRegion.scrollHeight - 8

      setShowScrollIndicator(hasOverflow && hasMoreBelow)
    }

    updateScrollIndicator()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => updateScrollIndicator())

    resizeObserver?.observe(scrollRegion)
    const firstChild = scrollRegion.firstElementChild
    if (firstChild instanceof HTMLElement) {
      resizeObserver?.observe(firstChild)
    }

    scrollRegion.addEventListener('scroll', updateScrollIndicator, {
      passive: true,
    })
    window.addEventListener('resize', updateScrollIndicator)

    return () => {
      resizeObserver?.disconnect()
      scrollRegion.removeEventListener('scroll', updateScrollIndicator)
      window.removeEventListener('resize', updateScrollIndicator)
    }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && content && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          key="help-backdrop"
          ref={containerRef}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on panel element */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            animate={{ x: 0 }}
            aria-label={t(content.titleKey as Parameters<typeof t>[0])}
            aria-modal="true"
            className="absolute right-0 top-0 h-full w-full max-w-sm bg-white dark:bg-secondary-900 shadow-2xl flex flex-col overflow-hidden"
            exit={{ x: '100%' }}
            initial={{ x: '100%' }}
            ref={panelRef}
            role="dialog"
            tabIndex={-1}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-secondary-200 dark:border-secondary-700 shrink-0">
              <h2 className="text-base font-semibold text-secondary-900 dark:text-secondary-100">
                {t(content.titleKey as Parameters<typeof t>[0])}
              </h2>
              <button
                aria-label={tc('close')}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors duration-200"
                onClick={onClose}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="relative min-h-0 flex-1">
              <div
                className="help-panel-scroll-region h-full overflow-y-auto overscroll-contain px-5 py-5 space-y-6"
                ref={scrollRegionRef}
              >
                <div className="space-y-6">
                  {content.sections.map(section => (
                    <div key={section.headingKey}>
                      <h3 className="mb-1.5 text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                        {t(section.headingKey as Parameters<typeof t>[0])}
                      </h3>

                      {section.kind === 'text' ? (
                        <p className="text-sm leading-relaxed text-secondary-700 dark:text-secondary-300">
                          {t(section.bodyKey as Parameters<typeof t>[0])}
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {section.bodyKey ? (
                            <p className="text-sm leading-relaxed text-secondary-700 dark:text-secondary-300">
                              {t(section.bodyKey as Parameters<typeof t>[0])}
                            </p>
                          ) : null}
                          {section.visualId === 'requirementLifecycle' ? (
                            <RequirementLifecycleVisual />
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <AnimatePresence>
                {showScrollIndicator && (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    aria-hidden="true"
                    className="help-panel-scroll-indicator pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center pb-3"
                    exit={{ opacity: 0, y: 6 }}
                    initial={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-secondary-900 dark:via-secondary-900/95" />
                    <motion.div
                      animate={{ y: [0, 3, 0] }}
                      className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-secondary-200/80 bg-white/92 text-secondary-500 shadow-sm dark:border-secondary-700/80 dark:bg-secondary-900/92 dark:text-secondary-300"
                      transition={{
                        duration: 1.4,
                        ease: 'easeInOut',
                        repeat: Number.POSITIVE_INFINITY,
                      }}
                    >
                      <ChevronDown aria-hidden="true" className="h-4 w-4" />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
