'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormActionRow from '@/components/FormActionRow'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { offsetPanelMotion } from '@/lib/reduced-motion'

const QUALITY_CHARACTERISTICS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'qualityCharacteristics.overview.body',
      headingKey: 'qualityCharacteristics.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'qualityCharacteristics.manage.body',
      headingKey: 'qualityCharacteristics.manage.heading',
    },
  ],
  titleKey: 'qualityCharacteristics.title',
}

interface TypeCategory {
  chapterId: string
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
  requirementTypeId: number
}

interface TypeCategoryForm {
  chapterId: string
  nameEn: string
  nameSv: string
  parentId: string
  requirementTypeId: string
}

interface Type {
  id: number
  nameEn: string
  nameSv: string
}

const getInitialForm = (): TypeCategoryForm => ({
  chapterId: '',
  nameEn: '',
  nameSv: '',
  parentId: '',
  requirementTypeId: '',
})

const toForm = (category: TypeCategory): TypeCategoryForm => ({
  chapterId: category.chapterId,
  nameEn: category.nameEn,
  nameSv: category.nameSv,
  parentId: category.parentId?.toString() ?? '',
  requirementTypeId: category.requirementTypeId.toString(),
})

const toPayload = (form: TypeCategoryForm) => ({
  chapterId: form.chapterId,
  nameSv: form.nameSv,
  nameEn: form.nameEn,
  requirementTypeId: Number(form.requirementTypeId),
  parentId: form.parentId ? Number(form.parentId) : null,
})

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

