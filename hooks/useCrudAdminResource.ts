'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

type CrudId = number | string

interface CrudAdminMutationErrorDetails {
  anchorEl?: HTMLElement
  error?: unknown
  message: string
  response?: Response
}

interface CrudAdminResourceOptions<TItem extends { id: CrudId }, TForm> {
  confirmDeleteMessage: string
  endpoint: string
  errorMessage: string
  getCaughtErrorMessage?: (error: unknown) => string
  getInitialForm: () => TForm
  itemEndpoint?: (id: TItem['id']) => string
  listEndpoint?: string
  listKey: string
  onDeleteError?: (
    details: CrudAdminMutationErrorDetails,
  ) => Promise<void> | void
  onSubmitError?: (
    details: CrudAdminMutationErrorDetails,
  ) => Promise<void> | void
  reloadOnDeleteError?: boolean
  toCreatePayload?: (form: TForm) => unknown
  toForm: (item: TItem) => TForm
  toPayload: (form: TForm) => unknown
  toUpdatePayload?: (form: TForm) => unknown
}

export interface CrudAdminResourceController<
  TItem extends { id: CrudId },
  TForm,
> {
  closeForm: () => void
  deleteError: string | null
  deletingIds: Set<TItem['id']>
  editId: TItem['id'] | null
  form: TForm
  formError: string | null
  items: TItem[]
  loadError: string | null
  loading: boolean
  openCreate: () => void
  openEdit: (item: TItem) => void
  reload: () => Promise<void>
  remove: (id: TItem['id'], anchorEl?: HTMLElement) => Promise<boolean>
  setForm: React.Dispatch<React.SetStateAction<TForm>>
  showForm: boolean
  submit: (event?: React.FormEvent<HTMLFormElement>) => Promise<boolean>
  submitting: boolean
}

function readItems<TItem>(body: unknown, listKey: string): TItem[] {
  if (!body || typeof body !== 'object') return []
  const value = (body as Record<string, unknown>)[listKey]
  return Array.isArray(value) ? (value as TItem[]) : []
}

function readCaughtErrorMessage(
  error: unknown,
  fallback: string,
  getCaughtErrorMessage?: (error: unknown) => string,
): string {
  return (
    getCaughtErrorMessage?.(error) ??
    (error instanceof Error ? error.message || fallback : fallback)
  )
}

function readSubmitAnchor(
  event?: React.FormEvent<HTMLFormElement>,
): HTMLElement | undefined {
  const nativeEvent = event?.nativeEvent as
    | (Event & { submitter?: EventTarget | null })
    | undefined
  return nativeEvent?.submitter instanceof HTMLElement
    ? nativeEvent.submitter
    : undefined
}

export function useCrudAdminResource<TItem extends { id: CrudId }, TForm>({
  confirmDeleteMessage,
  endpoint,
  errorMessage,
  getCaughtErrorMessage,
  getInitialForm,
  itemEndpoint,
  listEndpoint,
  listKey,
  onDeleteError,
  onSubmitError,
  reloadOnDeleteError = false,
  toCreatePayload,
  toForm,
  toPayload,
  toUpdatePayload,
}: CrudAdminResourceOptions<TItem, TForm>): CrudAdminResourceController<
  TItem,
  TForm
