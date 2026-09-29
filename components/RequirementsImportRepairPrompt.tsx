'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, ClipboardCopy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useMemo, useState } from 'react'
import type { buildRequirementImportRepairPrompt } from '@/lib/ai/requirement-prompt'
import { devMarker } from '@/lib/developer-mode-markers'
import type { AppLocale } from '@/lib/locale-preference'
import {
  COLLAPSIBLE_REGION_CLIP_CLASS,
  collapsiblePanelMotion,
} from '@/lib/reduced-motion'
import {
  formatRequirementImportJsonErrors,
  REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT,
} from '@/lib/requirements/import-json-errors'
import type { ImportJsonProblem } from '@/lib/requirements/import-json-input'

interface RequirementsImportRepairPromptProps {
  locale: AppLocale
  /** A problem that `isRequirementImportJsonProblemRepairable` accepts. */
  problem: ImportJsonProblem
}

type RepairPromptBuilder = typeof buildRequirementImportRepairPrompt

type BuilderState =
  | { build: RepairPromptBuilder; status: 'ready' }
  | { status: 'failed' | 'loading' }

interface CopyResult {
  prompt: string
  status: 'copied' | 'copyFailed'
}

const MARKER_CONTEXT = 'requirements import'

const STATUS_TEXT = 'text-secondary-800 dark:text-secondary-200'

/**
 * Loads the prompt module on demand. It bundles the prompt texts for both
 * locales, so the import dialog only loads it when a repair prompt is needed.
 */
function loadRepairPromptBuilder(): Promise<RepairPromptBuilder> {
  return import('@/lib/ai/requirement-prompt').then(
    module => module.buildRequirementImportRepairPrompt,
  )
}

/**
 * Step 3 of the import dialog's external AI guide, below the error list: copy
 * a repair prompt for pasted JSON that does not validate, and preview it.
 */
export default function RequirementsImportRepairPrompt({
  locale,
  problem,
}: RequirementsImportRepairPromptProps) {
  const t = useTranslations('requirementsImportJson')
  const idPrefix = useId()
  const leadId = `${idPrefix}-lead`
  const previewId = `${idPrefix}-preview`
  const [builder, setBuilder] = useState<BuilderState>({ status: 'loading' })
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    let active = true
    loadRepairPromptBuilder().then(
      build => {
        if (active) setBuilder({ build, status: 'ready' })
      },
      () => {
        if (active) setBuilder({ status: 'failed' })
      },
    )
    return () => {
      active = false
    }
  }, [])

  const prompt = useMemo(() => {
    if (builder.status !== 'ready') return null
    return builder.build({
      errors: formatRequirementImportJsonErrors(problem, {
        limit: REQUIREMENT_IMPORT_REPAIR_PROMPT_ERROR_LIMIT,
        t,
      }),
      locale,
    })
  }, [builder, locale, problem, t])

  // The acknowledgement belongs to the copied text and disappears when the
  // errors change.
  const copyStatus =
    copyResult && copyResult.prompt === prompt ? copyResult.status : null

  const copy = async () => {
    if (prompt === null) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopyResult({ prompt, status: 'copied' })
    } catch {
      setCopyResult({ prompt, status: 'copyFailed' })
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-secondary-700 dark:text-secondary-300" id={leadId}>
        {t('repairPrompt.lead')}
      </p>
      <button
        aria-describedby={leadId}
        className="btn-secondary inline-flex items-center gap-2"
        disabled={prompt === null}
        onClick={() => void copy()}
        title={
          builder.status === 'failed'
            ? t('repairPrompt.unavailable')
            : undefined
        }
        type="button"
        {...devMarker({
          context: MARKER_CONTEXT,
          name: 'copy action',
          value: 'repair prompt',
        })}
      >
        <ClipboardCopy aria-hidden="true" className="h-4 w-4 shrink-0" />
        {builder.status === 'loading'
          ? t('repairPrompt.loading')
          : t('repairPrompt.copy')}
      </button>
      {builder.status === 'failed' ? (
        <p className={STATUS_TEXT} role="status">
          {t('repairPrompt.unavailable')}
        </p>
      ) : null}
      {copyStatus ? (
        <p className={STATUS_TEXT} role="status">
          {t(`repairPrompt.${copyStatus}`)}
        </p>
      ) : null}
      {prompt === null ? null : (
        <div
          {...devMarker({
            context: MARKER_CONTEXT,
            name: 'disclosure',
            value: 'repair prompt preview',
          })}
        >
          <button
            aria-controls={previewId}
            aria-expanded={previewOpen}
            className="inline-flex min-h-8 items-center gap-1 rounded font-medium text-secondary-700 hover:text-secondary-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-secondary-300 dark:hover:text-secondary-50"
            onClick={() => setPreviewOpen(open => !open)}
            type="button"
          >
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 transition-transform motion-reduce:transition-none ${previewOpen ? '' : '-rotate-90'}`}
            />
            {t('repairPrompt.previewToggle')}
          </button>
          {/* The region stays mounted so aria-controls always resolves. The
              collapsed preview is unmounted and out of the accessibility
              tree. */}
          <div id={previewId}>
            <AnimatePresence initial={false}>
              {previewOpen ? (
                <motion.div
                  className={COLLAPSIBLE_REGION_CLIP_CLASS}
                  key="preview"
                  {...collapsiblePanelMotion(shouldReduceMotion)}
                >
                  <div className="pt-2 pb-1">
                    <textarea
                      aria-label={t('repairPrompt.previewLabel')}
                      className="block min-h-40 w-full resize-y rounded-lg border border-secondary-300 bg-white px-3 py-2 font-mono text-xs text-secondary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
                      readOnly
                      value={prompt}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}
