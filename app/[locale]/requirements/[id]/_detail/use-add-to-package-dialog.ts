import { useTranslations } from 'next-intl'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import type { AddToPackageNeedsRefMode } from './types'

interface PackageOption {
  id: number
  name: string
}

interface NeedsReferenceOption {
  id: number
  text: string
}

interface AddToPackageDialogState {
  addToPackageError: string | null
  addToPackageStatus: 'error' | 'idle' | 'loading' | 'success'
  availableNeedsRefs: NeedsReferenceOption[]
  isOpen: boolean
  needsReferenceId: number | ''
  needsReferenceMode: AddToPackageNeedsRefMode
  needsReferencesError: string | null
  needsReferencesLoading: boolean
  needsReferenceText: string
  openHelp: Set<string>
  packageId: string
  packages: PackageOption[]
  packagesError: string | null
  packagesLoading: boolean
}

type AddToPackageDialogAction =
  | { packages: PackageOption[]; type: 'load_packages_success' }
  | { packageId: string; type: 'select_package_start' }
  | { refs: NeedsReferenceOption[]; type: 'load_needs_refs_success' }
  | { text: string; type: 'set_needs_reference_text' }
  | {
      mode: AddToPackageNeedsRefMode
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

const closedState: Omit<AddToPackageDialogState, 'packages'> = {
  addToPackageError: null,
  addToPackageStatus: 'idle',
  availableNeedsRefs: [],
  isOpen: false,
  needsReferenceId: '',
  needsReferenceMode: 'none',
  needsReferenceText: '',
  needsReferencesError: null,
  needsReferencesLoading: false,
  openHelp: new Set(),
  packageId: '',
  packagesError: null,
  packagesLoading: false,
}

const initialState: AddToPackageDialogState = {
  ...closedState,
  packages: [],
}

function resetOpenState(
  state: AddToPackageDialogState,
): AddToPackageDialogState {
  return {
    ...closedState,
    isOpen: true,
    packages: state.packages,
  }
}

function addToPackageDialogReducer(
  state: AddToPackageDialogState,
  action: AddToPackageDialogAction,
): AddToPackageDialogState {
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
        packageId: action.packageId,
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
        addToPackageError: null,
        addToPackageStatus: 'loading',
      }
    case 'submit_success':
      return { ...state, addToPackageStatus: 'success' }
    case 'submit_error':
      return {
        ...state,
        addToPackageError: action.error,
        addToPackageStatus: 'error',
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

interface UseAddToPackageDialogOptions {
  requirementInternalId: number | null
}

export interface UseAddToPackageDialogResult {
  closeDialog: () => void
  handlePackageSelect: (packageId: string) => Promise<void>
  handleSubmit: (event: FormEvent) => Promise<void>
  openDialog: () => Promise<void>
  setNeedsReferenceMode: (
    mode: AddToPackageNeedsRefMode,
    needsReferenceId?: number | '',
  ) => void
  setNeedsReferenceText: (text: string) => void
  state: AddToPackageDialogState
  toggleHelp: (field: string) => void
}

export function useAddToPackageDialog({
  requirementInternalId,
}: UseAddToPackageDialogOptions): UseAddToPackageDialogResult {
  const tp = useTranslations('package')
  const tc = useTranslations('common')
  const [state, dispatch] = useReducer(addToPackageDialogReducer, initialState)
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
        const res = await apiFetch('/api/requirement-packages')
        if (!res.ok) {
          const details = await readResponseMessage(res)
          throw new Error(
            details
              ? `${tp('loadPackagesFailed')}: ${details}`
              : tp('loadPackagesFailed'),
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
            error instanceof Error ? error.message : tp('loadPackagesFailed'),
          type: 'load_packages_error',
        })
      }
    }
  }, [resetSubmitSession, state.packages.length, tp])

  const handlePackageSelect = useCallback(
    async (packageId: string) => {
      needsRefsAbortRef.current?.abort()
      needsRefsAbortRef.current = null
      needsRefsRequestIdRef.current += 1
      const requestId = needsRefsRequestIdRef.current
      dispatch({ packageId, type: 'select_package_start' })
      if (!packageId) {
        return
      }

      const controller = new AbortController()
      needsRefsAbortRef.current = controller
      dispatch({ type: 'load_needs_refs_start' })

      try {
        const res = await apiFetch(
          `/api/requirement-packages/${packageId}/needs-references`,
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
      if (!state.packageId || requirementInternalId == null) return
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
          `/api/requirement-packages/${state.packageId}/items`,
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
      state.packageId,
      tc,
    ],
  )

  const setNeedsReferenceMode = useCallback(
    (mode: AddToPackageNeedsRefMode, needsReferenceId?: number | '') => {
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
