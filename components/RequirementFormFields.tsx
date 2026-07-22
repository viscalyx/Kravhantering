'use client'

import { ListChecks } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import FieldHelpButton from '@/components/FieldHelpButton'
import FormModal from '@/components/FormModal'
import QualityCharacteristicSelectOptions from '@/components/QualityCharacteristicSelectOptions'
import RequiredFieldMarker from '@/components/RequiredFieldMarker'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'
import StatusBadge from '@/components/StatusBadge'
import type {
  NormReferenceOption,
  TaxonomyOption,
  TaxonomyOptions,
} from '@/hooks/useTaxonomyOptions'

export interface RequirementFormFieldValues {
  acceptanceCriteria: string
  areaId: string
  categoryId: string
  description: string
  normReferenceIds: number[]
  priorityLevelId: string
  qualityCharacteristicId: string
  requirementPackageIds: number[]
  typeId: string
  verifiable: boolean
  verificationMethod: string
}

export interface RequirementFormFieldsProps {
  /** Norm references created after initial fetch, merged into the options list */
  additionalNormReferences?: NormReferenceOption[]
  /** When true, area is required. Default: true */
  areaRequired?: boolean
  /** Extra fields rendered after priority (e.g. needsReferenceId) */
  extraFieldsAfterPriorityLevel?: ReactNode
  /** Unique prefix for field ids to avoid collisions when multiple forms exist */
  idPrefix?: string
  /** Layout for requirementPackages/norm-references: 'sidebar' renders in right column, 'bottom' renders below */
  layout?: 'sidebar' | 'bottom'
  /** Extra actions rendered after norm reference list (e.g. "Create" button) */
  normReferenceActions?: ReactNode
  onChange: (values: RequirementFormFieldValues) => void
  /** Hide area for contexts where requirements are not owned by a requirement area */
  showArea?: boolean
  /** Hide requirement-package selection for contexts outside the requirements library */
  showRequirementPackages?: boolean
  /** Taxonomy option arrays loaded by the form container via useTaxonomyOptions */
  taxonomyOptions: TaxonomyOptions
  values: RequirementFormFieldValues
}

const richTags = {
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
}

const selectClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

const textareaClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 min-h-25'

const associationFieldsetClassName = 'm-0 flex min-h-0 flex-col border-0 p-0'

const associationListClassName =
  'min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-xl border bg-white p-3 pr-1 dark:bg-secondary-800/50'