function compareChapterIds(a: string, b: string) {
  const left = a.split('.').map(part => Number(part))
  const right = b.split('.').map(part => Number(part))
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function ChapterBadge({ chapterId }: { chapterId: string }) {
  return (
    <span className="inline-flex shrink-0 rounded border border-primary-200 bg-primary-50 px-1.5 py-0.5 font-mono text-[0.7rem] leading-none text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
      {chapterId}
    </span>
  )
}

export default function QualityCharacteristicsClient() {
  useHelpContent(QUALITY_CHARACTERISTICS_HELP)
  const t = useTranslations('qualityCharacteristicMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const shouldReduceMotion = useReducedMotion()
  const [types, setTypes] = useState<Type[]>([])
  const [typesError, setTypesError] = useState<string>()
  const [typesLoading, setTypesLoading] = useState(true)
  const errorFallback = tc('error')

  const getName = (category: TypeCategory) =>
    locale === 'sv' ? category.nameSv : category.nameEn
  const getTypeName = (type: Type) =>
    locale === 'sv' ? type.nameSv : type.nameEn

  const presentMutationError = useCallback(
    async ({
      anchorEl,
      message,
    }: {
      anchorEl?: HTMLElement
      message: string
    }) => {
      await confirm({
        anchorEl,
        icon: 'warning',
        message: message || errorFallback,
        showCancel: false,
      })
    },
    [confirm, errorFallback],
  )

  const getCaughtErrorMessage = useCallback(
    (error: unknown) =>
      error instanceof Error ? error.message || errorFallback : errorFallback,
    [errorFallback],
  )

  const controller = useCrudAdminResource<TypeCategory, TypeCategoryForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/quality-characteristics',
    errorMessage: errorFallback,
    getCaughtErrorMessage,
    getInitialForm,
    listKey: 'qualityCharacteristics',
    onDeleteError: presentMutationError,
    onSubmitError: presentMutationError,
    reloadOnDeleteError: true,
    toForm,
    toPayload,
  })

  useEffect(() => {
    let cancelled = false

    async function fetchTypes() {
      setTypesLoading(true)
      try {
        const response = await apiFetch('/api/requirement-types')
        if (cancelled) return
        if (!response.ok) {
          const message = (await readResponseMessage(response)) ?? errorFallback
          setTypesError(message)
          await presentMutationError({ message })
          return
        }
        setTypesError(undefined)
        setTypes(((await response.json()) as { types?: Type[] }).types ?? [])
      } catch (error) {
        if (!cancelled) {
          const message = getCaughtErrorMessage(error)
          setTypesError(message)
          await presentMutationError({ message })
        }
      } finally {
        if (!cancelled) setTypesLoading(false)
      }
    }

    void fetchTypes()

    return () => {
      cancelled = true
    }
  }, [errorFallback, getCaughtErrorMessage, presentMutationError])

  const parentOptions = controller.items
    .filter(
      category =>
        category.parentId === null &&
        category.id !== controller.editId &&
        (controller.form.requirementTypeId
          ? category.requirementTypeId ===
            Number(controller.form.requirementTypeId)
          : true),
    )
    .sort((a, b) => compareChapterIds(a.chapterId, b.chapterId))
  const loading = controller.loading || typesLoading
  const renderEditActionContent = (iconClassName: string) =>
    controller.submitting ? (
      <span className="px-1 text-xs font-medium">{tc('saving')}</span>
    ) : (
      <>
        <Pencil aria-hidden="true" className={iconClassName} />
        <span className="sr-only">{tc('edit')}</span>
      </>
    )
  const renderDeleteActionContent = (
    isDeleting: boolean,
    iconClassName: string,
  ) =>
    controller.submitting ? (
      <span className="px-1 text-xs font-medium">{tc('saving')}</span>
    ) : isDeleting ? (
      <span className="px-1 text-xs font-medium">{tc('deleting')}</span>
    ) : (
      <>
        <Trash2 aria-hidden="true" className={iconClassName} />
        <span className="sr-only">{tc('delete')}</span>
      </>
    )
  const getMutationActionTitle = (actionLabel: string, isDeleting = false) => {
    if (controller.submitting) return tc('savingInProgress')
    if (isDeleting) return tc('deletingInProgress')
    return actionLabel
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('qualityCharacteristics')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'quality characteristics',
              name: 'create button',
              priority: 350,
            })}
            disabled={controller.submitting}
            onClick={controller.openCreate}
            title={getMutationActionTitle(tc('create'))}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {tc('create')}
          </button>
        </div>
        <p className="text-secondary-600 dark:text-secondary-400 text-sm mb-6">
          {t('subtitle')}
        </p>

        {controller.loadError && (
          <div
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200"
            role="alert"
          >
            {controller.loadError}
          </div>
        )}

        <AnimatePresence>
          {controller.showForm && (
            <motion.form
              className="glass rounded-2xl p-6 mb-6 space-y-5 max-w-lg"
              {...offsetPanelMotion(shouldReduceMotion)}
              {...devMarker({
                context: 'quality characteristics',
                name: 'crud form',
                priority: 340,
                value: controller.editId ? 'edit' : 'create',
              })}
              onSubmit={controller.submit}
            >
              <h2 className="text-lg font-semibold">
                {controller.editId ? tc('edit') : tc('create')}
              </h2>
              <div>
                <FieldLabelWithHelp
                  help={t('chapterIdHelp')}
                  htmlFor="qc-chapter-id"
                  label={t('chapterId')}
                  required
                />
                <input
                  className={inputClassName}
                  disabled={controller.submitting}
                  id="qc-chapter-id"
                  onChange={event =>
                    controller.setForm(previousForm => ({
                      ...previousForm,
                      chapterId: event.target.value,
                    }))
                  }
                  pattern="\d+(?:\.\d+)*"
                  placeholder="3.1.1"
                  required
                  value={controller.form.chapterId}
                />
              </div>
              <div>
                <FieldLabelWithHelp
                  help={t('nameSvHelp')}
                  htmlFor="qc-name-sv"
                  label={`${t('name')} (SV)`}
                  required
                />
                <input
                  className={inputClassName}
                  disabled={controller.submitting}
                  id="qc-name-sv"
                  onChange={event =>
                    controller.setForm(previousForm => ({
                      ...previousForm,
                      nameSv: event.target.value,
                    }))
                  }
                  required
                  value={controller.form.nameSv}
                />
              </div>
              <div>
                <FieldLabelWithHelp
                  help={t('nameEnHelp')}
                  htmlFor="qc-name-en"
                  label={`${t('name')} (EN)`}
                  required
                />
                <input
                  className={inputClassName}
                  disabled={controller.submitting}
                  id="qc-name-en"
                  onChange={event =>
                    controller.setForm(previousForm => ({
                      ...previousForm,
                      nameEn: event.target.value,
                    }))
                  }
                  required
                  value={controller.form.nameEn}
                />
              </div>
              <div>
                <FieldLabelWithHelp
                  help={t('typeHelp')}
                  htmlFor="qc-type"
                  label={t('type')}
                  required
                />
                <select
                  className={inputClassName}
                  disabled={controller.submitting}
                  id="qc-type"
                  onChange={event =>
                    controller.setForm(previousForm => ({
                      ...previousForm,
                      parentId: '',
                      requirementTypeId: event.target.value,
                    }))
                  }
                  required
                  value={controller.form.requirementTypeId}
                >
                  <option value="">—</option>
                  {types.map(type => (
                    <option key={type.id} value={type.id}>
                      {getTypeName(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabelWithHelp
                  help={t('parentHelp')}
                  htmlFor="qc-parent"
                  label={t('parent')}
                />
                <select
                  className={inputClassName}
                  disabled={controller.submitting}
                  id="qc-parent"
                  onChange={event =>
                    controller.setForm(previousForm => ({
                      ...previousForm,
                      parentId: event.target.value,
                    }))
                  }
                  value={controller.form.parentId}
                >
                  <option value="">{t('topLevel')}</option>
                  {parentOptions.map(parent => (
                    <option key={parent.id} value={parent.id}>
                      {getName(parent)}
                    </option>
                  ))}
                </select>
              </div>
              <FormActionRow>
                <button
                  className="btn-primary"
                  disabled={controller.submitting}
                  title={getMutationActionTitle(tc('save'))}
                  type="submit"
                >
                  {controller.submitting ? tc('saving') : tc('save')}
                </button>
                <button
                  className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 text-secondary-700 dark:text-secondary-300 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                  disabled={controller.submitting}
                  onClick={controller.closeForm}
                  title={getMutationActionTitle(tc('cancel'))}
                  type="button"
                >
                  {tc('cancel')}
                </button>
              </FormActionRow>
            </motion.form>
          )}
        </AnimatePresence>

        {loading ? (
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loading')}
          </p>
        ) : typesError ? (
          <div
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200"
            role="alert"
          >
            {typesError}
          </div>
        ) : (
          <div
            className="space-y-8"
            {...devMarker({
              context: 'quality characteristics',
              name: 'crud table',
              priority: 340,
            })}
          >
            {types.map(type => {
              const topLevel = controller.items
                .filter(
                  category =>
                    category.requirementTypeId === type.id &&
                    !category.parentId,
                )
                .sort((a, b) => compareChapterIds(a.chapterId, b.chapterId))
              return (
                <div key={type.id}>
                  <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 mb-4">
                    {getTypeName(type)}
                  </h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
                    {topLevel.map(parent => {
                      const parentDeleting = controller.deletingIds.has(
                        parent.id,
                      )
                      const parentActionDisabled =
                        controller.submitting || parentDeleting
                      const children = controller.items
                        .filter(category => category.parentId === parent.id)
                        .sort((a, b) =>
                          compareChapterIds(a.chapterId, b.chapterId),
                        )
                      return (
                        <div
                          className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-5 transition-all duration-200 hover:shadow-md"
                          key={parent.id}
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <h3 className="flex min-w-0 items-start gap-2 text-sm font-semibold leading-snug text-primary-700 dark:text-primary-300">
                              <ChapterBadge chapterId={parent.chapterId} />
                              <span className="min-w-0">{getName(parent)}</span>
                            </h3>
                            <span className="flex shrink-0 gap-1">
                              <button
                                className="text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-100 min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                                {...devMarker({
                                  context: 'quality characteristics',
                                  name: 'table action',
                                  value: 'edit',
                                })}
                                disabled={parentActionDisabled}
                                onClick={() => controller.openEdit(parent)}
                                title={getMutationActionTitle(
                                  tc('edit'),
                                  parentDeleting,
                                )}
                                type="button"
                              >
                                {renderEditActionContent('h-3.5 w-3.5')}
                              </button>
                              <button
                                className="text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                                {...devMarker({
                                  context: 'quality characteristics',
                                  name: 'table action',
                                  value: 'delete',
                                })}
                                disabled={parentActionDisabled}
                                onClick={event => {
                                  void controller.remove(
                                    parent.id,
                                    event.currentTarget,
                                  )
                                }}
                                title={getMutationActionTitle(
                                  tc('delete'),
                                  parentDeleting,
                                )}
                                type="button"
                              >
                                {renderDeleteActionContent(
                                  parentDeleting,
                                  'h-3.5 w-3.5',
                                )}
                              </button>
                            </span>
                          </div>
                          {children.length > 0 && (
                            <ul className="space-y-1">
                              {children.map(child => {
                                const childDeleting =
                                  controller.deletingIds.has(child.id)
                                const childActionDisabled =
                                  controller.submitting || childDeleting

                                return (
                                  <li
                                    className="group relative min-h-11 border-l-2 border-primary-200 py-1 pl-3 pr-1 text-sm text-secondary-700 dark:border-primary-800 dark:text-secondary-300"
                                    key={child.id}
                                  >
                                    <span className="flex min-w-0 items-start gap-2">
                                      <ChapterBadge
                                        chapterId={child.chapterId}
                                      />
                                      <span className="min-w-0 leading-snug">
                                        {getName(child)}
                                      </span>
                                    </span>
                                    <span className="absolute right-0 top-1/2 flex shrink-0 -translate-y-1/2 gap-0.5 rounded bg-white/95 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 dark:bg-secondary-900/95">
                                      <button
                                        className="text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-100 min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                                        {...devMarker({
                                          context: 'quality characteristics',
                                          name: 'table action',
                                          value: 'edit',
                                        })}
                                        disabled={childActionDisabled}
                                        onClick={() =>
                                          controller.openEdit(child)
                                        }
                                        title={getMutationActionTitle(
                                          tc('edit'),
                                          childDeleting,
                                        )}
                                        type="button"
                                      >
                                        {renderEditActionContent('h-3 w-3')}
                                      </button>
                                      <button
                                        className="text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                                        {...devMarker({
                                          context: 'quality characteristics',
                                          name: 'table action',
                                          value: 'delete',
                                        })}
                                        disabled={childActionDisabled}
                                        onClick={event => {
                                          void controller.remove(
                                            child.id,
                                            event.currentTarget,
                                          )
                                        }}
                                        title={getMutationActionTitle(
                                          tc('delete'),
                                          childDeleting,
                                        )}
                                        type="button"
                                      >
                                        {renderDeleteActionContent(
                                          childDeleting,
                                          'h-3 w-3',
                                        )}
                                      </button>
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
