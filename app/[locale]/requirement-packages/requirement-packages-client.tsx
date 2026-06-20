'use client'

import {
  Archive,
  Info,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRoundCog,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FloatingActionRail from '@/components/FloatingActionRail'
import FormModal from '@/components/FormModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import HsaPersonChangeModal, {
  type HsaPersonChangeSubmitResult,
} from '@/components/HsaPersonChangeModal'
import HsaPersonVerifyField, {
  type HsaPersonVerification,
} from '@/components/HsaPersonVerifyField'
import { modalResizableTextareaClassName } from '@/components/modal-textarea-class'
import RequiredFieldsHint from '@/components/RequiredFieldsHint'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { isSwedish } from '@/lib/i18n/localized'
import { resolveStatusLabel } from '@/lib/requirements/status-label'

const REQUIREMENT_PACKAGES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementPackages.overview.body',
      headingKey: 'requirementPackages.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementPackages.manage.body',
      headingKey: 'requirementPackages.manage.heading',
    },
  ],
  titleKey: 'requirementPackages.title',
}

interface RequirementPackage {
  coAuthors: RequirementPackageCoAuthor[]
  description: string | null
  id: number
  isArchived: boolean
  leadDisplayName: string
  leadEmail: string | null
  leadHsaId: string
  linkedRequirementCount: number
  name: string
}

interface RequirementPackageCoAuthor {
  displayName: string
  email: string | null
  hsaId: string
}

interface RequirementPackageCoAuthorForm {
  clientId: string
  displayName: string
  email: string
  hsaId: string
  persistedHsaId: string | null
  personVerification: HsaPersonVerification | null
}

interface RequirementPackageForm {
  coAuthors: RequirementPackageCoAuthorForm[]
  description: string
  leadDisplayName: string
  leadEmail: string
  leadHsaId: string
  leadPersonVerification: HsaPersonVerification | null
  name: string
}

interface LinkedRequirement {
  archiveInitiatedAt: string | null
  description: string | null
  id: number
  statusColor: string | null
  statusIconName: string | null
  statusId: number | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

interface CurrentUser {
  displayName: string
  email: string
  hsaId: string
  roles: string[]
}

interface PackageLeadChangeState {
  currentLeadHsaId: string
  packageId: number
}

interface LinkedRequirementsModalState {
  linkedRequirementCount: number
  packageId: number
  packageName: string
}

const DESCRIPTION_TRUNCATE = 80
const REQUIREMENT_PACKAGE_TABLE_COLUMN_COUNT = 6
let coAuthorClientIdSequence = 0

const createCoAuthorClientId = () => {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return randomId
  coAuthorClientIdSequence += 1
  return `co-author-${coAuthorClientIdSequence}`
}

const getInitialForm = (): RequirementPackageForm => ({
  coAuthors: [],
  description: '',
  leadDisplayName: '',
  leadEmail: '',
  leadHsaId: '',
  leadPersonVerification: null,
  name: '',
})

const toForm = (
  requirementPackage: RequirementPackage,
): RequirementPackageForm => ({
  coAuthors: (requirementPackage.coAuthors ?? []).map(coAuthor => ({
    clientId: createCoAuthorClientId(),
    displayName: coAuthor.displayName,
    email: coAuthor.email ?? '',
    hsaId: coAuthor.hsaId,
    persistedHsaId: coAuthor.hsaId.trim(),
    personVerification: null,
  })),
  description: requirementPackage.description ?? '',
  leadDisplayName: requirementPackage.leadDisplayName,
  leadEmail: requirementPackage.leadEmail ?? '',
  leadHsaId: requirementPackage.leadHsaId,
  leadPersonVerification: null,
  name: requirementPackage.name,
})

const coAuthorHsaIdsFromForm = (form: RequirementPackageForm) =>
  form.coAuthors.map(coAuthor => coAuthor.hsaId.trim()).filter(Boolean)

const hasUnsavedCoAuthorEntry = (
  coAuthors: readonly RequirementPackageCoAuthorForm[],
) =>
  coAuthors.some(
    coAuthor =>
      coAuthor.persistedHsaId === null ||
      coAuthor.hsaId.trim() !== coAuthor.persistedHsaId,
  )

const toCreatePayload = (form: RequirementPackageForm) => ({
  coAuthorHsaIds: coAuthorHsaIdsFromForm(form),
  description: form.description || undefined,
  name: form.name,
})

const toUpdatePayload = (form: RequirementPackageForm) => ({
  coAuthorHsaIds: coAuthorHsaIdsFromForm(form),
  description: form.description || undefined,
  name: form.name,
})

const toPayload = toUpdatePayload

function readCurrentUser(body: unknown): CurrentUser | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  if (record.authenticated !== true || typeof record.hsaId !== 'string') {
    return null
  }

  const hsaId = record.hsaId.trim()
  if (!hsaId) return null

  const name =
    typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : hsaId
  const email = typeof record.email === 'string' ? record.email : ''

  return {
    displayName: name,
    email,
    hsaId,
    roles: Array.isArray(record.roles)
      ? record.roles.filter((role): role is string => typeof role === 'string')
      : [],
  }
}

const packageEditableSignature = (form: RequirementPackageForm) =>
  JSON.stringify({
    coAuthorHsaIds: coAuthorHsaIdsFromForm(form),
    description: form.description,
    name: form.name,
  })

