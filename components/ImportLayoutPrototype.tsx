'use client'

// THROWAWAY #1360: baseline + three entry layouts on /sv/requirements.
// Question: which hierarchy makes input primary while keeping support visible?
import { ArrowLeft, ArrowRight, Download, FileInput, X } from 'lucide-react'
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { devMarker } from '@/lib/developer-mode-markers'
import styles from './ImportLayoutPrototype.module.css'

const variants = ['baseline', 'A', 'B', 'C'] as const
type Variant = (typeof variants)[number]
const sample = JSON.stringify(
  {
    schemaVersion: 'requirement-import.v4',
    requirements: [
      { description: 'Systemet ska visa kravets publicerade version.' },
    ],
  },
  null,
  2,
)

interface Props {
  areas: {
    id: number
    name: string
    prefix?: string
    permissions?: { canAuthor?: boolean }
  }[]
}

export default function ImportLayoutPrototype({ areas }: Props) {
  const t = useTranslations('importLayoutPrototype')
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const requested = params.get('variant')
  const variant: Variant = variants.find(value => value === requested) ?? 'A'
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(true)
  const [area, setArea] = useState('')
  const [json, setJson] = useState('')
  const [file, setFile] = useState('')
  const [long, setLong] = useState(false)
  const [dark, setDark] = useState(false)
  const [preview, setPreview] = useState(false)
  const [notice, setNotice] = useState('')
  const [inspector, setInspector] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const overlay = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const reopenButton = useRef<HTMLButtonElement>(null)
  const options = areas.filter(item => item.permissions?.canAuthor)
  const destinations = options.length
    ? options
    : [{ id: -1, name: 'Informationssäkerhet', prefix: 'DEMO' }]
  const selected = destinations.find(item => String(item.id) === area)
  const areaName = long ? t('longArea') : selected?.name
  let validation = !json.trim() ? 'empty' : 'invalid'
  let rows = 0
  if (json.trim()) {
    try {
      const parsed = JSON.parse(json)
      if (
        parsed.schemaVersion === 'requirement-import.v4' &&
        Array.isArray(parsed.requirements) &&
        parsed.requirements.length > 0 &&
        parsed.requirements.every(
          (row: { description?: unknown }) =>
            typeof row?.description === 'string' && row.description.trim(),
        )
      ) {
        validation = 'valid'
        rows = parsed.requirements.length
      }
    } catch {
      /* Deliberately limited prototype validation; no server contract. */
    }
  }
  const canPreview = Boolean(area) && validation === 'valid'

  useEffect(() => {
    setMounted(true)
    setDark(document.documentElement.classList.contains('dark'))
    const wasDark = document.documentElement.classList.contains('dark')
    return () => {
      document.documentElement.classList.toggle('dark', wasDark)
    }
  }, [])
  useEffect(() => {
    if (mounted) document.documentElement.classList.toggle('dark', dark)
  }, [dark, mounted])
  useEffect(() => {
    if (!mounted || !open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [mounted, open])

  const choose = useCallback(
    (next: Variant) => {
      const query = new URLSearchParams(params.toString())
      query.set('variant', next)
      router.replace(`${pathname}?${query}` as Route, { scroll: false })
    },
    [params, pathname, router],
  )
  const cycle = useCallback(
    (delta: number) => {
      choose(
        variants[
          (variants.indexOf(variant) + delta + variants.length) %
            variants.length
        ],
      )
    },
    [choose, variant],
  )
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !target.closest('input, textarea, select, [contenteditable]')
      ) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          cycle(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }
      if (open && event.key === 'Escape') {
        setOpen(false)
        requestAnimationFrame(() => reopenButton.current?.focus())
      }
      if (open && event.key === 'Tab') {
        const nodes = Array.from(
          overlay.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select, textarea, input:not([type="hidden"])',
          ) ?? [],
        ).filter(node => node.getClientRects().length > 0)
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [cycle, open])

  function updateJson(value: string, source = '') {
    setJson(value)
    setFile(source)
    setPreview(false)
    setNotice('')
  }
  async function readFile(input?: File) {
    if (!input) return
    if (input.size > 8 * 1024 * 1024) {
      updateJson('')
      setNotice(t('tooLarge'))
      return
    }
    updateJson(await input.text(), input.name)
  }
  function download(kind: string) {
    const content =
      kind === 'sample' ? sample : `${t('artifactNotice')}\n${kind}`
    const url = URL.createObjectURL(
      new Blob([content], {
        type: kind === 'sample' ? 'application/json' : 'text/plain',
      }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `prototype-${kind}.${kind === 'sample' ? 'json' : 'txt'}`
    link.click()
    URL.revokeObjectURL(url)
    setNotice(t('downloaded'))
  }

  const support = (
    <aside
      className={styles.support}
      {...devMarker({
        name: 'support panel',
        context: 'import layout prototype',
        value: variant,
      })}
    >
      {variant !== 'baseline' && <h3>{t('support')}</h3>}
      <div className={styles.downloads}>
        <button
          aria-describedby="prototype-download-help"
          onClick={() => download('schema')}
          type="button"
        >
          <Download aria-hidden="true" size={16} />
          {t('schema')}
        </button>
        <button
          aria-describedby="prototype-download-help"
          onClick={() => download('instruction')}
          type="button"
        >
          <Download aria-hidden="true" size={16} />
          {t('instruction')}
        </button>
      </div>
      <p id="prototype-download-help">{t('help')}</p>
    </aside>
  )
  const destination = (
    <div className={styles.destination}>
      <label htmlFor="prototype-area">
        {t('area')} <span aria-hidden="true">*</span>
      </label>
      <select
        id="prototype-area"
        onChange={event => {
          setArea(event.target.value)
          setPreview(false)
        }}
        value={area}
      >
        <option value="">{t('chooseArea')}</option>
        {destinations.map(item => (
          <option key={item.id} value={item.id}>
            {item.prefix} {long ? t('longArea') : item.name}
          </option>
        ))}
      </select>
    </div>
  )
  const upload = (
    <div className={styles.uploadGroup}>
      <button
        className={styles.drop}
        onClick={() => fileInput.current?.click()}
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault()
          void readFile(event.dataTransfer.files[0])
        }}
        type="button"
      >
        <FileInput aria-hidden="true" size={24} />
        <span>{t('drop')}</span>
        {file && <strong>{file}</strong>}
      </button>
    </div>
  )
  const paste = (
    <div className={styles.paste}>
      <label htmlFor="prototype-json">
        {t('json')} <span aria-hidden="true">*</span>
      </label>
      <textarea
        id="prototype-json"
        onChange={event => updateJson(event.target.value)}
        placeholder={t('placeholder')}
        spellCheck={false}
        value={json}
      />
    </div>
  )
  const action = (
    <div className={styles.action}>
      {!canPreview && (
        <p className={styles.blocker} role="status">
          {validation === 'invalid' ? t('invalid') : t('blocker')}
        </p>
      )}
      <button
        className="btn-primary"
        disabled={!canPreview}
        onClick={() => setPreview(true)}
        type="button"
      >
        {t('preview')}
      </button>
      {notice && <p role="status">{notice}</p>}
      {preview && (
        <div className={styles.preview} role="status">
          <strong>{t('previewTitle', { count: rows })}</strong>
          <p>{t('previewNotice')}</p>
        </div>
      )}
    </div>
  )
  const state = {
    variant,
    dialog: open,
    area: area || null,
    destinationSource: options.length
      ? 'existing authorable areas'
      : 'demo fallback',
    file: file || null,
    validation,
    rows,
    preview,
    dark,
    longText: long,
    rawJson: json,
    notice,
    persistence: 'none; import simulated',
  }

  if (!mounted || process.env.NODE_ENV === 'production') return null
  return createPortal(
    <section
      {...(open
        ? {
            role: 'dialog' as const,
            'aria-modal': true as const,
            'aria-label': t('title'),
          }
        : {})}
      className={styles.prototype}
      ref={overlay}
    >
      {open && (
        <div className={styles.backdrop}>
          <section
            aria-label={t('title')}
            className={`${styles.dialog} ${styles[variant]}`}
            data-prototype-variant={variant}
            {...devMarker({
              name: 'dialog',
              context: 'import layout prototype',
              value: variant,
            })}
          >
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>JSON</span>
                <h2>
                  {areaName ? t('titleArea', { area: areaName }) : t('title')}
                </h2>
              </div>
              <button
                aria-label={t('close')}
                className={styles.close}
                onClick={() => {
                  setOpen(false)
                  requestAnimationFrame(() => reopenButton.current?.focus())
                }}
                ref={closeButton}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </header>
            <div className={styles.body}>
              <input
                accept=".json,application/json"
                hidden
                onChange={event => {
                  void readFile(event.target.files?.[0])
                  event.target.value = ''
                }}
                ref={fileInput}
                type="file"
              />
              {variant === 'baseline' && (
                <>
                  {support}
                  {destination}
                  {upload}
                  {paste}
                  {action}
                </>
              )}
              {variant === 'A' && (
                <>
                  <div className={styles.main}>
                    {destination}
                    {upload}
                    {paste}
                    {action}
                  </div>
                  {support}
                </>
              )}
              {variant === 'B' && (
                <>
                  {destination}
                  <div className={styles.main}>
                    {upload}
                    {paste}
                    {action}
                  </div>
                  {support}
                </>
              )}
              {variant === 'C' && (
                <>
                  {destination}
                  <div className={styles.inputSplit}>
                    {upload}
                    {paste}
                  </div>
                  {support}
                  {action}
                </>
              )}
            </div>
          </section>
        </div>
      )}
      <section
        aria-label={t('tools')}
        className={styles.toolbar}
        {...devMarker({
          name: 'prototype controls',
          context: 'import layout prototype',
          value: variant,
        })}
      >
        <div className={styles.switcher}>
          <strong>PROTOTYPE #1360</strong>
          <button
            aria-label={t('previous')}
            onClick={() => cycle(-1)}
            type="button"
          >
            <ArrowLeft size={16} />
          </button>
          <select
            aria-label={t('variant')}
            onChange={event => choose(event.target.value as Variant)}
            value={variant}
          >
            {variants.map(key => (
              <option key={key} value={key}>
                {key} · {t(`variants.${key}`)}
              </option>
            ))}
          </select>
          <button aria-label={t('next')} onClick={() => cycle(1)} type="button">
            <ArrowRight size={16} />
          </button>
          <button onClick={() => setDark(value => !value)} type="button">
            {dark ? t('light') : t('dark')}
          </button>
          <button
            aria-pressed={long}
            onClick={() => setLong(value => !value)}
            type="button"
          >
            {t('long')}
          </button>
          <button
            onClick={() => {
              setArea(String(destinations[0].id))
              updateJson(sample)
            }}
            type="button"
          >
            {t('sample')}
          </button>
          <button onClick={() => download('sample')} type="button">
            {t('sampleFile')}
          </button>
          <button
            onClick={() => {
              setArea('')
              updateJson('')
            }}
            type="button"
          >
            {t('reset')}
          </button>
          <button
            onClick={() => setOpen(value => !value)}
            ref={reopenButton}
            type="button"
          >
            {open ? t('hide') : t('show')}
          </button>
          <button
            aria-expanded={inspector}
            onClick={() => setInspector(value => !value)}
            type="button"
          >
            {t('state')}
          </button>
        </div>
        <p className={styles.summary} role="status">
          {t(`descriptions.${variant}`)} · {t('simulation')} · {validation} ·{' '}
          {rows} {t('rows')}
          {area ? ` · ${areaName}` : ''}
        </p>
        {inspector && (
          <pre className={styles.inspector}>
            {JSON.stringify(state, null, 2)}
          </pre>
        )}
      </section>
    </section>,
    document.body,
  )
}
