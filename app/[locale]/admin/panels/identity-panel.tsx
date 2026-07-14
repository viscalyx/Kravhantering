'use client'

import { Eye, EyeOff, Plus, Save, Star, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import DirtyStateButton from '@/components/DirtyStateButton'
import FieldHelpButton from '@/components/FieldHelpButton'
import { devMarker } from '@/lib/developer-mode-markers'
import { createDirtySnapshot } from '@/lib/forms/dirty-state'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'

interface HsaIdPrefixAdminItem {
  clientId: string
  id?: number
  isDefault: boolean
  isUsed: boolean
  isVisible: boolean
  label: string
  prefix: string
}

const HSA_ID_PREFIX_PATTERN = /^[A-Z]{2}\d{10}$/u

function toHsaIdPrefixAdminItem(row: {
  id: number
  isDefault: boolean
  isUsed: boolean
  isVisible: boolean
  label: string | null
  prefix: string
}): HsaIdPrefixAdminItem {
  return {
    clientId: `stored-${row.id}`,
    id: row.id,
    isDefault: row.isDefault,
    isUsed: row.isUsed,
    isVisible: row.isVisible,
    label: row.label ?? '',
    prefix: row.prefix,
  }
}

function hsaIdPrefixSnapshot(prefixes: HsaIdPrefixAdminItem[]) {
  return createDirtySnapshot({
    prefixes: prefixes.map(item => ({
      ...(item.id === undefined ? {} : { id: item.id }),
      isDefault: item.isDefault,
      isVisible: item.isVisible,
      label: item.label.trim() || null,
      prefix: item.prefix.trim(),
    })),
  })
}

export default function IdentitySettingsPanel() {
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const [openIdentityHelp, setOpenIdentityHelp] = useState<string | null>(null)
  const [prefixes, setPrefixes] = useState<HsaIdPrefixAdminItem[]>([])
  const [prefixesBaseline, setPrefixesBaseline] = useState(() =>
    hsaIdPrefixSnapshot([]),
  )
  const [isInitialLoadPending, setIsInitialLoadPending] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const saveTokenRef = useRef(0)
  const isSaving = saveState === 'saving'
  const loadErrorMessage = ta('identity.loadError')
  const visiblePrefixCount = prefixes.filter(item => item.isVisible).length
  const prefixesDirty = prefixesBaseline !== hsaIdPrefixSnapshot(prefixes)

  const loadPrefixes = useCallback(async () => {
    setIsInitialLoadPending(true)
    setSaveState('saving')
    setMessage(null)
    try {
      const response = await apiFetch('/api/admin/hsa-id-prefixes')
      if (!response.ok) {
        setSaveState('error')
        setMessage((await readResponseMessage(response)) ?? loadErrorMessage)
        return
      }
      const payload = (await response.json()) as {
        prefixes?: Array<{
          id: number
          isDefault: boolean
          isUsed: boolean
          isVisible: boolean
          label: string | null
          prefix: string
        }>
      }
      const nextPrefixes = (payload.prefixes ?? []).map(toHsaIdPrefixAdminItem)
      setPrefixes(nextPrefixes)
      setPrefixesBaseline(hsaIdPrefixSnapshot(nextPrefixes))
      setSaveState('idle')
    } catch {
      setSaveState('error')
      setMessage(loadErrorMessage)
    } finally {
      setIsInitialLoadPending(false)
    }
  }, [loadErrorMessage])

  useEffect(() => {
    void loadPrefixes()
  }, [loadPrefixes])

  useEffect(() => {
    if (openIdentityHelp === null) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenIdentityHelp(null)
      }
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && panelRef.current?.contains(target)) {
        return
      }
      setOpenIdentityHelp(null)
    }

    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [openIdentityHelp])

  const setPrefix = (
    clientId: string,
    updater: (item: HsaIdPrefixAdminItem) => HsaIdPrefixAdminItem,
  ) => {
    setPrefixes(current =>
      current.map(item => (item.clientId === clientId ? updater(item) : item)),
    )
    setSaveState('idle')
    setMessage(null)
  }

  const addPrefix = () => {
    setPrefixes(current => [
      ...current,
      {
        clientId: `new-${Date.now()}-${current.length}`,
        isDefault: current.every(item => !item.isVisible),
        isUsed: false,
        isVisible: true,
        label: '',
        prefix: '',
      },
    ])
    setSaveState('idle')
    setMessage(null)
  }

  const removePrefix = (clientId: string) => {
    setPrefixes(current => current.filter(item => item.clientId !== clientId))
    setSaveState('idle')
    setMessage(null)
  }

  const selectDefault = (clientId: string) => {
    setPrefixes(current =>
      current.map(item => ({
        ...item,
        isDefault: item.clientId === clientId,
        isVisible: item.clientId === clientId ? true : item.isVisible,
      })),
    )
    setSaveState('idle')
    setMessage(null)
  }

  const toggleVisible = (clientId: string) => {
    setPrefixes(current => {
      const currentVisibleCount = current.filter(item => item.isVisible).length
      return current.map(item => {
        if (item.clientId !== clientId) return item
        if (item.isVisible && currentVisibleCount <= 1) return item
        const isVisible = !item.isVisible
        return {
          ...item,
          isDefault: isVisible ? item.isDefault : false,
          isVisible,
        }
      })
    })
    setSaveState('idle')
    setMessage(null)
  }

  const inlineHelpButton = (key: string, label: string, controls: string) => (
    <FieldHelpButton
      controls={controls}
      expanded={openIdentityHelp === key}
      label={`${tc('help')}: ${label}`}
      onClick={() =>
        setOpenIdentityHelp(current => (current === key ? null : key))
      }
    />
  )

  const inlineHelpPanel = (
    key: string,
    id: string,
    translationKey: Parameters<typeof ta>[0],
  ) => (
    <AnimatedHelpPanel id={id} isOpen={openIdentityHelp === key}>
      {ta(translationKey)}
    </AnimatedHelpPanel>
  )

  const floatingHelpButton = (
    key: string,
    label: string,
    id: string,
    translationKey: Parameters<typeof ta>[0],
  ) => (
    <span className="relative inline-flex">
      <FieldHelpButton
        controls={id}
        expanded={openIdentityHelp === key}
        label={`${tc('help')}: ${label}`}
        onClick={() =>
          setOpenIdentityHelp(current => (current === key ? null : key))
        }
      />
      {openIdentityHelp === key ? (
        <span
          className="absolute right-0 top-full z-30 mt-2 w-64 max-w-[min(16rem,calc(100vw-2rem))] rounded-lg border border-secondary-200 bg-white px-3 py-2 text-left text-xs text-secondary-600 shadow-lg dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-300"
          id={id}
          role="tooltip"
        >
          {ta(translationKey)}
        </span>
      ) : null}
    </span>
  )

  const validatePrefixes = () => {
    const normalizedPrefixes = prefixes.map(item => item.prefix.trim())
    if (
      normalizedPrefixes.some(prefix => !HSA_ID_PREFIX_PATTERN.test(prefix))
    ) {
      return ta('identity.invalidPrefix')
    }
    if (new Set(normalizedPrefixes).size !== normalizedPrefixes.length) {
      return ta('identity.duplicatePrefix')
    }
    const visiblePrefixes = prefixes.filter(item => item.isVisible)
    const defaultPrefixes = prefixes.filter(item => item.isDefault)
    if (prefixes.length > 0 && visiblePrefixes.length === 0) {
      return ta('identity.visibleRequired')
    }
    if (visiblePrefixes.length > 0 && defaultPrefixes.length !== 1) {
      return ta('identity.defaultRequired')
    }
    if (defaultPrefixes.some(item => !item.isVisible)) {
      return ta('identity.defaultMustBeVisible')
    }
    return null
  }

  const savePrefixes = async () => {
    if (!prefixesDirty) return
    const validationMessage = validatePrefixes()
    if (validationMessage) {
      setSaveState('error')
      setMessage(validationMessage)
      return
    }

    const requestToken = saveTokenRef.current + 1
    saveTokenRef.current = requestToken
    setSaveState('saving')
    setMessage(null)
    try {
      const response = await apiFetch('/api/admin/hsa-id-prefixes', {
        body: JSON.stringify({
          prefixes: prefixes.map(item => ({
            ...(item.id === undefined ? {} : { id: item.id }),
            isDefault: item.isDefault,
            isVisible: item.isVisible,
            label: item.label.trim() || null,
            prefix: item.prefix.trim(),
          })),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })
      if (requestToken !== saveTokenRef.current) return

      if (!response.ok) {
        setSaveState('error')
        setMessage(
          (await readResponseMessage(response)) ?? ta('identity.saveError'),
        )
        return
      }

      const payload = (await response.json()) as {
        prefixes?: Array<{
          id: number
          isDefault: boolean
          isUsed: boolean
          isVisible: boolean
          label: string | null
          prefix: string
        }>
      }
      if (requestToken !== saveTokenRef.current) return
      const nextPrefixes = (payload.prefixes ?? []).map(toHsaIdPrefixAdminItem)
      setPrefixes(nextPrefixes)
      setPrefixesBaseline(hsaIdPrefixSnapshot(nextPrefixes))
      setSaveState('saved')
      setMessage(null)
    } catch {
      if (requestToken === saveTokenRef.current) {
        setSaveState('error')
        setMessage(ta('identity.saveError'))
      }
    }
  }

  return (
    <section
      aria-labelledby="identity-tab"
      className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
      {...devMarker({
        context: 'admin center',
        name: 'tab panel',
        priority: 340,
        value: 'identity',
      })}
      id="identity-panel"
      ref={panelRef}
      role="tabpanel"
    >
      <div className="flex flex-col gap-4 border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
            {ta('identity.title')}
          </h2>
          <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
            {ta('identity.description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {saveState === 'saved' ? (
            <span
              className="text-xs font-medium text-emerald-700 dark:text-emerald-300"
              role="status"
            >
              {ta('saved')}
            </span>
          ) : null}
          {saveState === 'error' && message ? (
            <span
              className="text-sm font-medium text-red-700 dark:text-red-400"
              role="alert"
            >
              {message}
            </span>
          ) : null}
          <button
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-secondary-200 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
            disabled={isSaving}
            onClick={addPrefix}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {ta('identity.addPrefix')}
          </button>
          <DirtyStateButton
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            dirty={prefixesDirty}
            disabled={isSaving}
            onClick={savePrefixes}
            type="button"
          >
            <Save aria-hidden="true" className="h-4 w-4" />
            {isSaving ? tc('loading') : tc('save')}
          </DirtyStateButton>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {!isInitialLoadPending && prefixes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-secondary-300 px-4 py-5 text-sm text-secondary-600 dark:border-secondary-700 dark:text-secondary-300">
            {ta('identity.emptyPrefixes')}
          </p>
        ) : (
          prefixes.map(item => {
            const prefixInputId = `hsa-id-prefix-${item.clientId}`
            const labelInputId = `hsa-id-prefix-label-${item.clientId}`
            const visibleInputId = `hsa-id-prefix-visible-${item.clientId}`
            const defaultInputId = `hsa-id-prefix-default-${item.clientId}`
            const prefixHelpKey = `${item.clientId}:prefix`
            const labelHelpKey = `${item.clientId}:label`
            const visibleHelpKey = `${item.clientId}:visible`
            const defaultHelpKey = `${item.clientId}:default`
            const prefixHelpId = `${prefixInputId}-help`
            const labelHelpId = `${labelInputId}-help`
            const visibleHelpId = `${visibleInputId}-help`
            const defaultHelpId = `${defaultInputId}-help`
            const isLastVisiblePrefix =
              item.isVisible && visiblePrefixCount === 1
            const prefixLabel = item.prefix || ta('identity.newPrefix')

            return (
              <article
                className="grid gap-3 rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40 lg:grid-cols-[minmax(10rem,0.8fr)_minmax(10rem,1fr)_auto_auto_auto]"
                data-testid={`hsa-id-prefix-row-${item.prefix || item.clientId}`}
                key={item.clientId}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                      htmlFor={prefixInputId}
                    >
                      {ta('identity.prefix')}
                    </label>
                    {inlineHelpButton(
                      prefixHelpKey,
                      ta('identity.prefix'),
                      prefixHelpId,
                    )}
                  </div>
                  {inlineHelpPanel(
                    prefixHelpKey,
                    prefixHelpId,
                    'identity.fieldHelp.prefix',
                  )}
                  <input
                    aria-describedby={
                      openIdentityHelp === prefixHelpKey
                        ? prefixHelpId
                        : undefined
                    }
                    className="min-h-11 w-full rounded-xl border bg-white px-3.5 py-2.5 font-mono text-sm uppercase dark:bg-secondary-900"
                    disabled={isSaving || item.isUsed}
                    id={prefixInputId}
                    maxLength={12}
                    onChange={event =>
                      setPrefix(item.clientId, current => ({
                        ...current,
                        prefix: event.target.value.toUpperCase(),
                      }))
                    }
                    value={item.prefix}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                      htmlFor={labelInputId}
                    >
                      {ta('identity.label')}
                    </label>
                    {inlineHelpButton(
                      labelHelpKey,
                      ta('identity.label'),
                      labelHelpId,
                    )}
                  </div>
                  {inlineHelpPanel(
                    labelHelpKey,
                    labelHelpId,
                    'identity.fieldHelp.label',
                  )}
                  <input
                    aria-describedby={
                      openIdentityHelp === labelHelpKey
                        ? labelHelpId
                        : undefined
                    }
                    className="min-h-11 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm dark:bg-secondary-900"
                    disabled={isSaving}
                    id={labelInputId}
                    onChange={event =>
                      setPrefix(item.clientId, current => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                    value={item.label}
                  />
                </div>
                <div className="space-y-1 self-end">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-secondary-700 dark:text-secondary-200">
                      {ta('identity.visible')}
                    </span>
                    {floatingHelpButton(
                      visibleHelpKey,
                      ta('identity.visible'),
                      visibleHelpId,
                      'identity.fieldHelp.visible',
                    )}
                  </div>
                  <button
                    aria-describedby={
                      openIdentityHelp === visibleHelpKey
                        ? visibleHelpId
                        : undefined
                    }
                    aria-label={
                      item.isVisible
                        ? `${ta('identity.hidePrefix')}: ${prefixLabel}`
                        : `${ta('identity.showPrefix')}: ${prefixLabel}`
                    }
                    aria-pressed={item.isVisible}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                      item.isVisible
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-secondary-200 bg-white text-secondary-500 hover:bg-secondary-100 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-300 dark:hover:bg-secondary-800'
                    }`}
                    disabled={isSaving || isLastVisiblePrefix}
                    onClick={() => toggleVisible(item.clientId)}
                    title={
                      isLastVisiblePrefix
                        ? ta('identity.visibleRequired')
                        : item.isVisible
                          ? ta('identity.hidePrefix')
                          : ta('identity.showPrefix')
                    }
                    type="button"
                  >
                    {item.isVisible ? (
                      <Eye aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <EyeOff aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="space-y-1 self-end">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-secondary-700 dark:text-secondary-200">
                      {ta('identity.defaultPrefix')}
                    </span>
                    {floatingHelpButton(
                      defaultHelpKey,
                      ta('identity.defaultPrefix'),
                      defaultHelpId,
                      'identity.fieldHelp.defaultPrefix',
                    )}
                  </div>
                  <label
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-500 ${
                      item.isDefault
                        ? 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 dark:border-primary-800/70 dark:bg-primary-950/40 dark:text-primary-300'
                        : 'border-secondary-200 bg-white text-secondary-500 hover:bg-secondary-100 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-300 dark:hover:bg-secondary-800'
                    } ${isSaving ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    htmlFor={defaultInputId}
                    title={
                      item.isDefault
                        ? ta('identity.defaultSelected')
                        : ta('identity.setDefaultPrefix')
                    }
                  >
                    <input
                      aria-describedby={
                        openIdentityHelp === defaultHelpKey
                          ? defaultHelpId
                          : undefined
                      }
                      aria-label={`${ta('identity.defaultPrefix')}: ${prefixLabel}`}
                      checked={item.isDefault}
                      className="sr-only"
                      disabled={isSaving}
                      id={defaultInputId}
                      name="hsa-id-prefix-default"
                      onChange={() => selectDefault(item.clientId)}
                      type="radio"
                    />
                    <Star
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill={item.isDefault ? 'currentColor' : 'none'}
                    />
                  </label>
                </div>
                <button
                  aria-label={ta('identity.removePrefix')}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center self-end rounded-xl border border-secondary-200 text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-secondary-700 dark:text-red-300 dark:hover:bg-red-950/30"
                  disabled={isSaving || item.isUsed}
                  onClick={() => removePrefix(item.clientId)}
                  title={
                    item.isUsed
                      ? ta('identity.usedPrefixDeleteBlocked')
                      : ta('identity.removePrefix')
                  }
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
                {item.isUsed ? (
                  <p className="text-xs text-secondary-500 dark:text-secondary-400 lg:col-span-5">
                    {ta('identity.usedPrefix')}
                  </p>
                ) : null}
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
