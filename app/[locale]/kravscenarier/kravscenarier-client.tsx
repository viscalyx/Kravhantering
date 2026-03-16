'use client'

import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import StatusBadge from '@/components/StatusBadge'
import { Link } from '@/i18n/routing'

interface Owner {
  email: string
  firstName: string
  id: number
  lastName: string
}

interface Scenario {
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  linkedRequirementCount: number
  nameEn: string
  nameSv: string
  owner: Owner | null
  ownerId: number | null
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

export default function KravscenarierClient() {
  const t = useTranslations('scenario')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const locale = useLocale()

  const getName = (s: Scenario) => (locale === 'sv' ? s.nameSv : s.nameEn)
  const getDescription = (s: Scenario) =>
    locale === 'sv' ? s.descriptionSv : s.descriptionEn

  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [owners, setOwners] = useState<Owner[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [linkedRequirements, setLinkedRequirements] = useState<
    LinkedRequirement[]
  >([])
  const [linkedRequirementsLoading, setLinkedRequirementsLoading] =
    useState(false)
  const [form, setForm] = useState({
    nameSv: '',
    nameEn: '',
    descriptionSv: '',
    descriptionEn: '',
    ownerId: '',
  })

  const fetchScenarios = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/usage-scenarios')
      if (res.ok)
        setScenarios(
          ((await res.json()) as { scenarios?: Scenario[] }).scenarios ?? [],
        )
    } catch {
      setScenarios([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchOwners = useCallback(async () => {
    try {
      const res = await fetch('/api/owners/all')
      if (res.ok)
        setOwners(((await res.json()) as { owners?: Owner[] }).owners ?? [])
    } catch {
      setOwners([])
    }
  }, [])

  const linkedReqRequestId = useRef(0)

  const fetchLinkedRequirements = useCallback(async (scenarioId: number) => {
    const requestId = ++linkedReqRequestId.current
    setLinkedRequirementsLoading(true)
    try {
      const res = await fetch(`/api/usage-scenarios/${scenarioId}`)
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
    fetchScenarios()
    fetchOwners()
  }, [fetchScenarios, fetchOwners])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const method = editId ? 'PUT' : 'POST'
      const url = editId
        ? `/api/usage-scenarios/${editId}`
        : '/api/usage-scenarios'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameSv: form.nameSv,
          nameEn: form.nameEn,
          descriptionSv: form.descriptionSv || undefined,
          descriptionEn: form.descriptionEn || undefined,
          ownerId: form.ownerId ? Number(form.ownerId) : null,
        }),
      })
      if (!res.ok) return
      setShowForm(false)
      setEditId(null)
      setLinkedRequirements([])
      setForm({
        nameSv: '',
        nameEn: '',
        descriptionSv: '',
        descriptionEn: '',
        ownerId: '',
      })
      fetchScenarios()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (s: Scenario) => {
    setEditId(s.id)
    setLinkedRequirements([])
    setForm({
      nameSv: s.nameSv,
      nameEn: s.nameEn,
      descriptionSv: s.descriptionSv ?? '',
      descriptionEn: s.descriptionEn ?? '',
      ownerId: s.ownerId != null ? String(s.ownerId) : '',
    })
    setShowForm(true)
    fetchLinkedRequirements(s.id)
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
    await fetch(`/api/usage-scenarios/${id}`, { method: 'DELETE' })
    fetchScenarios()
  }

  const getOwnerName = (s: Scenario) => {
    if (s.owner) return `${s.owner.firstName} ${s.owner.lastName}`
    return '—'
  }

  const truncateDescription = (text: string | null) => {
    if (!text) return null
    if (text.length <= DESCRIPTION_TRUNCATE) return text
    return `${text.slice(0, DESCRIPTION_TRUNCATE)}…`
  }

  const selectClass =
    'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('scenarios')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            data-developer-mode-context="scenarios"
            data-developer-mode-name="create button"
            data-developer-mode-priority="350"
            disabled={submitting}
            onClick={() => {
              setShowForm(true)
              setEditId(null)
              setLinkedRequirements([])
              setForm({
                nameSv: '',
                nameEn: '',
                descriptionSv: '',
                descriptionEn: '',
                ownerId: '',
              })
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
                className="space-y-5"
                data-developer-mode-context="scenarios"
                data-developer-mode-name="crud form"
                data-developer-mode-priority="340"
                data-developer-mode-value={editId ? 'edit' : 'create'}
                onSubmit={handleSubmit}
              >
                <h2 className="text-lg font-semibold">
                  {editId ? tc('edit') : tc('create')}
                </h2>
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    htmlFor="scen-name-sv"
                  >
                    {t('name')} (SV) *
                  </label>
                  <input
                    className={selectClass}
                    id="scen-name-sv"
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
                    htmlFor="scen-name-en"
                  >
                    {t('name')} (EN) *
                  </label>
                  <input
                    className={selectClass}
                    id="scen-name-en"
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
                    htmlFor="scen-desc-sv"
                  >
                    {t('description')} (SV)
                  </label>
                  <textarea
                    className={selectClass}
                    id="scen-desc-sv"
                    onChange={e =>
                      setForm(f => ({ ...f, descriptionSv: e.target.value }))
                    }
                    value={form.descriptionSv}
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    htmlFor="scen-desc-en"
                  >
                    {t('description')} (EN)
                  </label>
                  <textarea
                    className={selectClass}
                    id="scen-desc-en"
                    onChange={e =>
                      setForm(f => ({ ...f, descriptionEn: e.target.value }))
                    }
                    value={form.descriptionEn}
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    htmlFor="scen-owner"
                  >
                    {t('owner')}
                  </label>
                  <select
                    className={selectClass}
                    id="scen-owner"
                    onChange={e =>
                      setForm(f => ({ ...f, ownerId: e.target.value }))
                    }
                    value={form.ownerId}
                  >
                    <option value="">{t('owner')}...</option>
                    {owners.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.firstName} {o.lastName}
                      </option>
                    ))}
                  </select>
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
                                key={req.id}
                              >
                                <td className="py-2 px-3 font-medium">
                                  <Link
                                    className="text-primary-700 dark:text-primary-300 hover:underline"
                                    href={`/kravkatalog/${req.uniqueId}/${req.versionNumber}`}
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

        {loading ? (
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loading')}
          </p>
        ) : (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-x-auto"
            data-developer-mode-context="scenarios"
            data-developer-mode-name="crud table"
            data-developer-mode-priority="340"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('description')}</th>
                  <th className="py-3 px-4 font-medium">{t('owner')}</th>
                  <th className="py-3 px-4 font-medium text-center">
                    {t('linkedRequirements')}
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={s.id}
                  >
                    <td className="py-3 px-4 font-medium">{getName(s)}</td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400 truncate max-w-xs">
                      {getDescription(s) ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {getOwnerName(s)}
                    </td>
                    <td className="py-3 px-4 text-center text-secondary-600 dark:text-secondary-400">
                      {t('requirementCount', {
                        count: s.linkedRequirementCount,
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        data-developer-mode-context="scenarios"
                        data-developer-mode-name="table action"
                        data-developer-mode-value="edit"
                        disabled={submitting}
                        onClick={() => handleEdit(s)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        data-developer-mode-context="scenarios"
                        data-developer-mode-name="table action"
                        data-developer-mode-value="delete"
                        disabled={submitting}
                        onClick={e =>
                          handleDelete(s.id, e.currentTarget as HTMLElement)
                        }
                        type="button"
                      >
                        {tc('delete')}
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
