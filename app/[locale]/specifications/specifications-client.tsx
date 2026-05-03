'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { generateSpecificationSlug, normalizeSlugInput } from '@/lib/slug'

const REQUIREMENT_SPECIFICATIONS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementsSpecifications.overview.body',
      headingKey: 'requirementsSpecifications.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementsSpecifications.create.body',
      headingKey: 'requirementsSpecifications.create.heading',
    },
  ],
  titleKey: 'requirementsSpecifications.title',
}

interface TaxonomyItem {
  id: number
  nameEn: string
  nameSv: string
}

interface RequirementArea {
  id: number
  name: string
}

interface Specification {
  businessNeedsReference: string | null
  id: number
  implementationType: TaxonomyItem | null
  itemCount: number
  lifecycleStatus: TaxonomyItem | null
  name: string
  requirementAreas: RequirementArea[]
  responsibilityArea: TaxonomyItem | null
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
  specificationResponsibilityAreaId: number | null
  uniqueId: string
}

const REQUIREMENT_AREA_PILL_ROW_HEIGHT = 24

function RequirementAreaPills({ areas }: { areas: RequirementArea[] }) {
  const tc = useTranslations('common')
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const updateCanExpand = useCallback(() => {
    const list = listRef.current
    if (!list) {
      return
    }

    const nextCanExpand =
      list.scrollHeight > REQUIREMENT_AREA_PILL_ROW_HEIGHT + 1
    setCanExpand(nextCanExpand)
    if (!nextCanExpand) {
      setExpanded(false)
    }
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }

    updateCanExpand()
    const frame = window.requestAnimationFrame(updateCanExpand)

    const handleResize = () => updateCanExpand()
    window.addEventListener('resize', handleResize)

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateCanExpand)
    resizeObserver?.observe(list)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
    }
  }, [updateCanExpand])

  const toggleLabel = expanded ? tc('showLess') : tc('showMore')

  return (
    <div
      className={`flex gap-1 ${expanded ? 'items-start' : 'items-center'}`}
      data-specification-requirement-area-pills="true"
    >
      <div
        className={`flex min-w-0 flex-1 flex-wrap gap-1 ${expanded ? '' : 'max-h-6 overflow-hidden'}`}
        data-specification-requirement-area-pill-list="true"
        ref={listRef}
      >
        {areas.map(area => (
          <span
            className="inline-flex h-6 items-center whitespace-nowrap rounded-full border border-primary-200/80 bg-primary-50/80 px-2 text-[11px] font-medium text-primary-700 dark:border-primary-800/60 dark:bg-primary-950/30 dark:text-primary-300"
            data-specification-requirement-area-pill="true"
            key={area.id}
          >
            {area.name}
          </span>
        ))}
      </div>
      {canExpand ? (
        <button
          aria-expanded={expanded}
          aria-label={toggleLabel}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:text-primary-300 dark:hover:bg-primary-950/30"
          data-specification-requirement-area-pill-toggle="true"
          {...devMarker({
            context: 'specifications',
            name: 'table action',
            value: expanded
              ? 'collapse requirement areas'
              : 'expand requirement areas',
          })}
          onClick={() => setExpanded(value => !value)}
          title={toggleLabel}
          type="button"
        >
          {expanded ? (
            <ChevronUp
              aria-hidden="true"
              className="h-3.5 w-3.5"
              focusable={false}
            />
          ) : (
            <ChevronDown
              aria-hidden="true"
              className="h-3.5 w-3.5"
              focusable={false}
            />
          )}
        </button>
      ) : null}
    </div>
  )
}

