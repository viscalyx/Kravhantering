'use client'

// Throwaway #1345: Before + B prototype on the existing list routes.
import { ArrowLeft, ArrowRight, FlaskConical, Plus, X } from 'lucide-react'
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import './Prototype1345.css'

export type PrototypeVariant = 'before' | 'B'
const variants: PrototypeVariant[] = ['before', 'B']
const PrototypeContext = createContext({
  enabled: false,
  active: false,
  variant: 'before' as PrototypeVariant,
  toolsTarget: null as HTMLFieldSetElement | null,
  setToolsTarget: (_target: HTMLFieldSetElement | null) => {},
  simulate: (_label: string) => {},
})
export const usePrototype1345 = () => useContext(PrototypeContext)

export function Prototype1345Provider({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('prototype1345')
  const nav = useTranslations('nav')
  const [toolsTarget, setToolsTarget] = useState<HTMLFieldSetElement | null>(
    null,
  )
  const [lastAction, setLastAction] = useState('')
  const [showReview, setShowReview] = useState(false)
  const prototypeBuild =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_PROTOTYPE_1345 === 'true'
  const route = pathname.replace(/^\/(sv|en)/, '')
  const supported =
    ['/requirements', '/specifications', '/requirement-areas'].includes(
      route,
    ) ||
    /^\/specifications\/\d+$/.test(route) ||
    (route.startsWith('/requirements/stewardship') &&
      ['packages', 'norms', 'questions', 'information-requests'].includes(
        params.get('tab') ?? route.split('/').at(-1) ?? '',
      ))
  const enabled = prototypeBuild && supported
  const requested = params.get('variant')
  const variant: PrototypeVariant = variants.includes(
    requested as PrototypeVariant,
  )
    ? (requested as PrototypeVariant)
    : 'B'
  const active = enabled && variant !== 'before'
  const simulate = useCallback((label: string) => setLastAction(label), [])
  const choose = useCallback(
    (next: PrototypeVariant) => {
      const query = new URLSearchParams(params.toString())
      query.set('variant', next)
      router.replace(`${pathname}?${query}` as Route, { scroll: false })
      setLastAction('')
    },
    [params, pathname, router],
  )

  useEffect(() => {
    if (enabled && ['A', 'C', 'D'].includes(requested ?? '')) choose('B')
  }, [choose, enabled, requested])

  useEffect(() => {
    if (!enabled) return
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        target.closest(
          'input, textarea, select, [contenteditable], [role="menu"], [role="dialog"], [role="slider"], [role="tablist"], .prototype-1345-view-switcher',
        )
      )
        return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      choose(
        variants[
          (variants.indexOf(variant) +
            (event.key === 'ArrowRight' ? 1 : variants.length - 1)) %
            variants.length
        ],
      )
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [choose, enabled, variant])

  // Keep existing reads, filters and menus. Writes are simulated throughout this throwaway app session.
  useEffect(() => {
    if (!prototypeBuild) return
    const original = window.fetch
    window.fetch = async (input, init) => {
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase()
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        simulate(`${method}: ${t('writeSimulated')}`)
        return new Response(JSON.stringify({ error: t('writeSimulated') }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return original(input, init)
    }
    const click = (event: MouseEvent) => {
      const element = (event.target as HTMLElement).closest<HTMLElement>(
        'button, a',
      )
      if (!element || element.closest('[data-prototype-controls]')) return
      const action = element.getAttribute('data-floating-action-id')
      const href = element.getAttribute('href') ?? ''
      const label =
        element.getAttribute('aria-label') ??
        element.getAttribute('title') ??
        element.textContent?.trim() ??
        ''
      if (
        (action &&
          ['create', 'ai-generate', 'import', 'export'].includes(action)) ||
        /\/requirements\/new/.test(href) ||
        /^(Ny$|Nytt |Ny normreferens|New |Create$|Redigera|Edit$|Ta bort|Delete$|Arkivera|Archive$)/i.test(
          label,
        )
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        simulate(label)
      }
    }
    document.addEventListener('click', click, true)
    return () => {
      window.fetch = original
      document.removeEventListener('click', click, true)
    }
  }, [prototypeBuild, simulate, t])

  const views = [
    ['/requirements', 'catalog'],
    ['/specifications', 'specifications'],
    ['/requirements/stewardship?tab=packages', 'requirementPackages'],
    ['/requirements/stewardship?tab=norms', 'normLibrary'],
    ['/requirement-areas', 'areas'],
    [
      '/requirements/stewardship?tab=questions',
      'requirementSelectionQuestions',
    ],
    ['/requirements/stewardship?tab=information-requests', 'rfiQuestions'],
  ] as const

  return (
    <PrototypeContext.Provider
      value={{
        enabled,
        active,
        variant,
        toolsTarget,
        setToolsTarget,
        simulate,
      }}
    >
      {children}
      {enabled && (
        <>
          <div
            className="prototype-1345-switcher"
            data-prototype-controls
            {...devMarker({
              context: 'prototype 1345',
              name: 'variant switcher',
            })}
          >
            <div className="prototype-1345-switcher-main">
              <FlaskConical aria-hidden="true" size={18} />
              <strong>{t('prototype')}</strong>
              <button
                aria-label={t('previous')}
                onClick={() =>
                  choose(
                    variants[
                      (variants.indexOf(variant) + variants.length - 1) %
                        variants.length
                    ],
                  )
                }
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={16} />
              </button>
              <span aria-live="polite" className="prototype-1345-variant">
                {variant} · {t(`variants.${variant}`)}
              </span>
              <button
                aria-label={t('next')}
                onClick={() =>
                  choose(
                    variants[(variants.indexOf(variant) + 1) % variants.length],
                  )
                }
                type="button"
              >
                <ArrowRight aria-hidden="true" size={16} />
              </button>
              <button
                aria-pressed={variant === 'before'}
                onClick={() => choose(variant === 'before' ? 'B' : 'before')}
                type="button"
              >
                {t('compare')}
              </button>
              <button
                aria-expanded={showReview}
                onClick={() => setShowReview(!showReview)}
                type="button"
              >
                {t('review')}
              </button>
            </div>
            <div className="prototype-1345-links">
              <a href={`/${locale}/specifications/8?variant=${variant}`}>
                {t('detailView')}
              </a>
              {views.map(([path, key]) => (
                <a
                  href={`/${locale}${path}${path.includes('?') ? '&' : '?'}variant=${variant}`}
                  key={key}
                >
                  {nav(key)}
                </a>
              ))}
            </div>
            <p role="status">
              {t('state', {
                variant,
                view: params.has('tab')
                  ? `${route}?tab=${params.get('tab')}`
                  : route,
                action: lastAction || t('none'),
              })}
            </p>
          </div>
          {showReview && (
            <section
              aria-label={t('review')}
              className="prototype-1345-review"
              data-prototype-controls
            >
              <button
                aria-label={t('close')}
                className="prototype-1345-close"
                onClick={() => setShowReview(false)}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
              <h2>{t('review')}</h2>
              <p>{t(`tradeoffs.${variant}`)}</p>
              <ol>
                {(
                  [
                    'heading',
                    'primary',
                    'secondary',
                    'menus',
                    'viewport',
                    'keyboard',
                    'safety',
                  ] as const
                ).map(key => (
                  <li key={key}>{t(`checks.${key}`)}</li>
                ))}
              </ol>
              <p>{t('readOnly')}</p>
            </section>
          )}
        </>
      )}
    </PrototypeContext.Provider>
  )
}

interface HeaderProps {
  action: string
  canCreate?: boolean
  disabled?: boolean
  icon?: ReactNode
  title: ReactNode
  tooltip?: string
}
export function Prototype1345Header({
  title,
  action,
  disabled,
  icon,
  tooltip,
  canCreate = true,
}: HeaderProps) {
  const { active, setToolsTarget, simulate } = usePrototype1345()
  const t = useTranslations('prototype1345')
  if (!active) return null
  const button = canCreate ? (
    <button
      aria-label={action}
      className="btn-primary prototype-1345-primary"
      disabled={disabled}
      onClick={() => simulate(action)}
      title={tooltip ?? action}
      type="button"
      {...devMarker({
        context: 'prototype 1345',
        name: 'primary action',
        value: action,
      })}
    >
      {icon ?? <Plus aria-hidden="true" size={17} />}
      {action}
    </button>
  ) : null
  const tools = (
    <fieldset
      aria-label={t('tools')}
      className="prototype-1345-tools"
      ref={setToolsTarget}
      {...devMarker({ context: 'prototype 1345', name: 'list toolbar' })}
    />
  )
  return <VariantB button={button} title={title} tools={tools} />
}
interface VariantProps {
  button: ReactNode
  title: ReactNode
  tools: ReactNode
}
export function Prototype1345Table(props: ComponentProps<'table'>) {
  const { active } = usePrototype1345()
  const tableRef = useRef<HTMLTableElement>(null)
  useEffect(() => {
    const table = tableRef.current
    const head = table?.tHead
    if (!active || !table || !head) return
    const surface = table.closest(
      '[data-prototype-1345], [data-prototype-detail]',
    )
    const pane = table.closest<HTMLElement>(
      '[data-specification-detail-list-panel]',
    )
    const tabs = pane?.firstElementChild
    let translated = 0
    let frame = 0
    const update = () => {
      frame = 0
      if (tabs)
        table.style.setProperty(
          '--prototype-1345-table-tabs-height',
          `${tabs.getBoundingClientRect().height}px`,
        )
      const paneTop =
        pane && ['auto', 'scroll'].includes(getComputedStyle(pane).overflowY)
          ? pane.getBoundingClientRect().top + pane.clientTop
          : 0
      const stop =
        paneTop + Number.parseFloat(getComputedStyle(head).scrollMarginTop)
      const bounds = head.getBoundingClientRect()
      const naturalTop = bounds.top - translated
      translated = Math.max(
        0,
        Math.min(
          stop - naturalTop,
          table.getBoundingClientRect().bottom - naturalTop - bounds.height,
        ),
      )
      // Move the actual header so column widths, horizontal scrolling and controls remain native.
      head.style.transform = `translateY(${translated}px)`
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    for (const element of [
      table,
      head,
      tabs,
      surface?.querySelector('.prototype-1345-header'),
      surface?.querySelector('.prototype-1345-filters'),
    ]) {
      if (element) observer.observe(element)
    }
    document.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      head.style.removeProperty('transform')
    }
  }, [active])
  return (
    <table
      {...props}
      data-prototype-table={active || undefined}
      ref={tableRef}
      {...(active &&
        devMarker({
          context: 'prototype 1345',
          name: 'table with sticky column headers',
        }))}
    />
  )
}
export function Prototype1345Filters({ children }: { children: ReactNode }) {
  const { active } = usePrototype1345()
  const filterRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const filters = filterRef.current
    const workspace = filters?.closest<HTMLElement>('[data-prototype-1345]')
    const pane = filters?.closest('[data-specification-detail-list-panel]')
    const tabs = pane?.firstElementChild
    if (!active || !filters) return
    const measure = () => {
      workspace?.style.setProperty(
        '--prototype-1345-filters-height',
        `${filters.getBoundingClientRect().height}px`,
      )
      if (tabs)
        filters.style.setProperty(
          '--prototype-1345-pane-tabs-height',
          `${tabs.getBoundingClientRect().height}px`,
        )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(filters)
    if (tabs) observer.observe(tabs)
    measure()
    return () => {
      observer.disconnect()
      workspace?.style.removeProperty('--prototype-1345-filters-height')
    }
  }, [active])
  if (!active) return children
  return (
    <div
      className="prototype-1345-filters"
      ref={filterRef}
      {...devMarker({
        context: 'prototype 1345',
        name: 'sticky search and filters',
      })}
    >
      {children}
    </div>
  )
}
function usePrototypeHeaderMeasure() {
  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const measure = () =>
      document.documentElement.style.setProperty(
        '--prototype-1345-header-height',
        `${header.getBoundingClientRect().height}px`,
      )
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    measure()
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty(
        '--prototype-1345-header-height',
      )
    }
  }, [])
  return headerRef
}
export function VariantB({ title, button, tools }: VariantProps) {
  const headerRef = usePrototypeHeaderMeasure()
  return (
    <header className="prototype-1345-header prototype-1345-B" ref={headerRef}>
      <h1>{title}</h1>
      {tools}
      {button}
    </header>
  )
}