export default function RequirementFormFields({
  additionalNormReferences,
  areaRequired = true,
  extraFieldsAfterPriorityLevel,
  idPrefix = '',
  layout = 'sidebar',
  normReferenceActions,
  onChange,
  showArea = true,
  showRequirementPackages = true,
  taxonomyOptions,
  values,
}: RequirementFormFieldsProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const tNormReference = useTranslations('normReference')
  const locale = useLocale()

  const {
    areas,
    categories,
    normReferences,
    qualityCharacteristics,
    requirementPackages,
    priorityLevels,
    types,
  } = taxonomyOptions

  const getOptionName = (o: TaxonomyOption) =>
    locale === 'sv' ? o.nameSv : o.nameEn
  const getPriorityName = (o: (typeof priorityLevels)[number]) =>
    [o.code, getOptionName(o)].filter(Boolean).join(' – ')
  const getPriorityDescription = (o: (typeof priorityLevels)[number]) =>
    locale === 'sv' ? o.descriptionSv : o.descriptionEn
  const getPriorityAssessmentCriteria = (o: (typeof priorityLevels)[number]) =>
    locale === 'sv' ? o.assessmentCriteriaSv : o.assessmentCriteriaEn

  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const [showPriorityScale, setShowPriorityScale] = useState(false)
  const mainFieldsRef = useRef<HTMLDivElement>(null)
  const priorityScaleButtonRef = useRef<HTMLButtonElement>(null)
  const [associationPanelHeight, setAssociationPanelHeight] = useState<
    number | null
  >(null)

  useEffect(() => {
    if (layout !== 'sidebar') {
      setAssociationPanelHeight(null)
      return
    }

    const mainFieldsNode = mainFieldsRef.current
    if (!mainFieldsNode) return

    let animationFrame: number | null = null
    const updatePanelHeight = () => {
      const nextHeight = Math.ceil(
        mainFieldsNode.getBoundingClientRect().height,
      )
      if (nextHeight <= 0) return
      setAssociationPanelHeight(current =>
        current === nextHeight ? current : nextHeight,
      )
    }
    const schedulePanelHeightUpdate = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
      animationFrame = window.requestAnimationFrame(updatePanelHeight)
    }

    schedulePanelHeightUpdate()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedulePanelHeightUpdate)
    resizeObserver?.observe(mainFieldsNode)
    window.addEventListener('resize', schedulePanelHeightUpdate)

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
      resizeObserver?.disconnect()
      window.removeEventListener('resize', schedulePanelHeightUpdate)
    }
  }, [layout])

  const allNormReferences = useMemo(() => {
    if (!additionalNormReferences?.length) return normReferences
    const existingIds = new Set(normReferences.map(nr => nr.id))
    return [
      ...normReferences,
      ...additionalNormReferences.filter(nr => !existingIds.has(nr.id)),
    ]
  }, [normReferences, additionalNormReferences])
  const renderNormReferenceLabel = (nr: NormReferenceOption) => (
    <span>
      <span className="font-mono text-xs text-secondary-500 dark:text-secondary-400">
        {nr.normReferenceId}
      </span>{' '}
      {nr.name}
      {nr.isArchived ? (
        <span className="ml-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          {tNormReference('archived')}
        </span>
      ) : null}
    </span>
  )

  const associationSidebarStyle = associationPanelHeight
    ? ({
        '--requirement-association-height': `${associationPanelHeight}px`,
      } as CSSProperties)
    : undefined
  const associationGridClassName = showRequirementPackages
    ? 'lg:grid-cols-[minmax(0,1fr)_minmax(32rem,34rem)]'
    : 'lg:grid-cols-[minmax(0,1fr)_minmax(20rem,22rem)]'
  const associationSidebarClassName = showRequirementPackages
    ? 'grid min-h-0 gap-6 sm:grid-cols-2 lg:h-(--requirement-association-height) lg:max-h-(--requirement-association-height) lg:w-full lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden'
    : 'grid min-h-0 gap-6 lg:h-(--requirement-association-height) lg:max-h-(--requirement-association-height) lg:w-full lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden'

  const handleChange = (
    key: keyof RequirementFormFieldValues,
    value: string | boolean,
  ) => {
    const next = { ...values, [key]: value }
    if (key === 'verifiable' && !value) {
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

  const helpButton = (
    field: string,
    label: string,
    buttonRef?: Ref<HTMLButtonElement>,
  ) => (
    <FieldHelpButton
      controls={`help-${field}`}
      expanded={openHelp.has(field)}
      label={`${tc('help')}: ${label}`}
      onClick={() => toggleHelp(field)}
      ref={buttonRef}
    />
  )

  const helpPanel = (helpKey: string, field: string) => (
    <AnimatedHelpPanel id={`help-${field}`} isOpen={openHelp.has(field)}>
      {t.rich(helpKey, richTags)}
    </AnimatedHelpPanel>
  )

  const priorityLevelFieldId = fid('priorityLevelId')

  const selectedAreaOwnerName = values.areaId
    ? areas.find(a => String(a.id) === values.areaId)?.ownerHsaId
    : null
  const selectedPriorityLevel = values.priorityLevelId
    ? priorityLevels.find(
        priorityLevel => String(priorityLevel.id) === values.priorityLevelId,
      )
    : null
  const selectedPriorityDescription = selectedPriorityLevel
    ? getPriorityDescription(selectedPriorityLevel)
    : null
  const selectedPriorityAssessmentCriteria = selectedPriorityLevel
    ? getPriorityAssessmentCriteria(selectedPriorityLevel)
    : null
  const selectedPriorityTooltip = selectedPriorityLevel
    ? [
        `${t('priorityLevelDescriptionLabel')}: ${selectedPriorityDescription ?? '—'}`,
        `${t('priorityLevelAssessmentCriteriaLabel')}: ${selectedPriorityAssessmentCriteria ?? '—'}`,
      ].join('\n')
    : null

  const mainFields = (
    <>
      {showArea ? (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="text-sm font-medium" htmlFor={fid('areaId')}>
              {t('area')}
              {areaRequired ? <RequiredFieldMarker /> : null}
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
              {t('area')} — {t('areaOwner')}: {selectedAreaOwnerName ?? '—'}
            </p>
          )}
        </div>
      ) : null}

      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-sm font-medium" htmlFor={fid('description')}>
            {t('description')}
            <RequiredFieldMarker />
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

      <div className={!values.typeId ? 'opacity-60' : undefined}>
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
        {helpPanel('qualityCharacteristicHelp', fid('qualityCharacteristicId'))}
        <select
          className={`${selectClassName} disabled:cursor-not-allowed disabled:opacity-70`}
          disabled={!values.typeId}
          id={fid('qualityCharacteristicId')}
          onChange={e =>
            handleChange('qualityCharacteristicId', e.target.value)
          }
          value={values.qualityCharacteristicId}
        >
          <option value="">{t('qualityCharacteristic')}...</option>
          <QualityCharacteristicSelectOptions
            locale={locale}
            options={qualityCharacteristics}
          />
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label
              className="text-sm font-medium"
              htmlFor={fid('priorityLevelId')}
            >
              {t('priorityLevel')}
            </label>
            {helpButton(priorityLevelFieldId, t('priorityLevel'))}
            <button
              aria-label={t('priorityLevelScaleAction')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
              onClick={() => setShowPriorityScale(true)}
              ref={priorityScaleButtonRef}
              title={t('priorityLevelScaleAction')}
              type="button"
            >
              <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
          {helpPanel('priorityLevelHelp', priorityLevelFieldId)}
          <RequirementPackagePurposeTooltip
            maxWidth={360}
            purposeAndScope={selectedPriorityTooltip}
            wrapperClassName="block w-full"
          >
            <select
              className={selectClassName}
              id={priorityLevelFieldId}
              onChange={e => handleChange('priorityLevelId', e.target.value)}
              value={values.priorityLevelId}
            >
              <option value="">{t('priorityLevel')}...</option>
              {priorityLevels.map(rl => (
                <option key={rl.id} value={rl.id}>
                  {getPriorityName(rl)}
                </option>
              ))}
            </select>
          </RequirementPackagePurposeTooltip>
          <FormModal
            maxWidthClassName="max-w-5xl"
            onClose={() => setShowPriorityScale(false)}
            open={showPriorityScale}
            title={t('priorityLevelScaleHeading')}
            titleId={`${priorityLevelFieldId}-scale-title`}
          >
            {priorityLevels.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {priorityLevels.map(priorityLevel => (
                  <article
                    className="rounded-xl border border-secondary-200 bg-secondary-50/70 p-4 dark:border-secondary-700 dark:bg-secondary-800/50"
                    key={priorityLevel.id}
                  >
                    <h3>
                      <StatusBadge
                        color={priorityLevel.color}
                        iconName={priorityLevel.iconName}
                        label={getPriorityName(priorityLevel)}
                      />
                    </h3>
                    <dl className="mt-3 space-y-3 text-sm leading-relaxed text-secondary-700 dark:text-secondary-200">
                      <div>
                        <dt className="font-medium text-secondary-950 dark:text-secondary-50">
                          {t('priorityLevelDescriptionLabel')}
                        </dt>
                        <dd className="mt-1">
                          {getPriorityDescription(priorityLevel)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-secondary-950 dark:text-secondary-50">
                          {t('priorityLevelAssessmentCriteriaLabel')}
                        </dt>
                        <dd className="mt-1">
                          {getPriorityAssessmentCriteria(priorityLevel)}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-secondary-600 dark:text-secondary-300">
                {t('priorityLevelScaleEmpty')}
              </p>
            )}
          </FormModal>
        </div>
        {extraFieldsAfterPriorityLevel}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            checked={values.verifiable}
            className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
            onChange={e => handleChange('verifiable', e.target.checked)}
            type="checkbox"
          />
          {t('verifiable')}
        </label>
        {helpButton(fid('verifiable'), t('verifiable'))}
      </div>
      {helpPanel('verifiableHelp', fid('verifiable'))}

      {values.verifiable && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label
              className="text-sm font-medium"
              htmlFor={fid('verificationMethod')}
            >
              {t('verificationMethod')}
              <RequiredFieldMarker />
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

  const requirementPackagesFieldset = showRequirementPackages &&
    requirementPackages.length > 0 && (
      <fieldset className={associationFieldsetClassName}>
        <div className="flex items-center gap-1.5 mb-1">
          <legend className="text-sm font-medium contents">
            {t('requirementPackage')}
          </legend>
          {helpButton(fid('requirementPackage'), t('requirementPackage'))}
        </div>
        {helpPanel('requirementPackageHelp', fid('requirementPackage'))}
        <div className={associationListClassName}>
          {requirementPackages.map(s => (
            <RequirementPackagePurposeTooltip
              key={s.id}
              maxWidth={320}
              purposeAndScope={s.purposeAndScope}
              wrapperClassName="flex min-w-0"
            >
              <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm">
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
                <span className="min-w-0 wrap-break-word">{s.name}</span>
              </label>
            </RequirementPackagePurposeTooltip>
          ))}
        </div>
      </fieldset>
    )

  const normReferencesFieldset = (
    <fieldset className={associationFieldsetClassName}>
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
      <div className={associationListClassName}>
        {allNormReferences.map(nr => {
          const isSelected = values.normReferenceIds.includes(nr.id)
          const isDisabled = nr.isArchived === true && !isSelected
          return (
            <label
              className={`flex items-center gap-2 text-sm ${
                isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
              key={nr.id}
            >
              <input
                checked={isSelected}
                className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                disabled={isDisabled}
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
              {renderNormReferenceLabel(nr)}
            </label>
          )
        })}
      </div>
    </fieldset>
  )

  if (layout === 'bottom') {
    return (
      <div className="space-y-5">
        {mainFields}
        <div
          className={`grid gap-5 ${
            showRequirementPackages ? 'lg:grid-cols-2' : ''
          }`}
        >
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
                  <RequirementPackagePurposeTooltip
                    key={s.id}
                    maxWidth={360}
                    purposeAndScope={s.purposeAndScope}
                    wrapperClassName="flex min-w-0"
                  >
                    <label className="flex min-w-0 items-center gap-2 text-sm">
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
                      <span className="min-w-0 wrap-break-word">{s.name}</span>
                    </label>
                  </RequirementPackagePurposeTooltip>
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
              {allNormReferences.map(nr => {
                const isSelected = values.normReferenceIds.includes(nr.id)
                const isDisabled = nr.isArchived === true && !isSelected
                return (
                  <label
                    className={`flex items-start gap-2 text-sm ${
                      isDisabled
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-pointer'
                    }`}
                    key={nr.id}
                  >
                    <input
                      checked={isSelected}
                      className="mt-0.5 rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                      disabled={isDisabled}
                      onChange={e => {
                        const checked = e.target.checked
                        onChange({
                          ...values,
                          normReferenceIds: checked
                            ? [...values.normReferenceIds, nr.id]
                            : values.normReferenceIds.filter(
                                id => id !== nr.id,
                              ),
                        })
                      }}
                      type="checkbox"
                    />
                    {renderNormReferenceLabel(nr)}
                  </label>
                )
              })}
            </div>
          </fieldset>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div
        className={`grid grid-cols-1 items-stretch gap-6 ${associationGridClassName}`}
      >
        <div className="self-start space-y-5" ref={mainFieldsRef}>
          {mainFields}
        </div>
        <div
          className={associationSidebarClassName}
          style={associationSidebarStyle}
        >
          {requirementPackagesFieldset}
          {normReferencesFieldset}
        </div>
      </div>
    </div>
  )
}
