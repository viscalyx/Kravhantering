'use client'

import { CheckCircle2, CircleHelp, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import FieldHelpButton from '@/components/FieldHelpButton'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import { devMarker } from '@/lib/developer-mode-markers'
import { getBrowserLinkUri } from '@/lib/norm-references/browser-link-uri'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import type { RfiAssessment, RfiListItemUpdate } from '@/lib/rfi/assessment'

export function RfiAssessmentDetails({
  assessment,
}: {
  assessment: RfiAssessment
}) {
  const t = useTranslations('specificationRfiList')
  const locale = useLocale()
  const documentHref = getBrowserLinkUri(assessment.documentUrl)
  return (
    <div className="space-y-1 whitespace-pre-wrap wrap-break-word text-sm text-secondary-700 dark:text-secondary-200">
      <p>
        {t('assessment.version', { number: assessment.versionNumber })} ·{' '}
        {assessment.relevance === 'relevant'
          ? t('relevant')
          : assessment.relevance === 'not_relevant'
            ? t('notRelevant')
            : t('assessment.unassessed')}
      </p>
      <p>
        {formatActorDisplayNameForLocale(
          assessment.createdByDisplayName,
          locale,
        )}{' '}
        ·{' '}
        <time dateTime={assessment.createdAt}>
          {new Date(assessment.createdAt).toLocaleString(locale)}
        </time>
      </p>
      {assessment.reason ? (
        <p>
          {t('assessment.reason')}: {assessment.reason}
        </p>
      ) : null}
      {assessment.documentReference ? (
        <p>
          {t('assessment.documentReference')}: {assessment.documentReference}
        </p>
      ) : null}
      {assessment.documentUrl ? (
        <p>
          {t('assessment.documentUrl')}:{' '}
          {documentHref ? (
            <a
              className="underline hover:text-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:hover:text-primary-400"
              href={documentHref}
              rel="noopener noreferrer"
              target="_blank"
              {...devMarker({ name: 'rfi assessment document link' })}
            >
              {assessment.documentUrl}
            </a>
          ) : (
            assessment.documentUrl
          )}
        </p>
      ) : null}
    </div>
  )
}

interface Props {
  assessment: RfiAssessment | null
  canEdit: boolean
  onSave: (data: RfiListItemUpdate) => Promise<boolean>
  previousAssessment: RfiAssessment | null
  saving: boolean
}

export default function RfiAssessmentEditor({
  assessment,
  previousAssessment,
  canEdit,
  saving,
  onSave,
}: Props) {
  const t = useTranslations('specificationRfiList')
  const id = useId()
  const [showOutcomeHelp, setShowOutcomeHelp] = useState(false)
  const source = assessment ?? previousAssessment
  const [relevance, setRelevance] = useState(source?.relevance ?? null)
  const [reason, setReason] = useState(source?.reason ?? '')
  const [documentReference, setDocumentReference] = useState(
    source?.documentReference ?? '',
  )
  const [documentUrl, setDocumentUrl] = useState(source?.documentUrl ?? '')
  const pending = !assessment && !!previousAssessment
  const StatusIcon = pending
    ? RefreshCw
    : assessment
      ? CheckCircle2
      : CircleHelp
  const inputClass =
    'w-full rounded-md border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 focus-visible:outline-2 focus-visible:outline-primary-500 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-900 dark:text-secondary-100'

  return (
    <div
      className="space-y-3 rounded-md border border-secondary-200 p-3 dark:border-secondary-700"
      {...devMarker({ name: 'rfi assessment editor' })}
    >
      <p
        className="flex items-center gap-2 text-sm text-secondary-700 dark:text-secondary-200"
        role="status"
      >
        <StatusIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
        {t(
          pending
            ? 'assessment.pending'
            : assessment
              ? 'assessment.confirmed'
              : 'assessment.unassessed',
        )}
      </p>
      {source ? <RfiAssessmentDetails assessment={source} /> : null}
      {canEdit ? (
        <form
          className="space-y-3"
          onSubmit={event => {
            event.preventDefault()
            if (relevance)
              void onSave({
                relevance,
                reason: reason.trim() || null,
                documentReference: documentReference.trim() || null,
                documentUrl: documentUrl.trim() || null,
              })
          }}
        >
          <fieldset
            className="space-y-2 text-sm text-secondary-700 dark:text-secondary-200"
            disabled={saving}
          >
            <legend className="mb-1 flex items-center gap-2">
              {t('relevance')}
              <FieldHelpButton
                controls={`${id}-outcome-help`}
                expanded={showOutcomeHelp}
                label={t('assessment.relevanceHelpLabel')}
                onClick={() => setShowOutcomeHelp(value => !value)}
              />
            </legend>
            <AnimatedHelpPanel
              id={`${id}-outcome-help`}
              isOpen={showOutcomeHelp}
            >
              {t('assessment.relevanceHelp')}
            </AnimatedHelpPanel>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex min-h-6 items-center gap-2">
                <input
                  checked={relevance === 'relevant'}
                  id={`${id}-relevant`}
                  name={`${id}-relevance`}
                  onChange={() => setRelevance('relevant')}
                  type="radio"
                />
                {t('relevant')}
              </label>
              <label className="inline-flex min-h-6 items-center gap-2">
                <input
                  checked={relevance === 'not_relevant'}
                  name={`${id}-relevance`}
                  onChange={() => setRelevance('not_relevant')}
                  type="radio"
                />
                {t('notRelevant')}
              </label>
            </div>
          </fieldset>
          <div>
            <FieldLabelWithHelp
              help={t('assessment.reasonHelp')}
              htmlFor={`${id}-reason`}
              label={t('assessment.reason')}
            />
            <textarea
              className={inputClass}
              disabled={saving}
              id={`${id}-reason`}
              maxLength={10000}
              onChange={event => setReason(event.target.value)}
              rows={3}
              value={reason}
            />
          </div>
          <div>
            <FieldLabelWithHelp
              help={t('assessment.documentReferenceHelp')}
              htmlFor={`${id}-reference`}
              label={t('assessment.documentReference')}
            />
            <input
              className={inputClass}
              disabled={saving}
              id={`${id}-reference`}
              maxLength={2000}
              onChange={event => setDocumentReference(event.target.value)}
              value={documentReference}
            />
          </div>
          <div>
            <FieldLabelWithHelp
              help={t('assessment.documentUrlHelp')}
              htmlFor={`${id}-url`}
              label={t('assessment.documentUrl')}
            />
            <input
              className={inputClass}
              disabled={saving}
              id={`${id}-url`}
              maxLength={2000}
              onChange={event => setDocumentUrl(event.target.value)}
              type="url"
              value={documentUrl}
            />
          </div>
          <button
            className="min-h-8 rounded-md bg-primary-700 px-3 py-1 text-sm font-medium text-white hover:bg-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 dark:bg-primary-600 dark:hover:bg-primary-700"
            disabled={saving || !relevance}
            title={!relevance ? t('assessment.chooseOutcome') : undefined}
            type="submit"
            {...devMarker({ name: 'rfi assessment save' })}
          >
            {t(
              saving
                ? 'assessment.saving'
                : pending
                  ? 'assessment.confirm'
                  : 'assessment.save',
            )}
          </button>
        </form>
      ) : null}
    </div>
  )
}
