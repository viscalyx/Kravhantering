'use client'

import { HelpCircle, Plus, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import NormReferenceFormFields from '@/components/NormReferenceFormFields'
import { useRouter } from '@/i18n/routing'

interface FormData {
  acceptanceCriteria: string
  areaId: string
  categoryId: string
  description: string
  normReferenceIds: number[]
  qualityCharacteristicId: string
  requiresTesting: boolean
  scenarioIds: number[]
  typeId: string
  verificationMethod: string
}

interface RequirementFormProps {
  initialData?: Partial<Omit<FormData, 'normReferenceIds' | 'scenarioIds'>>
  initialNormReferenceIds?: number[]
  initialScenarioIds?: number[]
  mode: 'create' | 'edit'
  requirementId?: number | string
}

interface ScenarioOption {
  id: number
  nameEn: string
  nameSv: string
}

interface NormReferenceOption {
  id: number
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
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

const richTags = { strong: (chunks: ReactNode) => <strong>{chunks}</strong> }

export default function RequirementForm({
  initialData,
  initialNormReferenceIds,
  initialScenarioIds,
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
  const [normReferences, setNormReferences] = useState<NormReferenceOption[]>(
    [],
  )
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([])
  const [showCreateNormRef, setShowCreateNormRef] = useState(false)
  const [normRefForm, setNormRefForm] = useState({
    normReferenceId: '',
    name: '',
    type: '',
    reference: '',
    version: '',
    issuer: '',
  })
  const [normRefSubmitting, setNormRefSubmitting] = useState(false)
  const [normRefError, setNormRefError] = useState<string | null>(null)
  const [qualityCharacteristics, setQualityCharacteristics] = useState<
    QualityCharacteristicOption[]
  >([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
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
    normReferenceIds: initialNormReferenceIds ?? [],
    scenarioIds: initialScenarioIds ?? [],
    verificationMethod: initialData?.verificationMethod ?? '',
  })

  const hasUserEdited = useRef(false)
  const prevInitialData = useRef(initialData)
  const prevNormReferenceIds = useRef(initialNormReferenceIds)
  const prevScenarioIds = useRef(initialScenarioIds)

  useEffect(() => {
    if (hasUserEdited.current) return
    const dataChanged = initialData !== prevInitialData.current
    const normRefsChanged =
      initialNormReferenceIds !== prevNormReferenceIds.current
    const scenariosChanged = initialScenarioIds !== prevScenarioIds.current
    if (!dataChanged && !normRefsChanged && !scenariosChanged) return

    prevInitialData.current = initialData
    prevNormReferenceIds.current = initialNormReferenceIds
    prevScenarioIds.current = initialScenarioIds

    setForm(prev => ({
      ...prev,
      ...(dataChanged && initialData
        ? {
            areaId: initialData.areaId ?? prev.areaId,
            categoryId: initialData.categoryId ?? prev.categoryId,
            typeId: initialData.typeId ?? prev.typeId,
            qualityCharacteristicId:
              initialData.qualityCharacteristicId ??
              prev.qualityCharacteristicId,
            description: initialData.description ?? prev.description,
            acceptanceCriteria:
              initialData.acceptanceCriteria ?? prev.acceptanceCriteria,
            requiresTesting:
              initialData.requiresTesting ?? prev.requiresTesting,
            verificationMethod:
              initialData.verificationMethod ?? prev.verificationMethod,
          }
        : {}),
      ...(normRefsChanged
        ? { normReferenceIds: initialNormReferenceIds ?? prev.normReferenceIds }
        : {}),
      ...(scenariosChanged
        ? { scenarioIds: initialScenarioIds ?? prev.scenarioIds }
        : {}),
    }))
  }, [initialData, initialNormReferenceIds, initialScenarioIds])

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

  const fetchOptions = useCallback(async () => {
    const results = await Promise.allSettled([
      fetch('/api/requirement-areas'),
      fetch('/api/requirement-categories'),
      fetch('/api/requirement-types'),
      fetch('/api/usage-scenarios'),
      fetch('/api/norm-references'),
    ])
    const [
      areasResult,
      catResult,
      typesResult,
      scenariosResult,
      normRefsResult,
    ] = results
    if (areasResult.status === 'fulfilled' && areasResult.value.ok)
      setAreas(
        ((await areasResult.value.json()) as { areas?: AreaOption[] }).areas ??
          [],
      )
    if (catResult.status === 'fulfilled' && catResult.value.ok)
      setCategories(
        ((await catResult.value.json()) as { categories?: Option[] })
          .categories ?? [],
      )
    if (typesResult.status === 'fulfilled' && typesResult.value.ok)
      setTypes(
        ((await typesResult.value.json()) as { types?: Option[] }).types ?? [],
      )
    if (scenariosResult.status === 'fulfilled' && scenariosResult.value.ok)
      setScenarios(
        (
          (await scenariosResult.value.json()) as {
            scenarios?: ScenarioOption[]
          }
        ).scenarios ?? [],
      )
    if (normRefsResult.status === 'fulfilled' && normRefsResult.value.ok) {
      const fetched =
        (
          (await normRefsResult.value.json()) as {
            normReferences?: NormReferenceOption[]
          }
        ).normReferences ?? []
      setNormReferences(prev => {
        const ids = new Set(fetched.map(nr => nr.id))
        const localOnly = prev.filter(nr => !ids.has(nr.id))
        return [...localOnly, ...fetched]
      })
    }
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
    hasUserEdited.current = true
    setForm(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'requiresTesting' && !value) {
        next.verificationMethod = ''
      }
      if (key === 'typeId') {
        next.qualityCharacteristicId = ''
      }
      return next
    })
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
          verificationMethod: form.requiresTesting
            ? form.verificationMethod || undefined
            : undefined,
          normReferenceIds:
            mode === 'edit'
              ? form.normReferenceIds
              : form.normReferenceIds.length > 0
                ? form.normReferenceIds
                : undefined,
          scenarioIds:
            mode === 'edit'
              ? form.scenarioIds
              : form.scenarioIds.length > 0
                ? form.scenarioIds
                : undefined,
        }),
      })

      if (res.ok) {
        const data = (await res.json()) as {
          id?: number
          uniqueId?: string
          requirement?: { id: number; uniqueId: string }
          version?: { versionNumber: number } | number
        }
        const targetUniqueId =
          mode === 'create'
            ? data.requirement?.uniqueId
            : (data.uniqueId ?? requirementId)
        if (saveDestination === 'page') {
          const versionNumber =
            typeof data.version === 'object'
              ? data.version?.versionNumber
              : data.version
          const versionSuffix = versionNumber ? `/${versionNumber}` : ''
          router.push(`/requirements/${targetUniqueId}${versionSuffix}`)
        } else {
          router.push(`/requirements?selected=${targetUniqueId}`)
        }
      } else {
        const err = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        setError(err?.error ?? res.statusText)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const topLevelCategories = qualityCharacteristics.filter(tc => !tc.parentId)
  const childCategories = qualityCharacteristics.filter(tc => tc.parentId)
  const getQualityCharacteristicName = (c: QualityCharacteristicOption) =>
    locale === 'sv' ? c.nameSv : c.nameEn

  const helpButton = (field: string, label: string) => (
    <button
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) =>
    openHelp.has(field) && (
      <p
        className="mt-1 mb-2 text-xs text-secondary-500 dark:text-secondary-400 whitespace-pre-line bg-secondary-50 dark:bg-secondary-800/50 rounded-lg px-3 py-2 border border-secondary-200 dark:border-secondary-700"
        id={`help-${field}`}
      >
        {t.rich(helpKey, richTags)}
      </p>
    )

  return (
    <form className="animate-fade-in-up" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-sm font-medium" htmlFor="areaId">
                {t('area')} *
              </label>
              {helpButton('areaId', t('area'))}
            </div>
            {helpPanel('areaHelp', 'areaId')}
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
                {areas.find(a => String(a.id) === form.areaId)?.ownerName ??
                  '—'}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-sm font-medium" htmlFor="description">
                {t('description')} *
              </label>
              {helpButton('description', t('description'))}
            </div>
            {helpPanel('descriptionHelp', 'description')}
            <textarea
              className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 min-h-[100px]"
              id="description"
              onChange={e => handleChange('description', e.target.value)}
              required
              value={form.description}
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label
                className="text-sm font-medium"
                htmlFor="acceptanceCriteria"
              >
                {t('acceptanceCriteria')}
              </label>
              {helpButton('acceptanceCriteria', t('acceptanceCriteria'))}
            </div>
            {helpPanel('acceptanceCriteriaHelp', 'acceptanceCriteria')}
            <textarea
              className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 min-h-[100px]"
              id="acceptanceCriteria"
              onChange={e => handleChange('acceptanceCriteria', e.target.value)}
              value={form.acceptanceCriteria}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium" htmlFor="categoryId">
                  {t('category')}
                </label>
                {helpButton('categoryId', t('category'))}
              </div>
              {helpPanel('categoryHelp', 'categoryId')}
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
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium" htmlFor="typeId">
                  {t('type')}
                </label>
                {helpButton('typeId', t('type'))}
              </div>
              {helpPanel('typeHelp', 'typeId')}
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
              <div className="flex items-center gap-1.5 mb-1">
                <label
                  className="text-sm font-medium"
                  htmlFor="qualityCharacteristicId"
                >
                  {t('qualityCharacteristic')}
                </label>
                {helpButton(
                  'qualityCharacteristicId',
                  t('qualityCharacteristic'),
                )}
              </div>
              {helpPanel(
                'qualityCharacteristicHelp',
                'qualityCharacteristicId',
              )}
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
                  <optgroup
                    key={tc.id}
                    label={getQualityCharacteristicName(tc)}
                  >
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

          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                checked={form.requiresTesting}
                className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                onChange={e =>
                  handleChange('requiresTesting', e.target.checked)
                }
                type="checkbox"
              />
              {t('requiresTesting')}
            </label>
            {helpButton('requiresTesting', t('requiresTesting'))}
          </div>
          {helpPanel('requiresTestingHelp', 'requiresTesting')}

          {form.requiresTesting && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label
                  className="text-sm font-medium"
                  htmlFor="verificationMethod"
                >
                  {t('verificationMethod')} *
                </label>
                {helpButton('verificationMethod', t('verificationMethod'))}
              </div>
              {helpPanel('verificationMethodHelp', 'verificationMethod')}
              <textarea
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 min-h-[100px]"
                id="verificationMethod"
                onChange={e =>
                  handleChange('verificationMethod', e.target.value)
                }
                required
                value={form.verificationMethod}
              />
            </div>
          )}
        </div>

        <div className="self-start lg:w-64 space-y-6">
          {scenarios.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm font-medium">{t('scenario')}</span>
                {helpButton('scenario', t('scenario'))}
              </div>
              {helpPanel('scenarioHelp', 'scenario')}
              <div className="space-y-1.5 rounded-xl border bg-white dark:bg-secondary-800/50 p-3">
                {scenarios.map(s => (
                  <label
                    className="flex items-center gap-2 text-sm cursor-pointer"
                    key={s.id}
                  >
                    <input
                      checked={form.scenarioIds.includes(s.id)}
                      className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                      onChange={e => {
                        hasUserEdited.current = true
                        const checked = e.target.checked
                        setForm(prev => ({
                          ...prev,
                          scenarioIds: checked
                            ? [...prev.scenarioIds, s.id]
                            : prev.scenarioIds.filter(id => id !== s.id),
                        }))
                      }}
                      type="checkbox"
                    />
                    {getOptionName(s)}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">
                  {t('normReferences')}
                </span>
                {helpButton('normReferences', t('normReferences'))}
              </div>
              <button
                className="btn-primary inline-flex items-center gap-1.5 min-h-[44px] min-w-[44px]"
                onClick={() => setShowCreateNormRef(true)}
                type="button"
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                {tc('create')}
              </button>
            </div>
            {helpPanel('normReferencesHelp', 'normReferences')}
            {normReferences.length > 0 && (
              <div className="space-y-1.5 rounded-xl border bg-white dark:bg-secondary-800/50 p-3">
                {normReferences.map(nr => (
                  <label
                    className="flex items-center gap-2 text-sm cursor-pointer"
                    key={nr.id}
                  >
                    <input
                      checked={form.normReferenceIds.includes(nr.id)}
                      className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                      onChange={e => {
                        hasUserEdited.current = true
                        const checked = e.target.checked
                        setForm(prev => ({
                          ...prev,
                          normReferenceIds: checked
                            ? [...prev.normReferenceIds, nr.id]
                            : prev.normReferenceIds.filter(id => id !== nr.id),
                        }))
                      }}
                      type="checkbox"
                    />
                    <span>
                      <span className="font-mono text-xs text-secondary-500 dark:text-secondary-400">
                        {nr.normReferenceId}
                      </span>{' '}
                      {nr.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateNormRef &&
        createPortal(
          <NormReferenceModal
            normRefError={normRefError}
            normRefForm={normRefForm}
            normRefSubmitting={normRefSubmitting}
            onCancel={() => {
              setShowCreateNormRef(false)
              setNormRefError(null)
            }}
            onSave={async () => {
              setNormRefSubmitting(true)
              setNormRefError(null)
              try {
                const res = await fetch('/api/norm-references', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    normReferenceId: normRefForm.normReferenceId || undefined,
                    name: normRefForm.name,
                    type: normRefForm.type,
                    reference: normRefForm.reference,
                    version: normRefForm.version || null,
                    issuer: normRefForm.issuer,
                  }),
                })
                if (!res.ok) {
                  const data = (await res.json().catch(() => null)) as {
                    error?: string
                  } | null
                  setNormRefError(data?.error ?? tc('error'))
                } else {
                  const created = (await res.json()) as NormReferenceOption
                  setNormReferences(prev => [...prev, created])
                  setForm(prev => ({
                    ...prev,
                    normReferenceIds: [...prev.normReferenceIds, created.id],
                  }))
                  setNormRefForm({
                    normReferenceId: '',
                    name: '',
                    type: '',
                    reference: '',
                    version: '',
                    issuer: '',
                  })
                  setShowCreateNormRef(false)
                }
              } catch {
                setNormRefError(tc('error'))
              } finally {
                setNormRefSubmitting(false)
              }
            }}
            onSetField={(field, value) =>
              setNormRefForm(prev => ({ ...prev, [field]: value }))
            }
          />,
          document.body,
        )}

      {error && (
        <p className="mt-5 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 pt-4 mt-5 border-t">
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={submitting} type="submit">
            {submitting ? tc('loading') : tc('save')}
          </button>
          <button
            className="px-4 py-2.5 rounded-xl border text-sm font-medium min-h-11 min-w-11 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-all duration-200"
            disabled={submitting}
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
              aria-label={t('afterSaveInline')}
              aria-pressed={saveDestination === 'inline'}
              className={`min-h-[44px] min-w-[44px] px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 ${saveDestination === 'inline' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-secondary-800 hover:bg-secondary-50 dark:hover:bg-secondary-700'}`}
              disabled={submitting}
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
              aria-label={t('afterSavePage')}
              aria-pressed={saveDestination === 'page'}
              className={`min-h-[44px] min-w-[44px] px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 ${saveDestination === 'page' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-secondary-800 hover:bg-secondary-50 dark:hover:bg-secondary-700'}`}
              disabled={submitting}
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

interface NormReferenceModalProps {
  normRefError: string | null
  normRefForm: {
    issuer: string
    name: string
    normReferenceId: string
    reference: string
    type: string
    version: string
  }
  normRefSubmitting: boolean
  onCancel: () => void
  onSave: () => void
  onSetField: (field: string, value: string) => void
}

function NormReferenceModal({
  normRefError,
  normRefForm,
  normRefSubmitting,
  onCancel,
  onSave,
  onSetField,
}: NormReferenceModalProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !normRefSubmitting) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, normRefSubmitting])

  const canSave =
    !normRefSubmitting &&
    normRefForm.name.trim() !== '' &&
    normRefForm.type.trim() !== '' &&
    normRefForm.reference.trim() !== '' &&
    normRefForm.issuer.trim() !== ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      ref={overlayRef}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={normRefSubmitting ? undefined : onCancel}
      />
      <div
        aria-describedby="modal-desc-norm-ref"
        aria-labelledby="modal-title-norm-ref"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-secondary-900 border shadow-xl animate-fade-in-up p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
            id="modal-title-norm-ref"
          >
            {t('addNewNormReference')}
          </h2>
          <button
            aria-label={tc('cancel')}
            className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 transition-colors focus-visible:ring-2 focus-visible:ring-primary-400/50 disabled:opacity-50 disabled:pointer-events-none"
            disabled={normRefSubmitting}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div
          className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2"
          id="modal-desc-norm-ref"
        >
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {t('newNormReferenceWarning')}
          </p>
        </div>

        {normRefError && (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {normRefError}
          </p>
        )}

        <div className="space-y-3">
          <NormReferenceFormFields
            form={normRefForm}
            idPrefix="modal-nr"
            onSetField={onSetField}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            className="btn-primary"
            disabled={!canSave}
            onClick={onSave}
            type="button"
          >
            {normRefSubmitting ? tc('saving') : tc('save')}
          </button>
          <button
            className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 text-secondary-600 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2"
            disabled={normRefSubmitting}
            onClick={onCancel}
            type="button"
          >
            {tc('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
