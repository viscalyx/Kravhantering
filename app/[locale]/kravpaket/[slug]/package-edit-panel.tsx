'use client'

import { useLocale, useTranslations } from 'next-intl'
import { type FormEvent, useEffect, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import { normalizeSlugInput } from '@/lib/slug'

interface TaxonomyItem {
  id: number
  nameEn: string
  nameSv: string
}

interface PackageMeta {
  businessNeedsReference: string | null
  name: string
  packageImplementationTypeId: number | null
  packageResponsibilityAreaId: number | null
  uniqueId: string
}

interface PackageEditPanelProps {
  implementationTypes: TaxonomyItem[]
  onCancel: () => void
  onSaved: (newUniqueId: string) => Promise<void> | void
  packageSlug: string
  pkg: PackageMeta
  responsibilityAreas: TaxonomyItem[]
}

interface PackageFormState {
  businessNeedsReference: string
  name: string
  packageImplementationTypeId: string
  packageResponsibilityAreaId: string
  uniqueId: string
}

export const PACKAGE_EDIT_FORM_ID = 'requirement-package-edit-form'

function buildFormState(pkg: PackageMeta): PackageFormState {
  return {
    businessNeedsReference: pkg.businessNeedsReference ?? '',
    name: pkg.name,
    packageImplementationTypeId:
      pkg.packageImplementationTypeId?.toString() ?? '',
    packageResponsibilityAreaId:
      pkg.packageResponsibilityAreaId?.toString() ?? '',
    uniqueId: pkg.uniqueId,
  }
}

export default function PackageEditPanel({
  implementationTypes,
  onCancel,
  onSaved,
  packageSlug,
  pkg,
  responsibilityAreas,
}: PackageEditPanelProps) {
  const t = useTranslations('package')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [form, setForm] = useState<PackageFormState>(() => buildFormState(pkg))

  useEffect(() => {
    setForm(buildFormState(pkg))
  }, [pkg])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setSlugError(null)

    try {
      const response = await fetch(`/api/requirement-packages/${packageSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uniqueId: form.uniqueId,
          name: form.name,
          packageResponsibilityAreaId: form.packageResponsibilityAreaId
            ? Number(form.packageResponsibilityAreaId)
            : null,
          packageImplementationTypeId: form.packageImplementationTypeId
            ? Number(form.packageImplementationTypeId)
            : null,
          businessNeedsReference: form.businessNeedsReference || null,
        }),
      })

      if (response.status === 409) {
        setSlugError(t('uniqueIdTaken'))
        return
      }

      if (!response.ok) return

      await onSaved(form.uniqueId)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      aria-busy={isSubmitting}
      className="glass max-w-lg animate-fade-in-up space-y-5 rounded-2xl p-6"
      id={PACKAGE_EDIT_FORM_ID}
      {...devMarker({
        context: 'requirement package detail',
        name: 'crud form',
        priority: 340,
        value: 'edit',
      })}
      onSubmit={handleSubmit}
    >
      <h2 className="text-lg font-semibold">{t('editPackage')}</h2>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="pkg-name">
          {t('name')} *
        </label>
        <input
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="pkg-name"
          onChange={event =>
            setForm(current => ({ ...current, name: event.target.value }))
          }
          required
          value={form.name}
        />
      </div>

      <div>
        <label
          className="mb-1 block text-sm font-medium"
          htmlFor="pkg-unique-id"
        >
          {t('uniqueId')} *
        </label>
        <input
          className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-mono transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50${slugError ? ' border-red-500 focus:ring-red-400/50' : ''}`}
          id="pkg-unique-id"
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
        <label className="mb-1 block text-sm font-medium" htmlFor="pkg-area">
          {t('responsibilityArea')}
        </label>
        <select
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="pkg-area"
          onChange={event =>
            setForm(current => ({
              ...current,
              packageResponsibilityAreaId: event.target.value,
            }))
          }
          value={form.packageResponsibilityAreaId}
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
        <label
          className="mb-1 block text-sm font-medium"
          htmlFor="pkg-impl-type"
        >
          {t('implementationType')}
        </label>
        <select
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="pkg-impl-type"
          onChange={event =>
            setForm(current => ({
              ...current,
              packageImplementationTypeId: event.target.value,
            }))
          }
          value={form.packageImplementationTypeId}
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
        <label
          className="mb-1 block text-sm font-medium"
          htmlFor="pkg-business-ref"
        >
          {t('businessNeedsReference')}
        </label>
        <textarea
          className="w-full resize-none rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
          id="pkg-business-ref"
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
    </form>
  )
}
