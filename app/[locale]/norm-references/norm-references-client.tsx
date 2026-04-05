'use client'

import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import NormReferenceFormFields from '@/components/NormReferenceFormFields'
import StatusBadge from '@/components/StatusBadge'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'

const NORM_REFERENCES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'normReferences.overview.body',
      headingKey: 'normReferences.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'normReferences.idGeneration.body',
      headingKey: 'normReferences.idGeneration.heading',
    },
    {
      kind: 'text',
      bodyKey: 'normReferences.manage.body',
      headingKey: 'normReferences.manage.heading',
    },
  ],
  titleKey: 'normReferences.title',
}

interface NormReference {
  id: number
  issuer: string
  linkedRequirementCount: number
  name: string
  normReferenceId: string
  reference: string
  type: string
  updatedAt: string
  version: string | null
}

interface LinkedRequirement {
  description: string | null
  id: number
  statusColor: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

const DESCRIPTION_TRUNCATE = 80

export default function NormReferencesClient() {
  useHelpContent(NORM_REFERENCES_HELP)
  const t = useTranslations('normReference')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const locale = useLocale()

  const [normReferences, setNormReferences] = useState<NormReference[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [linkedRequirements, setLinkedRequirements] = useState<
    LinkedRequirement[]
  >([])
  const [linkedRequirementsLoading, setLinkedRequirementsLoading] =
    useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    normReferenceId: '',
    name: '',
    type: '',
    reference: '',
    version: '',
    issuer: '',
  })

