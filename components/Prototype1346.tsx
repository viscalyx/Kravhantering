'use client'

import type { Route } from 'next'
// THROWAWAY: Before / Proposed on every existing product route, using ?variant=.
// #1346 fixes the layout contract, so this experiment compares skins, not layouts.
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import { scanPrototype1346 } from './prototype1346-dom'
import './Prototype1346.css'

export const prototype1346Changes = [
  [
    'C01',
    'Controls: 8 px corners',
    'Compare buttons, icon buttons, fields and tabs. Inspect highlights all matched controls.',
  ],
  [
    'C02',
    'Panels and dialogs: 12 px corners',
    'Compare Admin Center, form cards, list frames and an open dialog.',
  ],
  [
    'C03',
    'Flat neutral panels',
    'Admin decoration becomes a solid neutral surface; borders remain visible in both themes.',
  ],
  [
    'C04',
    'Ordinary elevation removed',
    'Compare button/card shadows, including hover. Keyboard focus outlines must remain.',
  ],
  [
    'C05',
    'Floating layers retain shadows',
    'Open a menu or dialog. Its boundary must remain clear over the page.',
  ],
  [
    'C06',
    'Active tabs use indigo',
    'Switch Admin and specification tabs. The active choice has indigo fill and readable text.',
  ],
  [
    'C07',
    'Heading and label scale',
    'Page headings: 24 px; sections: 20 px; field labels: 14 px. Table text and row density remain.',
  ],
  [
    'C08',
    'Table headers lightly tinted',
    'Compare a list and its column headings in light and dark themes.',
  ],
  [
    'C09',
    'Status and functional shapes preserved',
    'Status badges keep pills, text, icons and colors. Check switch thumbs, native controls and stepper outlines.',
  ],
  [
    'C10',
    'Primary / ordinary / destructive actions',
    'Primary actions remain indigo, ordinary actions neutral, destructive actions red. Check hover, disabled and focus states.',
  ],
  [
    'P01',
    'Same-route comparison',
    'Use Before / Proposed or Left / Right outside fields. Reload a copied URL; the selected variant remains.',
  ],
  [
    'P02',
    'Application-wide coverage',
    'Use the view selector, all Admin tabs and ordinary navigation. Newly opened dialogs also receive the skin.',
  ],
  [
    'P03',
    'Writes blocked',
    'Open a form and attempt Save. A prototype notice appears; no business write is sent. Server guard also rejects direct mutations.',
  ],
  [
    'P04',
    'Inspection and review state',
    'Toggle Inspect. Check URL, viewport, theme and matched element counts below. Compare both navigation states.',
  ],
  [
    'P05',
    'Offline review gallery',
    'Use the generated review.html gallery for screenshots, measurements, coverage and known limitations.',
  ],
] as const

const views = [
  ['/requirements', 'Requirements library'],
  ['/requirements/new', 'New requirement'],
  ['/specifications', 'Requirement specifications'],
  ['/requirement-areas', 'Requirement areas'],
  ['/requirements/stewardship?tab=packages', 'Requirement packages'],
  ['/requirements/stewardship?tab=norms', 'Norm library'],
  ['/requirements/stewardship?tab=questions', 'Selection questions'],
  [
    '/requirements/stewardship?tab=information-requests',
    'Information requests',
  ],
  ['/admin?tab=columns', 'Admin · Columns'],
  ['/admin?tab=identity', 'Admin · Identity'],
  ['/admin?tab=settings', 'Admin · Settings / AI'],
  ['/admin?tab=taxonomy', 'Admin · Taxonomy'],
  ['/admin?tab=statusesAndWorkflows', 'Admin · Statuses and workflows'],
  ['/admin?tab=accessReview', 'Admin · Access review'],
  ['/admin?tab=archiving', 'Admin · Archiving'],
  ['/admin?tab=privacy', 'Admin · Privacy'],
  ['/admin?tab=actionAuditLog', 'Admin · Action log'],
  ['/privacy', 'Privacy page'],
  ['/prototype-1346-missing', 'Not-found page'],
] as const

export default function Prototype1346() {
  return process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_PROTOTYPE_1346 === 'true' ? (
    <Prototype1346Review />
  ) : null
}

