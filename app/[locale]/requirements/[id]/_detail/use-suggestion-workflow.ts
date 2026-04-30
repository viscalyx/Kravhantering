import { useTranslations } from 'next-intl'
import type { MouseEvent } from 'react'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import type { RequirementDetailResponse } from '@/lib/requirements/types'
import type { SuggestionData, SuggestionStep } from './types'

type SuggestionDialogState =
  | { mode: 'create' }
  | { mode: 'edit'; target: SuggestionData }
  | { mode: 'none' }
  | { mode: 'resolution'; target: SuggestionData }

type SuggestionDialogAction =
  | { type: 'close' }
  | { type: 'open_create' }
  | { target: SuggestionData; type: 'open_edit' }
  | { target: SuggestionData; type: 'open_resolution' }

function suggestionDialogReducer(
  _state: SuggestionDialogState,
  action: SuggestionDialogAction,
): SuggestionDialogState {
  switch (action.type) {
    case 'open_create':
      return { mode: 'create' }
    case 'open_edit':
      return { mode: 'edit', target: action.target }
    case 'open_resolution':
      return { mode: 'resolution', target: action.target }
    case 'close':
      return { mode: 'none' }
  }
}

interface UseSuggestionWorkflowOptions {
  onChange?: () => void | Promise<void>
  requirement: RequirementDetailResponse | null
  requirementId: number | string
  selectedVersionNumber: number | null
}

export interface UseSuggestionWorkflowResult {
  closeDialog: () => void
  editSuggestionTarget: SuggestionData | null
  getSuggestionStep: (suggestion: SuggestionData) => SuggestionStep
  handleCreateSuggestion: (content: string, createdBy: string) => Promise<void>
  handleDeleteSuggestion: (
    suggestionId: number,
    event?: MouseEvent<HTMLButtonElement>,
  ) => Promise<void>
  handleEditSuggestion: (content: string, createdBy: string) => Promise<void>
  handleRecordResolution: (
    resolution: 1 | 2,
    motivation: string,
    resolvedBy: string,
  ) => Promise<void>
  handleSuggestionRequestReview: (suggestionId: number) => Promise<void>
  handleSuggestionRevertToDraft: (
    suggestionId: number,
    event?: MouseEvent<HTMLButtonElement>,
  ) => Promise<void>
  openCreateDialog: () => void
  openEditDialog: (target: SuggestionData) => void
  openResolutionDialog: (target: SuggestionData) => void
  resolutionTarget: SuggestionData | null
  showEditSuggestionForm: boolean
  showResolutionForm: boolean
  showSuggestionForm: boolean
  suggestionError: string | null
  suggestionSaving: boolean
  versionSuggestionItems: SuggestionData[]
}

