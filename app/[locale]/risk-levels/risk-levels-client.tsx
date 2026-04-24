'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import StatusBadge from '@/components/StatusBadge'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'

const RISK_LEVELS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'riskLevels.overview.body',
      headingKey: 'riskLevels.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'riskLevels.manage.body',
      headingKey: 'riskLevels.manage.heading',
    },
  ],
  titleKey: 'riskLevels.title',
}

interface RiskLevel {
  color: string
  id: number
  linkedRequirementCount: number
  nameEn: string
  nameSv: string
  sortOrder: number
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

export default function RiskLevelsClient() {
  useHelpContent(RISK_LEVELS_HELP)
  const t = useTranslations('riskLevelAdmin')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const locale = useLocale()

  const getName = (r: RiskLevel) => (locale === 'sv' ? r.nameSv : r.nameEn)

  const [riskLevels, setRiskLevels] = useState<RiskLevel[]>([])
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
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    nameSv: '',
    nameEn: '',
    color: '#3b82f6',
    sortOrder: '0',
  })

  const fetchRiskLevels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/risk-levels')
      if (res.ok)
        setRiskLevels(
          ((await res.json()) as { riskLevels?: RiskLevel[] }).riskLevels ?? [],
        )
    } catch {
      setRiskLevels([])
    } finally {
      setLoading(false)
    }
  }, [])

  const linkedReqRequestId = useRef(0)

  const fetchLinkedRequirements = useCallback(async (riskLevelId: number) => {
    const requestId = ++linkedReqRequestId.current
    setLinkedRequirementsLoading(true)
    try {
      const res = await apiFetch(`/api/risk-levels/${riskLevelId}`)
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
    fetchRiskLevels()
  }, [fetchRiskLevels])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const method = editId ? 'PUT' : 'POST'
      const url = editId ? `/api/risk-levels/${editId}` : '/api/risk-levels'
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameSv: form.nameSv,
          nameEn: form.nameEn,
          color: form.color,
          sortOrder: Number(form.sortOrder) || 0,
        }),
      })
      if (!res.ok) return
      setShowForm(false)
      setEditId(null)
      setLinkedRequirements([])
      setForm({ nameSv: '', nameEn: '', color: '#3b82f6', sortOrder: '0' })
      fetchRiskLevels()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (r: RiskLevel) => {
    setEditId(r.id)
    setLinkedRequirements([])
    setForm({
      nameSv: r.nameSv,
      nameEn: r.nameEn,
      color: r.color,
      sortOrder: String(r.sortOrder),
    })
    setShowForm(true)
    fetchLinkedRequirements(r.id)
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
      const res = await apiFetch(`/api/risk-levels/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setDeleteError(
          (body as { error?: string } | null)?.error ?? tc('error'),
        )
        return
      }
      fetchRiskLevels()
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

  const inputClass =
    'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('riskLevels')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'risk-levels',
              name: 'create button',
              priority: 350,
            })}
            disabled={submitting}
            onClick={() => {
              setShowForm(true)
              setEditId(null)
              setLinkedRequirements([])
              setForm({
                nameSv: '',
                nameEn: '',
                color: '#3b82f6',
                sortOrder: '0',
              })
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {tc('create')}
          </button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6 mb-6"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
                <form
                  className="space-y-5"
                  {...devMarker({
                    context: 'risk-levels',
                    name: 'crud form',
                    priority: 340,
                    value: editId ? 'edit' : 'create',
                  })}
                  onSubmit={handleSubmit}
                >
                  <h2 className="text-lg font-semibold">
                    {editId ? tc('edit') : tc('create')}
                  </h2>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="rl-name-sv"
                    >
                      {t('name')} (SV) *
                    </label>
                    <input
                      className={inputClass}
                      id="rl-name-sv"
                      onChange={e =>
                        setForm(f => ({ ...f, nameSv: e.target.value }))
                      }
                      required
                      value={form.nameSv}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="rl-name-en"
                    >
                      {t('name')} (EN) *
                    </label>
                    <input
                      className={inputClass}
                      id="rl-name-en"
                      onChange={e =>
                        setForm(f => ({ ...f, nameEn: e.target.value }))
                      }
                      required
                      value={form.nameEn}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="rl-color"
                    >
                      {t('color')} *
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        className="h-10 w-14 rounded-lg border cursor-pointer"
                        id="rl-color"
                        onChange={e =>
                          setForm(f => ({ ...f, color: e.target.value }))
                        }
                        required
                        type="color"
                        value={form.color}
                      />
                      <input
                        aria-label={t('colorHex')}
                        className={inputClass}
                        onChange={e =>
                          setForm(f => ({ ...f, color: e.target.value }))
                        }
                        pattern="^#[0-9a-fA-F]{6}$"
                        placeholder="#3b82f6"
                        value={form.color}
                      />
                      <span
                        aria-hidden="true"
                        className="inline-block w-6 h-6 rounded-full shrink-0 border"
                        style={{ backgroundColor: form.color }}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="rl-sort-order"
                    >
                      {t('sortOrder')}
                    </label>
                    <input
                      className={inputClass}
                      id="rl-sort-order"
                      min="0"
                      onChange={e =>
                        setForm(f => ({ ...f, sortOrder: e.target.value }))
                      }
                      type="number"
                      value={form.sortOrder}
                    />
                  </div>
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
                                  key={`${req.id}-v${req.versionNumber}`}
                                >
                                  <td className="py-2 px-3 font-medium">
                                    <Link
                                      className="inline-flex items-center min-h-[44px] min-w-[44px] text-primary-700 dark:text-primary-300 hover:underline"
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
            </motion.div>
          )}
        </AnimatePresence>

        {deleteError && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            {...devMarker({
              context: 'risk-levels',
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
              context: 'risk-levels',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('color')}</th>
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('sortOrder')}</th>
                  <th className="py-3 px-4 font-medium text-center">
                    {t('linkedRequirements')}
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {riskLevels.map(r => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={r.id}
                  >
                    <td className="py-3 px-4">
                      <span
                        aria-hidden="true"
                        className="inline-block w-4 h-4 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                    </td>
                    <td className="py-3 px-4 font-medium">{getName(r)}</td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {r.sortOrder}
                    </td>
                    <td className="py-3 px-4 text-center text-secondary-600 dark:text-secondary-400">
                      {t('requirementCount', {
                        count: r.linkedRequirementCount,
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'risk-levels',
                          name: 'table action',
                          value: 'edit',
                        })}
                        disabled={submitting}
                        onClick={() => handleEdit(r)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'risk-levels',
                          name: 'table action',
                          value: 'delete',
                        })}
                        disabled={submitting || deletingId === r.id}
                        onClick={e =>
                          handleDelete(r.id, e.currentTarget as HTMLElement)
                        }
                        type="button"
                      >
                        {deletingId === r.id ? tc('loading') : tc('delete')}
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
