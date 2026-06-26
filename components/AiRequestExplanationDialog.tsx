'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Braces,
  FileText,
  Info,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  buildRequirementImportSystemPrompt,
  buildRequirementImportUserPrompt,
} from '@/lib/ai/requirement-prompt'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

interface AiRequestExplanationDialogProps {
  candidateCount: number
  dataPolicyLabels: string[]
  imageCount: number
  importInstruction: string
  importInstructionLoading: boolean
  locale: 'en' | 'sv'
  modelName?: string
  need: string
  needPlaceholder: string
  onClose: () => void
  onLoadImportInstruction: () => void
  open: boolean
  reasoningEffortLabel: string
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-secondary-200 py-3 last:border-b-0 dark:border-secondary-800">
      <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
        {label}
      </dt>
      <dd className="mt-1 min-w-0 text-sm text-secondary-800 dark:text-secondary-100">
        {value}
      </dd>
    </div>
  )
}

function HorizontalDetailItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 border-b border-secondary-200 py-3 last:border-b-0 md:border-r md:border-b-0 md:px-4 md:first:pl-0 md:last:border-r-0 md:last:pr-0 dark:border-secondary-800">
      <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
        {label}
      </dt>
      <dd className="mt-1 min-w-0 text-sm text-secondary-800 dark:text-secondary-100">
        {value}
      </dd>
    </div>
  )
}

function Badge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-200">
      {children}
    </span>
  )
}

function RequestPart({
  badge,
  children,
  icon,
  title,
}: {
  badge: string
  children: ReactNode
  icon: ReactNode
  title: string
}) {
  return (
    <section className="rounded-lg border border-secondary-200 p-4 dark:border-secondary-800">
      <div className="space-y-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-secondary-900 dark:text-secondary-50">
          {icon}
          <span>{title}</span>
        </h3>
        <Badge>{badge}</Badge>
      </div>
      <div className="mt-3 text-sm leading-6 text-secondary-700 dark:text-secondary-200">
        {children}
      </div>
    </section>
  )
}

function ExactTextBlock({
  loading,
  number,
  title,
  value,
}: {
  loading?: boolean
  number: number
  title: string
  value: string
}) {
  const tc = useTranslations('common')

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-secondary-900 dark:text-secondary-50">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700 dark:bg-primary-950 dark:text-primary-200">
          {number}
        </span>
        <span>{title}</span>
      </h4>
      <pre className="max-h-80 overflow-auto rounded-lg bg-secondary-950 p-3 font-mono text-xs leading-5 text-secondary-50 whitespace-pre-wrap">
        {loading ? tc('loading') : value}
      </pre>
    </div>
  )
}

function ExactFormatStep() {
  const t = useTranslations('ai')

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-secondary-900 dark:text-secondary-50">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700 dark:bg-primary-950 dark:text-primary-200">
          3
        </span>
        <span>{t('requestExplanation.responseFormatTitle')}</span>
      </h4>
      <div className="rounded-lg bg-secondary-50 p-3 text-sm leading-6 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
        {t('requestExplanation.schemaNote')}
      </div>
    </div>
  )
}