const packageEditableSignatureFromItem = (
  requirementPackage: RequirementPackage,
) =>
  JSON.stringify({
    coAuthorHsaIds: (requirementPackage.coAuthors ?? [])
      .map(coAuthor => coAuthor.hsaId.trim())
      .filter(Boolean),
    description: requirementPackage.description ?? '',
    name: requirementPackage.name,
  })

const uniqueTrimmedHsaIds = (values: readonly string[]) =>
  Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

const textareaClassName = `${inputClassName} ${modalResizableTextareaClassName}`

const rowActionButtonClassName =
  'inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

export default function RequirementPackagesClient() {
  useHelpContent(REQUIREMENT_PACKAGES_HELP)
  const t = useTranslations('requirementPackage')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const tStatusLabel = useTranslations('requirement.statusLabel')
  const locale = useLocale()
  const contentRef = useRef<HTMLDivElement>(null)
  const tableAnchorRef = useRef<HTMLDivElement>(null)
  const nameFilterRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const { confirm } = useConfirmModal()
  const [nameFilter, setNameFilter] = useState('')
  const [stateError, setStateError] = useState<string | null>(null)
  const [stateChangingIds, setStateChangingIds] = useState<Set<number>>(
    new Set(),
  )
  const [linkedRequirements, setLinkedRequirements] = useState<
    LinkedRequirement[]
  >([])
  const [linkedRequirementsError, setLinkedRequirementsError] = useState<
    string | null
  >(null)
  const [linkedRequirementsLoading, setLinkedRequirementsLoading] =
    useState(false)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [currentUserLoading, setCurrentUserLoading] = useState(true)
  const [currentUserUnavailable, setCurrentUserUnavailable] = useState(false)
  const [leadChange, setLeadChange] = useState<PackageLeadChangeState | null>(
    null,
  )
  const [linkedRequirementsModal, setLinkedRequirementsModal] =
    useState<LinkedRequirementsModalState | null>(null)
  const linkedReqRequestId = useRef(0)
  const editFormSignatureRef = useRef<string | null>(null)
  const persistedCoAuthorHsaIdsRef = useRef<string[]>([])

  const controller = useCrudAdminResource<
    RequirementPackage,
    RequirementPackageForm
  >({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/requirement-packages',
    errorMessage: tc('error'),
    getInitialForm,
    listEndpoint: '/api/requirement-packages?includeArchived=true',
    listKey: 'requirementPackages',
    toCreatePayload,
    toForm,
    toPayload,
    toUpdatePayload,
  })

  useEffect(() => {
    let cancelled = false

    const loadCurrentUser = async () => {
      setCurrentUserLoading(true)
      setCurrentUserUnavailable(false)
      try {
        const response = await apiFetch('/api/auth/me', {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (cancelled) return
        if (!response.ok) {
          setCurrentUser(null)
          setCurrentUserUnavailable(true)
          return
        }
        const user = readCurrentUser(await response.json())
        if (cancelled) return
        setCurrentUser(user)
        setCurrentUserUnavailable(user === null)
      } catch {
        if (!cancelled) {
          setCurrentUser(null)
          setCurrentUserUnavailable(true)
        }
      } finally {
        if (!cancelled) {
          setCurrentUserLoading(false)
        }
      }
    }

    void loadCurrentUser()

    return () => {
      cancelled = true
    }
  }, [])

  const fetchLinkedRequirements = useCallback(
    async (requirementPackageId: number) => {
      const requestId = ++linkedReqRequestId.current
      setLinkedRequirementsLoading(true)
      setLinkedRequirementsError(null)
      try {
        const response = await apiFetch(
          `/api/requirement-packages/${requirementPackageId}`,
        )
        if (requestId !== linkedReqRequestId.current) return
        if (!response.ok) {
          setLinkedRequirements([])
          setLinkedRequirementsError(tc('error'))
          return
        }
        const data = (await response.json()) as {
          linkedRequirements?: LinkedRequirement[]
        }
        if (requestId !== linkedReqRequestId.current) return
        setLinkedRequirements(data.linkedRequirements ?? [])
      } catch {
        if (requestId === linkedReqRequestId.current) {
          setLinkedRequirements([])
          setLinkedRequirementsError(tc('error'))
        }
      } finally {
        if (requestId === linkedReqRequestId.current) {
          setLinkedRequirementsLoading(false)
        }
      }
    },
    [tc],
  )

  const openLinkedRequirementsModal = (
    requirementPackage: RequirementPackage,
  ) => {
    setLinkedRequirementsModal({
      linkedRequirementCount: requirementPackage.linkedRequirementCount,
      packageId: requirementPackage.id,
      packageName: requirementPackage.name,
    })
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    void fetchLinkedRequirements(requirementPackage.id)
  }

  const retryLinkedRequirements = () => {
    if (!linkedRequirementsModal) return
    void fetchLinkedRequirements(linkedRequirementsModal.packageId)
  }

  const closeLinkedRequirementsModal = () => {
    linkedReqRequestId.current++
    setLinkedRequirementsModal(null)
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    setLinkedRequirementsLoading(false)
  }

  const currentUserError = currentUserUnavailable
    ? t('currentUserUnavailable')
    : null
  const createDisabled =
    controller.submitting || currentUserLoading || !currentUser
  const createDisabledReason = currentUserLoading
    ? tc('loading')
    : currentUserError
  const createActionTooltip = createDisabledReason ?? t('newRequirementPackage')
  const isCurrentUserAdmin = currentUser?.roles.includes('Admin') ?? false

  const openCreate = () => {
    if (!currentUser) {
      setStateError(currentUserError ?? t('currentUserUnavailable'))
      return
    }
    linkedReqRequestId.current++
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    setLinkedRequirementsLoading(false)
    setLinkedRequirementsModal(null)
    setStateError(null)
    controller.openCreate()
    editFormSignatureRef.current = null
    persistedCoAuthorHsaIdsRef.current = []
    controller.setForm(previousForm => ({
      ...previousForm,
      leadDisplayName: currentUser.displayName,
      leadEmail: currentUser.email,
      leadHsaId: currentUser.hsaId,
      leadPersonVerification: null,
    }))
  }

  const openEdit = (requirementPackage: RequirementPackage) => {
    setStateError(null)
    setLeadChange(null)
    editFormSignatureRef.current =
      packageEditableSignatureFromItem(requirementPackage)
    persistedCoAuthorHsaIdsRef.current = (requirementPackage.coAuthors ?? [])
      .map(coAuthor => coAuthor.hsaId.trim())
      .filter(Boolean)
    controller.openEdit(requirementPackage)
  }

  const closeForm = () => {
    linkedReqRequestId.current++
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    setLinkedRequirementsLoading(false)
    setLinkedRequirementsModal(null)
    setLeadChange(null)
    editFormSignatureRef.current = null
    persistedCoAuthorHsaIdsRef.current = []
    controller.closeForm()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const didSubmit = await controller.submit(event)
    if (didSubmit) {
      linkedReqRequestId.current++
      setLinkedRequirements([])
      setLinkedRequirementsError(null)
      setLinkedRequirementsLoading(false)
      setLinkedRequirementsModal(null)
      setLeadChange(null)
      editFormSignatureRef.current = null
      persistedCoAuthorHsaIdsRef.current = []
    }
  }

  const remove = async (id: number, anchorEl?: HTMLElement) => {
    const didRemove = await controller.remove(id, anchorEl)
    if (didRemove && controller.editId === id) {
      setLinkedRequirements([])
      setLinkedRequirementsError(null)
      setLinkedRequirementsModal(null)
    }
    if (didRemove && linkedRequirementsModal?.packageId === id) {
      closeLinkedRequirementsModal()
    }
  }

  const openLeadChange = () => {
    if (typeof controller.editId !== 'number') return
    setLeadChange({
      currentLeadHsaId: controller.form.leadHsaId,
      packageId: controller.editId,
    })
  }

  const closeLeadChange = () => {
    setLeadChange(null)
  }

  const hasUnsavedPackageEdits = () =>
    editFormSignatureRef.current !== null &&
    editFormSignatureRef.current !== packageEditableSignature(controller.form)

  const blockedLeadHsaIds = () =>
    uniqueTrimmedHsaIds([
      ...persistedCoAuthorHsaIdsRef.current,
      ...coAuthorHsaIdsFromForm(controller.form),
    ])

  const submitLeadChange = async (
    nextLeadHsaId: string,
    person: HsaPersonVerification | null,
  ): Promise<HsaPersonChangeSubmitResult> => {
    if (!leadChange) return { ok: false }
    if (blockedLeadHsaIds().includes(nextLeadHsaId)) {
      return { error: t('leadChangeCoAuthorConflict'), ok: false }
    }

    const shouldCloseFormAfterChange = !isCurrentUserAdmin
    if (shouldCloseFormAfterChange && hasUnsavedPackageEdits()) {
      const confirmed = await confirm({
        cancelText: tc('cancel'),
        confirmText: t('changeLead'),
        defaultCancel: true,
        icon: 'warning',
        message: t('leadChangeUnsavedConfirm'),
        title: t('changeLeadTitle'),
      })
      if (!confirmed) return { ok: false }
    }

    try {
      const response = await apiFetch(
        `/api/requirement-packages/${leadChange.packageId}`,
        {
          body: JSON.stringify({ leadHsaId: nextLeadHsaId }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      )
      if (!response.ok) {
        return {
          error: (await readResponseMessage(response)) ?? t('leadChangeError'),
          ok: false,
        }
      }

      const payload = (await response.json()) as Partial<RequirementPackage>
      setLeadChange(null)
      if (shouldCloseFormAfterChange) {
        linkedReqRequestId.current++
        setLinkedRequirements([])
        setLinkedRequirementsError(null)
        setLinkedRequirementsLoading(false)
        setLinkedRequirementsModal(null)
        editFormSignatureRef.current = null
        persistedCoAuthorHsaIdsRef.current = []
        controller.closeForm()
      } else {
        const nextDisplayName =
          payload.leadDisplayName ?? person?.displayName ?? nextLeadHsaId
        const nextEmail = payload.leadEmail ?? person?.email ?? ''
        controller.setForm(previousForm => ({
          ...previousForm,
          leadDisplayName: nextDisplayName,
          leadEmail: nextEmail,
          leadHsaId: payload.leadHsaId ?? nextLeadHsaId,
          leadPersonVerification: person,
        }))
      }
      await controller.reload()
      return { ok: true }
    } catch {
      return { error: t('leadChangeError'), ok: false }
    }
  }

  const changeArchivedState = async (
    requirementPackage: RequirementPackage,
    operation: 'archive' | 'reactivate',
  ) => {
    setStateError(null)
    setStateChangingIds(previous =>
      new Set(previous).add(requirementPackage.id),
    )
    try {
      const response = await apiFetch(
        `/api/requirement-packages/${requirementPackage.id}/${operation}`,
        { method: 'POST' },
      )
      if (!response.ok) {
        setStateError((await readResponseMessage(response)) ?? tc('error'))
        return
      }
      await controller.reload()
    } catch {
      setStateError(tc('error'))
    } finally {
      setStateChangingIds(previous => {
        const next = new Set(previous)
        next.delete(requirementPackage.id)
        return next
      })
    }
  }

  const truncateDescription = (text: string | null) => {
    if (!text) return null
    if (text.length <= DESCRIPTION_TRUNCATE) return text
    return `${text.slice(0, DESCRIPTION_TRUNCATE)}...`
  }

  const isBusy = (requirementPackage: RequirementPackage) =>
    controller.submitting ||
    controller.deletingIds.has(requirementPackage.id) ||
    stateChangingIds.has(requirementPackage.id)
  const requirementCountLabel = (count: number) =>
    t('requirementCount', { count })
  const showLinkedRequirementsLabel = (count: number) =>
    t('showLinkedRequirements', { count })
  const editedRequirementPackage =
    controller.editId == null
      ? null
      : (controller.items.find(
          requirementPackage => requirementPackage.id === controller.editId,
        ) ?? null)
  const addCoAuthor = () => {
    controller.setForm(previousForm => ({
      ...previousForm,
      coAuthors: hasUnsavedCoAuthorEntry(previousForm.coAuthors)
        ? previousForm.coAuthors
        : [
            ...previousForm.coAuthors,
            {
              clientId: createCoAuthorClientId(),
              displayName: '',
              email: '',
              hsaId: '',
              persistedHsaId: null,
              personVerification: null,
            },
          ],
    }))
  }
  const removeCoAuthor = (index: number) => {
    controller.setForm(previousForm => ({
      ...previousForm,
      coAuthors: previousForm.coAuthors.filter(
        (_, rowIndex) => rowIndex !== index,
      ),
    }))
  }
  const updateCoAuthor = (
    index: number,
    values: Partial<RequirementPackageCoAuthorForm>,
  ) => {
    controller.setForm(previousForm => ({
      ...previousForm,
      coAuthors: previousForm.coAuthors.map((coAuthor, rowIndex) =>
        rowIndex === index ? { ...coAuthor, ...values } : coAuthor,
      ),
    }))
  }
  const deferredNameFilter = useDeferredValue(nameFilter)
  const normalizedNameFilter = deferredNameFilter
    .trim()
    .toLocaleLowerCase(locale)
  const hasActiveNameFilter = nameFilter.trim().length > 0
  const filteredRequirementPackages = controller.items.filter(
    requirementPackage => {
      const searchableText = [
        requirementPackage.name,
        requirementPackage.description ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase(locale)

      return searchableText.includes(normalizedNameFilter)
    },
  )

  const renderCreateLeadSummary = () => (
    <section
      aria-labelledby="requirement-package-create-lead-title"
      className="space-y-3"
    >
      <div
        className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-3 text-sm text-primary-900 dark:border-primary-800/70 dark:bg-primary-950/40 dark:text-primary-100"
        {...devMarker({
          context: 'requirementPackages',
          name: 'responsibility notice',
          priority: 340,
          value: 'create package lead',
        })}
        role="note"
      >
        <Info
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-primary-700 dark:text-primary-300"
          focusable={false}
        />
        <p>{t('createResponsibilityNotice')}</p>
      </div>
      <div className="rounded-xl border border-secondary-200 bg-secondary-50/80 px-4 py-3 dark:border-secondary-700 dark:bg-secondary-900/60">
        <h3
          className="text-sm font-medium text-secondary-800 dark:text-secondary-100"
          id="requirement-package-create-lead-title"
        >
          {t('lead')}
        </h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
              {t('leadDisplayName')}
            </dt>
            <dd className="mt-1 text-secondary-900 dark:text-secondary-100">
              {controller.form.leadDisplayName || tc('hsaVerifyUnavailable')}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
              {t('leadHsaId')}
            </dt>
            <dd className="mt-1 font-mono text-secondary-900 dark:text-secondary-100">
              {controller.form.leadHsaId || tc('hsaVerifyUnavailable')}
            </dd>
          </div>
          {controller.form.leadEmail ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
                {t('leadEmail')}
              </dt>
              <dd className="mt-1 wrap-break-word text-secondary-900 dark:text-secondary-100">
                {controller.form.leadEmail}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  )

  const renderEditLeadField = () => (
    <div>
      <FieldLabelWithHelp
        help={t('leadHsaIdHelp')}
        htmlFor="requirement-package-lead-hsa-id"
        label={t('leadHsaId')}
        required
      />
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            aria-readonly="true"
            className={`${inputClassName} bg-secondary-100 font-mono text-secondary-500 dark:bg-secondary-800 dark:text-secondary-400`}
            id="requirement-package-lead-hsa-id"
            readOnly
            value={controller.form.leadHsaId}
          />
          <button
            aria-label={t('changeLead')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-secondary-300 dark:hover:bg-secondary-800"
            disabled={controller.submitting}
            onClick={openLeadChange}
            title={t('changeLead')}
            type="button"
          >
            <UserRoundCog
              aria-hidden="true"
              className="h-4 w-4"
              focusable={false}
            />
          </button>
        </div>
        <p className="mt-1 text-xs italic text-secondary-700 dark:text-secondary-300">
          {controller.form.leadDisplayName && controller.form.leadEmail
            ? `${controller.form.leadDisplayName} (${controller.form.leadEmail})`
            : controller.form.leadDisplayName ||
              controller.form.leadEmail ||
              tc('hsaVerifyUnavailable')}
        </p>
      </div>
    </div>
  )

  const renderPackageFormFields = () => (
    <>
      <div>
        <FieldLabelWithHelp
          help={t('nameHelp')}
          htmlFor="requirement-package-name"
          label={t('name')}
          required
        />
        <input
          className={inputClassName}
          disabled={controller.submitting}
          id="requirement-package-name"
          onChange={event =>
            controller.setForm(previousForm => ({
              ...previousForm,
              name: event.target.value,
            }))
          }
          ref={nameInputRef}
          required
          value={controller.form.name}
        />
      </div>
      <div>
        <FieldLabelWithHelp
          help={t('descriptionHelp')}
          htmlFor="requirement-package-description"
          label={t('description')}
        />
        <textarea
          className={textareaClassName}
          disabled={controller.submitting}
          id="requirement-package-description"
          onChange={event =>
            controller.setForm(previousForm => ({
              ...previousForm,
              description: event.target.value,
            }))
          }
          value={controller.form.description}
        />
      </div>
      {controller.editId == null
        ? renderCreateLeadSummary()
        : renderEditLeadField()}
    </>
  )

  const renderCoAuthorsSection = () => (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
            {t('coAuthors')}
          </h3>
          <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
            {t('coAuthorsHelp')}
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3.5 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-secondary-200 dark:hover:bg-secondary-800"
          disabled={
            controller.submitting ||
            hasUnsavedCoAuthorEntry(controller.form.coAuthors)
          }
          onClick={addCoAuthor}
          title={
            controller.submitting
              ? tc('saving')
              : hasUnsavedCoAuthorEntry(controller.form.coAuthors)
                ? t('addCoAuthorUnsavedDisabled')
                : t('addCoAuthor')
          }
          type="button"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t('addCoAuthor')}
        </button>
      </div>
      {controller.form.coAuthors.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-secondary-500 dark:text-secondary-400">
          {t('noCoAuthors')}
        </p>
      ) : (
        <div className="space-y-3">
          {controller.form.coAuthors.map((coAuthor, index) => {
            const inputId = `requirement-package-co-author-${coAuthor.clientId}`
            return (
              <div className="rounded-xl border p-3" key={coAuthor.clientId}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <FieldLabelWithHelp
                      help={t('coAuthorHsaIdHelp')}
                      htmlFor={inputId}
                      label={t('coAuthorHsaId')}
                      required
                    />
                    <HsaPersonVerifyField
                      disabled={controller.submitting}
                      emailLabel={tc('hsaVerifyEmail')}
                      errorFallback={tc('hsaVerifyError')}
                      fetchingLabel={tc('fetchingHsaPerson')}
                      fetchLabel={tc('fetchHsaPerson')}
                      hsaId={coAuthor.hsaId}
                      initialDisplayName={coAuthor.displayName}
                      initialEmail={coAuthor.email}
                      inputClassName={inputClassName}
                      inputId={inputId}
                      nameLabel={tc('hsaVerifyName')}
                      onHsaIdChange={value =>
                        updateCoAuthor(index, {
                          displayName:
                            value.trim() === coAuthor.hsaId.trim()
                              ? coAuthor.displayName
                              : '',
                          email:
                            value.trim() === coAuthor.hsaId.trim()
                              ? coAuthor.email
                              : '',
                          hsaId: value,
                          personVerification:
                            value.trim() === coAuthor.personVerification?.hsaId
                              ? coAuthor.personVerification
                              : null,
                        })
                      }
                      onVerified={person =>
                        updateCoAuthor(index, {
                          displayName: person.displayName,
                          email: person.email ?? '',
                          personVerification: person,
                        })
                      }
                      purpose="requirement_package_co_author"
                      required
                      scopeId={controller.editId ?? undefined}
                      showPersonSummaryAsText
                      unavailableText={tc('hsaVerifyUnavailable')}
                    />
                  </div>
                  <button
                    aria-label={t('removeCoAuthor')}
                    className={`${rowActionButtonClassName} mt-7 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30`}
                    disabled={controller.submitting}
                    onClick={() => removeCoAuthor(index)}
                    title={t('removeCoAuthor')}
                    type="button"
                  >
                    <Trash2
                      aria-hidden="true"
                      className="h-4 w-4"
                      focusable={false}
                    />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderPackageForm = () => (
    <form
      className="space-y-6"
      {...devMarker({
        context: 'requirementPackages',
        name: 'crud form',
        priority: 340,
        value: controller.editId ? 'edit' : 'create',
      })}
      onSubmit={submit}
    >
      <RequiredFieldsHint />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          {renderPackageFormFields()}
          {controller.formError && (
            <p
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
              role="alert"
            >
              {controller.formError}
            </p>
          )}
        </div>
        {renderCoAuthorsSection()}
      </div>
      <div className="flex gap-3">
        <button
          className="btn-primary"
          disabled={controller.submitting}
          type="submit"
        >
          {controller.submitting ? tc('saving') : tc('save')}
        </button>
        <button
          className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2"
          disabled={controller.submitting}
          onClick={closeForm}
          type="button"
        >
          {tc('cancel')}
        </button>
      </div>
    </form>
  )

  const renderEditPackageForm = () => (
    <form
      className="space-y-6"
      {...devMarker({
        context: 'requirementPackages',
        name: 'crud form',
        priority: 340,
        value: 'edit',
      })}
      onSubmit={submit}
    >
      <RequiredFieldsHint />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          {renderPackageFormFields()}
          {controller.formError && (
            <p
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
              role="alert"
            >
              {controller.formError}
            </p>
          )}
        </div>
        {renderCoAuthorsSection()}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <button
            className="btn-primary"
            disabled={controller.submitting}
            type="submit"
          >
            {controller.submitting ? tc('saving') : tc('save')}
          </button>
          <button
            className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2"
            disabled={controller.submitting}
            onClick={closeForm}
            type="button"
          >
            {tc('cancel')}
          </button>
        </div>
        {editedRequirementPackage && (
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-secondary-300 px-4 py-2.5 text-sm font-medium text-secondary-700 transition-all duration-200 hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
            {...devMarker({
              context: 'requirementPackages',
              name: 'crud form action',
              priority: 340,
              value: 'linked requirements',
            })}
            disabled={controller.submitting}
            onClick={() =>
              openLinkedRequirementsModal(editedRequirementPackage)
            }
            title={showLinkedRequirementsLabel(
              editedRequirementPackage.linkedRequirementCount,
            )}
            type="button"
          >
            <ListChecks aria-hidden="true" className="h-4 w-4" />
            {showLinkedRequirementsLabel(
              editedRequirementPackage.linkedRequirementCount,
            )}
          </button>
        )}
      </div>
    </form>
  )

  const renderLinkedRequirementsContent = () => (
    <div>
      {linkedRequirementsLoading ? (
        <p
          className="text-sm text-secondary-500 dark:text-secondary-400"
          role="status"
        >
          {tc('loading')}
        </p>
      ) : linkedRequirementsError ? (
        <div
          className="space-y-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          <p>{linkedRequirementsError}</p>
          <button
            className="inline-flex min-h-11 items-center rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-2 dark:border-red-700 dark:bg-secondary-950 dark:text-red-300 dark:hover:bg-red-950/30"
            onClick={retryLinkedRequirements}
            type="button"
          >
            {tc('retry')}
          </button>
        </div>
      ) : linkedRequirements.length === 0 ? (
        <p className="text-sm text-secondary-500 dark:text-secondary-400">
          {tc('noneAvailable')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary-50/80 text-left text-secondary-700 dark:bg-secondary-800/30 dark:text-secondary-300">
                <th className="px-3 py-2 font-medium">{tr('uniqueId')}</th>
                <th className="px-3 py-2 font-medium">{tr('description')}</th>
                <th className="px-3 py-2 font-medium">{tc('version')}</th>
                <th className="px-3 py-2 font-medium">{tr('status')}</th>
              </tr>
            </thead>
            <tbody>
              {linkedRequirements.map(requirement => {
                const truncated = truncateDescription(requirement.description)
                const isTruncated =
                  truncated !== requirement.description &&
                  requirement.description != null
                return (
                  <tr
                    className="border-b transition-colors last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20"
                    key={`${requirement.id}-v${requirement.versionNumber}`}
                  >
                    <td className="px-3 py-2 font-medium">
                      <Link
                        className="inline-flex min-h-11 min-w-11 items-center text-primary-700 hover:underline dark:text-primary-300"
                        href={`/requirements/${requirement.uniqueId}/${requirement.versionNumber}`}
                      >
                        {requirement.uniqueId}
                      </Link>
                    </td>
                    <td
                      className="max-w-xs px-3 py-2 text-secondary-600 dark:text-secondary-400"
                      title={
                        isTruncated
                          ? (requirement.description ?? undefined)
                          : undefined
                      }
                    >
                      {truncated ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-secondary-600 dark:text-secondary-400">
                      v{requirement.versionNumber}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        color={requirement.statusColor}
                        iconName={requirement.statusIconName}
                        label={resolveStatusLabel(
                          {
                            archiveInitiatedAt: requirement.archiveInitiatedAt,
                            status: requirement.statusId,
                            statusNameEn: requirement.statusNameEn,
                            statusNameSv: requirement.statusNameSv,
                          },
                          isSwedish(locale) ? 'sv' : 'en',
                          tStatusLabel,
                        )}
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
  )

  const isEditing = controller.showForm && controller.editId != null
  const formModalTitle = isEditing
    ? t('editRequirementPackage')
    : t('newRequirementPackage')

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom" ref={contentRef}>
        <FloatingActionRail
          anchorRef={tableAnchorRef}
          developerModeContext="requirementPackages"
          items={[
            {
              ariaLabel: t('newRequirementPackage'),
              developerModeValue: 'new requirement package',
              disabled: createDisabled,
              icon: <Plus aria-hidden="true" className="h-4 w-4" />,
              id: 'create',
              onClick: openCreate,
              tooltip: createActionTooltip,
              variant: 'primary',
            },
          ]}
        />
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('requirementPackages')}
          </h1>
        </div>

        <div className="mb-4">
          {!controller.loading && controller.items.length > 0 && (
            <div className="w-full max-w-lg">
              <label
                className="mb-1.5 block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                htmlFor="requirement-package-name-filter"
              >
                {t('filterByName')}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
                  />
                  <input
                    autoComplete="off"
                    className="min-h-11 w-full rounded-xl border border-secondary-200 bg-white py-2.5 pr-3 pl-10 text-sm text-secondary-900 transition-all duration-200 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100 dark:placeholder:text-secondary-500"
                    {...devMarker({
                      context: 'requirementPackages',
                      name: 'text field',
                      priority: 330,
                      value: 'name or description filter',
                    })}
                    id="requirement-package-name-filter"
                    onChange={event => setNameFilter(event.target.value)}
                    placeholder={t('filterByNamePlaceholder')}
                    ref={nameFilterRef}
                    type="text"
                    value={nameFilter}
                  />
                </div>
                {hasActiveNameFilter && (
                  <button
                    className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-secondary-200 px-4 py-2.5 text-sm text-secondary-700 transition-all duration-200 hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800/60"
                    onClick={() => setNameFilter('')}
                    type="button"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                    {tc('clearSearch')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {(controller.deleteError ||
          controller.loadError ||
          stateError ||
          currentUserError) && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            {...devMarker({
              context: 'requirementPackages',
              name: 'error banner',
              priority: 340,
              value: controller.deleteError
                ? 'delete-error'
                : stateError
                  ? 'state-error'
                  : currentUserError
                    ? 'current-user-error'
                    : 'load-error',
            })}
            role="alert"
          >
            {controller.deleteError ??
              controller.loadError ??
              stateError ??
              currentUserError}
          </p>
        )}

        <FormModal
          closeDisabled={controller.submitting}
          developerModeValue={
            isEditing ? 'edit requirement package' : 'new requirement package'
          }
          initialFocusRef={nameInputRef}
          maxWidthClassName="max-w-5xl"
          onClose={closeForm}
          open={controller.showForm}
          title={formModalTitle}
          titleId={
            isEditing
              ? 'requirement-package-edit-title'
              : 'requirement-package-create-title'
          }
        >
          {isEditing ? renderEditPackageForm() : renderPackageForm()}
        </FormModal>

        {leadChange && (
          <HsaPersonChangeModal
            blockedError={t('leadChangeCoAuthorConflict')}
            blockedHsaIds={blockedLeadHsaIds()}
            cancelLabel={tc('cancel')}
            currentHelp={t('currentLeadHsaIdHelp')}
            currentHsaId={leadChange.currentLeadHsaId}
            currentInputId="requirement-package-current-lead-hsa-id"
            currentLabel={t('currentLeadHsaId')}
            description={t('changeLeadDescription')}
            developerModeValue="change requirements package lead"
            emailLabel={tc('hsaVerifyEmail')}
            errorFallback={tc('hsaVerifyError')}
            fetchingLabel={tc('fetchingHsaPerson')}
            fetchLabel={tc('fetchHsaPerson')}
            inputClassName={inputClassName}
            invalidError={t('leadChangeInvalid')}
            nameLabel={tc('hsaVerifyName')}
            newHelp={t('newLeadHsaIdHelp')}
            newInputId="requirement-package-new-lead-hsa-id"
            newLabel={t('newLeadHsaId')}
            onClose={closeLeadChange}
            onSubmit={submitLeadChange}
            open
            purpose="requirement_package_lead"
            sameError={t('leadChangeSame')}
            scopeId={leadChange.packageId}
            submitLabel={t('changeLead')}
            submittingLabel={tc('saving')}
            title={t('changeLeadTitle')}
            titleId="requirement-package-lead-change-title"
            unavailableText={tc('hsaVerifyUnavailable')}
          />
        )}

        <FormModal
          developerModeValue="linked requirements"
          maxWidthClassName="max-w-4xl"
          onClose={closeLinkedRequirementsModal}
          open={linkedRequirementsModal !== null}
          title={
            linkedRequirementsModal
              ? t('linkedRequirementsTitle', {
                  name: linkedRequirementsModal.packageName,
                })
              : t('linkedRequirements')
          }
          titleId="requirement-package-linked-requirements-title"
        >
          <div className="space-y-5">
            {renderLinkedRequirementsContent()}
            <div className="flex justify-end">
              <button
                className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2"
                onClick={closeLinkedRequirementsModal}
                type="button"
              >
                {tc('close')}
              </button>
            </div>
          </div>
        </FormModal>

        {controller.loading ? (
          <p
            className="text-secondary-600 dark:text-secondary-400"
            role="status"
          >
            {tc('loading')}
          </p>
        ) : (
          <div
            className="overflow-x-auto rounded-2xl border bg-white/80 shadow-sm backdrop-blur-sm dark:bg-secondary-900/60"
            {...devMarker({
              context: 'requirementPackages',
              name: 'crud table',
              priority: 340,
            })}
            ref={tableAnchorRef}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 text-left text-secondary-700 dark:bg-secondary-800/30 dark:text-secondary-300">
                  <th className="px-4 py-3 font-medium">{t('name')}</th>
                  <th className="px-4 py-3 font-medium">{t('description')}</th>
                  <th className="px-4 py-3 font-medium">{t('lead')}</th>
                  <th className="px-4 py-3 font-medium">{t('status')}</th>
                  <th className="px-4 py-3 text-center font-medium">
                    {t('linkedRequirements')}
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {controller.items.length === 0 ? (
                  <tr
                    {...devMarker({
                      context: 'requirementPackages',
                      name: 'empty state',
                      priority: 330,
                    })}
                  >
                    <td
                      className="px-4 py-10 text-center"
                      colSpan={REQUIREMENT_PACKAGE_TABLE_COLUMN_COUNT}
                    >
                      <div className="flex flex-col items-center justify-center gap-3 text-secondary-500 dark:text-secondary-400">
                        <p>{t('emptyState')}</p>
                        <button
                          className="btn-primary inline-flex items-center gap-1.5"
                          {...devMarker({
                            context: 'requirementPackages',
                            name: 'empty state create button',
                            priority: 330,
                          })}
                          disabled={createDisabled}
                          onClick={openCreate}
                          title={createActionTooltip}
                          type="button"
                        >
                          <Plus aria-hidden="true" className="h-4 w-4" />
                          {tc('create')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : filteredRequirementPackages.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                      colSpan={REQUIREMENT_PACKAGE_TABLE_COLUMN_COUNT}
                    >
                      {tc('noResults')}
                    </td>
                  </tr>
                ) : (
                  filteredRequirementPackages.map(requirementPackage => {
                    const archiveActionLabel = requirementPackage.isArchived
                      ? t('reactivate')
                      : t('archive')
                    const archiveActionValue = requirementPackage.isArchived
                      ? 'reactivate'
                      : 'archive'
                    const busy = isBusy(requirementPackage)

                    return (
                      <tr
                        className="border-b transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-950/20"
                        key={requirementPackage.id}
                      >
                        <td className="px-4 py-3 font-medium">
                          {requirementPackage.name}
                        </td>
                        <td
                          className="w-md max-w-md whitespace-normal wrap-break-word px-4 py-3 align-top leading-6 text-secondary-600 dark:text-secondary-400"
                          title={requirementPackage.description || '-'}
                        >
                          {requirementPackage.description || '-'}
                        </td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">
                          <span className="block">
                            {requirementPackage.leadDisplayName}
                          </span>
                          <span className="block text-xs text-secondary-500 dark:text-secondary-500">
                            {requirementPackage.leadHsaId}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">
                          {requirementPackage.isArchived
                            ? t('archived')
                            : t('active')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-primary-300 dark:hover:bg-primary-950/30"
                            {...devMarker({
                              context: 'requirementPackages',
                              name: 'table action',
                              value: 'linked requirements',
                            })}
                            onClick={() =>
                              openLinkedRequirementsModal(requirementPackage)
                            }
                            title={showLinkedRequirementsLabel(
                              requirementPackage.linkedRequirementCount,
                            )}
                            type="button"
                          >
                            {requirementCountLabel(
                              requirementPackage.linkedRequirementCount,
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              aria-label={tc('edit')}
                              className={`${rowActionButtonClassName} text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/30`}
                              {...devMarker({
                                context: 'requirementPackages',
                                name: 'table action',
                                value: 'edit',
                              })}
                              disabled={busy}
                              onClick={() => openEdit(requirementPackage)}
                              title={tc('edit')}
                              type="button"
                            >
                              <Pencil
                                aria-hidden="true"
                                className="h-4 w-4"
                                focusable={false}
                              />
                            </button>
                            <button
                              aria-label={archiveActionLabel}
                              className={`${rowActionButtonClassName} text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800/70`}
                              {...devMarker({
                                context: 'requirementPackages',
                                name: 'table action',
                                value: archiveActionValue,
                              })}
                              disabled={busy}
                              onClick={() => {
                                void changeArchivedState(
                                  requirementPackage,
                                  requirementPackage.isArchived
                                    ? 'reactivate'
                                    : 'archive',
                                )
                              }}
                              title={archiveActionLabel}
                              type="button"
                            >
                              {requirementPackage.isArchived ? (
                                <RotateCcw
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                  focusable={false}
                                />
                              ) : (
                                <Archive
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                  focusable={false}
                                />
                              )}
                            </button>
                            <button
                              aria-label={tc('delete')}
                              className={`${rowActionButtonClassName} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30`}
                              {...devMarker({
                                context: 'requirementPackages',
                                name: 'table action',
                                value: 'delete',
                              })}
                              disabled={busy}
                              onClick={event => {
                                void remove(
                                  requirementPackage.id,
                                  event.currentTarget,
                                )
                              }}
                              title={tc('delete')}
                              type="button"
                            >
                              <Trash2
                                aria-hidden="true"
                                className="h-4 w-4"
                                focusable={false}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
