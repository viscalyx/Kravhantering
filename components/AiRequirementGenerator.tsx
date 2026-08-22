'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import AiRequestExplanationDialog from '@/components/AiRequestExplanationDialog'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldHelpButton from '@/components/FieldHelpButton'
import { modalResizableTextareaRows4ClassName } from '@/components/modal-textarea-class'
import RequiredFieldMarker from '@/components/RequiredFieldMarker'
import SafeMarkdown from '@/components/SafeMarkdown'
import StatusBadge from '@/components/StatusBadge'
import type {
  AiAuthoringProfileDescription,
  AiAuthoringProfileUnavailableReason,
} from '@/lib/ai/authoring-runtime'
import {
  type AiRequirementGenerationAvailability,
  DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY,
} from '@/lib/ai/generation-availability'
import {
  DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
  MAX_REQUIREMENT_CANDIDATE_COUNT,
  MIN_REQUIREMENT_CANDIDATE_COUNT,
  SAFE_AI_TECHNICAL_CODE,
} from '@/lib/ai/requirement-prompt'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'
import type { ImportRequirementsPayload } from '@/lib/requirements/import-schema'

type AiImportMode = 'library' | 'specification-local'
type FailureKind = 'generation' | 'generation-retry' | 'repair'
type Phase = 'done' | 'error' | 'generating' | 'idle' | 'thinking'
type PreviewTab =
  | 'analysis'
  | 'needsReferenceProposals'
  | 'normReferences'
  | 'rawResult'
  | 'requirements'

export interface AiRequirementGeneratorProps {
  aiGenerationAvailability?: AiRequirementGenerationAvailability
  areas?: Array<{
    id: number
    name: string
    permissions?: { canAuthor?: boolean }
  }>
  embedded?: boolean
  mode?: AiImportMode
  onClose: () => void
  onCreated?: () => void
  onImportPreview?: (
    payload: ImportRequirementsPayload,
    options: { areaId?: number; preview?: PreviewResponse },
  ) => void
  open: boolean
  specificationId?: number
}

interface GenerationStats {
  totalTokens: number | null
}

interface ImportMessage {
  code: string
  field?: string
  level: 'error' | 'info' | 'warning'
  message: string
  originalValue?: string
}

interface PreviewValues {
  acceptanceCriteria: string | null
  categoryId: number | null
  description: string
  needsReferenceId: number | null
  normReferenceIds: number[]
  priorityLevelId: number | null
  qualityCharacteristicId: number | null
  requirementPackageIds: number[]
  typeId: number | null
  verifiable: boolean
  verificationMethod: string | null
}

interface PreviewRow {
  errors: ImportMessage[]
  infos?: ImportMessage[]
  labels?: {
    category: string | null
    priorityLevel: string | null
    qualityCharacteristic: string | null
    type: string | null
  }
  proposedNeedsReferenceKey: string | null
  proposedNormReferenceKeys: string[]
  resolvedPriorityLevel?: {
    code: string
    color: string
    iconName: string | null
    name: string
  }
  reviewRowId: string
  selected: boolean
  sourceIndex: number
  values: PreviewValues
  warnings: ImportMessage[]
}

interface ProposalPreview {
  issuer: string
  key: string
  name: string
  normReferenceId: string | null
  reference: string
  referencedCount: number
  resolvedNormReferenceDbId: number | null
  type: string
  uri: string | null
  version: string | null
  warnings: ImportMessage[]
}

interface NeedsReferenceProposalPreview {
  description: string | null
  key: string
  referencedCount: number
  resolvedNeedsReferenceId: number | null
  text: string
  warnings: ImportMessage[]
}

interface PreviewResponse {
  needsReferenceProposals: NeedsReferenceProposalPreview[]
  previewToken: string
  proposals: ProposalPreview[]
  rows: PreviewRow[]
  summary: {
    errorCount: number
    rowCount: number
    warningCount: number
  }
}

interface SchemaIssue {
  code: string
  message: string
  path: string
}

async function readGenerationResponseMessage(
  response: Response,
): Promise<string | null> {
  const contentType =
    response.headers?.get?.('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    return readResponseMessage(response)
  }

  const fallbackResponse = response.clone()
  const body = (await response.json().catch(() => null)) as {
    issues?: Array<{ message?: unknown }>
  } | null
  const issueMessage = body?.issues?.find(
    issue =>
      typeof issue.message === 'string' && issue.message.trim().length > 0,
  )?.message
  return typeof issueMessage === 'string'
    ? issueMessage.trim()
    : readResponseMessage(fallbackResponse)
}

interface AttachedImage {
  dataUrl: string
  id: string
  name: string
}

interface AiAuthoringProfilesResponse {
  enabled: boolean
  profiles: Record<
    | 'generate_with_images'
    | 'generate_without_images'
    | 'repair_invalid_import_json',
    AiAuthoringProfileDescription
  >
}

function isAuthoringProfilesResponse(
  value: unknown,
): value is AiAuthoringProfilesResponse {
  if (typeof value !== 'object' || value === null) return false
  const profiles = (value as { profiles?: unknown }).profiles
  if (typeof profiles !== 'object' || profiles === null) return false
  return [
    'generate_with_images',
    'generate_without_images',
    'repair_invalid_import_json',
  ].every(key => key in profiles)
}

const MAX_IMAGES = 3
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const SCROLL_FOLLOW_BOTTOM_TOLERANCE_PX = 24
const THINKING_STREAM_UPDATE_INTERVAL_MS = 150
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]

const richTags = {
  em: (chunks: ReactNode) => <em>{chunks}</em>,
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
}

const textareaBaseClassName =
  'w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 dark:placeholder:text-secondary-500'
const textareaRows4ClassName = `${textareaBaseClassName} ${modalResizableTextareaRows4ClassName}`

function isNearScrollBottom(element: HTMLElement) {
  return (
    element.scrollTop + element.clientHeight >=
    element.scrollHeight - SCROLL_FOLLOW_BOTTOM_TOLERANCE_PX
  )
}

function formatRawResult(value: string): string {
  if (!value) return ''
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function normalizePayloadForMode(
  payload: ImportRequirementsPayload,
  mode: AiImportMode,
): ImportRequirementsPayload {
  if (mode !== 'specification-local') return payload
  return {
    ...payload,
    requirements: payload.requirements.map(requirement => {
      const {
        requirementPackageIds: _requirementPackageIds,
        requirementPackageNames: _requirementPackageNames,
        ...rest
      } = requirement
      return rest
    }),
  }
}

function parseSseBlock(block: string): { data: unknown; event: string } | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trimEnd()
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  return { data: JSON.parse(dataLines.join('\n')) as unknown, event }
}

function importBudgetErrorMessage(
  code: unknown,
  translate: (key: string) => string,
): string | null {
  switch (code) {
    case 'import_content_bytes_exceeded':
      return translate('generatedImportContentLimitExceeded')
    case 'import_json_depth_cap_exceeded':
      return translate('generatedImportJsonDepthLimitExceeded')
    case 'import_nested_collection_cap_exceeded':
      return translate('generatedImportNestedItemsLimitExceeded')
    case 'import_proposed_needs_reference_count_cap_exceeded':
      return translate('generatedImportNeedsProposalLimitExceeded')
    case 'import_proposed_norm_reference_count_cap_exceeded':
      return translate('generatedImportNormProposalLimitExceeded')
    case 'import_row_count_cap_exceeded':
      return translate('generatedImportRowLimitExceeded')
    default:
      return null
  }
}

function issueText(issue: SchemaIssue): string {
  return `${issue.path}: ${issue.message}`
}

type PreviewClassificationField =
  | 'categoryId'
  | 'priorityLevelId'
  | 'qualityCharacteristicId'
  | 'typeId'

function previewMessageSummary(row: PreviewRow): string {
  const errors = row.errors.length
  const warnings = row.warnings.length
  if (errors > 0 && warnings > 0) return `${errors} fel, ${warnings} varningar`
  if (errors > 0) return `${errors} fel`
  if (warnings > 0) return `${warnings} varningar`
  return ''
}

function previewFieldWarning(
  row: PreviewRow,
  field: PreviewClassificationField,
): ImportMessage | null {
  return (
    row.warnings.find(
      warning => warning.level === 'warning' && warning.field === field,
    ) ?? null
  )
}

