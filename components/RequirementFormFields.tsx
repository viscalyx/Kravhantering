'use client'

import { HelpCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'

interface TaxonomyOption {
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

interface RequirementPackageOption {
  id: number
  nameEn: string
  nameSv: string
}

interface NormReferenceOption {
  id: number
  name: string
  normReferenceId: string
}

export interface RequirementFormFieldValues {
  acceptanceCriteria: string
  areaId: string
  categoryId: string
  description: string
  normReferenceIds: number[]
  qualityCharacteristicId: string
  requirementPackageIds: number[]
  requiresTesting: boolean
  riskLevelId: string
  typeId: string
  verificationMethod: string
}

export interface RequirementFormFieldsProps {
  /** Norm references created after initial fetch, merged into the options list */
  additionalNormReferences?: NormReferenceOption[]
  /** When true, area is required. Default: true */
  areaRequired?: boolean
  /** Extra fields rendered after risk level (e.g. needsReferenceId) */
  extraFieldsAfterRiskLevel?: ReactNode
  /** Unique prefix for field ids to avoid collisions when multiple forms exist */
  idPrefix?: string
  /** Layout for requirementPackages/norm-references: 'sidebar' renders in right column, 'bottom' renders below */
  layout?: 'sidebar' | 'bottom'
  /** Extra actions rendered after norm reference list (e.g. "Create" button) */
  normReferenceActions?: ReactNode
  onChange: (values: RequirementFormFieldValues) => void
  values: RequirementFormFieldValues
}

const richTags = {
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
}

const selectClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

const textareaClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 min-h-[100px]'

export default function RequirementFormFields({
  additionalNormReferences,
  areaRequired = true,
  extraFieldsAfterRiskLevel,
  idPrefix = '',
  layout = 'sidebar',
  normReferenceActions,
  onChange,
  values,
}: RequirementFormFieldsProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getOptionName = (o: TaxonomyOption) =>
    locale === 'sv' ? o.nameSv : o.nameEn

  const [areas, setAreas] = useState<AreaOption[]>([])
  const [categories, setCategories] = useState<TaxonomyOption[]>([])
  const [types, setTypes] = useState<TaxonomyOption[]>([])
  const [qualityCharacteristics, setQualityCharacteristics] = useState<
    QualityCharacteristicOption[]
  >([])
  const [riskLevels, setRiskLevels] = useState<TaxonomyOption[]>([])
  const [requirementPackages, setRequirementPackages] = useState<
    RequirementPackageOption[]
  >([])
  const [normReferences, setNormReferences] = useState<NormReferenceOption[]>(
    [],
  )
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())

  const allNormReferences = useMemo(() => {
    if (!additionalNormReferences?.length) return normReferences
    const existingIds = new Set(normReferences.map(nr => nr.id))
    return [
      ...normReferences,
      ...additionalNormReferences.filter(nr => !existingIds.has(nr.id)),
    ]
  }, [normReferences, additionalNormReferences])

  const fetchOptions = useCallback(async () => {
    const results = await Promise.allSettled([
      fetch('/api/requirement-areas'),
      fetch('/api/requirement-categories'),
      fetch('/api/requirement-types'),
      fetch('/api/requirement-packages'),
      fetch('/api/norm-references'),
      fetch('/api/risk-levels'),
    ])
    const [
      areasResult,
      catResult,
      typesResult,
      requirementPackagesResult,
      normRefsResult,
      riskLevelsResult,
    ] = results
    if (areasResult.status === 'fulfilled' && areasResult.value.ok)
      setAreas(
        ((await areasResult.value.json()) as { areas?: AreaOption[] }).areas ??
          [],
      )
    if (catResult.status === 'fulfilled' && catResult.value.ok)
      setCategories(
        ((await catResult.value.json()) as { categories?: TaxonomyOption[] })
          .categories ?? [],
      )
    if (typesResult.status === 'fulfilled' && typesResult.value.ok)
      setTypes(
        ((await typesResult.value.json()) as { types?: TaxonomyOption[] })
          .types ?? [],
      )
    if (
      requirementPackagesResult.status === 'fulfilled' &&
      requirementPackagesResult.value.ok
    )
      setRequirementPackages(
        (
          (await requirementPackagesResult.value.json()) as {
            requirementPackages?: RequirementPackageOption[]
          }
        ).requirementPackages ?? [],
      )
    if (normRefsResult.status === 'fulfilled' && normRefsResult.value.ok) {
      setNormReferences(
        (
          (await normRefsResult.value.json()) as {
            normReferences?: NormReferenceOption[]
          }
        ).normReferences ?? [],
      )
    }
    if (riskLevelsResult.status === 'fulfilled' && riskLevelsResult.value.ok)
      setRiskLevels(
        (
          (await riskLevelsResult.value.json()) as {
            riskLevels?: TaxonomyOption[]
          }
        ).riskLevels ?? [],
      )
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
    void fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    void fetchQualityCharacteristics(values.typeId)
  }, [values.typeId, fetchQualityCharacteristics])

  const handleChange = (
    key: keyof RequirementFormFieldValues,
    value: string | boolean,
  ) => {
    const next = { ...values, [key]: value }
    if (key === 'requiresTesting' && !value) {
      next.verificationMethod = ''
    }
    if (key === 'typeId') {
      next.qualityCharacteristicId = ''
    }
    onChange(next)
  }

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

  const fid = (name: string) => (idPrefix ? `${idPrefix}-${name}` : name)

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

  const helpPanel = (helpKey: string, field: string) => (
    <AnimatedHelpPanel id={`help-${field}`} isOpen={openHelp.has(field)}>
      {t.rich(helpKey, richTags)}
    </AnimatedHelpPanel>
  )

  const topLevelCategories = qualityCharacteristics.filter(c => !c.parentId)
  const childCategories = qualityCharacteristics.filter(c => c.parentId)
  const getQcName = (c: QualityCharacteristicOption) =>
    locale === 'sv' ? c.nameSv : c.nameEn

  const mainFields = (
    <>
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-sm font-medium" htmlFor={fid('areaId')}>
            {t('area')}
            {areaRequired ? <span aria-hidden="true"> *</span> : null}
          </label>
          {helpButton(fid('areaId'), t('area'))}
        </div>
        {helpPanel(
          areaRequired ? 'areaHelp' : 'areaHelpOptional',
          fid('areaId'),
        )}
        <select
          className={selectClassName}
          id={fid('areaId')}
          onChange={e => handleChange('areaId', e.target.value)}
          required={areaRequired}
          value={values.areaId}
        >
          <option value="">{t('area')}...</option>
          {areas.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {values.areaId && (
          <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
            {t('area')} — {t('areaOwner')}:{' '}
            {areas.find(a => String(a.id) === values.areaId)?.ownerName ?? '—'}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-sm font-medium" htmlFor={fid('description')}>
            {t('description')} <span aria-hidden="true">*</span>
          </label>
          {helpButton(fid('description'), t('description'))}
        </div>
        {helpPanel('descriptionHelp', fid('description'))}
        <textarea
          className={textareaClassName}
          id={fid('description')}
          onChange={e => handleChange('description', e.target.value)}
          required
          value={values.description}
        />
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label
            className="text-sm font-medium"
            htmlFor={fid('acceptanceCriteria')}
          >
            {t('acceptanceCriteria')}
          </label>
          {helpButton(fid('acceptanceCriteria'), t('acceptanceCriteria'))}
        </div>
        {helpPanel('acceptanceCriteriaHelp', fid('acceptanceCriteria'))}
        <textarea
          className={textareaClassName}
          id={fid('acceptanceCriteria')}
          onChange={e => handleChange('acceptanceCriteria', e.target.value)}
          value={values.acceptanceCriteria}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="text-sm font-medium" htmlFor={fid('categoryId')}>
              {t('category')}
            </label>
            {helpButton(fid('categoryId'), t('category'))}
          </div>
          {helpPanel('categoryHelp', fid('categoryId'))}
          <select
            className={selectClassName}
            id={fid('categoryId')}
            onChange={e => handleChange('categoryId', e.target.value)}
            value={values.categoryId}
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
            <label className="text-sm font-medium" htmlFor={fid('typeId')}>
              {t('type')}
            </label>
            {helpButton(fid('typeId'), t('type'))}
          </div>
          {helpPanel('typeHelp', fid('typeId'))}
          <select
            className={selectClassName}
            id={fid('typeId')}
            onChange={e => handleChange('typeId', e.target.value)}
            value={values.typeId}
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
              htmlFor={fid('qualityCharacteristicId')}
            >
              {t('qualityCharacteristic')}
            </label>
            {helpButton(
              fid('qualityCharacteristicId'),
              t('qualityCharacteristic'),
            )}
          </div>
          {helpPanel(
            'qualityCharacteristicHelp',
            fid('qualityCharacteristicId'),
          )}
          <select
            className={selectClassName}
            id={fid('qualityCharacteristicId')}
            onChange={e =>
              handleChange('qualityCharacteristicId', e.target.value)
            }
            value={values.qualityCharacteristicId}
          >
            <option value="">{t('qualityCharacteristic')}...</option>
            {topLevelCategories.map(tc => (
              <optgroup key={tc.id} label={getQcName(tc)}>
                {childCategories
                  .filter(c => c.parentId === tc.id)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {getQcName(c)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="text-sm font-medium" htmlFor={fid('riskLevelId')}>
              {t('riskLevel')}
            </label>
            {helpButton(fid('riskLevelId'), t('riskLevel'))}
          </div>
          {helpPanel('riskLevelHelp', fid('riskLevelId'))}
          <select
            className={selectClassName}
            id={fid('riskLevelId')}
            onChange={e => handleChange('riskLevelId', e.target.value)}
            value={values.riskLevelId}
          >
            <option value="">{t('riskLevel')}...</option>
            {riskLevels.map(rl => (
              <option key={rl.id} value={rl.id}>
                {getOptionName(rl)}
              </option>
            ))}
          </select>
        </div>
        {extraFieldsAfterRiskLevel}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            checked={values.requiresTesting}
            className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
            onChange={e => handleChange('requiresTesting', e.target.checked)}
            type="checkbox"
          />
          {t('requiresTesting')}
        </label>
        {helpButton(fid('requiresTesting'), t('requiresTesting'))}
      </div>
      {helpPanel('requiresTestingHelp', fid('requiresTesting'))}

      {values.requiresTesting && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label
              className="text-sm font-medium"
              htmlFor={fid('verificationMethod')}
            >
              {t('verificationMethod')} <span aria-hidden="true">*</span>
            </label>
            {helpButton(fid('verificationMethod'), t('verificationMethod'))}
          </div>
          {helpPanel('verificationMethodHelp', fid('verificationMethod'))}
          <textarea
            className={textareaClassName}
            id={fid('verificationMethod')}
            onChange={e => handleChange('verificationMethod', e.target.value)}
            required
            value={values.verificationMethod}
          />
        </div>
      )}
    </>
  )

  const requirementPackagesFieldset = requirementPackages.length > 0 && (
    <fieldset className="border-0 m-0 p-0">
      <div className="flex items-center gap-1.5 mb-1">
        <legend className="text-sm font-medium contents">
          {t('requirementPackage')}
        </legend>
        {helpButton(fid('requirementPackage'), t('requirementPackage'))}
      </div>
      {helpPanel('requirementPackageHelp', fid('requirementPackage'))}
      <div className="space-y-1.5 rounded-xl border bg-white dark:bg-secondary-800/50 p-3">
        {requirementPackages.map(s => (
          <label
            className="flex items-center gap-2 text-sm cursor-pointer"
            key={s.id}
          >
            <input
              checked={values.requirementPackageIds.includes(s.id)}
              className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
              onChange={e => {
                const checked = e.target.checked
                onChange({
                  ...values,
                  requirementPackageIds: checked
                    ? [...values.requirementPackageIds, s.id]
                    : values.requirementPackageIds.filter(id => id !== s.id),
                })
              }}
              type="checkbox"
            />
            {getOptionName(s)}
          </label>
        ))}
      </div>
    </fieldset>
  )

  const normReferencesFieldset = (
    <fieldset className="border-0 m-0 p-0">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <legend className="text-sm font-medium contents">
            {t('normReferences')}
          </legend>
          {helpButton(fid('normReferences'), t('normReferences'))}
        </div>
        {normReferenceActions}
      </div>
      {helpPanel('normReferencesHelp', fid('normReferences'))}
      {allNormReferences.length > 0 && (
        <div className="space-y-1.5 rounded-xl border bg-white dark:bg-secondary-800/50 p-3 max-h-56 overflow-y-auto pr-1">
          {allNormReferences.map(nr => (
            <label
              className="flex items-center gap-2 text-sm cursor-pointer"
              key={nr.id}
            >
              <input
                checked={values.normReferenceIds.includes(nr.id)}
                className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                onChange={e => {
                  const checked = e.target.checked
                  onChange({
                    ...values,
                    normReferenceIds: checked
                      ? [...values.normReferenceIds, nr.id]
                      : values.normReferenceIds.filter(id => id !== nr.id),
                  })
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
    </fieldset>
  )

  if (layout === 'bottom') {
    return (
      <div className="space-y-5">
        {mainFields}
        <div className="grid gap-5 lg:grid-cols-2">
          {requirementPackagesFieldset && (
            <fieldset className="rounded-2xl border p-4">
              <legend className="px-1 text-sm font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {t('requirementPackage')}
                  {helpButton(
                    fid('requirementPackage-legend'),
                    t('requirementPackage'),
                  )}
                </span>
              </legend>
              {helpPanel(
                'requirementPackageHelp',
                fid('requirementPackage-legend'),
              )}
              <div className="mt-2 space-y-2">
                {requirementPackages.map(s => (
                  <label className="flex items-center gap-2 text-sm" key={s.id}>
                    <input
                      checked={values.requirementPackageIds.includes(s.id)}
                      className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                      onChange={e => {
                        const checked = e.target.checked
                        onChange({
                          ...values,
                          requirementPackageIds: checked
                            ? [...values.requirementPackageIds, s.id]
                            : values.requirementPackageIds.filter(
                                id => id !== s.id,
                              ),
                        })
                      }}
                      type="checkbox"
                    />
                    {getOptionName(s)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="rounded-2xl border p-4">
            <legend className="px-1 text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                {t('normReferences')}
                {helpButton(fid('normReferences-legend'), t('normReferences'))}
              </span>
            </legend>
            {helpPanel('normReferencesHelp', fid('normReferences-legend'))}
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
              {normReferences.map(nr => (
                <label className="flex items-start gap-2 text-sm" key={nr.id}>
                  <input
                    checked={values.normReferenceIds.includes(nr.id)}
                    className="mt-0.5 rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                    onChange={e => {
                      const checked = e.target.checked
                      onChange({
                        ...values,
                        normReferenceIds: checked
                          ? [...values.normReferenceIds, nr.id]
                          : values.normReferenceIds.filter(id => id !== nr.id),
                      })
                    }}
                    type="checkbox"
                  />
                  <span>
                    <span className="font-mono text-xs text-secondary-500">
                      {nr.normReferenceId}
                    </span>{' '}
                    {nr.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
      <div className="space-y-5">{mainFields}</div>
      <div className="self-start lg:w-64 space-y-6">
        {requirementPackagesFieldset}
        {normReferencesFieldset}
      </div>
    </div>
  )
}