export default function RequirementsSpecificationsClient() {
  useHelpContent(REQUIREMENT_SPECIFICATIONS_HELP)
  const t = useTranslations('specification')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()
  const tRef = useRef(t)
  tRef.current = t

  const getName = (spec: Specification) => spec.name
  const getTaxonomyName = (item: TaxonomyItem | null) =>
    item ? (locale === 'sv' ? item.nameSv : item.nameEn) : '—'
  const specificationTableColumnCount = 7

  const [specifications, setSpecifications] = useState<Specification[]>([])
  const [responsibilityAreas, setResponsibilityAreas] = useState<
    TaxonomyItem[]
  >([])
  const [implementationTypes, setImplementationTypes] = useState<
    TaxonomyItem[]
  >([])
  const [lifecycleStatuses, setLifecycleStatuses] = useState<TaxonomyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showSpinner, setShowSpinner] = useState(false)
  const spinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchIdRef = useRef(0)
  const isMountedRef = useRef(true)
  const [showForm, setShowForm] = useState(false)
  const [editSpec, setEditSpec] = useState<Specification | null>(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [form, setForm] = useState({
    name: '',
    uniqueId: '',
    specificationResponsibilityAreaId: '' as string,
    specificationImplementationTypeId: '' as string,
    specificationLifecycleStatusId: '' as string,
    businessNeedsReference: '',
  })
  const deferredNameFilter = useDeferredValue(nameFilter)
  const normalizedNameFilter = deferredNameFilter
    .trim()
    .toLocaleLowerCase(locale)
  const hasActiveNameFilter = nameFilter.trim().length > 0
  const filteredSpecifications = specifications.filter(spec =>
    getName(spec).toLocaleLowerCase(locale).includes(normalizedNameFilter),
  )

  const resetForm = () => ({
    name: '',
    uniqueId: '',
    specificationResponsibilityAreaId: '' as string,
    specificationImplementationTypeId: '' as string,
    specificationLifecycleStatusId: '' as string,
    businessNeedsReference: '',
  })

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
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
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

  const fetchSpecifications = useCallback(async () => {
    const localFetchId = ++fetchIdRef.current
    setLoading(true)
    setFetchError(null)
    if (spinnerTimerRef.current) clearTimeout(spinnerTimerRef.current)
    spinnerTimerRef.current = setTimeout(() => {
      if (isMountedRef.current && localFetchId === fetchIdRef.current) {
        setShowSpinner(true)
      }
    }, 200)
    try {
      const res = await apiFetch('/api/specifications')
      if (!res.ok) {
        const details = await readResponseMessage(res)
        throw new Error(
          details
            ? `${tRef.current('loadSpecificationsFailed')}: ${details}`
            : tRef.current('loadSpecificationsFailed'),
        )
      }

      if (isMountedRef.current && localFetchId === fetchIdRef.current) {
        setSpecifications(
          ((await res.json()) as { specifications?: Specification[] })
            .specifications ?? [],
        )
        setFetchError(null)
      }
    } catch (error) {
      console.error('Failed to load requirements specifications', error)
      if (isMountedRef.current && localFetchId === fetchIdRef.current) {
        setSpecifications([])
        setFetchError(
          error instanceof Error
            ? error.message
            : tRef.current('loadSpecificationsFailed'),
        )
      }
    } finally {
      if (localFetchId === fetchIdRef.current) {
        if (spinnerTimerRef.current) clearTimeout(spinnerTimerRef.current)
        spinnerTimerRef.current = null
        if (isMountedRef.current) {
          setShowSpinner(false)
          setLoading(false)
        }
      }
    }
  }, [])

  const fetchTaxonomies = useCallback(async () => {
    const loadTaxonomy = async <TBody,>(
      endpoint: string,
      label: string,
      pickItems: (body: TBody) => TaxonomyItem[] | undefined,
      setItems: (items: TaxonomyItem[]) => void,
    ) => {
      try {
        const response = await apiFetch(endpoint)
        if (!isMountedRef.current) return

        if (!response.ok) {
          setItems([])
          console.error(`Failed to load ${label}`, response.status)
          return
        }

        const body = (await response.json()) as TBody
        if (isMountedRef.current) {
          setItems(pickItems(body) ?? [])
        }
      } catch (error) {
        if (isMountedRef.current) {
          setItems([])
        }
        console.error(`Failed to load ${label}`, error)
      }
    }

    await Promise.all([
      loadTaxonomy(
        '/api/specification-responsibility-areas',
        'specification responsibility areas',
        (body: { areas?: TaxonomyItem[] }) => body.areas,
        setResponsibilityAreas,
      ),
      loadTaxonomy(
        '/api/specification-implementation-types',
        'specification implementation types',
        (body: { types?: TaxonomyItem[] }) => body.types,
        setImplementationTypes,
      ),
      loadTaxonomy(
        '/api/specification-lifecycle-statuses',
        'specification lifecycle statuses',
        (body: { statuses?: TaxonomyItem[] }) => body.statuses,
        setLifecycleStatuses,
      ),
    ])
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current)
        spinnerTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    void fetchSpecifications()
    void fetchTaxonomies()
  }, [fetchSpecifications, fetchTaxonomies])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setSlugError(null)
    setSaveError(null)
    try {
      const method = editSpec ? 'PUT' : 'POST'
      const url = editSpec
        ? `/api/specifications/${editSpec.uniqueId}`
        : '/api/specifications'
      const res = await apiFetch(url, {
        method,
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
      })
      if (res.status === 409) {
        setSlugError(t('uniqueIdTaken'))
        return
      }
      if (!res.ok) {
        const details = await readResponseMessage(res)
        setSaveError(
          details ? `${t('saveFailed')}: ${details}` : t('saveFailed'),
        )
        return
      }
      setShowForm(false)
      setEditSpec(null)
      setOpenHelp(new Set())
      setSlugEdited(false)
      setForm(resetForm())
      void fetchSpecifications()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('saveFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (spec: Specification) => {
    setEditSpec(spec)
    setOpenHelp(new Set())
    setSlugEdited(true)
    setSlugError(null)
    setSaveError(null)
    setForm({
      name: spec.name,
      uniqueId: spec.uniqueId,
      specificationResponsibilityAreaId:
        spec.specificationResponsibilityAreaId?.toString() ?? '',
      specificationImplementationTypeId:
        spec.specificationImplementationTypeId?.toString() ?? '',
      specificationLifecycleStatusId:
        spec.specificationLifecycleStatusId?.toString() ?? '',
      businessNeedsReference: spec.businessNeedsReference ?? '',
    })
    setShowForm(true)
  }

  const { confirm } = useConfirmModal()

  const handleDelete = async (spec: Specification, anchorEl?: HTMLElement) => {
    if (
      !(await confirm({
        message: tc('confirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return

    try {
      const res = await apiFetch(`/api/specifications/${spec.uniqueId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const details = (await res.text()).trim()
        await confirm({
          anchorEl,
          confirmText: tc('confirm'),
          icon: 'caution',
          message: details || tc('error'),
          showCancel: false,
          title: tc('error'),
          variant: 'danger',
        })
        return
      }

      await fetchSpecifications()
    } catch (error) {
      await confirm({
        anchorEl,
        confirmText: tc('confirm'),
        icon: 'caution',
        message: error instanceof Error ? error.message : tc('error'),
        showCancel: false,
        title: tc('error'),
        variant: 'danger',
      })
    }
  }

  const openCreateForm = () => {
    setShowForm(true)
    setEditSpec(null)
    setOpenHelp(new Set())
    setSlugEdited(false)
    setSlugError(null)
    setSaveError(null)
    setForm(resetForm())
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('specifications')}
          </h1>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.form
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6 mb-6 space-y-5 max-w-lg"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              {...devMarker({
                context: 'specifications',
                name: 'crud form',
                priority: 340,
                value: editSpec ? 'edit' : 'create',
              })}
              onSubmit={handleSubmit}
            >
              <h2 className="text-lg font-semibold">
                {editSpec ? t('editSpecification') : t('newSpecification')}
              </h2>
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <label
                    className="block text-sm font-medium"
                    htmlFor="spec-name"
                  >
                    {t('name')} <span aria-hidden="true">*</span>
                  </label>
                  {helpButton('spec-name', t('name'))}
                </div>
                {helpPanel('help.name', 'spec-name')}
                <input
                  className="min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
                  id="spec-name"
                  onBlur={() => {
                    if (!slugEdited && form.name) {
                      const nextUniqueId = generateSpecificationSlug(form.name)
                      if (!nextUniqueId) {
                        setSlugError(t('uniqueIdGenerationFailed'))
                        return
                      }
                      if (form.uniqueId !== nextUniqueId) {
                        setSlugError(null)
                        setForm(f => ({
                          ...f,
                          uniqueId: nextUniqueId,
                        }))
                      }
                    }
                  }}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  value={form.name}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <label
                    className="block text-sm font-medium"
                    htmlFor="spec-unique-id"
                  >
                    {t('uniqueId')} <span aria-hidden="true">*</span>
                  </label>
                  {helpButton('spec-unique-id', t('uniqueId'))}
                </div>
                {helpPanel('uniqueIdHelp', 'spec-unique-id')}
                <input
                  aria-describedby={
                    slugError ? 'spec-unique-id-error' : undefined
                  }
                  aria-invalid={!!slugError}
                  className={`min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-mono transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50${slugError ? ' border-red-500 focus:ring-red-400/50' : ''}`}
                  id="spec-unique-id"
                  onChange={e => {
                    setSlugEdited(true)
                    setSlugError(null)
                    setForm(f => ({
                      ...f,
                      uniqueId: normalizeSlugInput(e.target.value),
                    }))
                  }}
                  onInvalid={() => setSlugError(t('uniqueIdRequired'))}
                  placeholder={t('uniqueIdPlaceholder')}
                  required
                  value={form.uniqueId}
                />
                {slugError ? (
                  <p
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                    id="spec-unique-id-error"
                    role="alert"
                  >
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
                  <label
                    className="block text-sm font-medium"
                    htmlFor="spec-area"
                  >
                    {t('responsibilityArea')}
                  </label>
                  {helpButton('spec-area', t('responsibilityArea'))}
                </div>
                {helpPanel('responsibilityAreaHelp', 'spec-area')}
                <select
                  className="min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
                  id="spec-area"
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      specificationResponsibilityAreaId: e.target.value,
                    }))
                  }
                  value={form.specificationResponsibilityAreaId}
                >
                  <option value="">—</option>
                  {responsibilityAreas.map(a => (
                    <option key={a.id} value={a.id}>
                      {locale === 'sv' ? a.nameSv : a.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <label
                    className="block text-sm font-medium"
                    htmlFor="spec-impl-type"
                  >
                    {t('implementationType')}
                  </label>
                  {helpButton('spec-impl-type', t('implementationType'))}
                </div>
                {helpPanel('implementationTypeHelp', 'spec-impl-type')}
                <select
                  className="min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
                  id="spec-impl-type"
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      specificationImplementationTypeId: e.target.value,
                    }))
                  }
                  value={form.specificationImplementationTypeId}
                >
                  <option value="">—</option>
                  {implementationTypes.map(it => (
                    <option key={it.id} value={it.id}>
                      {locale === 'sv' ? it.nameSv : it.nameEn}
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
                  className="min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
                  id="spec-lifecycle-status"
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      specificationLifecycleStatusId: e.target.value,
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
                  className="min-h-[44px] w-full resize-none rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
                  id="spec-business-ref"
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      businessNeedsReference: e.target.value,
                    }))
                  }
                  placeholder={t('businessNeedsReferencePlaceholder')}
                  rows={2}
                  value={form.businessNeedsReference}
                />
              </div>
              {saveError && (
                <p
                  className="text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {saveError}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  className="btn-primary"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? tc('saving') : tc('save')}
                </button>
                <button
                  className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                  disabled={isSubmitting}
                  onClick={() => {
                    if (isSubmitting) return
                    setOpenHelp(new Set())
                    setShowForm(false)
                  }}
                  type="button"
                >
                  {tc('cancel')}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          {!loading && specifications.length > 0 && (
            <div className="w-full max-w-lg">
              <label
                className="mb-1.5 block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                htmlFor="specification-name-filter"
              >
                {t('filterByName')}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
                  />
                  <input
                    autoComplete="off"
                    className="min-h-[44px] w-full rounded-xl border border-secondary-200 bg-white py-2.5 pr-3 pl-10 text-sm text-secondary-900 transition-all duration-200 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100 dark:placeholder:text-secondary-500"
                    {...devMarker({
                      context: 'specifications',
                      name: 'text field',
                      priority: 330,
                      value: 'name filter',
                    })}
                    id="specification-name-filter"
                    onChange={e => setNameFilter(e.target.value)}
                    placeholder={t('filterByNamePlaceholder')}
                    type="text"
                    value={nameFilter}
                  />
                </div>
                {hasActiveNameFilter && (
                  <button
                    className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-secondary-200 px-4 py-2.5 text-sm text-secondary-700 transition-all duration-200 hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800/60"
                    onClick={() => setNameFilter('')}
                    type="button"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                    {tc('clearSearch')}
                  </button>
                )}
              </div>
            </div>
          )}

          <button
            className="btn-primary inline-flex items-center gap-1.5 justify-self-start lg:col-start-2 lg:justify-self-end"
            {...devMarker({
              context: 'specifications',
              name: 'create button',
              priority: 350,
            })}
            onClick={openCreateForm}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t('newSpecification')}
          </button>
        </div>

        {showSpinner && (
          <div
            aria-live="polite"
            className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 py-16"
            data-testid="requirement-specifications-loading"
            role="status"
          >
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
            <p className="text-secondary-600 dark:text-secondary-400">
              {tc('loading')}
            </p>
          </div>
        )}
        {!loading && (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden"
            {...devMarker({
              context: 'specifications',
              name: 'crud table',
              priority: 340,
            })}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                    <th className="py-3 px-4 font-medium">{t('name')}</th>
                    <th className="py-3 px-4 font-medium">
                      {t('responsibilityArea')}
                    </th>
                    <th className="py-3 px-4 font-medium">
                      {t('implementationType')}
                    </th>
                    <th className="py-3 px-4 font-medium">
                      {t('lifecycleStatus')}
                    </th>
                    <th className="py-3 px-4 font-medium">{t('itemCount')}</th>
                    <th className="py-3 px-4 font-medium">
                      {t('requirementAreas')}
                    </th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSpecifications.map(spec => (
                    <tr
                      className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                      key={spec.id}
                    >
                      <td className="py-3 px-4 font-medium">
                        <Link
                          className="text-primary-700 dark:text-primary-300 hover:underline"
                          href={`/specifications/${spec.uniqueId}`}
                        >
                          {getName(spec)}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {getTaxonomyName(spec.responsibilityArea)}
                      </td>
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {getTaxonomyName(spec.implementationType)}
                      </td>
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {getTaxonomyName(spec.lifecycleStatus)}
                      </td>
                      <td className="py-3 px-4">
                        {spec.itemCount > 0 ? (
                          <Link
                            className="text-primary-700 dark:text-primary-300 hover:underline font-medium"
                            href={`/specifications/${spec.uniqueId}`}
                          >
                            {spec.itemCount}
                          </Link>
                        ) : (
                          <span className="text-secondary-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <RequirementAreaPills
                          areas={spec.requirementAreas}
                          key={spec.requirementAreas
                            .map(area => `${area.id}:${area.name}`)
                            .join('|')}
                        />
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="flex justify-end gap-1">
                          <button
                            aria-label={tc('edit')}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-primary-300 dark:hover:bg-primary-950/30"
                            {...devMarker({
                              context: 'specifications',
                              name: 'table action',
                              value: 'edit',
                            })}
                            onClick={() => handleEdit(spec)}
                            title={tc('edit')}
                            type="button"
                          >
                            <Pencil
                              aria-hidden="true"
                              className="h-4 w-4"
                              focusable={false}
                            />
                          </button>
                          <button
                            aria-label={tc('delete')}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-red-400 dark:hover:bg-red-950/30"
                            {...devMarker({
                              context: 'specifications',
                              name: 'table action',
                              value: 'delete',
                            })}
                            onClick={e =>
                              handleDelete(spec, e.currentTarget as HTMLElement)
                            }
                            title={tc('delete')}
                            type="button"
                          >
                            <Trash2
                              aria-hidden="true"
                              className="h-4 w-4"
                              focusable={false}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {fetchError ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center"
                        colSpan={specificationTableColumnCount}
                      >
                        <p
                          className="text-sm text-red-600 dark:text-red-400"
                          role="alert"
                        >
                          {fetchError}
                        </p>
                      </td>
                    </tr>
                  ) : specifications.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                        colSpan={specificationTableColumnCount}
                      >
                        {t('emptyState')}
                      </td>
                    </tr>
                  ) : specifications.length > 0 &&
                    filteredSpecifications.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                        colSpan={specificationTableColumnCount}
                      >
                        {tc('noResults')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
