'use client'

import { ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import FieldHelpButton from '@/components/FieldHelpButton'
import RequiredFieldMarker from '@/components/RequiredFieldMarker'
import { devMarker } from '@/lib/developer-mode-markers'
import { getBrowserLinkUri } from '@/lib/norm-references/browser-link-uri'

interface NormReferenceFormData {
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
  uri: string
  version: string
}

interface NormReferenceFormFieldsProps {
  form: NormReferenceFormData
  idPrefix: string
  layout?: 'create' | 'stacked'
  normReferenceIdHelperText?: ReactNode
  onSetField: (field: string, value: string) => void
}

const TYPE_SUGGESTION_KEYS = [
  'typeSuggestionLaw',
  'typeSuggestionRegulation',
  'typeSuggestionDirective',
  'typeSuggestionStandard',
  'typeSuggestionGuideline',
  'typeSuggestionStrategicGuideline',
] as const

const richTags = { strong: (chunks: ReactNode) => <strong>{chunks}</strong> }

const fieldClass =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

const uriLinkClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-primary-700 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-primary-300 dark:hover:bg-primary-950/30 dark:hover:text-primary-200'

export default function NormReferenceFormFields({
  form,
  idPrefix,
  layout = 'stacked',
  normReferenceIdHelperText,
  onSetField,
}: NormReferenceFormFieldsProps) {
  const t = useTranslations('normReference')
  const tc = useTranslations('common')
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const browserLinkUri = getBrowserLinkUri(form.uri)

  const toggleHelp = (field: string) => {
    setOpenHelp(prev => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  const helpButton = (field: string, label: string) => (
    <FieldHelpButton
      controls={`help-${idPrefix}-${field}`}
      expanded={openHelp.has(field)}
      label={`${tc('help')}: ${label}`}
      onClick={() => toggleHelp(field)}
    />
  )

  const helpPanel = (helpKey: string, field: string) => (
    <AnimatedHelpPanel
      id={`help-${idPrefix}-${field}`}
      isOpen={openHelp.has(field)}
    >
      {t.rich(helpKey, richTags)}
    </AnimatedHelpPanel>
  )

  const normReferenceIdField = (className?: string) => (
    <div className={className}>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-id`}>
          {t('normReferenceId')}
        </label>
        {helpButton('normReferenceId', t('normReferenceId'))}
      </div>
      {helpPanel('normReferenceIdHelp', 'normReferenceId')}
      <input
        aria-describedby={
          normReferenceIdHelperText
            ? `${idPrefix}-norm-reference-id-helper`
            : undefined
        }
        className={fieldClass}
        id={`${idPrefix}-id`}
        onChange={e => onSetField('normReferenceId', e.target.value)}
        placeholder={t('normReferenceIdPlaceholder')}
        value={form.normReferenceId}
      />
      {normReferenceIdHelperText ? (
        <p
          className="mt-1 text-xs text-secondary-600 dark:text-secondary-300"
          id={`${idPrefix}-norm-reference-id-helper`}
        >
          {normReferenceIdHelperText}
        </p>
      ) : null}
    </div>
  )

  const nameField = (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-name`}>
          {t('name')}
          <RequiredFieldMarker />
        </label>
        {helpButton('name', t('name'))}
      </div>
      {helpPanel('help.name', 'name')}
      <input
        className={fieldClass}
        id={`${idPrefix}-name`}
        onChange={e => onSetField('name', e.target.value)}
        required
        value={form.name}
      />
    </div>
  )

  const typeField = (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-type`}>
          {t('type')}
          <RequiredFieldMarker />
        </label>
        {helpButton('type', t('type'))}
      </div>
      {helpPanel('typeHelp', 'type')}
      <input
        className={fieldClass}
        id={`${idPrefix}-type`}
        list={`${idPrefix}-type-list`}
        onChange={e => onSetField('type', e.target.value)}
        placeholder={t('typePlaceholder')}
        required
        value={form.type}
      />
      <datalist id={`${idPrefix}-type-list`}>
        {TYPE_SUGGESTION_KEYS.map(key => (
          <option key={key} value={t(key)} />
        ))}
      </datalist>
    </div>
  )

  const referenceField = (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label
          className="text-sm font-medium"
          htmlFor={`${idPrefix}-reference`}
        >
          {t('reference')}
          <RequiredFieldMarker />
        </label>
        {helpButton('reference', t('reference'))}
      </div>
      {helpPanel('referenceHelp', 'reference')}
      <input
        className={fieldClass}
        id={`${idPrefix}-reference`}
        onChange={e => onSetField('reference', e.target.value)}
        placeholder={t('referencePlaceholder')}
        required
        value={form.reference}
      />
    </div>
  )

  const versionField = (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-version`}>
          {t('version')}
        </label>
        {helpButton('version', t('version'))}
      </div>
      {helpPanel('versionHelp', 'version')}
      <input
        className={fieldClass}
        id={`${idPrefix}-version`}
        onChange={e => onSetField('version', e.target.value)}
        value={form.version}
      />
    </div>
  )

  const issuerField = (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-issuer`}>
          {t('issuer')}
          <RequiredFieldMarker />
        </label>
        {helpButton('issuer', t('issuer'))}
      </div>
      {helpPanel('issuerHelp', 'issuer')}
      <input
        className={fieldClass}
        id={`${idPrefix}-issuer`}
        onChange={e => onSetField('issuer', e.target.value)}
        required
        value={form.issuer}
      />
    </div>
  )

  const uriField = (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-uri`}>
          {t('uri')}
        </label>
        {helpButton('uri', t('uri'))}
      </div>
      {helpPanel('uriHelp', 'uri')}
      <div className="flex items-center gap-2">
        <input
          className={`${fieldClass} min-w-0 flex-1`}
          id={`${idPrefix}-uri`}
          onChange={e => onSetField('uri', e.target.value)}
          placeholder={t('uriPlaceholder')}
          type="url"
          value={form.uri}
        />
        {browserLinkUri && (
          <a
            aria-label={t('openUri')}
            className={uriLinkClass}
            {...devMarker({
              context: 'normReferences',
              name: 'form action',
              value: 'open URI',
            })}
            href={browserLinkUri}
            rel="noopener noreferrer"
            target="_blank"
            title={t('openUri')}
          >
            <ExternalLink
              aria-hidden="true"
              className="h-4 w-4"
              focusable={false}
            />
          </a>
        )}
      </div>
    </div>
  )

  if (layout === 'create') {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-x-6 lg:gap-y-4">
        {nameField}
        {typeField}
        {referenceField}
        {versionField}
        {issuerField}
        {uriField}
        {normReferenceIdField('lg:col-span-2')}
      </div>
    )
  }

  return (
    <>
      {normReferenceIdField()}
      {nameField}
      {typeField}
      {referenceField}
      {versionField}
      {issuerField}
      {uriField}
    </>
  )
}
