import { useTranslations } from 'next-intl'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import type { AddToSpecificationNeedsRefMode } from './types'

interface SpecificationOption {
  id: number
  name: string
}

interface NeedsReferenceOption {
  id: number
  text: string
}

interface AddToSpecificationDialogState {
  addToSpecificationError: string | null
  addToSpecificationStatus: 'error' | 'idle' | 'loading' | 'success'
  availableNeedsRefs: NeedsReferenceOption[]
  isOpen: boolean
  needsReferenceId: number | ''
  needsReferenceMode: AddToSpecificationNeedsRefMode
  needsReferencesError: string | null
  needsReferencesLoading: boolean
  needsReferenceText: string
  openHelp: Set<string>
  specificationId: string
  specifications: SpecificationOption[]
  specificationsError: string | null
  specificationsLoading: boolean
}

type AddToSpecificationDialogAction =
  | {
      specifications: SpecificationOption[]
      type: 'load_specifications_success'
    }
  | { specificationId: string; type: 'select_specification_start' }
  | { refs: NeedsReferenceOption[]; type: 'load_needs_refs_success' }
  | { text: string; type: 'set_needs_reference_text' }
  | {
      mode: AddToSpecificationNeedsRefMode
      needsReferenceId?: number | ''
      type: 'set_needs_reference_mode'
    }
  | { type: 'close' }
  | { type: 'load_needs_refs_finish' }
  | { type: 'load_needs_refs_start' }
  | { type: 'load_specifications_start' }
  | { type: 'open' }
  | { type: 'submit_start' }
  | { type: 'submit_success' }
  | { error: string; type: 'load_needs_refs_error' }
  | { error: string; type: 'load_specifications_error' }
  | { error: string; type: 'submit_error' }
  | { field: string; type: 'toggle_help' }

const closedState: Omit<AddToSpecificationDialogState, 'specifications'> = {
  addToSpecificationError: null,
  addToSpecificationStatus: 'idle',
  availableNeedsRefs: [],
  isOpen: false,
  needsReferenceId: '',
  needsReferenceMode: 'none',
  needsReferenceText: '',
  needsReferencesError: null,
  needsReferencesLoading: false,
  openHelp: new Set(),
  specificationId: '',
  specificationsError: null,
  specificationsLoading: false,
}

const initialState: AddToSpecificationDialogState = {
  ...closedState,
  specifications: [],
}

function resetOpenState(
  state: AddToSpecificationDialogState,
): AddToSpecificationDialogState {
  return {
    ...closedState,
    isOpen: true,
    specifications: state.specifications,
  }
}

function addToSpecificationDialogReducer(
  state: AddToSpecificationDialogState,
  action: AddToSpecificationDialogAction,
): AddToSpecificationDialogState {
  switch (action.type) {
    case 'open':
      return resetOpenState(state)
    case 'close':
      return { ...resetOpenState(state), isOpen: false }
    case 'load_specifications_start':
      return {
        ...state,
        specificationsError: null,
        specificationsLoading: true,
      }
    case 'load_specifications_success':
      return {
        ...state,
        specifications: action.specifications,
        specificationsError: null,
        specificationsLoading: false,
      }
    case 'load_specifications_error':
      return {
        ...state,
        specifications: [],
        specificationsError: action.error,
        specificationsLoading: false,
      }
    case 'select_specification_start':
      return {
        ...state,
        availableNeedsRefs: [],
        needsReferenceId: '',
        needsReferenceMode: 'none',
        needsReferenceText: '',
        needsReferencesError: null,
        needsReferencesLoading: false,
        specificationId: action.specificationId,
      }
    case 'load_needs_refs_start':
      return { ...state, needsReferencesLoading: true }
    case 'load_needs_refs_success':
      return {
        ...state,
        availableNeedsRefs: action.refs,
        needsReferencesLoading: false,
      }
    case 'load_needs_refs_error':
      return {
        ...state,
        needsReferencesError: action.error,
        needsReferencesLoading: false,
      }
    case 'load_needs_refs_finish':
      return { ...state, needsReferencesLoading: false }
    case 'set_needs_reference_mode':
      return {
        ...state,
        needsReferenceId: action.needsReferenceId ?? '',
        needsReferenceMode: action.mode,
      }
    case 'set_needs_reference_text':
      return { ...state, needsReferenceText: action.text }
    case 'submit_start':
      return {
        ...state,
        addToSpecificationError: null,
        addToSpecificationStatus: 'loading',
      }
    case 'submit_success':
      return { ...state, addToSpecificationStatus: 'success' }
    case 'submit_error':
      return {
        ...state,
        addToSpecificationError: action.error,
        addToSpecificationStatus: 'error',
      }
    case 'toggle_help': {
      const openHelp = new Set(state.openHelp)
      if (openHelp.has(action.field)) {
        openHelp.delete(action.field)
      } else {
        openHelp.add(action.field)
      }
      return { ...state, openHelp }
    }
  }
}

