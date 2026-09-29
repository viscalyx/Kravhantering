'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Download, FileJson } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import AiRequestFileDownloads from '@/components/AiRequestFileDownloads'
import { devMarker } from '@/lib/developer-mode-markers'
import type { AppLocale } from '@/lib/locale-preference'
import {
  COLLAPSIBLE_REGION_CLIP_CLASS,
  collapsiblePanelMotion,
} from '@/lib/reduced-motion'
import {
  type AiRequestFileDestination,
  importDestinationKindForMode,
} from '@/lib/requirements/ai-request-files'
import type { RequirementsImportMode } from '@/lib/requirements/import-service'

interface RequirementsImportSupportPanelProps {
  /**
   * The destination of the AI request files and the import instruction;
   * `null` disables their buttons.
   */
  destination: AiRequestFileDestination | null
  headingId: string
  locale: AppLocale
  mode: RequirementsImportMode
  onDownloadError: (message: string) => void
  onDownloadImportInstruction: () => void
  onDownloadSchema: () => void
  /** Called when an AI request file download starts, before its request. */
  onDownloadStart?: () => void
}

const MARKER_CONTEXT = 'requirements import'

const LINK_BUTTON =
  'inline-flex min-h-8 items-center gap-2 rounded text-left text-sm underline underline-offset-4 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-primary-300'

const STEP_BADGE =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white dark:bg-primary-600'

const STEP_TITLE =
  'text-sm font-medium text-secondary-900 dark:text-secondary-100'

const HELP_TEXT = 'text-xs leading-relaxed'

/**
 * The import dialog's support panel: a three-step guide for letting an
 * external AI assistant draft requirements, and a collapsed section with the
 * schema and import instruction for writing the whole prompt yourself.
 */
export default function RequirementsImportSupportPanel({
  destination,
  headingId,
  locale,
  mode,
  onDownloadError,
  onDownloadImportInstruction,
  onDownloadSchema,
  onDownloadStart,
}: RequirementsImportSupportPanelProps) {
  const t = useTranslations('requirementsImportAiRequest')
  const idPrefix = useId()
  const ownPromptId = `${idPrefix}-own-prompt`
  const ownPromptHelpId = `${idPrefix}-own-prompt-help`
  const [ownPromptOpen, setOwnPromptOpen] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  const steps = [
    {
      body: (
        <AiRequestFileDownloads
          destination={destination}
          locale={locale}
          markerContext={MARKER_CONTEXT}
          onDownloadStart={onDownloadStart}
          onError={onDownloadError}
        />
      ),
      markerValue: 'get files',
      title: t('step1Title'),
    },
    {
      body: <p className={HELP_TEXT}>{t('step2Body')}</p>,
      markerValue: 'ask ai assistant',
      title: t('step2Title'),
    },
    {
      body: <p className={HELP_TEXT}>{t('step3Body')}</p>,
      markerValue: 'add response',
      title: t('step3Title'),
    },
  ]

  return (
    <>
      <h3
        className="text-sm font-semibold text-secondary-800 dark:text-secondary-200"
        id={headingId}
      >
        {t('guideTitle')}
      </h3>
      <ol
        className="space-y-4"
        {...devMarker({
          context: MARKER_CONTEXT,
          name: 'step guide',
          value: 'external ai',
        })}
      >
        {steps.map((step, index) => (
          <li
            className="flex gap-3"
            key={step.markerValue}
            {...devMarker({
              context: MARKER_CONTEXT,
              name: 'guide step',
              value: step.markerValue,
            })}
          >
            <span aria-hidden="true" className={STEP_BADGE}>
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className={STEP_TITLE}>{step.title}</p>
              {step.body}
            </div>
          </li>
        ))}
      </ol>
      <p className={HELP_TEXT}>
        {importDestinationKindForMode(mode) === 'requirements_specification'
          ? t('referenceDataFreshnessSpecification')
          : t('referenceDataFreshnessLibrary')}
      </p>
      <div
        className="border-t border-secondary-200 pt-2 dark:border-secondary-800"
        {...devMarker({
          context: MARKER_CONTEXT,
          name: 'disclosure',
          value: 'own prompt or validation',
        })}
      >
        <button
          aria-controls={ownPromptId}
          aria-expanded={ownPromptOpen}
          className="inline-flex min-h-8 items-center gap-1 rounded text-sm font-medium text-secondary-700 hover:text-secondary-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-secondary-300 dark:hover:text-secondary-50"
          onClick={() => setOwnPromptOpen(open => !open)}
          type="button"
        >
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${ownPromptOpen ? '' : '-rotate-90'}`}
          />
          {t('ownPromptToggle')}
        </button>
        {/* The region stays mounted so aria-controls always resolves. The
            collapsed section is unmounted and out of the accessibility tree. */}
        <div id={ownPromptId}>
          <AnimatePresence initial={false}>
            {ownPromptOpen ? (
              <motion.div
                className={COLLAPSIBLE_REGION_CLIP_CLASS}
                key="own-prompt"
                {...collapsiblePanelMotion(shouldReduceMotion)}
              >
                <div className="flex flex-col items-start gap-2 pt-2 pb-1">
                  <button
                    aria-describedby={ownPromptHelpId}
                    className={LINK_BUTTON}
                    onClick={onDownloadSchema}
                    type="button"
                    {...devMarker({
                      context: MARKER_CONTEXT,
                      name: 'download button',
                      value: 'schema',
                    })}
                  >
                    <Download aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {t('downloadSchema')}
                  </button>
                  <button
                    aria-describedby={ownPromptHelpId}
                    className={LINK_BUTTON}
                    disabled={destination === null}
                    onClick={onDownloadImportInstruction}
                    title={destination ? undefined : t('filesUnavailable')}
                    type="button"
                    {...devMarker({
                      context: MARKER_CONTEXT,
                      name: 'download button',
                      value: 'import instruction',
                    })}
                  >
                    <FileJson aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {t('downloadImportInstruction')}
                  </button>
                  <p className={HELP_TEXT} id={ownPromptHelpId}>
                    {t('ownPromptHelp')}
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}
