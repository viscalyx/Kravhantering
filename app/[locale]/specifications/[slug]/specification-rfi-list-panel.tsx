'use client'

import {
  Download,
  MessageCircleReply,
  Printer,
  Send,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormModal from '@/components/FormModal'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

type RfiRelevance = 'not_relevant' | 'relevant'

interface RfiListItem {
  areaId: number
  areaName: string
  expectedAnswerFormat: string | null
  helpText: string | null
  isIncluded: boolean
  isVersionStale: boolean
  questionCode: string
  questionId: number
  questionText: string
  relevance: RfiRelevance | null
  versionNumber: number
}

interface RfiList {
  isLocked: boolean
  items: RfiListItem[]
  lockedAt: string | null
  lockedByDisplayName: string | null
  specificationId: number
}

interface RfiSuggestion {
  areaId: number
  content: string
  id: number
  isReviewRequested: boolean
  resolution: number | null
  rfiQuestionId: number | null
  specificationId: number | null
}

interface Props {
  canEdit: boolean
  specificationId: number
  specificationSlug: string
}

interface RfiAreaGroup {
  areaId: number
  areaName: string
  items: RfiListItem[]
}

type SuggestionTarget =
  | {
      areaId: number
      areaName: string
      type: 'area'
    }
  | {
      item: RfiListItem
      type: 'question'
    }

function groupedByArea(items: RfiListItem[]): RfiAreaGroup[] {
  const groups = new Map<number, RfiAreaGroup>()
  for (const item of items) {
    const group = groups.get(item.areaId) ?? {
      areaId: item.areaId,
      areaName: item.areaName,
      items: [],
    }
    group.items.push(item)
    groups.set(item.areaId, group)
  }
  return Array.from(groups.values())
}

function jsonRequest(method: string, body?: unknown) {
  return {
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }),
    method,
  }
}

function suggestionMatchesTarget(
  suggestion: RfiSuggestion,
  target: SuggestionTarget,
  specificationId: number,
) {
  if (suggestion.specificationId !== specificationId) return false
  if (target.type === 'area') {
    return (
      suggestion.areaId === target.areaId && suggestion.rfiQuestionId == null
    )
  }
  return suggestion.rfiQuestionId === target.item.questionId
}

function canDeleteSuggestion(suggestion: RfiSuggestion) {
  return !suggestion.isReviewRequested && suggestion.resolution == null
}

function targetAreaName(target: SuggestionTarget) {
  return target.type === 'area' ? target.areaName : target.item.areaName
}

