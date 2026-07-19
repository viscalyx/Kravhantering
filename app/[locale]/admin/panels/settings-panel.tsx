'use client'

import { Download, FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import FieldHelpButton from '@/components/FieldHelpButton'
import {
  type AdminApplicationSettings,
  APPLICATION_SETTING_CONSTRAINTS,
  type ApplicationSettingField,
  DEFAULT_APPLICATION_SETTINGS,
  MIB,
} from '@/lib/application-settings'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import AiSettingsPanel from './settings/ai-settings-panel'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'
type LoadState = 'error' | 'loading' | 'ready'

interface SettingDefinition {
  field: ApplicationSettingField
  unit?: 'mib'
}

const EXPORT_SETTINGS: readonly SettingDefinition[] = [
  { field: 'csvExportMaxRequirements' },
  { field: 'csvExportMaxFileBytes', unit: 'mib' },
  { field: 'csvExportConcurrencyPerNode' },
  { field: 'csvExportTimeoutSeconds' },
]

const REPORT_SETTINGS: readonly SettingDefinition[] = [
  { field: 'pdfReportMaxRequirements' },
  { field: 'pdfReportMaxFileBytes', unit: 'mib' },
  { field: 'pdfReportConcurrencyPerNode' },
  { field: 'pdfReportTimeoutSeconds' },
  { field: 'pdfWorkerMemoryMib' },
]

function initialSettings(): AdminApplicationSettings {
  return {
    ...DEFAULT_APPLICATION_SETTINGS,
    constraints: APPLICATION_SETTING_CONSTRAINTS,
    updatedAt: '',
  }
}

function displayValue(
  settings: AdminApplicationSettings,
  definition: SettingDefinition,
): number {
  const value = settings[definition.field]
  return definition.unit === 'mib' ? value / MIB : value
}

function apiValue(definition: SettingDefinition, value: number): number {
  return definition.unit === 'mib' ? value * MIB : value
}

function emptySaveStates(): Record<ApplicationSettingField, SaveState> {
  return Object.fromEntries(
    [...EXPORT_SETTINGS, ...REPORT_SETTINGS].map(({ field }) => [
      field,
      'idle',
    ]),
  ) as Record<ApplicationSettingField, SaveState>
}

export default function SettingsPanel() {
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const [settings, setSettings] =
    useState<AdminApplicationSettings>(initialSettings)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [aiSettled, setAiSettled] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saveStates, setSaveStates] = useState(emptySaveStates)
  const [drafts, setDrafts] = useState<
    Partial<Record<ApplicationSettingField, string>>
  >({})
  const [openHelp, setOpenHelp] = useState<ApplicationSettingField | null>(null)
  const saveTokens = useRef<Record<ApplicationSettingField, number>>(
    Object.fromEntries(
      [...EXPORT_SETTINGS, ...REPORT_SETTINGS].map(({ field }) => [field, 0]),
    ) as Record<ApplicationSettingField, number>,
  )
  const loadErrorMessage = ta('applicationSettings.loadError')

  const loadSettings = useCallback(async () => {
    setLoadState('loading')
    setMessage(null)
    try {
      const response = await apiFetch('/api/admin/application-settings')
      if (!response.ok) {
        setMessage((await readResponseMessage(response)) ?? loadErrorMessage)
        setLoadState('error')
        return
      }
      setSettings((await response.json()) as AdminApplicationSettings)
      setDrafts({})
      setSaveStates(emptySaveStates())
      setLoadState('ready')
    } catch {
      setMessage(loadErrorMessage)
      setLoadState('error')
    }
  }, [loadErrorMessage])
  const handleAiSettingsSettled = useCallback(() => setAiSettled(true), [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function commit(definition: SettingDefinition) {
    const field = definition.field
    const raw = drafts[field]
    if (raw === undefined) return
    const parsed = Number(raw.trim())
    const constraint = settings.constraints[field]
    const value = apiValue(definition, parsed)
    const step = 'step' in constraint ? constraint.step : 1
    if (
      raw.trim() === '' ||
      !Number.isSafeInteger(value) ||
      value < constraint.min ||
      value > constraint.max ||
      value % step !== 0
    ) {
      setDrafts(current => ({ ...current, [field]: undefined }))
      setSaveStates(current => ({ ...current, [field]: 'error' }))
      setMessage(ta('applicationSettings.invalidValue'))
      return
    }
    if (value === settings[field]) {
      setDrafts(current => ({ ...current, [field]: undefined }))
      return
    }

    const token = saveTokens.current[field] + 1
    saveTokens.current[field] = token
    const previousValue = settings[field]
    setSettings(current => ({ ...current, [field]: value }))
    setDrafts(current => ({ ...current, [field]: undefined }))
    setSaveStates(current => ({ ...current, [field]: 'saving' }))
    setMessage(null)

    try {
      const response = await apiFetch('/api/admin/application-settings', {
        body: JSON.stringify({ [field]: value }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      if (token !== saveTokens.current[field]) return
      if (!response.ok) {
        setSettings(current => ({ ...current, [field]: previousValue }))
        setSaveStates(current => ({ ...current, [field]: 'error' }))
        setMessage(
          (await readResponseMessage(response)) ??
            ta('applicationSettings.saveError'),
        )
        return
      }
      const payload = (await response.json()) as {
        field: ApplicationSettingField
        updatedAt: string
        value: number
      }
      if (token !== saveTokens.current[field]) return
      setSettings(current => ({
        ...current,
        [payload.field]: payload.value,
        updatedAt: payload.updatedAt,
      }))
      setSaveStates(current => ({ ...current, [field]: 'saved' }))
    } catch {
      if (token !== saveTokens.current[field]) return
      setSettings(current => ({ ...current, [field]: previousValue }))
      setSaveStates(current => ({ ...current, [field]: 'error' }))
      setMessage(ta('applicationSettings.saveError'))
    }
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    event.currentTarget.blur()
  }

  function renderSetting(definition: SettingDefinition) {
    const { field } = definition
    const constraint = settings.constraints[field]
    const inputConstraint =
      definition.unit === 'mib'
        ? {
            max: constraint.max / MIB,
            min: constraint.min / MIB,
            step: 'step' in constraint ? constraint.step / MIB : 1,
          }
        : {
            max: constraint.max,
            min: constraint.min,
            step: 'step' in constraint ? constraint.step : 1,
          }
    const inputId = `admin-application-setting-${field}`
    const helpId = `${inputId}-help`
    const state = saveStates[field]

    return (
      <div
        className="rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40"
        key={field}
        {...devMarker({
          context: 'admin settings',
          name: 'application setting',
          priority: 350,
          value: field,
        })}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <label
                className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
                htmlFor={inputId}
              >
                {ta(`applicationSettings.fields.${field}.label`)}
              </label>
              <FieldHelpButton
                controls={helpId}
                expanded={openHelp === field}
                label={`${tc('help')}: ${ta(
                  `applicationSettings.fields.${field}.label`,
                )}`}
                onClick={() =>
                  setOpenHelp(current => (current === field ? null : field))
                }
              />
            </div>
            <AnimatedHelpPanel id={helpId} isOpen={openHelp === field}>
              {ta(`applicationSettings.fields.${field}.help`)}
            </AnimatedHelpPanel>
          </div>
          <div className="flex min-w-40 flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <input
                aria-describedby={openHelp === field ? helpId : undefined}
                className="min-h-11 w-28 rounded-xl border border-secondary-300 bg-white px-3 py-2 text-right text-sm text-secondary-950 shadow-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-secondary-600 dark:bg-secondary-900 dark:text-secondary-50 dark:focus:ring-primary-900"
                disabled={loadState !== 'ready' || state === 'saving'}
                id={inputId}
                inputMode="numeric"
                max={inputConstraint.max}
                min={inputConstraint.min}
                onBlur={() => void commit(definition)}
                onChange={event =>
                  setDrafts(current => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                onKeyDown={onInputKeyDown}
                step={inputConstraint.step}
                type="number"
                value={
                  drafts[field] ?? String(displayValue(settings, definition))
                }
              />
              {definition.unit === 'mib' ? (
                <span className="text-sm text-secondary-600 dark:text-secondary-300">
                  MiB
                </span>
              ) : null}
            </div>
            <span
              aria-live="polite"
              className={`min-h-5 text-xs ${
                state === 'error'
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-secondary-500 dark:text-secondary-400'
              }`}
            >
              {state === 'saving'
                ? tc('saving')
                : state === 'saved'
                  ? ta('saved')
                  : state === 'error'
                    ? ta('applicationSettings.saveError')
                    : ''}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const allSettled = aiSettled && loadState !== 'loading'

  return (
    <section
      aria-labelledby="settings-tab"
      className="relative rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
      id="settings-panel"
      role="tabpanel"
      {...devMarker({
        context: 'admin center',
        name: 'tab panel',
        priority: 340,
        value: 'settings',
      })}
    >
      <div className="border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60">
        <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
          {ta('applicationSettings.title')}
        </h2>
        <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
          {ta('applicationSettings.description')}
        </p>
      </div>

      <div
        aria-live="polite"
        className={
          !allSettled || (message && loadState !== 'error') ? 'mt-4' : ''
        }
      >
        {!allSettled ? (
          <p className="text-sm text-secondary-600 dark:text-secondary-300">
            {ta('applicationSettings.loading')}
          </p>
        ) : message && loadState !== 'error' ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
            role="alert"
          >
            <span>{message}</span>
          </div>
        ) : null}
      </div>

      <div
        aria-busy={!allSettled}
        className={`mt-6 space-y-6 ${allSettled ? '' : 'invisible'}`}
      >
        <AiSettingsPanel embedded onSettingsSettled={handleAiSettingsSettled} />

        <section
          aria-labelledby="admin-settings-exports-title"
          className="min-h-124 rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80 lg:min-h-0"
        >
          <h3
            className="flex items-center gap-2 text-xl font-semibold text-secondary-950 dark:text-secondary-50"
            id="admin-settings-exports-title"
          >
            <Download
              aria-hidden="true"
              className="h-5 w-5 text-primary-700 dark:text-primary-300"
            />
            {ta('applicationSettings.exports.title')}
          </h3>
          <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
            {ta('applicationSettings.exports.description')}
          </p>
          {loadState === 'error' ? (
            <div
              className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
              role="alert"
            >
              <span>{ta('applicationSettings.loadError')}</span>
              <button
                className="min-h-11 rounded-full border border-red-300 px-4 py-2 font-medium hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900"
                onClick={() => void loadSettings()}
                type="button"
              >
                {tc('retry')}
              </button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {EXPORT_SETTINGS.map(renderSetting)}
            </div>
          )}
        </section>

        <section
          aria-labelledby="admin-settings-reports-title"
          className="min-h-152 rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80 lg:min-h-0"
        >
          <h3
            className="flex items-center gap-2 text-xl font-semibold text-secondary-950 dark:text-secondary-50"
            id="admin-settings-reports-title"
          >
            <FileText
              aria-hidden="true"
              className="h-5 w-5 text-primary-700 dark:text-primary-300"
            />
            {ta('applicationSettings.reports.title')}
          </h3>
          <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
            {ta('applicationSettings.reports.description')}
          </p>
          {loadState === 'error' ? (
            <div
              className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
              role="alert"
            >
              <span>{ta('applicationSettings.loadError')}</span>
              <button
                className="min-h-11 rounded-full border border-red-300 px-4 py-2 font-medium hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900"
                onClick={() => void loadSettings()}
                type="button"
              >
                {tc('retry')}
              </button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {REPORT_SETTINGS.map(renderSetting)}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
