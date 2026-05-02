'use client'

import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'

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

export default function NormReferenceFormFields({
  form,
  idPrefix,
  onSetField,
}: NormReferenceFormFieldsProps) {
  const t = useTranslations('normReference')
  const tc = useTranslations('common')
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())

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
    <button
      aria-controls={`help-${idPrefix}-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) => (
    <AnimatedHelpPanel
      id={`help-${idPrefix}-${field}`}
      isOpen={openHelp.has(field)}
    >
      {t.rich(helpKey, richTags)}
    </AnimatedHelpPanel>
  )

  return (
    <>
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-sm font-medium" htmlFor={`${idPrefix}-id`}>
            {t('normReferenceId')}
          </label>
          {helpButton('normReferenceId', t('normReferenceId'))}
        </div>
        {helpPanel('normReferenceIdHelp', 'normReferenceId')}
        <input
          className={fieldClass}
          id={`${idPrefix}-id`}
          onChange={e => onSetField('normReferenceId', e.target.value)}
          placeholder={t('normReferenceIdPlaceholder')}
          value={form.normReferenceId}
        />
      </div>
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-sm font-medium" htmlFor={`${idPrefix}-name`}>
            {t('name')} <span aria-hidden="true">*</span>
          </label>
          {helpButton('name', t('name'))}
        </div>
        {helpPanel('nameHelp', 'name')}
        <input
          className={fieldClass}
          id={`${idPrefix}-name`}
          onChange={e => onSetField('name', e.target.value)}
          required
          value={form.name}
        />
      </div>
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-sm font-medium" htmlFor={`${idPrefix}-type`}>
            {t('type')} <span aria-hidden="true">*</span>
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
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label
            className="text-sm font-medium"
            htmlFor={`${idPrefix}-reference`}
          >
            {t('reference')} <span aria-hidden="true">*</span>
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
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label
            className="text-sm font-medium"
            htmlFor={`${idPrefix}-version`}
          >
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
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-sm font-medium" htmlFor={`${idPrefix}-issuer`}>
            {t('issuer')} <span aria-hidden="true">*</span>
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
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-sm font-medium" htmlFor={`${idPrefix}-uri`}>
            {t('uri')}
          </label>
          {helpButton('uri', t('uri'))}
        </div>
        {helpPanel('uriHelp', 'uri')}
        <input
          className={fieldClass}
          id={`${idPrefix}-uri`}
          onChange={e => onSetField('uri', e.target.value)}
          placeholder={t('uriPlaceholder')}
          type="url"
          value={form.uri}
        />
      </div>
    </>
  )
}
