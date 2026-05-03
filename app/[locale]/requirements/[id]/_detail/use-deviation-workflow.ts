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
import type { DeviationData, DeviationStep } from './types'

type DeviationDialogMode = 'create' | 'decision' | 'edit' | 'none'

interface DeviationDialogState {
  mode: DeviationDialogMode
}

type DeviationDialogAction =
  | { type: 'close' }
  | { type: 'open_create' }
  | { type: 'open_decision' }
  | { type: 'open_edit' }

function deviationDialogReducer(
  _state: DeviationDialogState,
  action: DeviationDialogAction,
): DeviationDialogState {
  switch (action.type) {
    case 'open_create':
      return { mode: 'create' }
    case 'open_edit':
      return { mode: 'edit' }
    case 'open_decision':
      return { mode: 'decision' }
    case 'close':
      return { mode: 'none' }
  }
}

interface UseDeviationWorkflowOptions {
  isPackageItemContext: boolean
  onChange?: () => void | Promise<void>
  specificationItemId?: number
}

export interface UseDeviationWorkflowResult {
  closeDialog: () => void
  deviationError: string | null
  deviationHistory: DeviationData[]
  deviationSaving: boolean
  deviationStep: DeviationStep | null
  handleCreateDeviation: (
    motivation: string,
    createdBy: string,
  ) => Promise<void>
  handleDeleteDeviation: (
    event?: MouseEvent<HTMLButtonElement>,
  ) => Promise<void>
  handleEditDeviation: (motivation: string, createdBy: string) => Promise<void>
  handleRecordDecision: (
    decision: 1 | 2,
    motivation: string,
    decidedBy: string,
  ) => Promise<void>
  handleRequestReview: () => Promise<void>
  handleRevertToDraft: (event?: MouseEvent<HTMLButtonElement>) => Promise<void>
  latestDeviation: DeviationData | null
  openCreateDialog: () => void
  openDecisionDialog: () => void
  openEditDialog: () => void
  showDecisionForm: boolean
  showDeviationForm: boolean
  showEditDeviationForm: boolean
}

