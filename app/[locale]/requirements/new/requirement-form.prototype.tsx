'use client'

// Throwaway: baseline geometry + six alternatives on /requirements/new?variant=.
// Question: compare field widths, purpose visibility and inline/modal selection.
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import FormActionRow from '@/components/FormActionRow'
import PrototypeRequirementAssociations from '@/components/PrototypeRequirementAssociations'
import PrototypeVariantSwitcher from '@/components/PrototypeVariantSwitcher'
import ReferenceDataStatus from '@/components/ReferenceDataStatus'
import RequirementFormFields, {
  type RequirementFormFieldValues,
} from '@/components/RequirementFormFields'
import { useTaxonomyOptions } from '@/hooks/useTaxonomyOptions'
import { devMarker } from '@/lib/developer-mode-markers'
import './requirement-form.prototype.css'

const KEYS = ['baseline', 'A', 'B', 'C', 'D', 'E.1', 'E.2'] as const
type Variant = (typeof KEYS)[number]
const EMPTY: RequirementFormFieldValues = {
  acceptanceCriteria: '',
  areaId: '',
  categoryId: '',
  description: '',
  normReferenceIds: [],
  priorityLevelId: '',
  qualityCharacteristicId: '',
  requirementPackageIds: [],
  typeId: '',
  verifiable: false,
  verificationMethod: '',
}

