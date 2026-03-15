'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from '@/i18n/routing'

interface FormData {
  acceptanceCriteria: string
  areaId: string
  categoryId: string
  description: string
  qualityCharacteristicId: string
  requiresTesting: boolean
  typeId: string
}

interface RequirementFormProps {
  initialData?: Partial<FormData>
  mode: 'create' | 'edit'
  requirementId?: number | string
}

interface Option {
  id: number
  nameEn: string
  nameSv: string
}

interface AreaOption {
  id: number
  name: string
  ownerName: string | null
}

interface QualityCharacteristicOption {
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
}

export default function RequirementForm({
  initialData,
  requirementId,
  mode,
}: RequirementFormProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const router = useRouter()
  const locale = useLocale()

  const getOptionName = (o: Option) => (locale === 'sv' ? o.nameSv : o.nameEn)

  const [areas, setAreas] = useState<AreaOption[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [types, setTypes] = useState<Option[]>([])
  const [qualityCharacteristics, setQualityCharacteristics] = useState<
    QualityCharacteristicOption[]
  >([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveDestination, setSaveDestination] = useState<'inline' | 'page'>(
    () => {
      try {
        const stored = globalThis.localStorage?.getItem(
          'requirement-save-destination',
        )
        if (stored === 'page') return 'page'
      } catch {
        // ignore
      }
      return 'inline'
    },
  )

  const [form, setForm] = useState<FormData>({
    areaId: initialData?.areaId ?? '',
    categoryId: initialData?.categoryId ?? '',
    typeId: initialData?.typeId ?? '',
    qualityCharacteristicId: initialData?.qualityCharacteristicId ?? '',
    description: initialData?.description ?? '',
    acceptanceCriteria: initialData?.acceptanceCriteria ?? '',
    requiresTesting: initialData?.requiresTesting ?? false,
  })

  const fetchOptions = useCallback(async () => {
    const [areasRes, catRes, typesRes] = await Promise.all([
      fetch('/api/requirement-areas'),
      fetch('/api/requirement-categories'),
      fetch('/api/requirement-types'),
    ])
    if (areasRes.ok)
      setAreas(
        ((await areasRes.json()) as { areas?: AreaOption[] }).areas ?? [],
      )
    if (catRes.ok)
      setCategories(
        ((await catRes.json()) as { categories?: Option[] }).categories ?? [],
      )
    if (typesRes.ok)
      setTypes(((await typesRes.json()) as { types?: Option[] }).types ?? [])
  }, [])

  const fetchQualityCharacteristics = useCallback(async (typeId: string) => {
    if (!typeId) {
      setQualityCharacteristics([])
      return
    }
    const res = await fetch(`/api/quality-characteristics?typeId=${typeId}`)
    if (res.ok)
      setQualityCharacteristics(
        (
          (await res.json()) as {
            qualityCharacteristics?: QualityCharacteristicOption[]
          }
        ).qualityCharacteristics ?? [],
      )
  }, [])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    fetchQualityCharacteristics(form.typeId)
  }, [form.typeId, fetchQualityCharacteristics])

  const handleChange = (key: keyof FormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const url =
        mode === 'create'
          ? '/api/requirements'
          : `/api/requirements/${requirementId}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          areaId: form.areaId ? Number(form.areaId) : undefined,
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
          typeId: form.typeId ? Number(form.typeId) : undefined,
          qualityCharacteristicId: form.qualityCharacteristicId
            ? Number(form.qualityCharacteristicId)
            : undefined,
          description: form.description || undefined,
          acceptanceCriteria: form.acceptanceCriteria || undefined,
          requiresTesting: form.requiresTesting,
        }),
      })

      if (res.ok) {
        const data = (await res.json()) as {
          id?: number
          uniqueId?: string
          requirement?: { id: number; uniqueId: string }
        }
        const targetUniqueId =
          mode === 'create'
            ? data.requirement?.uniqueId
            : (data.uniqueId ?? requirementId)
        if (saveDestination === 'page') {
          router.push(`/kravkatalog/${targetUniqueId}`)
        } else {
          router.push(`/kravkatalog?selected=${targetUniqueId}`)
        }
      } else {
        const err = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        setError(err?.error ?? res.statusText)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const topLevelCategories = qualityCharacteristics.filter(tc => !tc.parentId)
  const childCategories = qualityCharacteristics.filter(tc => tc.parentId)
  const getQualityCharacteristicName = (c: QualityCharacteristicOption) =>
    locale === 'sv' ? c.nameSv : c.nameEn

  return (
    <form
      className="space-y-5 max-w-2xl animate-fade-in-up"
      onSubmit={handleSubmit}
    >
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="areaId">
          {t('area')} *
        </label>
        <select
          className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
          id="areaId"
          onChange={e => handleChange('areaId', e.target.value)}
          required
          value={form.areaId}
        >
          <option value="">{t('area')}...</option>
          {areas.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {form.areaId && (
          <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
            {t('area')} — {t('areaOwner')}:{' '}
            {areas.find(a => String(a.id) === form.areaId)?.ownerName ?? '—'}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="description">
          {t('description')}
        </label>
        <textarea
          className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 min-h-[100px]"
          id="description"
          onChange={e => handleChange('description', e.target.value)}
          value={form.description}
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-1"
          htmlFor="acceptanceCriteria"
        >
          {t('acceptanceCriteria')}
        </label>
        <textarea
          className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 min-h-[100px]"
          id="acceptanceCriteria"
          onChange={e => handleChange('acceptanceCriteria', e.target.value)}
          value={form.acceptanceCriteria}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            className="block text-sm font-medium mb-1"
            htmlFor="categoryId"
          >
            {t('category')}
          </label>
          <select
            className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
            id="categoryId"
            onChange={e => handleChange('categoryId', e.target.value)}
            value={form.categoryId}
          >
            <option value="">{t('category')}...</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {getOptionName(c)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="typeId">
            {t('type')}
          </label>
          <select
            className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
            id="typeId"
            onChange={e => handleChange('typeId', e.target.value)}
            value={form.typeId}
          >
            <option value="">{t('type')}...</option>
            {types.map(tp => (
              <option key={tp.id} value={tp.id}>
                {getOptionName(tp)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {qualityCharacteristics.length > 0 && (
        <div>
          <label
            className="block text-sm font-medium mb-1"
            htmlFor="qualityCharacteristicId"
          >
            {t('qualityCharacteristic')}
          </label>
          <select
            className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
            id="qualityCharacteristicId"
            onChange={e =>
              handleChange('qualityCharacteristicId', e.target.value)
            }
            value={form.qualityCharacteristicId}
          >
            <option value="">{t('qualityCharacteristic')}...</option>
            {topLevelCategories.map(tc => (
              <optgroup key={tc.id} label={getQualityCharacteristicName(tc)}>
                {childCategories
                  .filter(c => c.parentId === tc.id)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {getQualityCharacteristicName(c)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          checked={form.requiresTesting}
          className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
          onChange={e => handleChange('requiresTesting', e.target.checked)}
          type="checkbox"
        />
        {t('requiresTesting')}
      </label>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 pt-4 border-t">
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={submitting} type="submit">
            {submitting ? tc('loading') : tc('save')}
          </button>
          <button
            className="px-4 py-2.5 rounded-xl border text-sm font-medium text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-all duration-200"
            onClick={() => router.back()}
            type="button"
          >
            {tc('cancel')}
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-secondary-600 dark:text-secondary-400">
          <span>{t('afterSave')}</span>
          <div className="inline-flex rounded-lg border overflow-hidden text-xs font-medium">
            <button
              className={`px-3 py-1.5 transition-colors ${saveDestination === 'inline' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-secondary-800 hover:bg-secondary-50 dark:hover:bg-secondary-700'}`}
              onClick={() => {
                setSaveDestination('inline')
                try {
                  localStorage.setItem('requirement-save-destination', 'inline')
                } catch {
                  // ignore
                }
              }}
              type="button"
            >
              {t('afterSaveInline')}
            </button>
            <button
              className={`px-3 py-1.5 transition-colors ${saveDestination === 'page' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-secondary-800 hover:bg-secondary-50 dark:hover:bg-secondary-700'}`}
              onClick={() => {
                setSaveDestination('page')
                try {
                  localStorage.setItem('requirement-save-destination', 'page')
                } catch {
                  // ignore
                }
              }}
              type="button"
            >
              {t('afterSavePage')}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