export function useSuggestionWorkflow({
  onChange,
  requirement,
  requirementId,
  selectedVersionNumber,
}: UseSuggestionWorkflowOptions): UseSuggestionWorkflowResult {
  const tf = useTranslations('improvementSuggestion')
  const { confirm } = useConfirmModal()
  const [suggestionItems, setSuggestionItems] = useState<SuggestionData[]>([])
  const [suggestionSaving, setSuggestionSaving] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const suggestionFetchRequestIdRef = useRef(0)
  const [dialog, dispatchDialog] = useReducer(suggestionDialogReducer, {
    mode: 'none',
  })

  const suggestionFetchFailed = tf('fetchFailed')
  const suggestionSaveFailed = tf('saveFailed')
  const suggestionDeleteFailed = tf('deleteFailed')
  const suggestionReviewFailed = tf('reviewFailed')
  const suggestionRevertFailed = tf('revertFailed')
  const suggestionResolutionFailed = tf('resolutionFailed')

  const fetchSuggestions = useCallback(async () => {
    const requestId = ++suggestionFetchRequestIdRef.current
    const isLatestRequest = () =>
      requestId === suggestionFetchRequestIdRef.current

    setSuggestionItems([])
    setSuggestionError(null)
    try {
      const res = await apiFetch(
        `/api/requirement-suggestions/${requirementId}`,
      )
      if (!isLatestRequest()) return
      if (res.ok) {
        const data = (await res.json()) as { suggestions: SuggestionData[] }
        if (!isLatestRequest()) return
        setSuggestionItems(data.suggestions)
      } else {
        setSuggestionError(suggestionFetchFailed)
      }
    } catch {
      if (!isLatestRequest()) return
      setSuggestionError(suggestionFetchFailed)
    }
  }, [requirementId, suggestionFetchFailed])

  useEffect(() => {
    void fetchSuggestions()
  }, [fetchSuggestions])

  const performSuggestionMutation = useCallback(
    async (
      input: RequestInfo,
      init?: RequestInit,
      errorMessage?: string,
    ): Promise<boolean> => {
      try {
        const res = await apiFetch(input, init)
        if (!res.ok) {
          const details = await readResponseMessage(res)
          console.error(
            'Suggestion mutation failed:',
            details ?? res.statusText,
          )
          setSuggestionError(errorMessage ?? details ?? res.statusText)
          return false
        }
        await Promise.all([fetchSuggestions(), onChange?.()])
        return true
      } catch (caughtError) {
        console.error('Suggestion mutation failed:', caughtError)
        const details =
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError)
        setSuggestionError(errorMessage ?? details)
        return false
      }
    },
    [fetchSuggestions, onChange],
  )

  const closeDialog = useCallback(() => {
    dispatchDialog({ type: 'close' })
  }, [])

  const editSuggestionTarget = dialog.mode === 'edit' ? dialog.target : null
  const resolutionTarget = dialog.mode === 'resolution' ? dialog.target : null

  const handleCreateSuggestion = useCallback(
    async (content: string, createdBy: string) => {
      if (!content) return
      setSuggestionSaving(true)
      try {
        const versionId =
          requirement?.versions.find(
            version => version.versionNumber === selectedVersionNumber,
          )?.id ?? null
        const ok = await performSuggestionMutation(
          `/api/requirement-suggestions/${requirementId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content,
              createdBy: createdBy || null,
              requirementVersionId: versionId,
            }),
          },
          suggestionSaveFailed,
        )
        if (ok) {
          closeDialog()
        }
      } finally {
        setSuggestionSaving(false)
      }
    },
    [
      requirementId,
      requirement,
      selectedVersionNumber,
      performSuggestionMutation,
      suggestionSaveFailed,
      closeDialog,
    ],
  )

  const handleEditSuggestion = useCallback(
    async (content: string, _createdBy: string) => {
      if (!editSuggestionTarget || !content) return
      setSuggestionSaving(true)
      try {
        const ok = await performSuggestionMutation(
          `/api/improvement-suggestions/${editSuggestionTarget.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          },
          suggestionSaveFailed,
        )
        if (ok) {
          closeDialog()
        }
      } finally {
        setSuggestionSaving(false)
      }
    },
    [
      editSuggestionTarget,
      performSuggestionMutation,
      suggestionSaveFailed,
      closeDialog,
    ],
  )

  const handleDeleteSuggestion = useCallback(
    async (suggestionId: number, event?: MouseEvent<HTMLButtonElement>) => {
      const anchorEl = event?.currentTarget
      const confirmed = await confirm({
        message: tf('deleteSuggestionConfirm'),
        title: tf('deleteSuggestionConfirmTitle'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      })
      if (!confirmed) return
      setSuggestionSaving(true)
      try {
        await performSuggestionMutation(
          `/api/improvement-suggestions/${suggestionId}`,
          { method: 'DELETE' },
          suggestionDeleteFailed,
        )
      } finally {
        setSuggestionSaving(false)
      }
    },
    [performSuggestionMutation, confirm, tf, suggestionDeleteFailed],
  )

  const handleSuggestionRequestReview = useCallback(
    async (suggestionId: number) => {
      setSuggestionSaving(true)
      try {
        await performSuggestionMutation(
          `/api/improvement-suggestions/${suggestionId}/request-review`,
          { method: 'POST' },
          suggestionReviewFailed,
        )
      } finally {
        setSuggestionSaving(false)
      }
    },
    [performSuggestionMutation, suggestionReviewFailed],
  )

  const handleSuggestionRevertToDraft = useCallback(
    async (suggestionId: number, event?: MouseEvent<HTMLButtonElement>) => {
      const anchorEl = event?.currentTarget
      const confirmed = await confirm({
        message: tf('revertToDraftConfirm'),
        title: tf('revertToDraftConfirmTitle'),
        variant: 'default',
        icon: 'warning',
        anchorEl,
      })
      if (!confirmed) return
      setSuggestionSaving(true)
      try {
        await performSuggestionMutation(
          `/api/improvement-suggestions/${suggestionId}/revert-to-draft`,
          { method: 'POST' },
          suggestionRevertFailed,
        )
      } finally {
        setSuggestionSaving(false)
      }
    },
    [performSuggestionMutation, confirm, tf, suggestionRevertFailed],
  )

  const handleRecordResolution = useCallback(
    async (resolution: 1 | 2, motivation: string, resolvedBy: string) => {
      if (!resolutionTarget) return
      setSuggestionSaving(true)
      try {
        const ok = await performSuggestionMutation(
          `/api/improvement-suggestions/${resolutionTarget.id}/resolution`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resolution,
              resolutionMotivation: motivation,
              resolvedBy,
            }),
          },
          suggestionResolutionFailed,
        )
        if (ok) {
          closeDialog()
        }
      } finally {
        setSuggestionSaving(false)
      }
    },
    [
      resolutionTarget,
      performSuggestionMutation,
      suggestionResolutionFailed,
      closeDialog,
    ],
  )

  const getSuggestionStep = useCallback(
    (suggestion: SuggestionData): SuggestionStep => {
      if (suggestion.resolution !== null) return 'resolved'
      if (suggestion.isReviewRequested === 1) return 'review_requested'
      return 'draft'
    },
    [],
  )

  const selectedVersionId = requirement?.versions.find(
    version => version.versionNumber === selectedVersionNumber,
  )?.id
  const versionSuggestionItems = useMemo(
    () =>
      selectedVersionId != null
        ? suggestionItems.filter(
            suggestion => suggestion.requirementVersionId === selectedVersionId,
          )
        : suggestionItems,
    [suggestionItems, selectedVersionId],
  )

  return {
    closeDialog,
    editSuggestionTarget,
    getSuggestionStep,
    handleCreateSuggestion,
    handleDeleteSuggestion,
    handleEditSuggestion,
    handleRecordResolution,
    handleSuggestionRequestReview,
    handleSuggestionRevertToDraft,
    openCreateDialog: () => dispatchDialog({ type: 'open_create' }),
    openEditDialog: target => dispatchDialog({ type: 'open_edit', target }),
    openResolutionDialog: target =>
      dispatchDialog({ type: 'open_resolution', target }),
    resolutionTarget,
    showResolutionForm: dialog.mode === 'resolution',
    showSuggestionForm: dialog.mode === 'create',
    showEditSuggestionForm: dialog.mode === 'edit',
    suggestionError,
    suggestionSaving,
    versionSuggestionItems,
  }
}