> {
  const { confirm } = useConfirmModal()
  const [items, setItems] = useState<TItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<TItem['id'] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<TItem['id']>>(new Set())
  const [form, setForm] = useState<TForm>(() => getInitialForm())
  const submittingRef = useRef(false)
  const editIdRef = useRef<TItem['id'] | null>(null)
  const getCaughtErrorMessageRef = useRef(getCaughtErrorMessage)
  getCaughtErrorMessageRef.current = getCaughtErrorMessage

  useEffect(() => {
    editIdRef.current = editId
  }, [editId])

  const setTrackedEditId = useCallback((nextEditId: TItem['id'] | null) => {
    editIdRef.current = nextEditId
    setEditId(nextEditId)
  }, [])

  const resolveItemEndpoint = useCallback(
    (id: TItem['id']) => itemEndpoint?.(id) ?? `${endpoint}/${id}`,
    [endpoint, itemEndpoint],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await apiFetch(listEndpoint ?? endpoint)
      if (!response.ok) {
        setLoadError((await readResponseMessage(response)) ?? errorMessage)
        return
      }
      setItems(readItems<TItem>(await response.json(), listKey))
    } catch (error) {
      setLoadError(
        readCaughtErrorMessage(
          error,
          errorMessage,
          getCaughtErrorMessageRef.current,
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [endpoint, errorMessage, listEndpoint, listKey])

  useEffect(() => {
    void reload()
  }, [reload])

  const closeForm = useCallback(() => {
    setShowForm(false)
  }, [])

  const openCreate = useCallback(() => {
    setTrackedEditId(null)
    setForm(getInitialForm())
    setFormError(null)
    setDeleteError(null)
    setShowForm(true)
  }, [getInitialForm, setTrackedEditId])

  const openEdit = useCallback(
    (item: TItem) => {
      setTrackedEditId(item.id)
      setForm(toForm(item))
      setFormError(null)
      setDeleteError(null)
      setShowForm(true)
    },
    [setTrackedEditId, toForm],
  )

  const submit = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault()
      if (submittingRef.current) return false
      const anchorEl = readSubmitAnchor(event)
      submittingRef.current = true
      setSubmitting(true)
      setFormError(null)
      try {
        const activeEditId = editId
        const payload =
          activeEditId === null
            ? (toCreatePayload ?? toPayload)(form)
            : (toUpdatePayload ?? toPayload)(form)
        const response = await apiFetch(
          activeEditId === null ? endpoint : resolveItemEndpoint(activeEditId),
          {
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' },
            method: activeEditId === null ? 'POST' : 'PUT',
          },
        )
        if (!response.ok) {
          const message = (await readResponseMessage(response)) ?? errorMessage
          if (onSubmitError) {
            await onSubmitError({ anchorEl, message, response })
          } else {
            setFormError(message)
          }
          return false
        }
        setShowForm(false)
        setTrackedEditId(null)
        setForm(getInitialForm())
        await reload()
        return true
      } catch (error) {
        const message = readCaughtErrorMessage(
          error,
          errorMessage,
          getCaughtErrorMessage,
        )
        if (onSubmitError) {
          await onSubmitError({ anchorEl, error, message })
        } else {
          setFormError(message)
        }
        return false
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [
      editId,
      endpoint,
      errorMessage,
      form,
      getCaughtErrorMessage,
      getInitialForm,
      onSubmitError,
      reload,
      resolveItemEndpoint,
      setTrackedEditId,
      toPayload,
      toCreatePayload,
      toUpdatePayload,
    ],
  )

  const remove = useCallback(
    async (id: TItem['id'], anchorEl?: HTMLElement) => {
      if (
        !(await confirm({
          anchorEl,
          icon: 'caution',
          message: confirmDeleteMessage,
          variant: 'danger',
        }))
      ) {
        return false
      }
      setDeleteError(null)
      setDeletingIds(previousIds => new Set(previousIds).add(id))
      try {
        const response = await apiFetch(resolveItemEndpoint(id), {
          method: 'DELETE',
        })
        if (!response.ok) {
          const message = (await readResponseMessage(response)) ?? errorMessage
          if (onDeleteError) {
            await onDeleteError({ anchorEl, message, response })
          } else {
            setDeleteError(message)
          }
          if (reloadOnDeleteError) await reload()
          return false
        }
        setEditId(previousEditId =>
          previousEditId === id ? null : previousEditId,
        )
        if (editIdRef.current === id) {
          editIdRef.current = null
          setShowForm(false)
          setForm(getInitialForm())
        }
        await reload()
        return true
      } catch (error) {
        const message = readCaughtErrorMessage(
          error,
          errorMessage,
          getCaughtErrorMessage,
        )
        if (onDeleteError) {
          await onDeleteError({ anchorEl, error, message })
        } else {
          setDeleteError(message)
        }
        if (reloadOnDeleteError) await reload()
        return false
      } finally {
        setDeletingIds(previousIds => {
          const nextIds = new Set(previousIds)
          nextIds.delete(id)
          return nextIds
        })
      }
    },
    [
      confirm,
      confirmDeleteMessage,
      errorMessage,
      getCaughtErrorMessage,
      getInitialForm,
      onDeleteError,
      reload,
      reloadOnDeleteError,
      resolveItemEndpoint,
    ],
  )

  return {
    closeForm,
    deleteError,
    deletingIds,
    editId,
    form,
    formError,
    items,
    loading,
    loadError,
    openCreate,
    openEdit,
    reload,
    remove,
    setForm,
    showForm,
    submit,
    submitting,
  }
}