export default function RequirementFormPrototype() {
  const t = useTranslations('prototype1349')
  const tr = useTranslations('requirement')
  const tc = useTranslations('common')
  const router = useRouter()
  const params = useSearchParams()
  const requested =
    params.get('variant') === 'E' ? 'E.1' : params.get('variant')
  const variant: Variant = KEYS.includes(requested as Variant)
    ? (requested as Variant)
    : 'A'
  const modalVariant = variant === 'E.1' || variant === 'E.2'
  const variantMessageKey = variant.replace('.', '')
  const [values, setValues] = useState<RequirementFormFieldValues>(EMPTY)
  const [destination, setDestination] = useState<'inline' | 'page'>('inline')
  const [action, setAction] = useState('')
  const [review, setReview] = useState(false)
  const [newNorm, setNewNorm] = useState(false)
  const [normName, setNormName] = useState('')
  const [extraNorms, setExtraNorms] = useState<
    { id: number; name: string; normReferenceId: string }[]
  >([])
  const taxonomy = useTaxonomyOptions(values.typeId)
  const variants = KEYS.map(key => ({
    key,
    name: t(`variants.${key.replace('.', '')}.name`),
  }))
  const changeVariant = useCallback(
    (key: string) => {
      const query = new URLSearchParams(params.toString())
      query.set('variant', key)
      router.replace(`?${query}`, { scroll: false })
    },
    [params, router],
  )

  const reset = () => {
    setValues(EMPTY)
    setDestination('inline')
    setExtraNorms([])
    setNewNorm(false)
    setNormName('')
    setAction(t('resetDone'))
  }

  const actions = (
    <>
      <button
        className="btn-primary"
        disabled={!taxonomy.readiness.canSave}
        type="submit"
      >
        {tc('save')}
      </button>
      <button
        className="prototype-1349-button"
        onClick={() => setAction(t('cancelDone'))}
        type="button"
      >
        {tc('cancel')}
      </button>
    </>
  )
  const destinations = (
    <div
      className="prototype-1349-destination"
      {...devMarker({ name: 'prototype save destination', value: destination })}
    >
      <span>{tr('afterSave')}</span>
      <div className="prototype-1349-segments">
        {(['inline', 'page'] as const).map(value => (
          <button
            aria-pressed={destination === value}
            key={value}
            onClick={() => setDestination(value)}
            type="button"
          >
            {tr(value === 'inline' ? 'afterSaveInline' : 'afterSavePage')}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div
      className="prototype-1349 section-padding px-4 sm:px-6 lg:px-8"
      data-prototype-variant={variant}
    >
      <div className="container-custom">
        <header
          className="prototype-1349-banner"
          {...devMarker({
            name: 'prototype review controls',
            value: 'issue 1349',
          })}
        >
          <div>
            <strong>{t('title')}</strong>
            <p>{t('notice')}</p>
          </div>
          <div className="prototype-1349-tools">
            <button
              aria-expanded={review}
              className="prototype-1349-button"
              onClick={() => setReview(!review)}
              type="button"
            >
              {t('review')}
            </button>
            <button
              className="prototype-1349-button"
              onClick={() => {
                setValues({
                  ...values,
                  description: t('sampleText'),
                  acceptanceCriteria: t('sampleCriteria'),
                  verifiable: true,
                  verificationMethod: t('sampleMethod'),
                })
                setAction(t('sampleLoaded'))
              }}
              type="button"
            >
              {t('longText')}
            </button>
            <button
              className="prototype-1349-button"
              onClick={reset}
              type="button"
            >
              {t('reset')}
            </button>
          </div>
        </header>
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100 mb-6">
          {tr('newRequirement')}
        </h1>
        <p aria-live="polite" className="prototype-1349-verdict">
          <strong>{t(`variants.${variantMessageKey}.name`)}</strong> —{' '}
          {t(`variants.${variantMessageKey}.summary`)}
        </p>
        <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-6">
          <ReferenceDataStatus
            id="prototype-reference-data"
            readiness={taxonomy.readiness}
          />
          <form
            onSubmit={event => {
              event.preventDefault()
              setAction(
                t('saveDone', {
                  destination: tr(
                    destination === 'inline'
                      ? 'afterSaveInline'
                      : 'afterSavePage',
                  ),
                }),
              )
            }}
          >
            <div
              className="prototype-1349-fields"
              {...devMarker({
                name: 'prototype requirement layout',
                value: variant,
              })}
            >
              <RequirementFormFields
                additionalNormReferences={extraNorms}
                layout="sidebar"
                normReferenceActions={
                  <button
                    className={`prototype-1349-new text-sm text-primary-700 dark:text-primary-300 ${variant === 'baseline' ? 'min-h-11' : 'min-h-6'}`}
                    onClick={() => setNewNorm(!newNorm)}
                    type="button"
                  >
                    + {tc('create')}
                  </button>
                }
                onChange={setValues}
                prototypeNormFieldset={
                  modalVariant ? (
                    <PrototypeRequirementAssociations
                      disabled={!taxonomy.readiness.canSave}
                      kind="norms"
                      modal
                      norms={[...taxonomy.normReferences, ...extraNorms]}
                      onChange={ids =>
                        setValues(current => ({
                          ...current,
                          normReferenceIds: ids,
                        }))
                      }
                      packages={[]}
                      selected={values.normReferenceIds}
                      table={variant === 'E.2'}
                    />
                  ) : undefined
                }
                prototypePackageFieldset={
                  <PrototypeRequirementAssociations
                    disabled={!taxonomy.readiness.canSave}
                    kind="packages"
                    modal={modalVariant}
                    norms={[]}
                    onChange={ids =>
                      setValues(current => ({
                        ...current,
                        requirementPackageIds: ids,
                      }))
                    }
                    packages={taxonomy.requirementPackages}
                    selected={values.requirementPackageIds}
                    table={variant === 'E.2'}
                  />
                }
                referenceDataReadiness={taxonomy.readiness}
                referenceDataStatusId="prototype-reference-data"
                taxonomyOptions={taxonomy}
                values={values}
              />
            </div>
            {newNorm && (
              <div className="prototype-1349-local-norm">
                <label htmlFor="prototype-norm-name">{t('normName')}</label>
                <input
                  id="prototype-norm-name"
                  onChange={event => setNormName(event.target.value)}
                  value={normName}
                />
                <button
                  className="prototype-1349-button"
                  disabled={!normName.trim()}
                  onClick={() => {
                    const id = -extraNorms.length - 1
                    setExtraNorms([
                      ...extraNorms,
                      {
                        id,
                        name: normName.trim(),
                        normReferenceId: `PROTOTYPE-${-id}`,
                      },
                    ])
                    setValues({
                      ...values,
                      normReferenceIds: [...values.normReferenceIds, id],
                    })
                    setNormName('')
                    setNewNorm(false)
                    setAction(t('normAdded'))
                  }}
                  type="button"
                >
                  {t('addNorm')}
                </button>
                <p>{t('localOnly')}</p>
              </div>
            )}
            <div
              className={`prototype-1349-footer ${variant === 'baseline' ? 'prototype-1349-footer-baseline' : ''}`}
              {...devMarker({ name: 'prototype form actions', value: variant })}
            >
              {variant === 'baseline' ? (
                <>
                  <FormActionRow>{actions}</FormActionRow>
                  {destinations}
                </>
              ) : (
                <>
                  <p className="prototype-1349-required">{t('required')}</p>
                  <div className="prototype-1349-action-line">
                    {destinations}
                    <div className="prototype-1349-actions">{actions}</div>
                  </div>
                </>
              )}
            </div>
            <p className="prototype-1349-result" role="status">
              {action || t('localOnly')}
            </p>
          </form>
        </div>
        {review && (
          <aside aria-label={t('review')} className="prototype-1349-review">
            <div className="prototype-1349-review-title">
              <h2>{t('review')}</h2>
              <button
                className="prototype-1349-button"
                onClick={() => setReview(false)}
                type="button"
              >
                {tc('close')}
              </button>
            </div>
            <h3>{t('changes')}</h3>
            <p>{t('purposeGuidance')}</p>
            <ul>
              {[1, 2, 3].map(n => (
                <li key={n}>{t(`variants.${variantMessageKey}.change${n}`)}</li>
              ))}
            </ul>
            <h3>{t('checkTitle')}</h3>
            <ol>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                <li key={n}>{t(`checks.${n}`)}</li>
              ))}
            </ol>
            <p>{t('scope')}</p>
            <h3>{t('state')}</h3>
            <pre>
              {JSON.stringify(
                {
                  variant,
                  destination,
                  values,
                  extraNorms,
                  lastAction: action,
                },
                null,
                2,
              )}
            </pre>
          </aside>
        )}
      </div>
      <PrototypeVariantSwitcher
        current={variant}
        label={t('variant')}
        nextLabel={t('next')}
        onChange={changeVariant}
        previousLabel={t('previous')}
        variants={variants}
      />
    </div>
  )
}