function Prototype1346Review() {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const enabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_PROTOTYPE_1346 === 'true'
  const variant = params.get('variant') === 'before' ? 'before' : 'after'
  const locale = pathname.startsWith('/en') ? 'en' : 'sv'
  const [review, setReview] = useState(false)
  const [inspect, setInspect] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [state, setState] = useState('Preparing comparison…')
  const [notice, setNotice] = useState(
    'Read-only product preview. Form values are temporary.',
  )
  const choose = useCallback((next: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [])

  useEffect(() => {
    if (!enabled) return
    document.documentElement.dataset.prototype1346 = variant
    document.documentElement.dataset.prototype1346Inspect = String(inspect)
    let frame = 0
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const counts = scanPrototype1346()
        const html = document.documentElement
        const nav = getComputedStyle(html)
          .getPropertyValue('--global-nav-width')
          .trim()
        setState(
          `${window.innerWidth} × ${window.innerHeight} · ${html.classList.contains('dark') ? 'dark' : 'light'} · nav ${nav || 'none'} · ${counts.control ?? 0} controls / ${counts.panel ?? 0} panels / ${counts.floating ?? 0} floating layers`,
        )
      })
    }
    refresh()
    const hydratedScan = window.setInterval(refresh, 1000)
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-selected', 'aria-expanded'],
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    window.addEventListener('resize', refresh)
    return () => {
      observer.disconnect()
      window.clearInterval(hydratedScan)
      window.removeEventListener('resize', refresh)
      cancelAnimationFrame(frame)
      document.getElementById('prototype1346-generated-skin')?.remove()
      delete document.documentElement.dataset.prototype1346
      delete document.documentElement.dataset.prototype1346Inspect
    }
  }, [enabled, variant, inspect])

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
          'input, textarea, select, [contenteditable], [role=dialog], [role=menu], [role=tablist], [role=slider]',
        )
      )
        return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        choose(variant === 'before' ? 'after' : 'before')
      }
    }
    document.addEventListener('keydown', key)
    const original = window.fetch
    window.fetch = async (input, init) => {
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase()
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.href,
      )
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
        !url.pathname.startsWith('/api/auth/') &&
        !url.pathname.startsWith('/_next/')
      ) {
        const message = `Prototype only: ${method} ${url.pathname} blocked. No data saved.`
        setNotice(message)
        return new Response(JSON.stringify({ error: message }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return original(input, init)
    }
    return () => {
      window.fetch = original
      document.removeEventListener('keydown', key)
    }
  }, [enabled, choose, variant])

  if (!enabled) return null
  return (
    <aside
      aria-label="Prototype 1346 review controls"
      className="prototype1346-tools"
      data-prototype1346-tools="true"
      {...devMarker({
        name: 'prototype switcher',
        value: 'issue 1346 visual comparison',
        priority: 450,
      })}
    >
      <div className="prototype1346-row">
        <strong>THROWAWAY #1346</strong>
        <button
          aria-label="Previous variant"
          onClick={() => choose(variant === 'before' ? 'after' : 'before')}
          type="button"
        >
          ←
        </button>
        <button
          aria-pressed={variant === 'before'}
          onClick={() => choose('before')}
          type="button"
        >
          Before
        </button>
        <button
          aria-pressed={variant === 'after'}
          onClick={() => choose('after')}
          type="button"
        >
          Proposed
        </button>
        <button
          aria-label="Next variant"
          onClick={() => choose(variant === 'before' ? 'after' : 'before')}
          type="button"
        >
          →
        </button>
        <button
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          type="button"
        >
          {collapsed ? 'Show tools' : 'Minimize'}
        </button>
        {!collapsed && (
          <>
            <button
              aria-pressed={inspect}
              onClick={() => setInspect(!inspect)}
              type="button"
            >
              Inspect
            </button>
            <button
              aria-expanded={review}
              onClick={() => setReview(!review)}
              type="button"
            >
              Changes & review
            </button>
            <select
              aria-label="Open a prototype view"
              onChange={event => {
                const url = new URL(
                  `/${locale}${event.target.value}`,
                  window.location.origin,
                )
                url.searchParams.set('variant', variant)
                router.push(`${url.pathname}${url.search}` as Route)
              }}
              value=""
            >
              <option disabled value="">
                Open a view…
              </option>
              {views.map(([path, label]) => (
                <option key={path} value={path}>
                  {label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="prototype1346-state">
            {variant.toUpperCase()} · {pathname}
            {params.get('tab') ? ` · ${params.get('tab')}` : ''} · {state}
          </div>
          <div className="prototype1346-state" role="status">
            {notice}
          </div>
          {review && (
            <div className="prototype1346-review">
              <h2>
                Does the agreed visual style work throughout the application?
              </h2>
              <p>
                Same real routes and data. No layout redesign. Open a detail
                from a list, or use the view selector. URLs without a variant
                default to Proposed.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Change</th>
                    <th>Verify</th>
                  </tr>
                </thead>
                <tbody>
                  {prototype1346Changes.map(([id, title, check]) => (
                    <tr key={id}>
                      <td>{id}</td>
                      <td>{title}</td>
                      <td>{check}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Excluded: PDFs/CSV, external sign-in pages, logos, packaged
                Developer Mode overlay. This DOM skin is an experiment, not
                production implementation. No visual verdict is recorded until
                you review it.
              </p>
            </div>
          )}
        </>
      )}
    </aside>
  )
}
