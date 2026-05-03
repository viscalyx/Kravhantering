'use client'

import { motion } from 'framer-motion'
import { HelpCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type FormEvent, useEffect, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { normalizeSlugInput } from '@/lib/slug'

interface TaxonomyItem {
  id: number
  nameEn: string
  nameSv: string
}

interface SpecificationMeta {
  businessNeedsReference: string | null
  name: string
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
  specificationResponsibilityAreaId: number | null
  uniqueId: string
}

interface SpecificationEditPanelProps {
  implementationTypes: TaxonomyItem[]
  lifecycleStatuses: TaxonomyItem[]
  onCancel: () => void
  onSaved: (result: { newUniqueId: string }) => Promise<void> | void
  responsibilityAreas: TaxonomyItem[]
  spec: SpecificationMeta
  specificationSlug: string
}

interface SpecificationFormState {
  businessNeedsReference: string
  name: string
  specificationImplementationTypeId: string
  specificationLifecycleStatusId: string
  specificationResponsibilityAreaId: string
  uniqueId: string
}

export const SPECIFICATION_EDIT_FORM_ID = 'requirement-specification-edit-form'

function buildFormState(spec: SpecificationMeta): SpecificationFormState {
  return {
    businessNeedsReference: spec.businessNeedsReference ?? '',
    name: spec.name,
    specificationImplementationTypeId:
      spec.specificationImplementationTypeId?.toString() ?? '',
    specificationLifecycleStatusId:
      spec.specificationLifecycleStatusId?.toString() ?? '',
    specificationResponsibilityAreaId:
      spec.specificationResponsibilityAreaId?.toString() ?? '',
    uniqueId: spec.uniqueId,
  }
}

export default function SpecificationEditPanel({
  implementationTypes,
  lifecycleStatuses,
  onCancel,
  onSaved,
  specificationSlug,
  spec,
  responsibilityAreas,
}: SpecificationEditPanelProps) {
  const t = useTranslations('specification')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const [slugError, setSlugError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [form, setForm] = useState<SpecificationFormState>(() =>
    buildFormState(spec),
  )

  useEffect(() => {
    setForm(buildFormState(spec))
    setOpenHelp(new Set())
  }, [spec])

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
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) => (
    <AnimatedHelpPanel id={`help-${field}`} isOpen={openHelp.has(field)}>
      {t(helpKey)}
    </AnimatedHelpPanel>
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setSlugError(null)
    setSubmitError(null)

    try {
      const response = await apiFetch(
        `/api/specifications/${specificationSlug}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uniqueId: form.uniqueId,
            name: form.name,
            specificationResponsibilityAreaId:
              form.specificationResponsibilityAreaId
                ? Number(form.specificationResponsibilityAreaId)
                : null,
            specificationImplementationTypeId:
              form.specificationImplementationTypeId
                ? Number(form.specificationImplementationTypeId)
                : null,
            specificationLifecycleStatusId: form.specificationLifecycleStatusId
              ? Number(form.specificationLifecycleStatusId)
              : null,
            businessNeedsReference: form.businessNeedsReference || null,
          }),
        },
      )

      if (response.status === 409) {
        setSlugError(t('uniqueIdTaken'))
        return
      }

      if (!response.ok) {
        setSubmitError(tc('error'))
        return
      }

      let data: { uniqueId?: string } = {}
      const text = await response.text()
      if (text) {
        try {
          data = JSON.parse(text) as { uniqueId?: string }
        } catch {
          // Server returned non-JSON success; use form value as fallback
        }
      }

      await onSaved({
        newUniqueId: data.uniqueId ?? form.uniqueId,
      })
    } catch {
      setSubmitError(tc('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.form
      animate={{ opacity: 1, y: 0 }}
      aria-busy={isSubmitting}
      className="glass max-w-lg space-y-5 rounded-2xl p-6"
      id={SPECIFICATION_EDIT_FORM_ID}
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
      {...devMarker({
        context: 'requirements specification detail',
        name: 'crud form',
        priority: 340,
        value: 'edit',
      })}
      onSubmit={handleSubmit}
    >
      <h2 className="text-lg font-semibold">{t('editSpecification')}</h2>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-sm font-medium" htmlFor="spec-name">
            {t('name')} <span aria-hidden="true">*</span>
          </label>
          {helpButton('spec-name', t('name'))}
        </div>
        {helpPanel('help.name', 'spec-name')}
        <input
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="spec-name"
          onChange={event =>
            setForm(current => ({ ...current, name: event.target.value }))
          }
          required
          value={form.name}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-sm font-medium" htmlFor="spec-unique-id">
            {t('uniqueId')} <span aria-hidden="true">*</span>
          </label>
          {helpButton('spec-unique-id', t('uniqueId'))}
        </div>
        {helpPanel('uniqueIdHelp', 'spec-unique-id')}
        <input
          className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-mono transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50${slugError ? ' border-red-500 focus:ring-red-400/50' : ''}`}
          id="spec-unique-id"
          onChange={event => {
            setSlugError(null)
            setForm(current => ({
              ...current,
              uniqueId: normalizeSlugInput(event.target.value),
            }))
          }}
          placeholder={t('uniqueIdPlaceholder')}
          required
          value={form.uniqueId}
        />
        {slugError ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {slugError}
          </p>
        ) : (
          <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
            {t('uniqueIdHelp')}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-sm font-medium" htmlFor="spec-area">
            {t('responsibilityArea')}
          </label>
          {helpButton('spec-area', t('responsibilityArea'))}
        </div>
        {helpPanel('responsibilityAreaHelp', 'spec-area')}
        <select
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="spec-area"
          onChange={event =>
            setForm(current => ({
              ...current,
              specificationResponsibilityAreaId: event.target.value,
            }))
          }
          value={form.specificationResponsibilityAreaId}
        >
          <option value="">—</option>
          {responsibilityAreas.map(area => (
            <option key={area.id} value={area.id}>
              {locale === 'sv' ? area.nameSv : area.nameEn}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-sm font-medium" htmlFor="spec-impl-type">
            {t('implementationType')}
          </label>
          {helpButton('spec-impl-type', t('implementationType'))}
        </div>
        {helpPanel('implementationTypeHelp', 'spec-impl-type')}
        <select
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="spec-impl-type"
          onChange={event =>
            setForm(current => ({
              ...current,
              specificationImplementationTypeId: event.target.value,
            }))
          }
          value={form.specificationImplementationTypeId}
        >
          <option value="">—</option>
          {implementationTypes.map(implementationType => (
            <option key={implementationType.id} value={implementationType.id}>
              {locale === 'sv'
                ? implementationType.nameSv
                : implementationType.nameEn}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label
            className="block text-sm font-medium"
            htmlFor="spec-lifecycle-status"
          >
            {t('lifecycleStatus')}
          </label>
          {helpButton('spec-lifecycle-status', t('lifecycleStatus'))}
        </div>
        {helpPanel('lifecycleStatusHelp', 'spec-lifecycle-status')}
        <select
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="spec-lifecycle-status"
          onChange={event =>
            setForm(current => ({
              ...current,
              specificationLifecycleStatusId: event.target.value,
            }))
          }
          value={form.specificationLifecycleStatusId}
        >
          <option value="">—</option>
          {lifecycleStatuses.map(ls => (
            <option key={ls.id} value={ls.id}>
              {locale === 'sv' ? ls.nameSv : ls.nameEn}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label
            className="block text-sm font-medium"
            htmlFor="spec-business-ref"
          >
            {t('businessNeedsReference')}
          </label>
          {helpButton('spec-business-ref', t('businessNeedsReference'))}
        </div>
        {helpPanel('businessNeedsReferenceHelp', 'spec-business-ref')}
        <textarea
          className="w-full resize-none rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="spec-business-ref"
          onChange={event =>
            setForm(current => ({
              ...current,
              businessNeedsReference: event.target.value,
            }))
          }
          placeholder={t('businessNeedsReferencePlaceholder')}
          rows={2}
          value={form.businessNeedsReference}
        />
      </div>

      {submitError && (
        <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
      )}

      <div className="flex gap-3">
        <button className="btn-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? tc('loading') : tc('save')}
        </button>
        <button
          className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2"
          onClick={onCancel}
          type="button"
        >
          {tc('cancel')}
        </button>
      </div>
    </motion.form>
  )
}