export default function SpecificationRfiListPanel({
  canEdit,
  specificationId,
  specificationSlug,
}: Props) {
  const t = useTranslations('specificationRfiList')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const encodedSlug = encodeURIComponent(specificationSlug)
  const [list, setList] = useState<RfiList | null>(null)
  const [suggestions, setSuggestions] = useState<RfiSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [createSuggestionTarget, setCreateSuggestionTarget] =
    useState<SuggestionTarget | null>(null)
  const [viewSuggestionsTarget, setViewSuggestionsTarget] =
    useState<SuggestionTarget | null>(null)
  const [suggestionContent, setSuggestionContent] = useState('')

  const loadSuggestions = useCallback(
    async (items: RfiListItem[]) => {
      if (!canEdit) {
        setSuggestions([])
        return
      }
      const areaIds = Array.from(new Set(items.map(item => item.areaId)))
      if (areaIds.length === 0) {
        setSuggestions([])
        return
      }
      const loaded = await Promise.all(
        areaIds.map(async areaId => {
          const response = await apiFetch(
            `/api/rfi-question-suggestions?areaId=${areaId}&specificationId=${specificationId}`,
          )
          if (!response.ok) {
            throw new Error(
              (await readResponseMessage(response)) ??
                t('loadSuggestionsError'),
            )
          }
          const data = (await response.json()) as {
            suggestions?: RfiSuggestion[]
          }
          return data.suggestions ?? []
        }),
      )
      setSuggestions(loaded.flat())
    },
    [canEdit, specificationId, t],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${encodedSlug}/rfi-list`,
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('loadError'))
      }
      const data = (await response.json()) as { list?: RfiList }
      setList(data.list ?? null)
      await loadSuggestions(data.list?.items ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [encodedSlug, loadSuggestions, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const groups = useMemo(() => groupedByArea(list?.items ?? []), [list])
  const suggestionsForTarget = useCallback(
    (target: SuggestionTarget) =>
      suggestions.filter(suggestion =>
        suggestionMatchesTarget(suggestion, target, specificationId),
      ),
    [specificationId, suggestions],
  )

  const mutateList = async (path: string, body?: unknown) => {
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${encodedSlug}/rfi-list/${path}`,
        jsonRequest('POST', body),
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('saveError'))
      }
      const data = (await response.json()) as { list?: RfiList }
      if (data.list) setList(data.list)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const updateItem = async (item: RfiListItem, body: unknown) => {
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${encodedSlug}/rfi-list/items/${item.questionId}`,
        jsonRequest('PATCH', body),
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('saveError'))
      }
      const data = (await response.json()) as { list?: RfiList }
      if (data.list) setList(data.list)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const openCreateSuggestion = (target: SuggestionTarget) => {
    setError(null)
    setStatusMessage(null)
    setSuggestionContent('')
    setCreateSuggestionTarget(target)
  }

  const createSuggestion = async () => {
    if (!createSuggestionTarget || !suggestionContent.trim()) return
    const areaId =
      createSuggestionTarget.type === 'area'
        ? createSuggestionTarget.areaId
        : createSuggestionTarget.item.areaId
    const rfiQuestionId =
      createSuggestionTarget.type === 'question'
        ? createSuggestionTarget.item.questionId
        : null
    setSaving(true)
    setError(null)
    setStatusMessage(null)
    try {
      const response = await apiFetch(
        '/api/rfi-question-suggestions',
        jsonRequest('POST', {
          areaId,
          content: suggestionContent,
          rfiQuestionId,
          specificationId,
        }),
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('saveError'))
      }
      const data = (await response.json()) as { suggestion?: RfiSuggestion }
      if (data.suggestion) {
        setSuggestions(current => [
          data.suggestion as RfiSuggestion,
          ...current.filter(
            suggestion => suggestion.id !== data.suggestion?.id,
          ),
        ])
      }
      setSuggestionContent('')
      setCreateSuggestionTarget(null)
      setStatusMessage(t('suggestionCreated'))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const deleteSuggestion = async (
    suggestion: RfiSuggestion,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const anchorEl = event.currentTarget
    const confirmed = await confirm({
      anchorEl,
      confirmText: tc('delete'),
      icon: 'caution',
      message: t('deleteSuggestionConfirm'),
      title: t('deleteSuggestionTitle'),
      variant: 'danger',
    })
    if (!confirmed) return
    const targetAtDelete = viewSuggestionsTarget
    setSaving(true)
    setError(null)
    setStatusMessage(null)
    try {
      const response = await apiFetch(
        `/api/rfi-question-suggestions/${suggestion.id}`,
        jsonRequest('DELETE'),
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('saveError'))
      }
      setSuggestions(current =>
        current.filter(
          currentSuggestion => currentSuggestion.id !== suggestion.id,
        ),
      )
      if (targetAtDelete) {
        const remaining = suggestions.filter(
          currentSuggestion =>
            currentSuggestion.id !== suggestion.id &&
            suggestionMatchesTarget(
              currentSuggestion,
              targetAtDelete,
              specificationId,
            ),
        )
        if (remaining.length === 0) setViewSuggestionsTarget(null)
      }
      setStatusMessage(t('suggestionDeleted'))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : t('saveError'),
      )
    } finally {
      setSaving(false)
    }
  }

  const targetContextText = (target: SuggestionTarget) =>
    target.type === 'area'
      ? t('suggestionForArea', { area: target.areaName })
      : t('suggestionForQuestion', {
          code: target.item.questionCode,
          question: target.item.questionText,
        })

  if (loading) {
    return (
      <p className="p-6 text-sm text-secondary-600 dark:text-secondary-300">
        {tc('loading')}
      </p>
    )
  }

  if (!list) {
    return (
      <p className="p-6 text-sm text-secondary-600 dark:text-secondary-300">
        {t('empty')}
      </p>
    )
  }

  const lockSwitchButtonClassName =
    'inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg px-1 py-1 text-sm font-medium text-secondary-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 dark:text-secondary-200 dark:focus-visible:ring-offset-secondary-950'
  // Keep these dimensions fixed and aligned with RequirementSelectionFilterToggle; do not resize this switch independently.
  const lockSwitchTrackClassName = `relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
    list.isLocked
      ? 'bg-amber-700 dark:bg-amber-400'
      : 'bg-secondary-300 dark:bg-secondary-700'
  }`
  const lockSwitchThumbClassName = `absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform dark:bg-secondary-50 ${
    list.isLocked ? 'translate-x-4' : 'translate-x-0.5'
  }`
  const exportPillClassName =
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-secondary-200/80 bg-white/90 text-secondary-500 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md transition-all hover:-translate-y-px hover:border-secondary-300 hover:text-secondary-700 hover:shadow-[0_14px_36px_-20px_rgba(15,23,42,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-secondary-700/80 dark:bg-secondary-900/80 dark:text-secondary-300 dark:hover:border-secondary-600 dark:hover:text-secondary-100 dark:focus-visible:ring-offset-secondary-950'
  const suggestionActionButtonClassName =
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-secondary-200/80 bg-white/90 text-secondary-500 shadow-sm transition-all hover:-translate-y-px hover:border-primary-300 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 dark:border-secondary-700/80 dark:bg-secondary-900/80 dark:text-secondary-300 dark:hover:border-primary-600 dark:hover:text-primary-200 dark:focus-visible:ring-offset-secondary-950'
  const suggestionCountButtonClassName =
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-primary-200 bg-primary-50 px-3 text-xs font-semibold text-primary-800 shadow-sm transition-all hover:-translate-y-px hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-primary-800 dark:bg-primary-950/50 dark:text-primary-200 dark:hover:bg-primary-900/60 dark:focus-visible:ring-offset-secondary-950'
  const lockStateActionTitle = list.isLocked ? t('unlock') : t('lock')
  const createTargetContext = createSuggestionTarget
    ? targetContextText(createSuggestionTarget)
    : ''
  const createRecipientText = createSuggestionTarget
    ? t('suggestionRecipientHint', {
        area: targetAreaName(createSuggestionTarget),
      })
    : ''
  const viewedSuggestions = viewSuggestionsTarget
    ? suggestionsForTarget(viewSuggestionsTarget)
    : []
  const viewTargetContext = viewSuggestionsTarget
    ? targetContextText(viewSuggestionsTarget)
    : ''

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-secondary-900 dark:text-secondary-100">
            {list.isLocked ? t('lockedMode') : t('prepareMode')}
          </p>
          <p className="text-xs text-secondary-500 dark:text-secondary-400">
            {list.isLocked && list.lockedAt
              ? t('lockedAt', { date: list.lockedAt })
              : t('dynamicHint')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            aria-label="CSV"
            className={exportPillClassName}
            href={`/api/requirements-specifications/${encodedSlug}/rfi-list/export?format=csv&locale=${locale}`}
            title="CSV"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">CSV</span>
          </a>
          <a
            aria-label="PDF"
            className={exportPillClassName}
            href={`/api/requirements-specifications/${encodedSlug}/rfi-list/export?format=pdf&locale=${locale}`}
            title="PDF"
          >
            <Printer aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">PDF</span>
          </a>
          {canEdit ? (
            <button
              aria-checked={list.isLocked}
              aria-label={t('lockedToggleAria')}
              className={lockSwitchButtonClassName}
              disabled={saving}
              onClick={() => void mutateList(list.isLocked ? 'unlock' : 'lock')}
              role="switch"
              title={lockStateActionTitle}
              type="button"
            >
              <span>{t('lockedToggleLabel')}</span>
              <span className={lockSwitchTrackClassName}>
                <span className={lockSwitchThumbClassName} />
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {statusMessage ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200"
          role="status"
        >
          {statusMessage}
        </p>
      ) : null}

      <FormModal
        closeDisabled={saving}
        maxWidthClassName="max-w-xl"
        onClose={() => setCreateSuggestionTarget(null)}
        open={createSuggestionTarget != null}
        title={t('createSuggestion')}
        titleId="rfi-suggestion-create-title"
      >
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault()
            void createSuggestion()
          }}
        >
          <p className="text-sm font-medium text-secondary-900 dark:text-secondary-100">
            {createRecipientText}
          </p>
          <p className="rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-sm text-secondary-700 dark:border-secondary-800 dark:bg-secondary-950/40 dark:text-secondary-200">
            {createTargetContext}
          </p>
          <div>
            <FieldLabelWithHelp
              help={t('suggestionContentHelp')}
              htmlFor="rfi-suggestion-content"
              label={t('suggestionContent')}
              required
            />
            <textarea
              className="min-h-28 w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm text-secondary-900 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
              id="rfi-suggestion-content"
              onChange={event => setSuggestionContent(event.target.value)}
              value={suggestionContent}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="inline-flex min-h-11 items-center rounded-lg border border-secondary-300 px-4 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
              disabled={saving}
              onClick={() => setCreateSuggestionTarget(null)}
              type="button"
            >
              {tc('cancel')}
            </button>
            <button
              className="btn-primary inline-flex min-h-11 items-center gap-2"
              disabled={saving || !suggestionContent.trim()}
              type="submit"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
              {saving ? tc('saving') : t('createSuggestion')}
            </button>
          </div>
        </form>
      </FormModal>

      <FormModal
        closeDisabled={saving}
        maxWidthClassName="max-w-xl"
        onClose={() => setViewSuggestionsTarget(null)}
        open={viewSuggestionsTarget != null}
        title={t('existingSuggestionsTitle')}
        titleId="rfi-suggestions-view-title"
      >
        <div className="space-y-4">
          <p className="rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-sm text-secondary-700 dark:border-secondary-800 dark:bg-secondary-950/40 dark:text-secondary-200">
            {viewTargetContext}
          </p>
          {viewedSuggestions.length === 0 ? (
            <p className="text-sm text-secondary-600 dark:text-secondary-300">
              {t('noExistingSuggestions')}
            </p>
          ) : (
            <ul className="space-y-3">
              {viewedSuggestions.map(suggestion => (
                <li
                  className="rounded-lg border border-secondary-200 p-3 dark:border-secondary-800"
                  key={suggestion.id}
                >
                  <p className="whitespace-pre-wrap text-sm leading-6 text-secondary-900 dark:text-secondary-100">
                    {suggestion.content}
                  </p>
                  {canDeleteSuggestion(suggestion) ? (
                    <div className="mt-3 flex justify-end">
                      <button
                        aria-label={t('deleteSuggestionAriaLabel')}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/30"
                        disabled={saving}
                        onClick={event =>
                          void deleteSuggestion(suggestion, event)
                        }
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        {tc('delete')}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </FormModal>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-secondary-200 px-4 py-6 text-center text-sm text-secondary-600 dark:border-secondary-800 dark:text-secondary-300">
          {t('empty')}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const areaTarget: SuggestionTarget = {
              areaId: group.areaId,
              areaName: group.areaName,
              type: 'area',
            }
            const areaSuggestionCount = suggestionsForTarget(areaTarget).length

            return (
              <section
                className="rounded-lg border border-secondary-200 dark:border-secondary-800"
                key={group.areaId}
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-secondary-200 px-3 py-2 dark:border-secondary-800">
                  <h3 className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                    {group.areaName}
                  </h3>
                  {canEdit ? (
                    <div className="ml-auto flex items-center gap-1">
                      {areaSuggestionCount > 0 ? (
                        <button
                          aria-label={t('viewAreaSuggestions', {
                            area: group.areaName,
                            count: areaSuggestionCount,
                          })}
                          className={suggestionCountButtonClassName}
                          onClick={() => setViewSuggestionsTarget(areaTarget)}
                          title={t('viewSuggestionsTitle', {
                            count: areaSuggestionCount,
                          })}
                          type="button"
                        >
                          {areaSuggestionCount}
                        </button>
                      ) : null}
                      <button
                        aria-label={t('createSuggestionForArea', {
                          area: group.areaName,
                        })}
                        className={suggestionActionButtonClassName}
                        disabled={saving}
                        onClick={() => openCreateSuggestion(areaTarget)}
                        title={t('createSuggestionForArea', {
                          area: group.areaName,
                        })}
                        type="button"
                      >
                        <MessageCircleReply
                          aria-hidden="true"
                          className="h-4 w-4"
                        />
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="divide-y divide-secondary-200 dark:divide-secondary-800">
                  {group.items.map(item => {
                    const questionTarget: SuggestionTarget = {
                      item,
                      type: 'question',
                    }
                    const questionSuggestionCount =
                      suggestionsForTarget(questionTarget).length

                    return (
                      <article
                        className="space-y-3 px-3 py-3"
                        key={item.questionId}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary-700 dark:text-primary-300">
                            {item.questionCode}
                          </span>
                          <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                            v{item.versionNumber}
                          </span>
                          {item.isVersionStale ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                              {t('staleVersion')}
                            </span>
                          ) : null}
                          {canEdit ? (
                            <div className="ml-auto flex items-center gap-1">
                              {questionSuggestionCount > 0 ? (
                                <button
                                  aria-label={t('viewQuestionSuggestions', {
                                    code: item.questionCode,
                                    count: questionSuggestionCount,
                                  })}
                                  className={suggestionCountButtonClassName}
                                  onClick={() =>
                                    setViewSuggestionsTarget(questionTarget)
                                  }
                                  title={t('viewSuggestionsTitle', {
                                    count: questionSuggestionCount,
                                  })}
                                  type="button"
                                >
                                  {questionSuggestionCount}
                                </button>
                              ) : null}
                              <button
                                aria-label={t('createSuggestionForQuestion', {
                                  code: item.questionCode,
                                })}
                                className={suggestionActionButtonClassName}
                                disabled={saving}
                                onClick={() =>
                                  openCreateSuggestion(questionTarget)
                                }
                                title={t('createSuggestionForQuestion', {
                                  code: item.questionCode,
                                })}
                                type="button"
                              >
                                <MessageCircleReply
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                />
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <p className="text-sm leading-6 text-secondary-900 dark:text-secondary-100">
                          {item.questionText}
                        </p>
                        {item.helpText ? (
                          <p className="text-sm leading-6 text-secondary-600 dark:text-secondary-300">
                            {item.helpText}
                          </p>
                        ) : null}
                        {item.expectedAnswerFormat ? (
                          <p className="text-xs text-secondary-500 dark:text-secondary-400">
                            {t('expectedAnswerFormat')}:{' '}
                            {item.expectedAnswerFormat}
                          </p>
                        ) : null}

                        <div className="flex flex-wrap gap-3">
                          <label className="inline-flex items-center gap-2 text-sm text-secondary-700 dark:text-secondary-200">
                            <input
                              checked={item.isIncluded}
                              className="h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                              disabled={!canEdit || list.isLocked || saving}
                              onChange={event =>
                                void updateItem(item, {
                                  isIncluded: event.target.checked,
                                })
                              }
                              type="checkbox"
                            />
                            {t('included')}
                          </label>

                          {list.isLocked && item.isIncluded ? (
                            <fieldset className="flex flex-wrap items-center gap-3 text-sm text-secondary-700 dark:text-secondary-200">
                              <legend className="sr-only">
                                {t('relevance')}
                              </legend>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  checked={item.relevance === 'relevant'}
                                  disabled={!canEdit || saving}
                                  name={`rfi-relevance-${item.questionId}`}
                                  onChange={() =>
                                    void updateItem(item, {
                                      relevance: 'relevant',
                                    })
                                  }
                                  type="radio"
                                />
                                {t('relevant')}
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  checked={item.relevance === 'not_relevant'}
                                  disabled={!canEdit || saving}
                                  name={`rfi-relevance-${item.questionId}`}
                                  onChange={() =>
                                    void updateItem(item, {
                                      relevance: 'not_relevant',
                                    })
                                  }
                                  type="radio"
                                />
                                {t('notRelevant')}
                              </label>
                            </fieldset>
                          ) : null}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