interface UseAddToSpecificationDialogOptions {
  requirementInternalId: number | null
}

export interface UseAddToSpecificationDialogResult {
  closeDialog: () => void
  handleSpecificationSelect: (specificationId: string) => Promise<void>
  handleSubmit: (event: FormEvent) => Promise<void>
  openDialog: () => Promise<void>
  setNeedsReferenceMode: (
    mode: AddToSpecificationNeedsRefMode,
    needsReferenceId?: number | '',
  ) => void
  setNeedsReferenceText: (text: string) => void
  state: AddToSpecificationDialogState
  toggleHelp: (field: string) => void
}

export function useAddToSpecificationDialog({
  requirementInternalId,
}: UseAddToSpecificationDialogOptions): UseAddToSpecificationDialogResult {
  const tp = useTranslations('specification')
  const tc = useTranslations('common')
  const [state, dispatch] = useReducer(
    addToSpecificationDialogReducer,
    initialState,
  )
  const dialogSessionRef = useRef(0)
  const submitAbortRef = useRef<AbortController | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const needsRefsRequestIdRef = useRef(0)
  const needsRefsAbortRef = useRef<AbortController | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const resetSubmitSession = useCallback(() => {
    dialogSessionRef.current += 1
    submitAbortRef.current?.abort()
    submitAbortRef.current = null
    clearCloseTimer()
  }, [clearCloseTimer])

  const isActiveSession = useCallback(
    (sessionId: number, signal?: AbortSignal) =>
      !signal?.aborted && dialogSessionRef.current === sessionId,
    [],
  )

  const closeDialog = useCallback(() => {
    resetSubmitSession()
    needsRefsAbortRef.current?.abort()
    needsRefsAbortRef.current = null
    dispatch({ type: 'close' })
  }, [resetSubmitSession])

  useEffect(() => {
    return () => {
      submitAbortRef.current?.abort()
      needsRefsAbortRef.current?.abort()
      clearCloseTimer()
    }
  }, [clearCloseTimer])

  const openDialog = useCallback(async () => {
    resetSubmitSession()
    needsRefsAbortRef.current?.abort()
    needsRefsAbortRef.current = null
    needsRefsRequestIdRef.current += 1
    dispatch({ type: 'open' })

    if (state.specifications.length === 0) {
      dispatch({ type: 'load_specifications_start' })
      try {
        const res = await apiFetch('/api/specifications')
        if (!res.ok) {
          const details = await readResponseMessage(res)
          throw new Error(
            details
              ? `${tp('loadSpecificationsFailed')}: ${details}`
              : tp('loadSpecificationsFailed'),
          )
        }
        const data = (await res.json()) as {
          specifications?: SpecificationOption[]
        }
        dispatch({
          specifications: data.specifications ?? [],
          type: 'load_specifications_success',
        })
      } catch (error) {
        console.error(
          'Failed to load specifications for add-to-specification dialog',
          error,
        )
        dispatch({
          error:
            error instanceof Error
              ? error.message
              : tp('loadSpecificationsFailed'),
          type: 'load_specifications_error',
        })
      }
    }
  }, [resetSubmitSession, state.specifications.length, tp])

  const handleSpecificationSelect = useCallback(
    async (specificationId: string) => {
      needsRefsAbortRef.current?.abort()
      needsRefsAbortRef.current = null
      needsRefsRequestIdRef.current += 1
      const requestId = needsRefsRequestIdRef.current
      dispatch({ specificationId, type: 'select_specification_start' })
      if (!specificationId) {
        return
      }

      const controller = new AbortController()
      needsRefsAbortRef.current = controller
      dispatch({ type: 'load_needs_refs_start' })

      try {
        const res = await apiFetch(
          `/api/specifications/${specificationId}/needs-references`,
          { signal: controller.signal },
        )
        if (!res.ok) {
          throw new Error(
            (await readResponseMessage(res)) ??
              tp('failedToLoadNeedsReferences'),
          )
        }
        const data = (await res.json()) as {
          needsReferences: NeedsReferenceOption[]
        }
        if (
          controller.signal.aborted ||
          needsRefsRequestIdRef.current !== requestId
        ) {
          return
        }
        dispatch({
          refs: data.needsReferences,
          type: 'load_needs_refs_success',
        })
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError') {
          console.error(
            'Failed to load needs references for add-to-specification dialog',
            error,
          )
          if (
            !controller.signal.aborted &&
            needsRefsRequestIdRef.current === requestId
          ) {
            dispatch({
              error:
                error instanceof Error
                  ? error.message
                  : tp('failedToLoadNeedsReferences'),
              type: 'load_needs_refs_error',
            })
          }
        }
      } finally {
        if (needsRefsAbortRef.current === controller) {
          needsRefsAbortRef.current = null
        }
        if (
          !controller.signal.aborted &&
          needsRefsRequestIdRef.current === requestId
        ) {
          dispatch({ type: 'load_needs_refs_finish' })
        }
      }
    },
    [tp],
  )

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!state.specificationId || requirementInternalId == null) return
      const sessionId = dialogSessionRef.current
      submitAbortRef.current?.abort()
      const controller = new AbortController()
      submitAbortRef.current = controller
      clearCloseTimer()
      dispatch({ type: 'submit_start' })
      const body: {
        requirementIds: number[]
        needsReferenceId?: number | null
        needsReferenceText?: string | null
      } = { requirementIds: [requirementInternalId] }
      if (
        state.needsReferenceMode === 'existing' &&
        state.needsReferenceId !== ''
      ) {
        body.needsReferenceId = Number(state.needsReferenceId)
      } else if (
        state.needsReferenceMode === 'new' &&
        state.needsReferenceText.trim()
      ) {
        body.needsReferenceText = state.needsReferenceText.trim()
      }
      try {
        const res = await apiFetch(
          `/api/specifications/${state.specificationId}/items`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        )
        if (!isActiveSession(sessionId, controller.signal)) {
          return
        }
        if (res.ok) {
          dispatch({ type: 'submit_success' })
          closeTimerRef.current = setTimeout(() => {
            if (dialogSessionRef.current === sessionId) {
              closeDialog()
            }
          }, 1200)
        } else {
          const details = await readResponseMessage(res)
          if (!isActiveSession(sessionId, controller.signal)) {
            return
          }
          dispatch({ error: details ?? tc('error'), type: 'submit_error' })
        }
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') {
          return
        }
        if (!isActiveSession(sessionId, controller.signal)) {
          return
        }
        dispatch({ error: tc('error'), type: 'submit_error' })
      } finally {
        if (submitAbortRef.current === controller) {
          submitAbortRef.current = null
        }
      }
    },
    [
      clearCloseTimer,
      closeDialog,
      isActiveSession,
      requirementInternalId,
      state.needsReferenceId,
      state.needsReferenceMode,
      state.needsReferenceText,
      state.specificationId,
      tc,
    ],
  )

  const setNeedsReferenceMode = useCallback(
    (mode: AddToSpecificationNeedsRefMode, needsReferenceId?: number | '') => {
      dispatch({ mode, needsReferenceId, type: 'set_needs_reference_mode' })
    },
    [],
  )

  const setNeedsReferenceText = useCallback((text: string) => {
    dispatch({ text, type: 'set_needs_reference_text' })
  }, [])

  const toggleHelp = useCallback((field: string) => {
    dispatch({ field, type: 'toggle_help' })
  }, [])

  return {
    closeDialog,
    handleSpecificationSelect,
    handleSubmit,
    openDialog,
    setNeedsReferenceMode,
    setNeedsReferenceText,
    state,
    toggleHelp,
  }
}
