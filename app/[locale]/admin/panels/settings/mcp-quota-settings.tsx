'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import FieldHelpButton from '@/components/FieldHelpButton'
import type { AdminAiSettings } from '@/lib/ai/generation-availability'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'

export type McpQuotaSettingKey =
  | 'mcpImportMaxActiveSessionsPerDestination'
  | 'mcpImportMaxActiveSessionsPerPrincipal'
  | 'mcpImportMaxCreationsPerWindow'
  | 'mcpImportMaxReservedBytes'

function settingInputs(settings: AdminAiSettings) {
  return {
    mcpImportMaxActiveSessionsPerDestination: String(
      settings.mcpImportMaxActiveSessionsPerDestination,
    ),
    mcpImportMaxActiveSessionsPerPrincipal: String(
      settings.mcpImportMaxActiveSessionsPerPrincipal,
    ),
    mcpImportMaxCreationsPerWindow: String(
      settings.mcpImportMaxCreationsPerWindow,
    ),
    mcpImportMaxReservedBytes: String(
      settings.mcpImportMaxReservedBytes / 1024 / 1024,
    ),
  }
}

export default function McpQuotaSettings({
  constraints,
  isLoading,
  onCommit,
  saveStates,
  settings,
}: {
  constraints: AdminAiSettings['constraints']
  isLoading: boolean
  onCommit: (
    key: McpQuotaSettingKey,
    value: number,
    displayDivisor: number,
  ) => number
  saveStates: Record<McpQuotaSettingKey, SaveState>
  settings: AdminAiSettings
}) {
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const [helpOpen, setHelpOpen] = useState<McpQuotaSettingKey | null>(null)
  const [inputs, setInputs] = useState(() => settingInputs(settings))
  const cards: Array<{
    displayDivisor: number
    help: string
    id: string
    key: McpQuotaSettingKey
    label: string
    unit: string
  }> = [
    {
      displayDivisor: 1,
      help: ta('ai.fieldHelp.mcpImportMaxActiveSessionsPerPrincipal'),
      id: 'admin-ai-mcp-import-principal-session-quota',
      key: 'mcpImportMaxActiveSessionsPerPrincipal',
      label: ta('ai.mcpImportMaxActiveSessionsPerPrincipal'),
      unit: ta('ai.sessions'),
    },
    {
      displayDivisor: 1,
      help: ta('ai.fieldHelp.mcpImportMaxActiveSessionsPerDestination'),
      id: 'admin-ai-mcp-import-destination-session-quota',
      key: 'mcpImportMaxActiveSessionsPerDestination',
      label: ta('ai.mcpImportMaxActiveSessionsPerDestination'),
      unit: ta('ai.sessions'),
    },
    {
      displayDivisor: 1,
      help: ta('ai.fieldHelp.mcpImportMaxCreationsPerWindow'),
      id: 'admin-ai-mcp-import-creation-rate-quota',
      key: 'mcpImportMaxCreationsPerWindow',
      label: ta('ai.mcpImportMaxCreationsPerWindow'),
      unit: ta('ai.creations'),
    },
    {
      displayDivisor: 1024 * 1024,
      help: ta('ai.fieldHelp.mcpImportMaxReservedBytes'),
      id: 'admin-ai-mcp-import-reserved-storage-quota',
      key: 'mcpImportMaxReservedBytes',
      label: ta('ai.mcpImportMaxReservedBytes'),
      unit: 'MiB',
    },
  ]

  useEffect(() => setInputs(settingInputs(settings)), [settings])

  return cards.map(card => {
    const constraint = constraints[card.key]
    const saveState = saveStates[card.key]
    const helpId = `${card.id}-help`
    const constraintId = `${card.id}-constraint`
    const commit = () => {
      const rawValue = inputs[card.key].trim()
      const parsed = Number(rawValue)
      if (rawValue !== '' && Number.isFinite(parsed)) {
        const committedValue = onCommit(card.key, parsed, card.displayDivisor)
        setInputs(current => ({
          ...current,
          [card.key]: String(committedValue / card.displayDivisor),
        }))
      } else {
        setInputs(current => ({
          ...current,
          [card.key]: String(settings[card.key] / card.displayDivisor),
        }))
      }
    }

    return (
      <div
        className="rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40"
        key={card.key}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <label
                className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
                htmlFor={card.id}
              >
                {card.label}
              </label>
              <FieldHelpButton
                controls={helpId}
                expanded={helpOpen === card.key}
                label={`${tc('help')}: ${card.label}`}
                onClick={() =>
                  setHelpOpen(current =>
                    current === card.key ? null : card.key,
                  )
                }
              />
            </div>
            <AnimatedHelpPanel id={helpId} isOpen={helpOpen === card.key}>
              {card.help}
            </AnimatedHelpPanel>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex min-h-11 items-center overflow-hidden rounded-full border border-secondary-200 bg-white text-sm font-medium text-secondary-800 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100">
              <input
                aria-describedby={`${helpId} ${constraintId}`}
                className="h-11 w-28 border-0 bg-transparent px-3 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isLoading || saveState === 'saving'}
                id={card.id}
                inputMode="numeric"
                max={constraint.max / card.displayDivisor}
                min={constraint.min / card.displayDivisor}
                onBlur={commit}
                onChange={event =>
                  setInputs(current => ({
                    ...current,
                    [card.key]: event.target.value,
                  }))
                }
                onKeyDown={event => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  commit()
                }}
                step={constraint.step / card.displayDivisor}
                type="number"
                value={inputs[card.key]}
              />
              <span className="px-3 text-xs text-secondary-500 dark:text-secondary-400">
                {card.unit}
              </span>
            </div>
            <p
              className="max-w-xs text-xs text-secondary-500 dark:text-secondary-400 sm:text-right"
              id={constraintId}
            >
              {ta('ai.mcpQuotaConstraint', {
                max: constraint.max / card.displayDivisor,
                min: constraint.min / card.displayDivisor,
                step: constraint.step / card.displayDivisor,
                unit: card.unit,
              })}
            </p>
          </div>
        </div>
        {saveState !== 'idle' ? (
          <p
            className="mt-2 text-xs font-medium text-secondary-500 dark:text-secondary-400"
            role="status"
          >
            {saveState === 'saving'
              ? tc('saving')
              : saveState === 'saved'
                ? ta('saved')
                : ta('ai.rowSaveError')}
          </p>
        ) : null}
      </div>
    )
  })
}