export default function AiRequestExplanationDialog({
  candidateCount,
  dataPolicyLabels,
  imageCount,
  importInstruction,
  importInstructionLoading,
  locale,
  modelName,
  need,
  needPlaceholder,
  onClose,
  onLoadImportInstruction,
  open,
  reasoningEffortLabel,
}: AiRequestExplanationDialogProps) {
  const t = useTranslations('ai')
  const tc = useTranslations('common')
  const shouldReduceMotion = useReducedMotion()
  const trimmedNeed = need.trim()
  const displayNeed = trimmedNeed || needPlaceholder
  const exactNeed = trimmedNeed || t('requestExplanation.emptyNeed')

  useEffect(() => {
    if (open) onLoadImportInstruction()
  }, [onLoadImportInstruction, open])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  const systemMessage = useMemo(
    () =>
      importInstruction
        ? buildRequirementImportSystemPrompt(importInstruction, locale)
        : '',
    [importInstruction, locale],
  )
  const userOrderText = useMemo(
    () =>
      buildRequirementImportUserPrompt({
        count: candidateCount,
        locale,
        need: exactNeed,
      }),
    [candidateCount, exactNeed, locale],
  )

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        {...fadeMotion(shouldReduceMotion)}
        className="fixed inset-0 z-80 flex items-center justify-center bg-secondary-950/60 p-4"
      >
        <motion.div
          {...dialogPanelMotion(shouldReduceMotion)}
          aria-labelledby="ai-request-explanation-title"
          aria-modal="true"
          className="flex max-h-[min(92vh,58rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-secondary-900"
          role="dialog"
        >
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-secondary-200 px-5 py-4 dark:border-secondary-800">
            <div>
              <h2
                className="text-lg font-semibold text-secondary-900 dark:text-secondary-50"
                id="ai-request-explanation-title"
              >
                {t('requestExplanation.title')}
              </h2>
              <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                {t('requestExplanation.intro')}
              </p>
            </div>
            <button
              aria-label={tc('close')}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-100"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="grid gap-4 xl:grid-cols-3">
              <RequestPart
                badge={t('requestExplanation.badgeFixed')}
                icon={
                  <ShieldCheck
                    aria-hidden
                    className="h-4 w-4 text-primary-600"
                  />
                }
                title={t('requestExplanation.applicationRulesTitle')}
              >
                <p>{t('requestExplanation.applicationRulesSummary')}</p>
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  <li>{t('requestExplanation.systemInstructionSummary')}</li>
                  <li>{t('requestExplanation.importRulesSummary')}</li>
                  <li>{t('requestExplanation.nonOverrideSummary')}</li>
                </ul>
              </RequestPart>

              <RequestPart
                badge={t('requestExplanation.badgeForm')}
                icon={
                  <UserRound aria-hidden className="h-4 w-4 text-primary-600" />
                }
                title={t('requestExplanation.userOrderTitle')}
              >
                <dl className="space-y-2">
                  <DetailRow
                    label={t('requestExplanation.aiInstructionLabel')}
                    value={t('requestExplanation.aiInstructionValue')}
                  />
                  <DetailRow label={t('topicLabel')} value={displayNeed} />
                  <DetailRow
                    label={t('candidateCount')}
                    value={String(candidateCount)}
                  />
                  <DetailRow
                    label={t('requestExplanation.imagesLabel')}
                    value={t('requestExplanation.imageCount', {
                      count: imageCount,
                    })}
                  />
                </dl>
              </RequestPart>

              <RequestPart
                badge={t('requestExplanation.badgeFormat')}
                icon={
                  <Braces aria-hidden className="h-4 w-4 text-primary-600" />
                }
                title={t('requestExplanation.responseFormatTitle')}
              >
                <dl className="space-y-2">
                  <DetailRow
                    label={t('requestExplanation.formatLabel')}
                    value={t('requestExplanation.jsonSchemaValue')}
                  />
                  <DetailRow
                    label={t('requestExplanation.sentAsLabel')}
                    value={t('requestExplanation.mandatoryFormatValue')}
                  />
                  <DetailRow
                    label={t('requestExplanation.fullSchemaLabel')}
                    value={t('requestExplanation.importViewsValue')}
                  />
                </dl>
              </RequestPart>
            </div>

            <section className="mt-5 rounded-lg border border-secondary-200 p-4 dark:border-secondary-800">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-secondary-900 dark:text-secondary-50">
                <Settings aria-hidden className="h-4 w-4 text-primary-600" />
                {t('requestExplanation.otherChoicesTitle')}
              </h3>
              <dl className="mt-3 grid md:grid-cols-2 xl:grid-cols-4">
                <HorizontalDetailItem
                  label={t('modelLabel')}
                  value={modelName || t('noModels')}
                />
                <HorizontalDetailItem
                  label={t('reasoningEffortLabel')}
                  value={reasoningEffortLabel}
                />
                <HorizontalDetailItem
                  label={t('dataPolicySettings')}
                  value={
                    dataPolicyLabels.length > 0
                      ? dataPolicyLabels.join(', ')
                      : t('requestExplanation.noDataPolicies')
                  }
                />
                <HorizontalDetailItem
                  label={t('requestExplanation.imagesLabel')}
                  value={t('requestExplanation.imageCount', {
                    count: imageCount,
                  })}
                />
              </dl>
            </section>

            <details className="mt-5 rounded-lg border border-secondary-200 p-4 dark:border-secondary-800">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-secondary-900 dark:text-secondary-50">
                <FileText aria-hidden className="h-4 w-4 text-primary-600" />
                {t('requestExplanation.exactMessagesTitle')}
              </summary>
              <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-secondary-600 dark:text-secondary-300">
                <Info aria-hidden className="mt-1 h-4 w-4 shrink-0" />
                {t('requestExplanation.exactMessagesHelp')}
              </p>
              <div className="mt-4 space-y-4">
                <ExactTextBlock
                  loading={importInstructionLoading}
                  number={1}
                  title={t('requestExplanation.systemInstructionTitle')}
                  value={systemMessage}
                />
                <ExactTextBlock
                  number={2}
                  title={t('requestExplanation.userOrderExactTitle')}
                  value={userOrderText}
                />
                <ExactFormatStep />
              </div>
            </details>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
