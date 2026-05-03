import { useTranslations } from 'next-intl'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import type { AddToSpecificationNeedsRefMode } from './types'

interface PackageOption {
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
  packages: PackageOption[]
  packagesError: string | null
  packagesLoading: boolean
  specificationId: string
}

type AddToSpecificationDialogAction =
  | { packages: PackageOption[]; type: 'load_packages_success' }
  | { specificationId: string; type: 'select_package_start' }
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
  | { type: 'load_packages_start' }
  | { type: 'open' }
  | { type: 'submit_start' }
  | { type: 'submit_success' }
  | { error: string; type: 'load_needs_refs_error' }
  | { error: string; type: 'load_packages_error' }
  | { error: string; type: 'submit_error' }
  | { field: string; type: 'toggle_help' }

const closedState: Omit<AddToSpecificationDialogState, 'packages'> = {
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
  packagesError: null,
  packagesLoading: false,
}

const initialState: AddToSpecificationDialogState = {
  ...closedState,
  packages: [],
}

function resetOpenState(
  state: AddToSpecificationDialogState,
): AddToSpecificationDialogState {
  return {
    ...closedState,
    isOpen: true,
    packages: state.packages,
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
    case 'load_packages_start':
      return { ...state, packagesError: null, packagesLoading: true }
    case 'load_packages_success':
      return {
        ...state,
        packages: action.packages,
        packagesError: null,
        packagesLoading: false,
      }
    case 'load_packages_error':
      return {
        ...state,
        packages: [],
        packagesError: action.error,
        packagesLoading: false,
      }
    case 'select_package_start':
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
  handlePackageSelect: (specificationId: string) => Promise<void>
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

    if (state.packages.length === 0) {
      dispatch({ type: 'load_packages_start' })
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
          packages?: PackageOption[]
        }
        dispatch({
          packages: data.packages ?? [],
          type: 'load_packages_success',
        })
      } catch (error) {
        console.error(
          'Failed to load packages for add-to-package dialog',
          error,
        )
        dispatch({
          error:
            error instanceof Error
              ? error.message
              : tp('loadSpecificationsFailed'),
          type: 'load_packages_error',
        })
      }
    }
  }, [resetSubmitSession, state.packages.length, tp])

  const handlePackageSelect = useCallback(
    async (specificationId: string) => {
      needsRefsAbortRef.current?.abort()
      needsRefsAbortRef.current = null
      needsRefsRequestIdRef.current += 1
      const requestId = needsRefsRequestIdRef.current
      dispatch({ specificationId, type: 'select_package_start' })
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
            'Failed to load needs references for add-to-package dialog',
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
    handlePackageSelect,
    handleSubmit,
    openDialog,
    setNeedsReferenceMode,
    setNeedsReferenceText,
    state,
    toggleHelp,
  }
}