function previewFieldWarningText(warning: ImportMessage): string {
  return warning.originalValue
    ? `${warning.message} (${warning.originalValue})`
    : warning.message
}

function previewFieldDisplay(
  row: PreviewRow,
  field: PreviewClassificationField,
  label: string,
  resolvedLabel: string | null | undefined,
  id: number | null,
): { label: string; value: string; warning: ImportMessage | null } | null {
  const warning = previewFieldWarning(row, field)
  const value = resolvedLabel ?? warning?.originalValue ?? null
  if (!value && id == null) return null
  return {
    label,
    value: value ?? String(id),
    warning,
  }
}

export default function AiRequirementGenerator({
  aiGenerationAvailability = DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY,
  areas = [],
  embedded = false,
  mode = 'library',
  onClose,
  onImportPreview,
  open,
  specificationId,
}: AiRequirementGeneratorProps) {
  const t = useTranslations('ai')
  const tc = useTranslations('common')
  const locale = useLocale() === 'sv' ? 'sv' : 'en'
  const { confirm } = useConfirmModal()
  const shouldReduceMotion = useReducedMotion()

  const [need, setNeed] = useState('')
  const [areaId, setAreaId] = useState<number | ''>('')
  const [candidateCount, setCandidateCount] = useState(
    DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
  )
  const [aiRequestExplanationOpen, setAiRequestExplanationOpen] =
    useState(false)
  const [importInstruction, setImportInstruction] = useState('')
  const [importInstructionScopeKey, setImportInstructionScopeKey] = useState<
    string | null
  >(null)
  const [importInstructionLoading, setImportInstructionLoading] =
    useState(false)
  const [needHelpOpen, setNeedHelpOpen] = useState(false)
  const [areaHelpOpen, setAreaHelpOpen] = useState(false)
  const [candidateCountHelpOpen, setCandidateCountHelpOpen] = useState(false)
  const [imageHelpOpen, setImageHelpOpen] = useState(false)
  const [authoringProfiles, setAuthoringProfiles] =
    useState<AiAuthoringProfilesResponse | null>(null)
  const [authoringProfilesLoading, setAuthoringProfilesLoading] =
    useState(false)

  const [images, setImages] = useState<AttachedImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [errorAnnouncement, setErrorAnnouncement] = useState('')
  const [statusAnnouncement, setStatusAnnouncement] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageSelectButtonRef = useRef<HTMLButtonElement>(null)
  const errorSummaryHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const retryGenerateButtonRef = useRef<HTMLButtonElement | null>(null)
  const repairButtonRef = useRef<HTMLButtonElement | null>(null)
  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const thinkingScrollRef = useRef<HTMLDivElement | null>(null)
  const thinkingEndRef = useRef<HTMLSpanElement | null>(null)
  const shouldFollowThinkingRef = useRef(true)
  const pendingThinkingRef = useRef<string | null>(null)
  const thinkingUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [failureKind, setFailureKind] = useState<FailureKind | null>(null)
  const [shouldFocusResults, setShouldFocusResults] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [thinking, setThinking] = useState('')
  const [rawResponse, setRawResponse] = useState('')
  const [stats, setStats] = useState<GenerationStats | null>(null)
  const [generatedPayload, setGeneratedPayload] =
    useState<ImportRequirementsPayload | null>(null)
  const [previewToken, setPreviewToken] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [previewNeedsReferenceProposals, setPreviewNeedsReferenceProposals] =
    useState<NeedsReferenceProposalPreview[]>([])
  const [previewProposals, setPreviewProposals] = useState<ProposalPreview[]>(
    [],
  )
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(
    new Set(),
  )
  const [previewTab, setPreviewTab] = useState<PreviewTab>('requirements')
  const [schemaIssues, setSchemaIssues] = useState<SchemaIssue[]>([])

  const isAiGenerationEnabled =
    aiGenerationAvailability.effectiveRequirementGenerationEnabled
  const aiGenerationDisabledMessage = !isAiGenerationEnabled
    ? aiGenerationAvailability.disabledByEnvironment
      ? t('generationDisabledByEnvironment')
      : t('generationDisabledByAdmin')
    : null
  const inProgress = phase === 'thinking' || phase === 'generating'
  const targetAreaId = mode === 'library' ? areaId : undefined
  const currentImportInstructionScopeKey =
    mode === 'library'
      ? `${locale}:library`
      : `${locale}:specification-local:${specificationId ?? ''}`
  const canLoadScopedImportInstruction =
    mode === 'library' || specificationId != null
  const scopedImportInstruction =
    importInstructionScopeKey === currentImportInstructionScopeKey
      ? importInstruction
      : ''
  const generationProfile =
    authoringProfiles?.profiles[
      images.length > 0 ? 'generate_with_images' : 'generate_without_images'
    ]
  const repairProfile = authoringProfiles?.profiles.repair_invalid_import_json
  const profileUnavailableMessage = useCallback(
    (reason: AiAuthoringProfileUnavailableReason) =>
      t(`profileUnavailable.${reason}`),
    [t],
  )
  const providerFailureMessage = useCallback(
    (message: unknown, technicalCode: unknown, fallback: string) => {
      const baseMessage =
        typeof message === 'string' && message.trim().length > 0
          ? message.trim()
          : fallback
      return typeof technicalCode === 'string' &&
        SAFE_AI_TECHNICAL_CODE.test(technicalCode)
        ? `${baseMessage} ${t('technicalErrorCode', { code: technicalCode })}`
        : baseMessage
    },
    [t],
  )
  const formattedRawResponse = useMemo(
    () => formatRawResult(rawResponse),
    [rawResponse],
  )
  const reportTerminalFailure = useCallback(
    (message: string, kind: FailureKind) => {
      setError(message)
      setFailureKind(kind)
      setErrorAnnouncement(
        `${t(kind === 'repair' ? 'repairFailed' : 'generationFailed')}: ${message}`,
      )
      setPhase('error')
    },
    [t],
  )
  const selectedRowCount = selectedRows.size
  const selectedProposalCount = selectedProposals.size
  const hasGeneratedWork = Boolean(generatedPayload || rawResponse || need)

  const authorableAreas = useMemo(
    () => areas.filter(area => area.permissions?.canAuthor !== false),
    [areas],
  )

  const repairPromptText = useMemo(() => {
    if (!rawResponse || schemaIssues.length === 0) return ''
    return [
      t('repairPromptLead'),
      '',
      schemaIssues.map(issue => `- ${issueText(issue)}`).join('\n'),
      '',
      rawResponse,
    ].join('\n')
  }, [rawResponse, schemaIssues, t])

  const handleThinkingScroll = useCallback(() => {
    const element = thinkingScrollRef.current
    if (!element) return
    shouldFollowThinkingRef.current = isNearScrollBottom(element)
  }, [])

  const clearThinkingUpdateTimer = useCallback(() => {
    if (thinkingUpdateTimerRef.current === null) return
    clearTimeout(thinkingUpdateTimerRef.current)
    thinkingUpdateTimerRef.current = null
  }, [])

  const flushQueuedThinking = useCallback(() => {
    clearThinkingUpdateTimer()
    const nextThinking = pendingThinkingRef.current
    pendingThinkingRef.current = null
    if (nextThinking !== null) {
      setThinking(nextThinking)
    }
  }, [clearThinkingUpdateTimer])

  const cancelQueuedThinking = useCallback(() => {
    clearThinkingUpdateTimer()
    pendingThinkingRef.current = null
  }, [clearThinkingUpdateTimer])

  const applyThinkingImmediately = useCallback(
    (nextThinking: string) => {
      cancelQueuedThinking()
      setThinking(nextThinking)
    },
    [cancelQueuedThinking],
  )

  const queueThinkingUpdate = useCallback((nextThinking: string) => {
    pendingThinkingRef.current = nextThinking
    if (thinkingUpdateTimerRef.current !== null) return

    thinkingUpdateTimerRef.current = setTimeout(() => {
      thinkingUpdateTimerRef.current = null
      const queuedThinking = pendingThinkingRef.current
      pendingThinkingRef.current = null
      if (queuedThinking !== null) {
        setThinking(queuedThinking)
      }
    }, THINKING_STREAM_UPDATE_INTERVAL_MS)
  }, [])

  useEffect(() => {
    return () => {
      cancelQueuedThinking()
    }
  }, [cancelQueuedThinking])

  useEffect(() => {
    if (!open || embedded || typeof document === 'undefined') return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [embedded, open])

  useEffect(() => {
    if (phase !== 'error' || !error) return
    const target =
      failureKind === 'generation'
        ? errorSummaryHeadingRef.current
        : failureKind === 'generation-retry'
          ? retryGenerateButtonRef.current
          : repairButtonRef.current
    if (!target) return

    const timeout = window.setTimeout(() => {
      target.focus()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [error, failureKind, phase])

  useEffect(() => {
    if (phase !== 'done' || !shouldFocusResults) return

    const timeout = window.setTimeout(() => {
      resultsHeadingRef.current?.focus()
      setShouldFocusResults(false)
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [phase, shouldFocusResults])

  useEffect(() => {
    if (!inProgress) return
    if (!shouldFollowThinkingRef.current) return
    thinkingEndRef.current?.scrollIntoView?.({
      block: thinking ? 'end' : 'nearest',
    })
  }, [inProgress, thinking])

  useEffect(() => {
    if (!open || !isAiGenerationEnabled) return
    const controller = new AbortController()
    setAuthoringProfilesLoading(true)
    setAuthoringProfiles(null)
    apiFetch('/api/ai/authoring-profiles', {
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('profile availability unavailable')
        const value: unknown = await response.json()
        if (!isAuthoringProfilesResponse(value)) {
          throw new Error('profile availability unavailable')
        }
        return value
      })
      .then(data => {
        if (controller.signal.aborted) return
        setAuthoringProfiles(data)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        const blocked = { available: false, reason: 'blocked' } as const
        setAuthoringProfiles({
          enabled: true,
          profiles: {
            generate_with_images: blocked,
            generate_without_images: blocked,
            repair_invalid_import_json: blocked,
          },
        })
      })
      .finally(() => {
        if (controller.signal.aborted) return
        setAuthoringProfilesLoading(false)
      })

    return () => controller.abort()
  }, [isAiGenerationEnabled, open])

  useEffect(() => {
    const resetAuthoringSession = () => {
      setNeed('')
      setAreaId('')
      setCandidateCount(DEFAULT_REQUIREMENT_CANDIDATE_COUNT)
      setAiRequestExplanationOpen(false)
      setImportInstruction('')
      setImportInstructionScopeKey(null)
      setImportInstructionLoading(false)
      setNeedHelpOpen(false)
      setAreaHelpOpen(false)
      setCandidateCountHelpOpen(false)
      setImageHelpOpen(false)
      setAuthoringProfiles(null)
      setAuthoringProfilesLoading(false)
      setPhase('idle')
      setError(null)
      setFailureKind(null)
      setErrorAnnouncement('')
      setStatusAnnouncement('')
      setShouldFocusResults(false)
      setRepairing(false)
      applyThinkingImmediately('')
      setRawResponse('')
      setStats(null)
      setGeneratedPayload(null)
      setPreviewToken(null)
      setPreviewRows([])
      setPreviewNeedsReferenceProposals([])
      setPreviewProposals([])
      setSelectedRows(new Set())
      setSelectedProposals(new Set())
      setPreviewTab('requirements')
      setSchemaIssues([])
      setImages([])
      setImageError(null)
    }

    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
      resetAuthoringSession()
      return
    }
    resetAuthoringSession()
  }, [applyThinkingImmediately, open])

  const loadImportInstruction = useCallback(async () => {
    if (
      importInstructionLoading ||
      scopedImportInstruction ||
      !canLoadScopedImportInstruction
    )
      return
    const instructionParams = new URLSearchParams({ locale })
    if (mode === 'specification-local' && specificationId) {
      instructionParams.set('kind', 'requirements_specification')
      instructionParams.set('specificationId', String(specificationId))
    } else if (mode === 'library') {
      instructionParams.set('kind', 'requirements_library')
    }
    setImportInstructionLoading(true)
    try {
      const instructionResponse = await apiFetch(
        `/api/requirements/import/instruction?${instructionParams}`,
      )
      if (!instructionResponse.ok) {
        throw new Error(
          (await readResponseMessage(instructionResponse)) ??
            t('errors.failedToLoadImportInstruction'),
        )
      }
      const instruction = await instructionResponse.text()
      setImportInstruction(instruction)
      setImportInstructionScopeKey(currentImportInstructionScopeKey)
    } catch (contractError) {
      setError(
        contractError instanceof Error
          ? contractError.message
          : t('errors.failedToLoadImportInstruction'),
      )
    } finally {
      setImportInstructionLoading(false)
    }
  }, [
    canLoadScopedImportInstruction,
    currentImportInstructionScopeKey,
    importInstructionLoading,
    locale,
    mode,
    scopedImportInstruction,
    specificationId,
    t,
  ])

  const loadPreview = useCallback(
    async (payload: ImportRequirementsPayload) => {
      const normalizedPayload = normalizePayloadForMode(payload, mode)
      const endpoint =
        mode === 'library'
          ? '/api/requirements/import/preview'
          : '/api/specification-local-requirements/import/preview'
      const body =
        mode === 'library'
          ? {
              areaId: targetAreaId,
              locale,
              payload: normalizedPayload,
            }
          : {
              locale,
              payload: normalizedPayload,
              specificationId,
            }
      const response = await apiFetch(endpoint, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error(
          (await readResponseMessage(response)) ?? t('previewFailed'),
        )
      }
      const preview = (await response.json()) as PreviewResponse
      setGeneratedPayload(normalizedPayload)
      setPreviewToken(preview.previewToken)
      setPreviewRows(preview.rows)
      setPreviewNeedsReferenceProposals(preview.needsReferenceProposals ?? [])
      setPreviewProposals(preview.proposals)
      setSelectedRows(
        new Set(
          preview.rows
            .filter(row => row.selected && row.errors.length === 0)
            .map(row => row.reviewRowId),
        ),
      )
      setSelectedProposals(
        new Set(preview.proposals.map(proposal => proposal.key)),
      )
      setPreviewTab(preview.rows.length > 0 ? 'requirements' : 'normReferences')
    },
    [locale, mode, specificationId, t, targetAreaId],
  )

  const handleImages = useCallback(
    async (files: FileList | null) => {
      if (!files) return
      setImageError(null)
      setErrorAnnouncement('')
      const remainingSlots = MAX_IMAGES - images.length
      if (remainingSlots <= 0) {
        const message = t('imageErrorCount', { max: MAX_IMAGES })
        setImageError(message)
        setErrorAnnouncement(message)
        imageSelectButtonRef.current?.focus()
        return
      }
      const selectionExceedsAvailableSlots = files.length > remainingSlots
      const selectedFiles = Array.from(files).slice(0, remainingSlots)
      const nextImages: AttachedImage[] = []
      const rejectedImageMessages: string[] = []
      for (const file of selectedFiles) {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
          rejectedImageMessages.push(t('imageErrorType', { name: file.name }))
          continue
        }
        if (file.size > MAX_IMAGE_BYTES) {
          rejectedImageMessages.push(t('imageErrorSize', { name: file.name }))
          continue
        }
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(file)
          })
          nextImages.push({
            dataUrl,
            id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
            name: file.name,
          })
        } catch {
          rejectedImageMessages.push(t('imageErrorRead'))
        }
      }
      setImages(current => [...current, ...nextImages].slice(0, MAX_IMAGES))
      const imageErrorMessages = selectionExceedsAvailableSlots
        ? [t('imageErrorCount', { max: MAX_IMAGES }), ...rejectedImageMessages]
        : rejectedImageMessages
      if (imageErrorMessages.length > 0) {
        const message = imageErrorMessages.join(' ')
        setImageError(message)
        setErrorAnnouncement(message)
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
      imageSelectButtonRef.current?.focus()
    },
    [images.length, t],
  )

  const resetGeneratedResult = useCallback(() => {
    setError(null)
    setFailureKind(null)
    setErrorAnnouncement('')
    setStatusAnnouncement('')
    setShouldFocusResults(false)
    applyThinkingImmediately('')
    setRawResponse('')
    setStats(null)
    setGeneratedPayload(null)
    setPreviewToken(null)
    setPreviewRows([])
    setPreviewNeedsReferenceProposals([])
    setPreviewProposals([])
    setSelectedRows(new Set())
    setSelectedProposals(new Set())
    setSchemaIssues([])
  }, [applyThinkingImmediately])

  const handleGenerate = useCallback(async () => {
    if (!need.trim() || inProgress || generationProfile?.available !== true) {
      return
    }
    if (mode === 'library' && !targetAreaId) {
      setError(t('areaHelp'))
      return
    }
    if (mode === 'specification-local' && !specificationId) {
      setError(t('missingSpecificationContext'))
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const nextFailureKind: FailureKind =
      phase === 'error' ? 'generation-retry' : 'generation'
    resetGeneratedResult()
    shouldFollowThinkingRef.current = true
    setPhase('thinking')

    try {
      const response = await apiFetch('/api/ai/generate-requirement-import', {
        body: JSON.stringify({
          areaId: mode === 'library' ? targetAreaId : undefined,
          count: candidateCount,
          images: images.map(image => ({ dataUrl: image.dataUrl })),
          locale,
          mode,
          need: need.trim(),
          specificationId:
            mode === 'specification-local' ? specificationId : undefined,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error(
          (await readGenerationResponseMessage(response)) ?? t('createError'),
        )
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedTerminalEvent = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let separatorIndex = buffer.indexOf('\n\n')
        while (separatorIndex >= 0) {
          const block = buffer.slice(0, separatorIndex)
          buffer = buffer.slice(separatorIndex + 2)
          separatorIndex = buffer.indexOf('\n\n')
          const parsed = parseSseBlock(block)
          if (!parsed) continue
          const payload = parsed.data as Record<string, unknown>
          if (parsed.event === 'thinking') {
            setPhase('thinking')
            queueThinkingUpdate(String(payload.thinkingSoFar ?? ''))
          } else if (parsed.event === 'generating') {
            setPhase('generating')
            setRawResponse(
              current => `${current}${String(payload.chunk ?? '')}`,
            )
          } else if (parsed.event === 'done') {
            receivedTerminalEvent = true
            flushQueuedThinking()
            const generated = payload.payload as ImportRequirementsPayload
            const rawContent = String(
              payload.rawContent ?? JSON.stringify(generated),
            )
            setRawResponse(rawContent)
            applyThinkingImmediately(String(payload.thinking ?? ''))
            setStats((payload.stats as GenerationStats | undefined) ?? null)
            await loadPreview(generated)
            setPhase('done')
            if (nextFailureKind === 'generation-retry') {
              setShouldFocusResults(true)
            }
            return
          } else if (parsed.event === 'validation_error') {
            receivedTerminalEvent = true
            flushQueuedThinking()
            const issues = (payload.issues as SchemaIssue[] | undefined) ?? []
            setSchemaIssues(issues)
            setRawResponse(String(payload.rawContent ?? ''))
            applyThinkingImmediately(String(payload.thinking ?? ''))
            setStats((payload.stats as GenerationStats | undefined) ?? null)
            reportTerminalFailure(
              String(payload.message ?? t('validationErrors')),
              nextFailureKind,
            )
            return
          } else if (parsed.event === 'error') {
            receivedTerminalEvent = true
            flushQueuedThinking()
            throw new Error(
              importBudgetErrorMessage(payload.code, t) ??
                providerFailureMessage(
                  payload.message,
                  payload.technicalCode,
                  t('createError'),
                ),
            )
          }
        }
      }
      if (!receivedTerminalEvent) {
        throw new Error(t('createError'))
      }
    } catch (generateError) {
      if (controller.signal.aborted) {
        cancelQueuedThinking()
        return
      }
      flushQueuedThinking()
      reportTerminalFailure(
        generateError instanceof Error
          ? generateError.message
          : t('createError'),
        nextFailureKind,
      )
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [
    candidateCount,
    generationProfile,
    images,
    inProgress,
    loadPreview,
    locale,
    mode,
    need,
    phase,
    applyThinkingImmediately,
    cancelQueuedThinking,
    flushQueuedThinking,
    queueThinkingUpdate,
    providerFailureMessage,
    reportTerminalFailure,
    resetGeneratedResult,
    specificationId,
    t,
    targetAreaId,
  ])

  const handleRepair = useCallback(async () => {
    if (
      !rawResponse ||
      schemaIssues.length === 0 ||
      repairing ||
      repairProfile?.available !== true
    ) {
      return
    }
    if (mode === 'library' && !targetAreaId) return
    if (mode === 'specification-local' && !specificationId) return

    setRepairing(true)
    setError(null)
    setFailureKind(null)
    setErrorAnnouncement('')
    setStatusAnnouncement('')
    try {
      const response = await apiFetch(
        '/api/ai/repair-requirement-import-json',
        {
          body: JSON.stringify({
            areaId: mode === 'library' ? targetAreaId : undefined,
            errors: schemaIssues.map(issueText),
            locale,
            mode,
            rawJson: rawResponse,
            specificationId:
              mode === 'specification-local' ? specificationId : undefined,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      const body = (await response.json()) as {
        error?: string
        issues?: SchemaIssue[]
        payload?: ImportRequirementsPayload
        rawContent?: string
        stats?: GenerationStats
        thinking?: string
        technicalCode?: string
      }
      if (!response.ok || !body.payload) {
        setSchemaIssues(body.issues ?? schemaIssues)
        throw new Error(
          providerFailureMessage(
            body.error,
            body.technicalCode,
            t('validationErrors'),
          ),
        )
      }
      setRawResponse(body.rawContent ?? JSON.stringify(body.payload))
      setThinking(body.thinking ?? '')
      setStats(body.stats ?? null)
      setSchemaIssues([])
      await loadPreview(body.payload)
      setPhase('done')
      setStatusAnnouncement(t('repairSucceeded'))
      setShouldFocusResults(true)
    } catch (repairError) {
      reportTerminalFailure(
        repairError instanceof Error
          ? repairError.message
          : t('validationErrors'),
        'repair',
      )
    } finally {
      setRepairing(false)
    }
  }, [
    loadPreview,
    locale,
    mode,
    rawResponse,
    repairProfile,
    repairing,
    providerFailureMessage,
    reportTerminalFailure,
    schemaIssues,
    specificationId,
    targetAreaId,
    t,
  ])

  const handleClose = useCallback(async () => {
    if (inProgress) {
      abortRef.current?.abort()
      setAreaId('')
      onClose()
      return
    }
    if (hasGeneratedWork) {
      const ok = await confirm({
        cancelText: tc('cancel'),
        confirmText: tc('close'),
        icon: 'warning',
        message: t('closeConfirm'),
        title: t('generateTitle'),
      })
      if (!ok) return
    }
    setAreaId('')
    onClose()
  }, [confirm, hasGeneratedWork, inProgress, onClose, t, tc])

  const buildSelectedPayload =
    useCallback((): ImportRequirementsPayload | null => {
      if (!generatedPayload) return null
      const selectedSourceIndexes = new Set(
        previewRows
          .filter(row => selectedRows.has(row.reviewRowId))
          .map(row => row.sourceIndex),
      )
      const selectedProposalKeys = new Set(selectedProposals)
      const requirements = generatedPayload.requirements
        .map((requirement, index) => ({ index, requirement }))
        .filter(item => selectedSourceIndexes.has(item.index))
        .map(({ requirement }) => ({
          ...requirement,
          proposedNormReferenceKeys:
            requirement.proposedNormReferenceKeys?.filter(key =>
              selectedProposalKeys.has(key),
            ),
        }))
      const selectedNeedsReferenceKeys = new Set(
        requirements
          .map(requirement => requirement.needsReferenceKey)
          .filter((key): key is string => Boolean(key)),
      )

      if (requirements.length === 0) return null
      return normalizePayloadForMode(
        {
          ...generatedPayload,
          proposedNeedsReferences:
            generatedPayload.proposedNeedsReferences?.filter(proposal =>
              selectedNeedsReferenceKeys.has(proposal.key),
            ) ?? [],
          proposedNormReferences:
            generatedPayload.proposedNormReferences?.filter(proposal =>
              selectedProposalKeys.has(proposal.key),
            ) ?? [],
          requirements,
        },
        mode,
      )
    }, [generatedPayload, mode, previewRows, selectedProposals, selectedRows])

  const handleContinueToImport = useCallback(() => {
    const payload = buildSelectedPayload()
    if (!payload) return
    const selectedPreviewRows = previewRows
      .filter(row => selectedRows.has(row.reviewRowId))
      .map(row => ({
        ...row,
        proposedNormReferenceKeys: row.proposedNormReferenceKeys.filter(key =>
          selectedProposals.has(key),
        ),
        selected: true,
      }))
    const selectedPreviewProposals = previewProposals
      .filter(proposal => selectedProposals.has(proposal.key))
      .map(proposal => ({
        ...proposal,
        referencedCount: selectedPreviewRows.filter(row =>
          row.proposedNormReferenceKeys.includes(proposal.key),
        ).length,
      }))
    const selectedPreviewNeedsReferenceProposals =
      previewNeedsReferenceProposals
        .map(proposal => ({
          ...proposal,
          referencedCount: selectedPreviewRows.filter(
            row => row.proposedNeedsReferenceKey === proposal.key,
          ).length,
        }))
        .filter(proposal => proposal.referencedCount > 0)
    const preview =
      previewToken != null
        ? {
            needsReferenceProposals: selectedPreviewNeedsReferenceProposals,
            previewToken,
            proposals: selectedPreviewProposals,
            rows: selectedPreviewRows,
            summary: {
              errorCount: selectedPreviewRows.reduce(
                (count, row) => count + row.errors.length,
                0,
              ),
              rowCount: selectedPreviewRows.length,
              warningCount:
                selectedPreviewRows.reduce(
                  (count, row) => count + row.warnings.length,
                  0,
                ) +
                selectedPreviewProposals.reduce(
                  (count, proposal) => count + proposal.warnings.length,
                  0,
                ) +
                selectedPreviewNeedsReferenceProposals.reduce(
                  (count, proposal) => count + proposal.warnings.length,
                  0,
                ),
            },
          }
        : undefined
    onImportPreview?.(payload, {
      areaId: mode === 'library' && targetAreaId ? targetAreaId : undefined,
      preview,
    })
  }, [
    buildSelectedPayload,
    mode,
    onImportPreview,
    previewNeedsReferenceProposals,
    previewProposals,
    previewRows,
    previewToken,
    selectedProposals,
    selectedRows,
    targetAreaId,
  ])

  if (!open || typeof document === 'undefined') return null

  const generateDisabled =
    !isAiGenerationEnabled ||
    inProgress ||
    authoringProfilesLoading ||
    !need.trim() ||
    generationProfile?.available !== true ||
    (mode === 'library' && !targetAreaId) ||
    (mode === 'specification-local' && !specificationId)
  const continueDisabled = selectedRowCount === 0 || !generatedPayload

  const content = (
    <AnimatePresence>
      <motion.div
        {...(embedded ? {} : fadeMotion(shouldReduceMotion))}
        className={
          embedded
            ? 'contents'
            : 'fixed inset-0 z-50 flex items-center justify-center bg-secondary-900/60 p-4 backdrop-blur-sm'
        }
        role="presentation"
      >
        <motion.div
          {...dialogPanelMotion(shouldReduceMotion)}
          aria-labelledby="ai-requirement-generator-title"
          aria-modal="true"
          className="flex max-h-[90dvh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-secondary-900"
          role="dialog"
          {...devMarker({
            context: 'ai-requirement-generator',
            name: 'dialog',
            value: 'ai-requirement-generator',
          })}
        >
          <div className="sr-only">
            <p aria-atomic="true" role="alert">
              {errorAnnouncement}
            </p>
            <p aria-atomic="true" role="status">
              {statusAnnouncement}
            </p>
          </div>
          <header className="flex items-start justify-between gap-4 border-b border-secondary-200 px-6 py-4 dark:border-secondary-800">
            <div className="min-w-0">
              <h2
                className="flex items-center gap-2 text-xl font-semibold text-secondary-900 dark:text-secondary-50"
                id="ai-requirement-generator-title"
                {...devMarker({
                  context: 'ai-requirement-generator',
                  name: 'dialog title',
                })}
              >
                <Sparkles aria-hidden className="h-5 w-5 text-primary-600" />
                {t('generateTitle')}
              </h2>
              {aiGenerationDisabledMessage ? (
                <p className="mt-2 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                  <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4" />
                  {aiGenerationDisabledMessage}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                aria-label={tc('close')}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-50"
                onClick={handleClose}
                type="button"
                {...devMarker({
                  context: 'ai-requirement-generator',
                  name: 'button',
                  value: 'close',
                })}
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="min-h-0 overflow-y-auto border-b border-secondary-200 p-6 dark:border-secondary-800 lg:border-r lg:border-b-0">
              <div className="space-y-5">
                <div className="block">
                  <div className="mb-1 flex items-center gap-2">
                    <label
                      className="text-sm font-medium text-secondary-800 dark:text-secondary-100"
                      htmlFor="ai-need"
                    >
                      {t('topicLabel')}
                    </label>
                    <FieldHelpButton
                      controls="ai-need-help"
                      expanded={needHelpOpen}
                      label={`${tc('help')}: ${t('topicLabel')}`}
                      onClick={() => setNeedHelpOpen(open => !open)}
                    />
                  </div>
                  <AnimatedHelpPanel id="ai-need-help" isOpen={needHelpOpen}>
                    {t.rich('topicHelp', richTags)}
                  </AnimatedHelpPanel>
                  <textarea
                    className={textareaRows4ClassName}
                    id="ai-need"
                    onChange={event => setNeed(event.target.value)}
                    placeholder={t('topicPlaceholder')}
                    value={need}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-secondary-800 dark:text-secondary-100">
                    <span>{t('imageAttachLabel')}</span>
                    <FieldHelpButton
                      controls="ai-image-help"
                      expanded={imageHelpOpen}
                      label={`${tc('help')}: ${t('imageAttachLabel')}`}
                      onClick={() => setImageHelpOpen(open => !open)}
                    />
                  </div>
                  <AnimatedHelpPanel id="ai-image-help" isOpen={imageHelpOpen}>
                    {t.rich('imageAttachHelp', richTags)}
                  </AnimatedHelpPanel>
                  <input
                    accept={ALLOWED_IMAGE_TYPES.join(',')}
                    className="hidden"
                    multiple
                    onChange={event => void handleImages(event.target.files)}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    aria-describedby={
                      imageError ? 'ai-image-validation-error' : undefined
                    }
                    aria-disabled={images.length >= MAX_IMAGES}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-secondary-300 px-3 text-sm font-medium text-secondary-700 hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800 ${
                      images.length >= MAX_IMAGES
                        ? 'cursor-not-allowed opacity-50'
                        : ''
                    }`}
                    onClick={() => {
                      if (images.length >= MAX_IMAGES) {
                        const message = t('imageErrorCount', {
                          max: MAX_IMAGES,
                        })
                        setImageError(message)
                        setErrorAnnouncement(message)
                        imageSelectButtonRef.current?.focus()
                        return
                      }
                      fileInputRef.current?.click()
                    }}
                    ref={imageSelectButtonRef}
                    type="button"
                  >
                    <ImagePlus aria-hidden className="h-4 w-4" />
                    {t('imageSelectButton')}
                  </button>
                  <p className="text-xs text-secondary-500 dark:text-secondary-400">
                    {t('imageAttachHint')}
                  </p>
                  {imageError ? (
                    <p
                      className="text-xs text-red-700 dark:text-red-300"
                      id="ai-image-validation-error"
                    >
                      {imageError}
                    </p>
                  ) : null}
                  {images.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {images.map(image => (
                        <span
                          className="inline-flex items-center gap-2 rounded-full bg-secondary-100 px-3 py-1 text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200"
                          key={image.id}
                        >
                          {image.name}
                          <button
                            aria-label={t('imageRemove')}
                            className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full text-secondary-500 hover:bg-secondary-200 hover:text-secondary-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-secondary-400 dark:hover:bg-secondary-700 dark:hover:text-secondary-100"
                            {...devMarker({
                              context: 'ai-requirement-generator',
                              name: 'button',
                              value: 'remove image attachment',
                            })}
                            onClick={() => {
                              setImages(current =>
                                current.filter(item => item.id !== image.id),
                              )
                              setImageError(null)
                              setErrorAnnouncement('')
                            }}
                            type="button"
                          >
                            <X aria-hidden className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {mode === 'library' ? (
                    <div className="block">
                      <div className="mb-1 flex items-center gap-2">
                        <label
                          className="text-sm font-medium text-secondary-800 dark:text-secondary-100"
                          htmlFor="ai-area"
                        >
                          {t('areaLabel')}
                          <RequiredFieldMarker />
                        </label>
                        <FieldHelpButton
                          controls="ai-area-help"
                          expanded={areaHelpOpen}
                          label={`${tc('help')}: ${t('areaLabel')}`}
                          onClick={() => setAreaHelpOpen(open => !open)}
                        />
                      </div>
                      <AnimatedHelpPanel
                        id="ai-area-help"
                        isOpen={areaHelpOpen}
                      >
                        {t.rich('areaHelp', richTags)}
                      </AnimatedHelpPanel>
                      <select
                        aria-label={t('areaLabel')}
                        className="min-h-11 w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100"
                        id="ai-area"
                        onChange={event => {
                          setAreaId(
                            event.target.value
                              ? Number(event.target.value)
                              : '',
                          )
                          resetGeneratedResult()
                        }}
                        required
                        value={areaId}
                      >
                        <option value="">{t('selectArea')}</option>
                        {authorableAreas.map(area => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="block">
                    <div className="mb-1 flex items-center gap-2">
                      <label
                        className="text-sm font-medium text-secondary-800 dark:text-secondary-100"
                        htmlFor="ai-candidate-count"
                      >
                        {t('candidateCount')}
                      </label>
                      <FieldHelpButton
                        controls="ai-candidate-count-help"
                        expanded={candidateCountHelpOpen}
                        label={t('candidateCountHelp')}
                        onClick={() => setCandidateCountHelpOpen(open => !open)}
                      />
                    </div>
                    <AnimatedHelpPanel
                      id="ai-candidate-count-help"
                      isOpen={candidateCountHelpOpen}
                    >
                      {t('candidateCountHelp')}
                    </AnimatedHelpPanel>
                    <input
                      className="min-h-11 w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100"
                      id="ai-candidate-count"
                      max={MAX_REQUIREMENT_CANDIDATE_COUNT}
                      min={MIN_REQUIREMENT_CANDIDATE_COUNT}
                      onChange={event => {
                        const value = Number(event.target.value)
                        setCandidateCount(
                          Number.isFinite(value)
                            ? Math.min(
                                MAX_REQUIREMENT_CANDIDATE_COUNT,
                                Math.max(
                                  MIN_REQUIREMENT_CANDIDATE_COUNT,
                                  value,
                                ),
                              )
                            : DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
                        )
                      }}
                      type="number"
                      value={candidateCount}
                    />
                  </div>
                </div>

                <div
                  className="rounded-lg border border-secondary-200 bg-secondary-50 p-3 text-sm dark:border-secondary-800 dark:bg-secondary-950/30"
                  role="status"
                  {...devMarker({
                    context: 'ai-requirement-generator',
                    name: 'status',
                    value: 'authoring profile',
                  })}
                >
                  <p className="font-medium text-secondary-900 dark:text-secondary-50">
                    {t('authoringProfile.title')}
                  </p>
                  {authoringProfilesLoading ? (
                    <p className="mt-1 text-secondary-600 dark:text-secondary-300">
                      {tc('loading')}
                    </p>
                  ) : generationProfile?.available ? (
                    <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                          {t('authoringProfile.connection')}
                        </dt>
                        <dd className="mt-1 text-secondary-800 dark:text-secondary-100">
                          {generationProfile.connectionName}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                          {t('authoringProfile.dataPolicy')}
                        </dt>
                        <dd className="mt-1 text-secondary-800 dark:text-secondary-100">
                          {generationProfile.dataPolicySummary}
                        </dd>
                      </div>
                    </dl>
                  ) : generationProfile ? (
                    <p className="mt-1 flex items-start gap-2 text-amber-700 dark:text-amber-300">
                      <AlertTriangle
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      {profileUnavailableMessage(generationProfile.reason)}
                    </p>
                  ) : null}
                </div>

                <button
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-secondary-200 px-3 py-3 text-left text-sm text-secondary-800 hover:bg-secondary-50 dark:border-secondary-800 dark:text-secondary-100 dark:hover:bg-secondary-800"
                  onClick={() => setAiRequestExplanationOpen(true)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {t('requestExplanation.title')}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-secondary-600 dark:text-secondary-300">
                      {t('requestExplanation.buttonHelp')}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
                </button>
              </div>
            </section>

            <section
              className={`min-h-0 ${
                inProgress || phase === 'done'
                  ? 'relative overflow-hidden'
                  : 'overflow-y-auto p-6'
              }`}
            >
              {phase === 'idle' ? (
                <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-secondary-300 p-8 text-center dark:border-secondary-700">
                  <Sparkles
                    aria-hidden
                    className="mb-3 h-8 w-8 text-primary-600"
                  />
                  <p className="text-sm text-secondary-600 dark:text-secondary-300">
                    {t.rich('topicHelp', richTags)}
                  </p>
                </div>
              ) : null}

              {inProgress ? (
                <div className="absolute inset-6 flex min-h-0 flex-col">
                  <div
                    aria-live="polite"
                    className="min-h-0 flex-1 overflow-y-auto pr-2"
                    onScroll={handleThinkingScroll}
                    ref={thinkingScrollRef}
                  >
                    {thinking ? (
                      <SafeMarkdown>{thinking}</SafeMarkdown>
                    ) : (
                      <p className="text-secondary-500 dark:text-secondary-400">
                        {phase === 'thinking'
                          ? t('thinkingPhase')
                          : t('generatingPhase')}
                      </p>
                    )}
                    <span ref={thinkingEndRef} />
                  </div>
                </div>
              ) : null}

              {phase === 'error' ? (
                <div className="space-y-4">
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
                    {...devMarker({
                      context: 'ai-requirement-generator',
                      name: 'error summary',
                      priority: 350,
                      value: 'generation outcome and technical error details',
                    })}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5" />
                      <div>
                        <h3
                          className="font-medium"
                          ref={errorSummaryHeadingRef}
                          tabIndex={-1}
                        >
                          {t(
                            failureKind === 'repair'
                              ? 'repairFailed'
                              : 'generationFailed',
                          )}
                        </h3>
                        <p>{error ?? t('validationErrors')}</p>
                        {schemaIssues.length > 0 ? (
                          <ul className="mt-2 list-disc space-y-1 pl-5">
                            {schemaIssues.map(issue => (
                              <li key={`${issue.path}-${issue.code}`}>
                                {issueText(issue)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {repairPromptText ? (
                    <div className="rounded-lg border border-secondary-200 p-4 dark:border-secondary-800">
                      <h3 className="text-sm font-semibold text-secondary-900 dark:text-secondary-50">
                        {t('repairPrompt')}
                      </h3>
                      <textarea
                        className={`${textareaRows4ClassName} mt-2 font-mono text-xs`}
                        readOnly
                        value={repairPromptText}
                      />
                      <button
                        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={
                          repairing || repairProfile?.available !== true
                        }
                        onClick={handleRepair}
                        ref={repairButtonRef}
                        title={
                          repairProfile && !repairProfile.available
                            ? profileUnavailableMessage(repairProfile.reason)
                            : undefined
                        }
                        type="button"
                      >
                        {repairing ? (
                          <Loader2
                            aria-hidden
                            className="h-4 w-4 animate-spin"
                          />
                        ) : (
                          <RefreshCw aria-hidden className="h-4 w-4" />
                        )}
                        {repairing ? t('repairing') : t('repair')}
                      </button>
                    </div>
                  ) : null}
                  {rawResponse ? (
                    <details className="rounded-lg border border-secondary-200 p-4 dark:border-secondary-800">
                      <summary className="cursor-pointer text-sm font-medium text-secondary-800 dark:text-secondary-100">
                        {t('rawResultTab')}
                      </summary>
                      <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-secondary-950 p-3 font-mono text-xs text-secondary-50 whitespace-pre-wrap">
                        {formattedRawResponse}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ) : null}

              {phase === 'done' ? (
                <div className="absolute inset-6 flex min-h-0 flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3
                        className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300"
                        ref={resultsHeadingRef}
                        tabIndex={-1}
                      >
                        <CheckCircle2 aria-hidden className="h-4 w-4" />
                        {t('selectedCandidates', { count: selectedRowCount })}
                      </h3>
                      {stats?.totalTokens != null ? (
                        <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                          {t('tokensCount', { count: stats.totalTokens })}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-secondary-300 px-3 text-sm font-medium text-secondary-700 hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                        disabled={inProgress}
                        onClick={handleGenerate}
                        type="button"
                        {...devMarker({
                          context: 'ai-requirement-generator',
                          name: 'button',
                          value: 'generate',
                        })}
                      >
                        <RefreshCw aria-hidden className="h-4 w-4" />
                        {t('regenerateButton')}
                      </button>
                      <button
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-secondary-300 px-3 text-sm font-medium text-secondary-700 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                        onClick={() => {
                          if (selectedRows.size === previewRows.length) {
                            setSelectedRows(new Set())
                          } else {
                            setSelectedRows(
                              new Set(previewRows.map(row => row.reviewRowId)),
                            )
                          }
                        }}
                        type="button"
                      >
                        {selectedRows.size === previewRows.length
                          ? t('deselectAll')
                          : t('selectAll')}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-b border-secondary-200 dark:border-secondary-800">
                    <button
                      aria-current={
                        previewTab === 'requirements' ? 'page' : undefined
                      }
                      className={`min-h-11 px-3 text-sm font-medium ${
                        previewTab === 'requirements'
                          ? 'border-b-2 border-primary-600 text-primary-700 dark:text-primary-300'
                          : 'text-secondary-600 hover:text-secondary-900 dark:text-secondary-400 dark:hover:text-secondary-100'
                      }`}
                      onClick={() => setPreviewTab('requirements')}
                      type="button"
                    >
                      {t('candidates')}
                    </button>
                    <button
                      aria-current={
                        previewTab === 'normReferences' ? 'page' : undefined
                      }
                      className={`min-h-11 px-3 text-sm font-medium ${
                        previewTab === 'normReferences'
                          ? 'border-b-2 border-primary-600 text-primary-700 dark:text-primary-300'
                          : 'text-secondary-600 hover:text-secondary-900 dark:text-secondary-400 dark:hover:text-secondary-100'
                      }`}
                      onClick={() => setPreviewTab('normReferences')}
                      type="button"
                    >
                      {t('proposals')} ({previewProposals.length})
                    </button>
                    <button
                      aria-current={
                        previewTab === 'needsReferenceProposals'
                          ? 'page'
                          : undefined
                      }
                      className={`min-h-11 px-3 text-sm font-medium ${
                        previewTab === 'needsReferenceProposals'
                          ? 'border-b-2 border-primary-600 text-primary-700 dark:text-primary-300'
                          : 'text-secondary-600 hover:text-secondary-900 dark:text-secondary-400 dark:hover:text-secondary-100'
                      }`}
                      onClick={() => setPreviewTab('needsReferenceProposals')}
                      type="button"
                    >
                      {t('needsReferenceProposals')} (
                      {previewNeedsReferenceProposals.length})
                    </button>
                    <button
                      aria-current={
                        previewTab === 'analysis' ? 'page' : undefined
                      }
                      className={`min-h-11 px-3 text-sm font-medium ${
                        previewTab === 'analysis'
                          ? 'border-b-2 border-primary-600 text-primary-700 dark:text-primary-300'
                          : 'text-secondary-600 hover:text-secondary-900 dark:text-secondary-400 dark:hover:text-secondary-100'
                      }`}
                      onClick={() => setPreviewTab('analysis')}
                      type="button"
                    >
                      {t('analysisTab')}
                    </button>
                    <button
                      aria-current={
                        previewTab === 'rawResult' ? 'page' : undefined
                      }
                      className={`min-h-11 px-3 text-sm font-medium ${
                        previewTab === 'rawResult'
                          ? 'border-b-2 border-primary-600 text-primary-700 dark:text-primary-300'
                          : 'text-secondary-600 hover:text-secondary-900 dark:text-secondary-400 dark:hover:text-secondary-100'
                      }`}
                      onClick={() => setPreviewTab('rawResult')}
                      type="button"
                    >
                      {t('rawResultTab')}
                    </button>
                  </div>

                  {previewTab === 'requirements' ? (
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                      {previewRows.length === 0 ? (
                        <p className="rounded-lg border border-secondary-200 p-4 text-sm text-secondary-600 dark:border-secondary-800 dark:text-secondary-300">
                          {t('noCandidates')}
                        </p>
                      ) : (
                        previewRows.map((row, index) => {
                          const selected = selectedRows.has(row.reviewRowId)
                          const messageSummary = previewMessageSummary(row)
                          const classificationBadges = [
                            previewFieldDisplay(
                              row,
                              'categoryId',
                              t('detailCategory'),
                              row.labels?.category,
                              row.values.categoryId,
                            ),
                            previewFieldDisplay(
                              row,
                              'typeId',
                              t('detailType'),
                              row.labels?.type,
                              row.values.typeId,
                            ),
                            previewFieldDisplay(
                              row,
                              'qualityCharacteristicId',
                              t('detailQuality'),
                              row.labels?.qualityCharacteristic,
                              row.values.qualityCharacteristicId,
                            ),
                          ].filter(
                            (
                              item,
                            ): item is {
                              label: string
                              value: string
                              warning: ImportMessage | null
                            } => item !== null,
                          )
                          const priorityClassification = previewFieldDisplay(
                            row,
                            'priorityLevelId',
                            t('detailPriorityLevel'),
                            row.labels?.priorityLevel,
                            row.values.priorityLevelId,
                          )
                          return (
                            <article
                              className={`rounded-lg border p-4 ${
                                selected
                                  ? 'border-primary-300 bg-primary-50/60 dark:border-primary-800 dark:bg-primary-950/20'
                                  : 'border-secondary-200 bg-white dark:border-secondary-800 dark:bg-secondary-950'
                              }`}
                              key={row.reviewRowId}
                            >
                              <div className="flex items-start gap-3">
                                {/* WCAG 2.5.8 target-size exception: spacing — separate candidate cards keep 24 CSS-pixel target circles apart; verified by ai-requirement-generator.test.tsx. */}
                                <input
                                  aria-label={t('selectRequirement', {
                                    index: index + 1,
                                  })}
                                  checked={selected}
                                  className="mt-1 h-5 w-5"
                                  onChange={() =>
                                    setSelectedRows(current => {
                                      const next = new Set(current)
                                      if (next.has(row.reviewRowId)) {
                                        next.delete(row.reviewRowId)
                                      } else {
                                        next.add(row.reviewRowId)
                                      }
                                      return next
                                    })
                                  }
                                  type="checkbox"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="wrap-break-word text-sm leading-relaxed text-secondary-900 dark:text-secondary-50">
                                    {row.values.description}
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                    {row.resolvedPriorityLevel ? (
                                      <StatusBadge
                                        color={row.resolvedPriorityLevel.color}
                                        iconName={
                                          row.resolvedPriorityLevel.iconName
                                        }
                                        label={`${row.resolvedPriorityLevel.code} – ${row.resolvedPriorityLevel.name}`}
                                      />
                                    ) : priorityClassification ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary-100 px-2 py-1 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                                        {priorityClassification.label}:{' '}
                                        {priorityClassification.value}
                                        {priorityClassification.warning ? (
                                          <span
                                            aria-label={previewFieldWarningText(
                                              priorityClassification.warning,
                                            )}
                                            className="inline-flex text-amber-600 dark:text-amber-300"
                                            role="img"
                                            title={previewFieldWarningText(
                                              priorityClassification.warning,
                                            )}
                                          >
                                            <AlertTriangle
                                              aria-hidden
                                              className="h-3.5 w-3.5"
                                            />
                                          </span>
                                        ) : null}
                                      </span>
                                    ) : null}
                                    {classificationBadges.map(badge => (
                                      <span
                                        className="inline-flex items-center gap-1 rounded-full bg-secondary-100 px-2 py-1 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200"
                                        key={badge.label}
                                      >
                                        {badge.label}: {badge.value}
                                        {badge.warning ? (
                                          <span
                                            aria-label={previewFieldWarningText(
                                              badge.warning,
                                            )}
                                            className="inline-flex text-amber-600 dark:text-amber-300"
                                            role="img"
                                            title={previewFieldWarningText(
                                              badge.warning,
                                            )}
                                          >
                                            <AlertTriangle
                                              aria-hidden
                                              className="h-3.5 w-3.5"
                                            />
                                          </span>
                                        ) : null}
                                      </span>
                                    ))}
                                    {row.values.verifiable ? (
                                      <span className="rounded-full bg-green-100 px-2 py-1 text-green-700 dark:bg-green-950 dark:text-green-300">
                                        {t('detailVerifiable')}
                                      </span>
                                    ) : null}
                                    {messageSummary ? (
                                      <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                        {messageSummary}
                                      </span>
                                    ) : null}
                                  </div>
                                  {row.values.acceptanceCriteria ? (
                                    <p className="mt-3 whitespace-pre-wrap text-xs text-secondary-600 dark:text-secondary-300">
                                      <strong>
                                        {t('detailAcceptanceCriteria')}:
                                      </strong>{' '}
                                      {row.values.acceptanceCriteria}
                                    </p>
                                  ) : null}
                                  {row.proposedNormReferenceKeys.length > 0 ? (
                                    <p className="mt-2 text-xs text-secondary-500 dark:text-secondary-400">
                                      {t('proposalCount', {
                                        count:
                                          row.proposedNormReferenceKeys.length,
                                      })}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </article>
                          )
                        })
                      )}
                    </div>
                  ) : null}

                  {previewTab === 'normReferences' ? (
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                      <p className="text-xs text-secondary-500 dark:text-secondary-400">
                        {t('selectedProposals', {
                          count: selectedProposalCount,
                        })}
                      </p>
                      {previewProposals.length === 0 ? (
                        <p className="rounded-lg border border-secondary-200 p-4 text-sm text-secondary-600 dark:border-secondary-800 dark:text-secondary-300">
                          {t('noProposals')}
                        </p>
                      ) : (
                        previewProposals.map(proposal => {
                          const selected = selectedProposals.has(proposal.key)
                          return (
                            <article
                              className={`rounded-lg border p-4 ${
                                selected
                                  ? 'border-primary-300 bg-primary-50/60 dark:border-primary-800 dark:bg-primary-950/20'
                                  : 'border-secondary-200 bg-white dark:border-secondary-800 dark:bg-secondary-950'
                              }`}
                              key={proposal.key}
                            >
                              <div className="flex items-start gap-3">
                                {/* WCAG 2.5.8 target-size exception: spacing — separate norm-reference cards keep 24 CSS-pixel target circles apart; verified by ai-requirement-generator.test.tsx. */}
                                <input
                                  aria-label={`${proposal.name} ${t('proposals')}`}
                                  checked={selected}
                                  className="mt-1 h-5 w-5"
                                  onChange={() =>
                                    setSelectedProposals(current => {
                                      const next = new Set(current)
                                      if (next.has(proposal.key)) {
                                        next.delete(proposal.key)
                                      } else {
                                        next.add(proposal.key)
                                      }
                                      return next
                                    })
                                  }
                                  type="checkbox"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-secondary-900 dark:text-secondary-50">
                                    {proposal.name}
                                  </p>
                                  <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                                    {proposal.type} · {proposal.reference}
                                  </p>
                                  <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                                    {proposal.issuer}
                                    {proposal.version
                                      ? ` · ${proposal.version}`
                                      : ''}
                                  </p>
                                </div>
                              </div>
                            </article>
                          )
                        })
                      )}
                    </div>
                  ) : null}

                  {previewTab === 'needsReferenceProposals' ? (
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                      {previewNeedsReferenceProposals.length === 0 ? (
                        <p className="rounded-lg border border-secondary-200 p-4 text-sm text-secondary-600 dark:border-secondary-800 dark:text-secondary-300">
                          {t('noNeedsReferenceProposals')}
                        </p>
                      ) : (
                        previewNeedsReferenceProposals.map(proposal => (
                          <article
                            className="rounded-lg border border-secondary-200 bg-white p-4 dark:border-secondary-800 dark:bg-secondary-950"
                            key={proposal.key}
                          >
                            <div className="min-w-0">
                              <p className="wrap-break-word font-medium text-secondary-900 dark:text-secondary-50">
                                {proposal.text}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-secondary-600 dark:text-secondary-300">
                                <span className="rounded-full bg-secondary-100 px-2 py-1 dark:bg-secondary-800">
                                  {proposal.key}
                                </span>
                                <span className="rounded-full bg-secondary-100 px-2 py-1 dark:bg-secondary-800">
                                  {t('needsReferenceProposalRows', {
                                    count: proposal.referencedCount,
                                  })}
                                </span>
                                {proposal.resolvedNeedsReferenceId != null ? (
                                  <span className="rounded-full bg-secondary-100 px-2 py-1 dark:bg-secondary-800">
                                    {t('resolvedNeedsReferenceId', {
                                      id: proposal.resolvedNeedsReferenceId,
                                    })}
                                  </span>
                                ) : null}
                              </div>
                              {proposal.description ? (
                                <p className="mt-3 whitespace-pre-wrap text-sm text-secondary-600 dark:text-secondary-300">
                                  {proposal.description}
                                </p>
                              ) : null}
                              {proposal.warnings.length > 0 ? (
                                <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                                  {proposal.warnings.map(warning => (
                                    <li
                                      className="flex gap-1"
                                      key={`${proposal.key}-${warning.code}-${warning.message}`}
                                    >
                                      <AlertTriangle
                                        aria-hidden
                                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                      />
                                      <span>{warning.message}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  ) : null}

                  {previewTab === 'analysis' ? (
                    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-secondary-200 bg-white p-4 dark:border-secondary-800 dark:bg-secondary-950/20">
                      {thinking ? (
                        <SafeMarkdown>{thinking}</SafeMarkdown>
                      ) : (
                        <p className="text-sm text-secondary-500 dark:text-secondary-400">
                          {t('noAnalysis')}
                        </p>
                      )}
                    </div>
                  ) : null}

                  {previewTab === 'rawResult' ? (
                    <pre className="min-h-0 flex-1 overflow-auto rounded-lg bg-secondary-950 p-4 font-mono text-xs leading-6 text-secondary-50 whitespace-pre-wrap">
                      {formattedRawResponse || t('noRawResult')}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-secondary-200 px-6 py-4 dark:border-secondary-800">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                className="inline-flex min-h-11 min-w-11 items-center rounded-xl border border-secondary-300 px-4 py-2.5 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-700 dark:text-secondary-300 dark:hover:bg-secondary-800"
                onClick={handleClose}
                type="button"
              >
                {t('cancelButton')}
              </button>
              {phase === 'done' ? (
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={continueDisabled}
                  onClick={handleContinueToImport}
                  type="button"
                >
                  <CheckCircle2 aria-hidden className="h-4 w-4" />
                  {t('continueToImport')}
                </button>
              ) : (
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={generateDisabled}
                  onClick={handleGenerate}
                  ref={retryGenerateButtonRef}
                  title={
                    aiGenerationDisabledMessage ??
                    (generationProfile && !generationProfile.available
                      ? profileUnavailableMessage(generationProfile.reason)
                      : undefined)
                  }
                  type="button"
                  {...devMarker({
                    context: 'ai-requirement-generator',
                    name: 'button',
                    value: 'generate',
                  })}
                >
                  {inProgress ? (
                    <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles aria-hidden className="h-4 w-4" />
                  )}
                  {t('generateButton')}
                </button>
              )}
            </div>
          </footer>
        </motion.div>
        <AiRequestExplanationDialog
          candidateCount={candidateCount}
          imageCount={images.length}
          importInstruction={scopedImportInstruction}
          importInstructionLoading={importInstructionLoading}
          locale={locale}
          need={need}
          needPlaceholder={t('topicPlaceholder')}
          onClose={() => setAiRequestExplanationOpen(false)}
          onLoadImportInstruction={loadImportInstruction}
          open={aiRequestExplanationOpen}
          profile={generationProfile ?? null}
        />
      </motion.div>
    </AnimatePresence>
  )

  if (embedded) return content
  return createPortal(content, document.body)
}