export function useDeviationWorkflow({
  isPackageItemContext,
  onChange,
  specificationItemId,
}: UseDeviationWorkflowOptions): UseDeviationWorkflowResult {
  const td = useTranslations('deviation')
  const { confirm } = useConfirmModal()
  const [deviations, setDeviations] = useState<DeviationData[]>([])
  const [deviationSaving, setDeviationSaving] = useState(false)
  const [deviationError, setDeviationError] = useState<string | null>(null)
  const deviationFetchRequestIdRef = useRef(0)
  const [dialog, dispatchDialog] = useReducer(deviationDialogReducer, {
    mode: 'none',
  })

  const latestDeviation = useMemo(() => {
    if (deviations.length === 0) return null
    return deviations[deviations.length - 1]
  }, [deviations])

  const deviationHistory = useMemo(
    () => (deviations.length > 1 ? deviations.slice(0, -1) : []),
    [deviations],
  )

  const deviationStep = useMemo((): DeviationStep | null => {
    if (!latestDeviation) return null
    if (latestDeviation.decision !== null) return 'decided'
    if (latestDeviation.isReviewRequested === 1) return 'review_requested'
    return 'draft'
  }, [latestDeviation])

  const deviationFetchFailed = td('fetchFailed')
  const deviationSaveFailed = td('saveFailed')
  const deviationDeleteFailed = td('deleteFailed')
  const deviationReviewFailed = td('reviewFailed')
  const deviationRevertFailed = td('revertFailed')
  const deviationDecisionFailed = td('decisionFailed')

  const fetchDeviations = useCallback(async () => {
    const requestId = ++deviationFetchRequestIdRef.current
    const isLatestRequest = () =>
      requestId === deviationFetchRequestIdRef.current

    setDeviations([])
    setDeviationError(null)
    if (!specificationItemId) return
    try {
      const res = await apiFetch(
        `/api/specification-item-deviations/${specificationItemId}`,
      )
      if (!isLatestRequest()) return
      if (res.ok) {
        const data = (await res.json()) as { deviations: DeviationData[] }
        if (!isLatestRequest()) return
        setDeviations(data.deviations)
      } else {
        setDeviationError(deviationFetchFailed)
      }
    } catch {
      if (!isLatestRequest()) return
      setDeviationError(deviationFetchFailed)
    }
  }, [specificationItemId, deviationFetchFailed])

  useEffect(() => {
    if (isPackageItemContext) {
      void fetchDeviations()
    }
  }, [isPackageItemContext, fetchDeviations])

  const closeDialog = useCallback(() => {
    dispatchDialog({ type: 'close' })
  }, [])

  const handleCreateDeviation = useCallback(
    async (motivation: string, createdBy: string) => {
      if (!specificationItemId || !motivation) return
      setDeviationSaving(true)
      try {
        const res = await apiFetch(
          `/api/specification-item-deviations/${specificationItemId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              motivation,
              createdBy: createdBy || null,
            }),
          },
        )
        if (res.ok) {
          closeDialog()
          await fetchDeviations()
        } else {
          setDeviationError(deviationSaveFailed)
        }
      } catch {
        setDeviationError(deviationSaveFailed)
      } finally {
        setDeviationSaving(false)
      }
    },
    [specificationItemId, fetchDeviations, deviationSaveFailed, closeDialog],
  )

  const handleEditDeviation = useCallback(
    async (motivation: string, createdBy: string) => {
      if (!latestDeviation || !motivation) return
      setDeviationSaving(true)
      try {
        const res = await apiFetch(`/api/deviations/${latestDeviation.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivation, createdBy: createdBy || null }),
        })
        if (res.ok) {
          closeDialog()
          await fetchDeviations()
        } else {
          setDeviationError(deviationSaveFailed)
        }
      } catch {
        setDeviationError(deviationSaveFailed)
      } finally {
        setDeviationSaving(false)
      }
    },
    [latestDeviation, fetchDeviations, deviationSaveFailed, closeDialog],
  )

  const handleDeleteDeviation = useCallback(
    async (event?: MouseEvent<HTMLButtonElement>) => {
      if (!latestDeviation) return
      const anchorEl = event?.currentTarget
      const confirmed = await confirm({
        message: td('deleteDeviationConfirm'),
        title: td('deleteDeviationConfirmTitle'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      })
      if (!confirmed) return
      setDeviationSaving(true)
      try {
        const res = await apiFetch(`/api/deviations/${latestDeviation.id}`, {
          method: 'DELETE',
        })
        if (res.ok) {
          await fetchDeviations()
        } else {
          setDeviationError(deviationDeleteFailed)
        }
      } catch {
        setDeviationError(deviationDeleteFailed)
      } finally {
        setDeviationSaving(false)
      }
    },
    [latestDeviation, fetchDeviations, confirm, td, deviationDeleteFailed],
  )

  const handleRequestReview = useCallback(async () => {
    if (!latestDeviation) return
    setDeviationSaving(true)
    try {
      const res = await apiFetch(
        `/api/deviations/${latestDeviation.id}/request-review`,
        { method: 'POST' },
      )
      if (res.ok) {
        await fetchDeviations()
      } else {
        setDeviationError(deviationReviewFailed)
      }
    } catch {
      setDeviationError(deviationReviewFailed)
    } finally {
      setDeviationSaving(false)
    }
  }, [latestDeviation, fetchDeviations, deviationReviewFailed])

  const handleRevertToDraft = useCallback(
    async (event?: MouseEvent<HTMLButtonElement>) => {
      if (!latestDeviation) return
      const anchorEl = event?.currentTarget
      const confirmed = await confirm({
        message: td('revertToDraftConfirm'),
        title: td('revertToDraftConfirmTitle'),
        variant: 'default',
        icon: 'warning',
        anchorEl,
      })
      if (!confirmed) return
      setDeviationSaving(true)
      try {
        const res = await apiFetch(
          `/api/deviations/${latestDeviation.id}/revert-to-draft`,
          { method: 'POST' },
        )
        if (res.ok) {
          await fetchDeviations()
        } else {
          setDeviationError(deviationRevertFailed)
        }
      } catch {
        setDeviationError(deviationRevertFailed)
      } finally {
        setDeviationSaving(false)
      }
    },
    [latestDeviation, fetchDeviations, confirm, td, deviationRevertFailed],
  )

  const handleRecordDecision = useCallback(
    async (decision: 1 | 2, motivation: string, decidedBy: string) => {
      if (!latestDeviation) return
      setDeviationSaving(true)
      try {
        const res = await apiFetch(
          `/api/deviations/${latestDeviation.id}/decision`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              decision,
              decisionMotivation: motivation,
              decidedBy,
            }),
          },
        )
        if (res.ok) {
          closeDialog()
          await Promise.all([fetchDeviations(), onChange?.()])
        } else {
          setDeviationError(deviationDecisionFailed)
        }
      } catch {
        setDeviationError(deviationDecisionFailed)
      } finally {
        setDeviationSaving(false)
      }
    },
    [
      latestDeviation,
      fetchDeviations,
      onChange,
      deviationDecisionFailed,
      closeDialog,
    ],
  )

  return {
    closeDialog,
    deviationError,
    deviationHistory,
    deviationSaving,
    deviationStep,
    handleCreateDeviation,
    handleDeleteDeviation,
    handleEditDeviation,
    handleRecordDecision,
    handleRequestReview,
    handleRevertToDraft,
    latestDeviation,
    openCreateDialog: () => dispatchDialog({ type: 'open_create' }),
    openDecisionDialog: () => dispatchDialog({ type: 'open_decision' }),
    openEditDialog: () => dispatchDialog({ type: 'open_edit' }),
    showDecisionForm: dialog.mode === 'decision',
    showDeviationForm: dialog.mode === 'create',
    showEditDeviationForm: dialog.mode === 'edit',
  }
}