  const fetchNormReferences = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/norm-references')
      if (res.ok)
        setNormReferences(
          ((await res.json()) as { normReferences?: NormReference[] })
            .normReferences ?? [],
        )
    } catch {
      setNormReferences([])
    } finally {
      setLoading(false)
    }
  }, [])

  const linkedReqRequestId = useRef(0)

  const fetchLinkedRequirements = useCallback(async (id: number) => {
    const requestId = ++linkedReqRequestId.current
    setLinkedRequirementsLoading(true)
    try {
      const res = await fetch(`/api/norm-references/${id}`)
      if (res.ok && requestId === linkedReqRequestId.current) {
        const data = (await res.json()) as {
          linkedRequirements?: LinkedRequirement[]
        }
        setLinkedRequirements(data.linkedRequirements ?? [])
      }
    } catch {
      // Keep existing linkedRequirements on error
    } finally {
      if (requestId === linkedReqRequestId.current) {
        setLinkedRequirementsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchNormReferences()
  }, [fetchNormReferences])

  const resetForm = () => {
    setForm({
      normReferenceId: '',
      name: '',
      type: '',
      reference: '',
      version: '',
      issuer: '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const method = editId ? 'PUT' : 'POST'
      const url = editId
        ? `/api/norm-references/${editId}`
        : '/api/norm-references'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normReferenceId: form.normReferenceId || undefined,
          name: form.name,
          type: form.type,
          reference: form.reference,
          version: form.version || null,
          issuer: form.issuer,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setFormError((body as { error?: string } | null)?.error ?? tc('error'))
        return
      }
      setFormError(null)
      setShowForm(false)
      setEditId(null)
      setLinkedRequirements([])
      resetForm()
      fetchNormReferences()
    } catch {
      setFormError(tc('error'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (nr: NormReference) => {
    setEditId(nr.id)
    setFormError(null)
    setLinkedRequirements([])
    setForm({
      normReferenceId: nr.normReferenceId,
      name: nr.name,
      type: nr.type,
      reference: nr.reference,
      version: nr.version ?? '',
      issuer: nr.issuer,
    })
    setShowForm(true)
    fetchLinkedRequirements(nr.id)
  }

  const { confirm } = useConfirmModal()

  const handleDelete = async (id: number, anchorEl?: HTMLElement) => {
    if (
      !(await confirm({
        message: tc('confirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return
    setDeleteError(null)
    setDeletingId(id)
    try {
      const res = await fetch(`/api/norm-references/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setDeleteError(
          (body as { error?: string } | null)?.error ?? tc('error'),
        )
        return
      }
      fetchNormReferences()
    } catch {
      setDeleteError(tc('error'))
    } finally {
      setDeletingId(null)
    }
  }

  const truncateDescription = (text: string | null) => {
    if (!text) return null
    if (text.length <= DESCRIPTION_TRUNCATE) return text
    return `${text.slice(0, DESCRIPTION_TRUNCATE)}…`
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('normReferences')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'normReferences',
              name: 'create button',
              priority: 350,
            })}
            disabled={submitting}
            onClick={() => {
              setShowForm(true)
              setEditId(null)
              setLinkedRequirements([])
              setFormError(null)
              resetForm()
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {tc('create')}
          </button>
        </div>

        {showForm && (
          <div className="glass rounded-2xl p-6 mb-6 animate-fade-in-up">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
              <form
                className="space-y-4"
                {...devMarker({
                  context: 'normReferences',
                  name: 'crud form',
                  priority: 340,
                  value: editId ? 'edit' : 'create',
                })}
                onSubmit={handleSubmit}
              >
                <h2 className="text-lg font-semibold">
                  {editId ? t('editNormReference') : t('newNormReference')}
                </h2>
                <NormReferenceFormFields
                  form={form}
                  idPrefix="nr"
                  onSetField={(field, value) =>
                    setForm(f => ({ ...f, [field]: value }))
                  }
                />
                {formError && (
                  <p
                    className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                    role="alert"
                  >
                    {formError}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    className="btn-primary"
                    disabled={submitting}
                    type="submit"
                  >
                    {submitting ? tc('saving') : tc('save')}
                  </button>
                  <button
                    className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                    disabled={submitting}
                    onClick={() => {
                      setShowForm(false)
                      setLinkedRequirements([])
                    }}
                    type="button"
                  >
                    {tc('cancel')}
                  </button>
                </div>
              </form>

              {editId && (
                <div>
                  <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-3">
                    {t('linkedRequirements')}
                  </h3>
                  {linkedRequirementsLoading ? (
                    <p className="text-sm text-secondary-500 dark:text-secondary-400">
                      {tc('loading')}
                    </p>
                  ) : linkedRequirements.length === 0 ? (
                    <p className="text-sm text-secondary-500 dark:text-secondary-400">
                      {tc('noneAvailable')}
                    </p>
                  ) : (
                    <div className="rounded-xl border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                            <th className="py-2 px-3 font-medium">
                              {tr('uniqueId')}
                            </th>
                            <th className="py-2 px-3 font-medium">
                              {tr('description')}
                            </th>
                            <th className="py-2 px-3 font-medium">
                              {tc('version')}
                            </th>
                            <th className="py-2 px-3 font-medium">
                              {tr('status')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {linkedRequirements.map(req => {
                            const truncated = truncateDescription(
                              req.description,
                            )
                            const isTruncated =
                              truncated !== req.description &&
                              req.description != null
                            return (
                              <tr
                                className="border-b last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                                key={req.id}
                              >
                                <td className="py-2 px-3 font-medium">
                                  <Link
                                    className="inline-flex items-center min-h-[44px] min-w-[44px] rounded text-primary-700 dark:text-primary-300 hover:underline focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus:outline-none"
                                    href={`/requirements/${req.uniqueId}/${req.versionNumber}`}
                                  >
                                    {req.uniqueId}
                                  </Link>
                                </td>
                                <td
                                  className="py-2 px-3 text-secondary-600 dark:text-secondary-400 max-w-xs"
                                  title={
                                    isTruncated
                                      ? (req.description ?? undefined)
                                      : undefined
                                  }
                                >
                                  {truncated ?? '—'}
                                </td>
                                <td className="py-2 px-3 text-secondary-600 dark:text-secondary-400">
                                  v{req.versionNumber}
                                </td>
                                <td className="py-2 px-3">
                                  <StatusBadge
                                    color={req.statusColor}
                                    label={
                                      (locale === 'sv'
                                        ? req.statusNameSv
                                        : req.statusNameEn) ?? ''
                                    }
                                  />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {deleteError && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            role="alert"
            {...devMarker({
              context: 'normReferences',
              name: 'error banner',
              priority: 340,
              value: 'delete-error',
            })}
          >
            {deleteError}
          </p>
        )}

        {loading ? (
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loading')}
          </p>
        ) : (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-x-auto"
            {...devMarker({
              context: 'normReferences',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">
                    {t('normReferenceId')}
                  </th>
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('type')}</th>
                  <th className="py-3 px-4 font-medium">{t('reference')}</th>
                  <th className="py-3 px-4 font-medium">{t('version')}</th>
                  <th className="py-3 px-4 font-medium">{t('issuer')}</th>
                  <th className="py-3 px-4 font-medium text-center">
                    {t('linkedRequirements')}
                  </th>
                  <th className="py-3 px-4">
                    <span className="sr-only">{tc('actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {normReferences.map(nr => (
                  <tr
                    className="border-b last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={nr.id}
                  >
                    <td className="py-3 px-4 font-mono text-xs font-medium text-secondary-700 dark:text-secondary-300">
                      {nr.normReferenceId}
                    </td>
                    <td className="py-3 px-4 font-medium">{nr.name}</td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {nr.type}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {nr.reference}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {nr.version ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {nr.issuer}
                    </td>
                    <td className="py-3 px-4 text-center text-secondary-600 dark:text-secondary-400">
                      {t('requirementCount', {
                        count: nr.linkedRequirementCount,
                      })}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'normReferences',
                          name: 'table action',
                          value: 'edit',
                        })}
                        disabled={submitting}
                        onClick={() => handleEdit(nr)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'normReferences',
                          name: 'table action',
                          value: 'delete',
                        })}
                        disabled={submitting || deletingId === nr.id}
                        onClick={e =>
                          handleDelete(nr.id, e.currentTarget as HTMLElement)
                        }
                        type="button"
                      >
                        {deletingId === nr.id ? tc('loading') : tc('delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
