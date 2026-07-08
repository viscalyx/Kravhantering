'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  ImagePlus,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Star,
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
import { modalResizableTextareaRows4ClassName } from '@/components/modal-textarea-class'
import RequiredFieldMarker from '@/components/RequiredFieldMarker'
import {
  type AiRequirementGenerationAvailability,
  DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY,
} from '@/lib/ai/generation-availability'
import {
  DEFAULT_REQUIREMENT_CANDIDATE_COUNT,
  MAX_REQUIREMENT_CANDIDATE_COUNT,
  MIN_REQUIREMENT_CANDIDATE_COUNT,
} from '@/lib/ai/requirement-prompt'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'
import type { ImportRequirementsPayload } from '@/lib/requirements/import-schema'

type AiImportMode = 'library' | 'specification-local'
type Phase = 'done' | 'error' | 'generating' | 'idle' | 'thinking'
type PreviewTab =
  | 'analysis'
  | 'needsReferenceProposals'
  | 'normReferences'
  | 'rawResult'
  | 'requirements'

interface AiRequirementGeneratorProps {
  aiGenerationAvailability?: AiRequirementGenerationAvailability
  areas?: Array<{
    id: number
    name: string
    permissions?: { canAuthor?: boolean }
  }>
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

interface OpenRouterModel {
  contextLength: number
  id: string
  name: string
  pricing: { completion: string; prompt: string; reasoning: string }
  provider: string
  supportedParameters: string[]
}

interface CreditInfo {
  isFreeTier: boolean
  limit: number | null
  limitRemaining: number | null
  managementKeyMissing: boolean
  totalCredits: number | null
  usage: number
}

interface GenerationStats {
  completionTokens: number
  cost: number
  promptTokens: number
  reasoningTokens: number
  totalTokens: number
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

interface AttachedImage {
  dataUrl: string
  id: string
  name: string
}

const FAVORITES_KEY = 'ai-favorite-models'
const FILTERS_KEY = 'ai-model-filters'
const DATA_POLICIES_KEY = 'ai-data-policies'
const DATA_POLICIES_DEFAULT = ['data_collection']
const REQUIRED_MODEL_PARAMETERS = ['response_format']
const REQUIRED_MODEL_CAPABILITIES = [
  {
    key: 'reasoning',
    labelKey: 'capabilityReasoning',
    tooltipKey: 'capabilityReasoningTooltip',
  },
  {
    key: 'stream',
    labelKey: 'capabilityStreaming',
    tooltipKey: 'capabilityStreamingTooltip',
  },
  {
    key: 'response_format',
    labelKey: 'capabilityResponseFormat',
    tooltipKey: 'capabilityResponseFormatTooltip',
  },
] as const
const REASONING_EFFORT_OPTIONS = [
  { labelKey: 'effortXhigh', value: 'xhigh' },
  { labelKey: 'effortHigh', value: 'high' },
  { labelKey: 'effortMedium', value: 'medium' },
  { labelKey: 'effortLow', value: 'low' },
] as const
const MAX_IMAGES = 3
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]

const OPTIONAL_CAPABILITIES = [
  {
    key: 'structured_outputs',
    labelKey: 'capabilityStructuredOutputs',
    tooltipKey: 'capabilityStructuredOutputsTooltip',
  },
  {
    key: 'tools',
    labelKey: 'capabilityTools',
    tooltipKey: 'capabilityToolsTooltip',
  },
  {
    key: 'vision',
    labelKey: 'capabilityVision',
    tooltipKey: 'capabilityVisionTooltip',
  },
] as const
type OptionalCapabilityKey = (typeof OPTIONAL_CAPABILITIES)[number]['key']

const DATA_POLICY_OPTIONS = [
  {
    key: 'data_collection',
    labelKey: 'dataPolicyDenyTraining',
    tooltipKey: 'dataPolicyDenyTrainingTooltip',
  },
  {
    key: 'zdr',
    labelKey: 'dataPolicyZdr',
    tooltipKey: 'dataPolicyZdrTooltip',
  },
  {
    key: 'enforce_distillable_text',
    labelKey: 'dataPolicyDistillable',
    tooltipKey: 'dataPolicyDistillableTooltip',
  },
] as const

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  google: 'Google',
  'meta-llama': 'Meta',
  mistralai: 'Mistral',
  openai: 'OpenAI',
  qwen: 'Qwen',
}

const richTags = {
  em: (chunks: ReactNode) => <em>{chunks}</em>,
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
}

const textareaBaseClassName =
  'w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 dark:placeholder:text-secondary-500'
const textareaRows4ClassName = `${textareaBaseClassName} ${modalResizableTextareaRows4ClassName}`

function loadJsonSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // Ignore invalid persisted UI preferences.
  }
  return new Set()
}

function saveJsonSet(key: string, values: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...values]))
}

function loadArrayPreference(key: string, fallback: string[] = []): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return (JSON.parse(raw) as string[]).filter(Boolean)
  } catch {
    // Ignore invalid persisted UI preferences.
  }
  return fallback
}

function saveArrayPreference(key: string, values: string[]) {
  localStorage.setItem(key, JSON.stringify(values))
}

function formatProvider(slug: string): string {
  return PROVIDER_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1)
}

function formatPrice(priceStr: string, freeLabel: string): string {
  const perToken = Number.parseFloat(priceStr)
  if (Number.isNaN(perToken) || perToken === 0) return freeLabel
  const perMillion = perToken * 1_000_000
  if (perMillion < 0.01) return '<$0.01/M'
  return `$${perMillion.toFixed(2)}/M`
}

function parseModelPrice(priceStr: string): number | null {
  const price = Number.parseFloat(priceStr)
  return Number.isFinite(price) && price >= 0 ? price : null
}

function shouldShowReasoningPrice(model: OpenRouterModel): boolean {
  const reasoning = parseModelPrice(model.pricing.reasoning)
  if (reasoning === null) return false
  if (reasoning === 0) return true
  const completion = parseModelPrice(model.pricing.completion)
  return completion === null || reasoning !== completion
}

function modelPriceParts(model: OpenRouterModel, freeLabel: string) {
  const parts = [
    { key: 'P', value: formatPrice(model.pricing.prompt, freeLabel) },
    { key: 'C', value: formatPrice(model.pricing.completion, freeLabel) },
  ]
  if (shouldShowReasoningPrice(model)) {
    parts.push({
      key: 'R',
      value: formatPrice(model.pricing.reasoning, freeLabel),
    })
  }
  return parts
}

function formatModelPrice(model: OpenRouterModel, freeLabel: string): string {
  return modelPriceParts(model, freeLabel)
    .map(part => `${part.key} ${part.value}`)
    .join(' · ')
}

function modelPriceScore(model: OpenRouterModel): {
  complete: boolean
  total: number
} {
  const prices = [
    parseModelPrice(model.pricing.prompt),
    parseModelPrice(model.pricing.completion),
    parseModelPrice(model.pricing.reasoning),
  ]
  return {
    complete: prices.every(price => price !== null),
    total: prices.reduce<number>((sum, price) => sum + (price ?? 0), 0),
  }
}

function preferredModelId(
  models: OpenRouterModel[],
  favorites: Set<string>,
): string {
  const favoriteCandidates = models
    .map((model, index) => ({ index, model, score: modelPriceScore(model) }))
    .filter(candidate => favorites.has(candidate.model.id))
  if (favoriteCandidates.length > 0) {
    favoriteCandidates.sort((left, right) => {
      if (left.score.complete !== right.score.complete) {
        return left.score.complete ? -1 : 1
      }
      const priceDifference = left.score.total - right.score.total
      return priceDifference !== 0 ? priceDifference : left.index - right.index
    })
    return favoriteCandidates[0]?.model.id ?? ''
  }

  const defaultModel = process.env.NEXT_PUBLIC_DEFAULT_MODEL?.trim()
  if (defaultModel && models.some(model => model.id === defaultModel)) {
    return defaultModel
  }

  return models[0]?.id ?? ''
}

function modelSupports(model: OpenRouterModel | undefined, parameter: string) {
  return model?.supportedParameters.includes(parameter) ?? false
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

function buildProviderPreferences(dataPolicies: string[]) {
  return {
    ...(dataPolicies.includes('data_collection')
      ? { data_collection: 'deny' as const }
      : {}),
    ...(dataPolicies.includes('zdr') ? { zdr: true } : {}),
    ...(dataPolicies.includes('enforce_distillable_text')
      ? { enforce_distillable_text: true }
      : {}),
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
  const [model, setModel] = useState('')
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
  const [modelHelpOpen, setModelHelpOpen] = useState(false)
  const [reasoningHelpOpen, setReasoningHelpOpen] = useState(false)
  const [imageHelpOpen, setImageHelpOpen] = useState(false)

  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelMenuOrder, setModelMenuOrder] = useState<string[]>([])
  const [preserveModelMenuOrder, setPreserveModelMenuOrder] = useState(false)
  const [modelMenuPosition, setModelMenuPosition] = useState<{
    left: number
    maxHeight: number
    top: number
    width: number
  } | null>(null)
  const [modelSearch, setModelSearch] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('high')
  const [capabilityModelCounts, setCapabilityModelCounts] = useState<
    Partial<Record<OptionalCapabilityKey, number>>
  >({})
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const [dataPolicies, setDataPolicies] = useState<string[]>(
    DATA_POLICIES_DEFAULT,
  )
  const [credits, setCredits] = useState<CreditInfo | null>(null)
  const [creditsError, setCreditsError] = useState<string | null>(null)

  const [images, setImages] = useState<AttachedImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const favoriteModelsRef = useRef<Set<string>>(new Set())
  const manualModelSelectionRef = useRef(false)
  const modelButtonRef = useRef<HTMLButtonElement | null>(null)
  const modelMenuPanelRef = useRef<HTMLDivElement | null>(null)
  const selectedModelOptionRef = useRef<HTMLDivElement | null>(null)
  const thinkingEndRef = useRef<HTMLSpanElement | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
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
  const selectedModel = models.find(item => item.id === model)
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
  const isVisionCapabilitySelected = activeFilters.includes('vision')
  const canUseVision = modelSupports(selectedModel, 'vision')
  const selectedModelPrice = selectedModel
    ? formatModelPrice(selectedModel, t('tierFree'))
    : null
  const selectedModelName = selectedModel
    ? `${formatProvider(selectedModel.provider)}: ${selectedModel.name}`
    : undefined
  const reasoningEffortLabel =
    t(
      REASONING_EFFORT_OPTIONS.find(option => option.value === reasoningEffort)
        ?.labelKey ?? 'effortHigh',
    ) ?? ''
  const selectedDataPolicyLabels = dataPolicies
    .map(policyKey =>
      DATA_POLICY_OPTIONS.find(policy => policy.key === policyKey),
    )
    .filter(
      (policy): policy is (typeof DATA_POLICY_OPTIONS)[number] =>
        policy !== undefined,
    )
    .map(policy => t(policy.labelKey))
  const formattedRawResponse = useMemo(
    () => formatRawResult(rawResponse),
    [rawResponse],
  )
  const selectedRowCount = selectedRows.size
  const selectedProposalCount = selectedProposals.size
  const hasGeneratedWork = Boolean(generatedPayload || rawResponse || need)

  const sortedModels = useMemo(() => {
    const favoriteModels = models.filter(item => favorites.has(item.id))
    const nonFavoriteModels = models.filter(item => !favorites.has(item.id))
    return [...favoriteModels, ...nonFavoriteModels]
  }, [favorites, models])
  const authorableAreas = useMemo(
    () => areas.filter(area => area.permissions?.canAuthor !== false),
    [areas],
  )

  const displayModels = useMemo(() => {
    if (!modelMenuOpen || !preserveModelMenuOrder || modelSearch.trim()) {
      return sortedModels
    }
    const modelsById = new Map(models.map(item => [item.id, item]))
    const ordered = modelMenuOrder
      .map(id => modelsById.get(id))
      .filter((item): item is OpenRouterModel => Boolean(item))
    const knownIds = new Set(modelMenuOrder)
    const missing = sortedModels.filter(item => !knownIds.has(item.id))
    return [...ordered, ...missing]
  }, [
    modelMenuOpen,
    modelMenuOrder,
    modelSearch,
    models,
    preserveModelMenuOrder,
    sortedModels,
  ])

  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase()
    if (!query) return displayModels
    return displayModels.filter(item => {
      return [item.name, item.id, item.provider, formatProvider(item.provider)]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [displayModels, modelSearch])

  const groupedModels = useMemo(() => {
    return filteredModels.reduce<Record<string, OpenRouterModel[]>>(
      (groups, item) => {
        const provider = formatProvider(item.provider)
        groups[provider] ??= []
        groups[provider].push(item)
        return groups
      },
      {},
    )
  }, [filteredModels])

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

  const updateModelMenuPosition = useCallback(() => {
    const button = modelButtonRef.current
    if (!button || typeof window === 'undefined') return

    const rect = button.getBoundingClientRect()
    const margin = 16
    const gap = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const width = Math.min(
      Math.max(rect.width, 360),
      Math.max(0, viewportWidth - margin * 2),
    )
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, viewportWidth - width - margin),
    )
    const below = viewportHeight - rect.bottom - margin - gap
    const above = rect.top - margin - gap
    const openAbove = below < 320 && above > below
    const maxHeight = Math.min(640, Math.max(240, openAbove ? above : below))
    const top = openAbove
      ? Math.max(margin, rect.top - gap - maxHeight)
      : rect.bottom + gap

    setModelMenuPosition({ left, maxHeight, top, width })
  }, [])

  const handleToggleModelMenu = useCallback(() => {
    if (modelMenuOpen) {
      setModelMenuOpen(false)
      return
    }
    setModelMenuOrder(sortedModels.map(item => item.id))
    setPreserveModelMenuOrder(true)
    setModelMenuOpen(true)
  }, [modelMenuOpen, sortedModels])

  const handleSelectModel = useCallback((modelId: string) => {
    manualModelSelectionRef.current = true
    setModel(modelId)
    setModelSearch('')
    setPreserveModelMenuOrder(false)
    setModelMenuOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    manualModelSelectionRef.current = false
    const loadedFavorites = loadJsonSet(FAVORITES_KEY)
    favoriteModelsRef.current = loadedFavorites
    setFavorites(loadedFavorites)
    setActiveFilters(
      loadArrayPreference(FILTERS_KEY).filter(
        item => item !== 'logprobs' && item !== 'response_format',
      ),
    )
    setDataPolicies(
      loadArrayPreference(DATA_POLICIES_KEY, DATA_POLICIES_DEFAULT),
    )
  }, [open])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!modelMenuOpen) return

    updateModelMenuPosition()
    window.addEventListener('resize', updateModelMenuPosition)
    window.addEventListener('scroll', updateModelMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateModelMenuPosition)
      window.removeEventListener('scroll', updateModelMenuPosition, true)
    }
  }, [modelMenuOpen, updateModelMenuPosition])

  useEffect(() => {
    if (!modelMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (modelButtonRef.current?.contains(target)) return
      if (modelMenuPanelRef.current?.contains(target)) return
      setModelMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [modelMenuOpen])

  useEffect(() => {
    if (!modelMenuOpen) return

    const handle = window.setTimeout(() => {
      selectedModelOptionRef.current?.scrollIntoView?.({ block: 'center' })
    }, 0)

    return () => window.clearTimeout(handle)
  }, [modelMenuOpen])

  useEffect(() => {
    if (modelMenuOpen) return
    setModelSearch('')
    setPreserveModelMenuOrder(false)
    setModelMenuOrder([])
    setModelMenuPosition(null)
  }, [modelMenuOpen])

  useEffect(() => {
    if (isVisionCapabilitySelected) return
    setImages([])
    setImageError(null)
  }, [isVisionCapabilitySelected])

  useEffect(() => {
    if (!inProgress) return
    thinkingEndRef.current?.scrollIntoView?.({
      block: thinking ? 'end' : 'nearest',
    })
  }, [inProgress, thinking])

  useEffect(() => {
    if (!open || !isAiGenerationEnabled) return

    const controller = new AbortController()
    setModelsLoading(true)
    setModelsError(null)
    const buildModelsUrl = (filters: string[]) => {
      const params = new URLSearchParams()
      const supportedParameters = [
        ...new Set([...REQUIRED_MODEL_PARAMETERS, ...filters]),
      ]
      params.set('supported_parameters', supportedParameters.join(','))
      return `/api/ai/models?${params.toString()}`
    }
    const withFilter = (filters: string[], filter: string) =>
      filters.includes(filter) ? filters : [...filters, filter]

    apiFetch(buildModelsUrl(activeFilters), {
      signal: controller.signal,
    })
      .then(async response => {
        const data = (await response.json()) as {
          error?: string
          models?: OpenRouterModel[]
        }
        const list = data.models ?? []
        const countEntries = await Promise.all(
          OPTIONAL_CAPABILITIES.map(async capability => {
            if (activeFilters.includes(capability.key)) {
              return [capability.key, list.length] as const
            }
            try {
              const countResponse = await apiFetch(
                buildModelsUrl(withFilter(activeFilters, capability.key)),
                { signal: controller.signal },
              )
              const countData = (await countResponse.json()) as {
                models?: OpenRouterModel[]
              }
              return [capability.key, countData.models?.length ?? null] as const
            } catch {
              return [capability.key, null] as const
            }
          }),
        )
        return {
          capabilityCounts: Object.fromEntries(
            countEntries.filter(
              (entry): entry is readonly [OptionalCapabilityKey, number] =>
                entry[1] !== null,
            ),
          ) as Partial<Record<OptionalCapabilityKey, number>>,
          data,
          list,
        }
      })
      .then(({ capabilityCounts, data, list }) => {
        if (controller.signal.aborted) return
        setModels(list)
        setCapabilityModelCounts(capabilityCounts)
        setModelsError(data.error ?? null)
        setModel(current => {
          const currentIsAvailable =
            current && list.some(item => item.id === current)
          if (manualModelSelectionRef.current && currentIsAvailable) {
            return current
          }
          return preferredModelId(list, favoriteModelsRef.current)
        })
      })
      .catch(fetchError => {
        if (controller.signal.aborted) return
        setModelsError(
          fetchError instanceof Error
            ? fetchError.message
            : t('errors.failedToLoadModels'),
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false)
      })

    return () => controller.abort()
  }, [activeFilters, isAiGenerationEnabled, open, t])

  useEffect(() => {
    if (!open || !isAiGenerationEnabled) return
    const controller = new AbortController()
    setCredits(null)
    setCreditsError(null)
    apiFetch('/api/ai/credits', {
      signal: controller.signal,
    })
      .then(
        response => response.json() as Promise<CreditInfo & { error?: string }>,
      )
      .then(data => {
        if (controller.signal.aborted) return
        if (data.error) {
          setCreditsError(data.error)
        } else {
          setCredits(data)
        }
      })
      .catch(fetchError => {
        if (controller.signal.aborted) return
        setCreditsError(
          fetchError instanceof Error
            ? fetchError.message
            : t('creditsUnreachable'),
        )
      })

    return () => controller.abort()
  }, [isAiGenerationEnabled, open, t])

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
      setModelHelpOpen(false)
      setReasoningHelpOpen(false)
      setImageHelpOpen(false)
      setModelMenuOpen(false)
      setModelMenuOrder([])
      setPreserveModelMenuOrder(false)
      setModelMenuPosition(null)
      setModelSearch('')
      setPhase('idle')
      setError(null)
      setRepairing(false)
      setThinking('')
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
  }, [open])

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

  const handleToggleFilter = useCallback((filter: string) => {
    setActiveFilters(current => {
      const next = current.includes(filter)
        ? current.filter(item => item !== filter)
        : [...current, filter]
      saveArrayPreference(FILTERS_KEY, next)
      return next
    })
  }, [])

  const handleToggleDataPolicy = useCallback((policy: string) => {
    setDataPolicies(current => {
      const next = current.includes(policy)
        ? current.filter(item => item !== policy)
        : [...current, policy]
      saveArrayPreference(DATA_POLICIES_KEY, next)
      return next
    })
  }, [])

  const handleToggleFavorite = useCallback((modelId: string) => {
    setFavorites(current => {
      const next = new Set(current)
      if (next.has(modelId)) {
        next.delete(modelId)
      } else {
        next.add(modelId)
      }
      favoriteModelsRef.current = next
      saveJsonSet(FAVORITES_KEY, next)
      return next
    })
  }, [])

  const handleImages = useCallback(
    async (files: FileList | null) => {
      if (!files) return
      setImageError(null)
      const remainingSlots = MAX_IMAGES - images.length
      if (remainingSlots <= 0) {
        setImageError(t('imageErrorCount', { max: MAX_IMAGES }))
        return
      }
      const selectedFiles = Array.from(files).slice(0, remainingSlots)
      const nextImages: AttachedImage[] = []
      for (const file of selectedFiles) {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
          setImageError(t('imageErrorType', { name: file.name }))
          continue
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setImageError(t('imageErrorSize', { name: file.name }))
          continue
        }
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
      }
      setImages(current => [...current, ...nextImages].slice(0, MAX_IMAGES))
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [images.length, t],
  )

  const resetGeneratedResult = useCallback(() => {
    setError(null)
    setThinking('')
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
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!need.trim() || inProgress || !model) return
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
    resetGeneratedResult()
    setPhase('thinking')

    try {
      const response = await apiFetch('/api/ai/generate-requirement-import', {
        body: JSON.stringify({
          areaId: mode === 'library' ? targetAreaId : undefined,
          count: candidateCount,
          images: images.map(image => ({ dataUrl: image.dataUrl })),
          locale,
          mode,
          model,
          need: need.trim(),
          providerPreferences: buildProviderPreferences(dataPolicies),
          reasoningEffort,
          specificationId:
            mode === 'specification-local' ? specificationId : undefined,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error(
          (await readResponseMessage(response)) ?? t('createError'),
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
            setThinking(String(payload.thinkingSoFar ?? ''))
          } else if (parsed.event === 'generating') {
            setPhase('generating')
            setRawResponse(
              current => `${current}${String(payload.chunk ?? '')}`,
            )
          } else if (parsed.event === 'done') {
            receivedTerminalEvent = true
            const generated = payload.payload as ImportRequirementsPayload
            const rawContent = String(
              payload.rawContent ?? JSON.stringify(generated),
            )
            setRawResponse(rawContent)
            setThinking(String(payload.thinking ?? ''))
            setStats((payload.stats as GenerationStats | undefined) ?? null)
            await loadPreview(generated)
            setPhase('done')
            return
          } else if (parsed.event === 'validation_error') {
            receivedTerminalEvent = true
            const issues = (payload.issues as SchemaIssue[] | undefined) ?? []
            setSchemaIssues(issues)
            setRawResponse(String(payload.rawContent ?? ''))
            setThinking(String(payload.thinking ?? ''))
            setStats((payload.stats as GenerationStats | undefined) ?? null)
            setError(String(payload.message ?? t('validationErrors')))
            setPhase('error')
            return
          } else if (parsed.event === 'error') {
            receivedTerminalEvent = true
            throw new Error(String(payload.message ?? t('createError')))
          }
        }
      }
      if (!receivedTerminalEvent) {
        throw new Error(t('createError'))
      }
    } catch (generateError) {
      if (controller.signal.aborted) return
      setError(
        generateError instanceof Error
          ? generateError.message
          : t('createError'),
      )
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [
    candidateCount,
    dataPolicies,
    images,
    inProgress,
    loadPreview,
    locale,
    mode,
    model,
    need,
    reasoningEffort,
    resetGeneratedResult,
    specificationId,
    t,
    targetAreaId,
  ])

  const handleRepair = useCallback(async () => {
    if (!rawResponse || schemaIssues.length === 0 || repairing || !model) return
    if (mode === 'library' && !targetAreaId) return
    if (mode === 'specification-local' && !specificationId) return

    setRepairing(true)
    setError(null)
    try {
      const response = await apiFetch(
        '/api/ai/repair-requirement-import-json',
        {
          body: JSON.stringify({
            areaId: mode === 'library' ? targetAreaId : undefined,
            errors: schemaIssues.map(issueText),
            locale,
            mode,
            model,
            providerPreferences: buildProviderPreferences(dataPolicies),
            rawJson: rawResponse,
            reasoningEffort,
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
      }
      if (!response.ok || !body.payload) {
        setSchemaIssues(body.issues ?? schemaIssues)
        throw new Error(body.error ?? t('validationErrors'))
      }
      setRawResponse(body.rawContent ?? JSON.stringify(body.payload))
      setThinking(body.thinking ?? '')
      setStats(body.stats ?? null)
      setSchemaIssues([])
      await loadPreview(body.payload)
      setPhase('done')
    } catch (repairError) {
      setError(
        repairError instanceof Error
          ? repairError.message
          : t('validationErrors'),
      )
      setPhase('error')
    } finally {
      setRepairing(false)
    }
  }, [
    dataPolicies,
    loadPreview,
    locale,
    mode,
    model,
    rawResponse,
    reasoningEffort,
    repairing,
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
    modelsLoading ||
    !need.trim() ||
    !model ||
    (mode === 'library' && !targetAreaId) ||
    (mode === 'specification-local' && !specificationId)
  const continueDisabled = selectedRowCount === 0 || !generatedPayload
  const modelMenuOverlay =
    modelMenuOpen && modelMenuPosition && models.length > 0 ? (
      <div
        className="fixed z-70 flex flex-col rounded-lg border border-secondary-200 bg-white shadow-2xl dark:border-secondary-700 dark:bg-secondary-900"
        ref={modelMenuPanelRef}
        style={{
          left: modelMenuPosition.left,
          maxHeight: modelMenuPosition.maxHeight,
          top: modelMenuPosition.top,
          width: modelMenuPosition.width,
        }}
      >
        <div className="shrink-0 border-b border-secondary-200 p-2 dark:border-secondary-800">
          <input
            aria-label={t('modelSearchLabel')}
            className="min-h-10 w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 dark:placeholder:text-secondary-500"
            onChange={event => {
              setModelSearch(event.target.value)
              setPreserveModelMenuOrder(false)
            }}
            placeholder={t('modelSearchPlaceholder')}
            type="search"
            value={modelSearch}
          />
        </div>
        <div
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
          id="ai-model-listbox"
          role="listbox"
        >
          {Object.entries(groupedModels).map(([provider, items]) => (
            <div key={provider}>
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                {provider}
              </p>
              <div className="space-y-1">
                {items.map(item => {
                  const selected = item.id === model
                  const priceParts = modelPriceParts(item, t('tierFree'))
                  return (
                    <div
                      aria-selected={selected}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2 rounded-lg border transition-colors ${
                        selected
                          ? 'border-primary-300 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/30'
                          : 'border-secondary-200 bg-white hover:bg-secondary-50 dark:border-secondary-800 dark:bg-secondary-950 dark:hover:bg-secondary-800'
                      }`}
                      key={item.id}
                      ref={selected ? selectedModelOptionRef : null}
                      role="option"
                      tabIndex={-1}
                    >
                      <button
                        className="min-w-0 px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        onClick={() => handleSelectModel(item.id)}
                        type="button"
                      >
                        <span className="flex min-w-0 items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-secondary-900 dark:text-secondary-50">
                              {item.name}
                            </span>
                            <span className="block truncate text-xs text-secondary-500 dark:text-secondary-400">
                              {item.id}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-xs text-secondary-500 dark:text-secondary-400">
                            {priceParts.map(part => (
                              <span className="block" key={part.key}>
                                {part.key} {part.value}
                              </span>
                            ))}
                          </span>
                        </span>
                      </button>
                      <button
                        aria-label={
                          favorites.has(item.id)
                            ? t('removeFavorite')
                            : t('addFavorite')
                        }
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-lg text-secondary-500 hover:bg-secondary-100 hover:text-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-amber-400"
                        onClick={event => {
                          event.stopPropagation()
                          handleToggleFavorite(item.id)
                        }}
                        type="button"
                      >
                        <Star
                          aria-hidden
                          className={`h-4 w-4 ${
                            favorites.has(item.id)
                              ? 'fill-amber-400 text-amber-500'
                              : ''
                          }`}
                        />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {filteredModels.length === 0 ? (
            <p className="px-3 py-4 text-sm text-secondary-500 dark:text-secondary-400">
              {t('noModels')}
            </p>
          ) : null}
        </div>
      </div>
    ) : null

  return createPortal(
    <AnimatePresence>
      <motion.div
        {...fadeMotion(shouldReduceMotion)}
        className="fixed inset-0 z-50 flex items-center justify-center bg-secondary-900/60 p-4 backdrop-blur-sm"
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
              {credits ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    credits.limit !== null &&
                    credits.limitRemaining !== null &&
                    credits.limitRemaining < 1
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : credits.isFreeTier
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}
                >
                  {(() => {
                    const tier = credits.isFreeTier
                      ? t('tierFree')
                      : t('tierPaid')
                    const keyBalance =
                      credits.limit !== null
                        ? `$${credits.usage.toFixed(2)} / $${credits.limit.toFixed(2)}`
                        : `$${credits.usage.toFixed(2)} / ${t('limitUnlimited')}`
                    if (credits.totalCredits != null) {
                      return t('creditsBadgeWithOrg', {
                        keyBalance,
                        orgCredits: `$${credits.totalCredits.toFixed(2)}`,
                        tier,
                      })
                    }
                    return t('creditsBadge', { balance: keyBalance, tier })
                  })()}
                  {credits.managementKeyMissing ? (
                    <span
                      className="inline-flex items-center gap-0.5 opacity-70"
                      title={t('orgCreditsMissingKey')}
                    >
                      {' · '}
                      <Lock aria-hidden="true" className="h-3 w-3" />
                      {t('totalCreditsLocked')}
                    </span>
                  ) : null}
                </span>
              ) : creditsError ? (
                <span
                  className="rounded-full border border-amber-300 px-3 py-1 text-xs text-amber-700 dark:border-amber-700 dark:text-amber-300"
                  title={creditsError}
                >
                  {t('creditsErrorTooltip', { detail: creditsError })}
                </span>
              ) : null}
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
                    <button
                      aria-controls="ai-need-help"
                      aria-expanded={needHelpOpen}
                      aria-label={`${tc('help')}: ${t('topicLabel')}`}
                      className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-100"
                      onClick={() => setNeedHelpOpen(open => !open)}
                      type="button"
                    >
                      <HelpCircle aria-hidden className="h-4 w-4" />
                    </button>
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

                {isVisionCapabilitySelected ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-secondary-800 dark:text-secondary-100">
                      <span>{t('imageAttachLabel')}</span>
                      <button
                        aria-controls="ai-image-help"
                        aria-expanded={imageHelpOpen}
                        aria-label={`${tc('help')}: ${t('imageAttachLabel')}`}
                        className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-100"
                        onClick={() => setImageHelpOpen(open => !open)}
                        type="button"
                      >
                        <HelpCircle aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                    <AnimatedHelpPanel
                      id="ai-image-help"
                      isOpen={imageHelpOpen}
                    >
                      {t.rich('imageAttachHelp', richTags)}
                    </AnimatedHelpPanel>
                    <input
                      accept={ALLOWED_IMAGE_TYPES.join(',')}
                      className="hidden"
                      disabled={!canUseVision}
                      multiple
                      onChange={event => void handleImages(event.target.files)}
                      ref={fileInputRef}
                      type="file"
                    />
                    <button
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-secondary-300 px-3 text-sm font-medium text-secondary-700 hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                      disabled={!canUseVision || images.length >= MAX_IMAGES}
                      onClick={() => fileInputRef.current?.click()}
                      type="button"
                    >
                      <ImagePlus aria-hidden className="h-4 w-4" />
                      {t('imageSelectButton')}
                    </button>
                    <p className="text-xs text-secondary-500 dark:text-secondary-400">
                      {t('imageAttachHint')}
                    </p>
                    {imageError ? (
                      <p className="text-xs text-red-700 dark:text-red-300">
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
                              onClick={() =>
                                setImages(current =>
                                  current.filter(item => item.id !== image.id),
                                )
                              }
                              type="button"
                            >
                              <X aria-hidden className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

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
                        <button
                          aria-controls="ai-area-help"
                          aria-expanded={areaHelpOpen}
                          aria-label={`${tc('help')}: ${t('areaLabel')}`}
                          className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-100"
                          onClick={() => setAreaHelpOpen(open => !open)}
                          type="button"
                        >
                          <HelpCircle aria-hidden className="h-4 w-4" />
                        </button>
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
                      <button
                        aria-controls="ai-candidate-count-help"
                        aria-expanded={candidateCountHelpOpen}
                        aria-label={t('candidateCountHelp')}
                        className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-100"
                        onClick={() => setCandidateCountHelpOpen(open => !open)}
                        type="button"
                      >
                        <HelpCircle aria-hidden className="h-4 w-4" />
                      </button>
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

                <div className="space-y-3 rounded-lg border border-secondary-200 p-3 dark:border-secondary-800">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(10rem,13rem)]">
                    <div className="min-w-0 space-y-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-secondary-800 dark:text-secondary-100">
                            <span className="truncate">{t('modelLabel')}</span>
                            <button
                              aria-controls="ai-model-help"
                              aria-expanded={modelHelpOpen}
                              aria-label={`${tc('help')}: ${t('modelLabel')}`}
                              className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-100"
                              onClick={() => setModelHelpOpen(open => !open)}
                              type="button"
                            >
                              <HelpCircle aria-hidden className="h-4 w-4" />
                            </button>
                          </div>
                          {selectedModelPrice ? (
                            <output
                              aria-label={t('modelPriceLabel')}
                              className="shrink-0 text-right text-xs font-normal leading-5 text-secondary-500 dark:text-secondary-400"
                            >
                              {selectedModelPrice}
                            </output>
                          ) : null}
                        </div>
                        <span aria-hidden className="min-w-11" />
                      </div>
                      <AnimatedHelpPanel
                        id="ai-model-help"
                        isOpen={modelHelpOpen}
                      >
                        {t.rich('modelHelp', richTags)}
                      </AnimatedHelpPanel>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                        <div className="relative min-w-0">
                          <button
                            aria-controls="ai-model-listbox"
                            aria-expanded={modelMenuOpen}
                            aria-haspopup="listbox"
                            aria-label={t('modelLabel')}
                            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-secondary-300 bg-white px-3 py-2 text-left text-sm text-secondary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100"
                            disabled={modelsLoading || models.length === 0}
                            id="ai-model"
                            onClick={handleToggleModelMenu}
                            ref={modelButtonRef}
                            type="button"
                            {...devMarker({
                              context: 'ai-requirement-generator',
                              name: 'button',
                              value: 'model selector',
                            })}
                          >
                            <span className="min-w-0 truncate">
                              {models.length === 0
                                ? modelsLoading
                                  ? tc('loading')
                                  : (modelsError ?? t('noModels'))
                                : (selectedModel?.name ?? t('noModels'))}
                            </span>
                            <ChevronDown
                              aria-hidden
                              className={`h-4 w-4 shrink-0 transition-transform ${
                                modelMenuOpen ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </div>
                        <button
                          aria-label={t('refreshModels')}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-secondary-300 text-secondary-700 hover:bg-secondary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                          disabled={modelsLoading}
                          onClick={() => {
                            setActiveFilters(filters => [...filters])
                            setModels([])
                          }}
                          type="button"
                        >
                          <RefreshCw
                            aria-hidden
                            className={`h-4 w-4 ${modelsLoading ? 'animate-spin' : ''}`}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-secondary-800 dark:text-secondary-100">
                        <label
                          className="truncate"
                          htmlFor="ai-reasoning-effort"
                        >
                          {t('reasoningEffortLabel')}
                        </label>
                        <button
                          aria-controls="ai-reasoning-help"
                          aria-expanded={reasoningHelpOpen}
                          aria-label={`${tc('help')}: ${t('reasoningEffortLabel')}`}
                          className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-100"
                          onClick={() => setReasoningHelpOpen(open => !open)}
                          type="button"
                        >
                          <HelpCircle aria-hidden className="h-4 w-4" />
                        </button>
                      </div>
                      <AnimatedHelpPanel
                        id="ai-reasoning-help"
                        isOpen={reasoningHelpOpen}
                      >
                        {t.rich('reasoningEffortHelp', richTags)}
                      </AnimatedHelpPanel>
                      <select
                        className="min-h-11 w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100"
                        disabled={inProgress}
                        id="ai-reasoning-effort"
                        onChange={event =>
                          setReasoningEffort(event.target.value)
                        }
                        value={reasoningEffort}
                      >
                        {REASONING_EFFORT_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                        {t('capabilitySettings')}
                      </legend>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
                          {t('requiredCapabilities')}
                        </p>
                        {REQUIRED_MODEL_CAPABILITIES.map(capability => {
                          const upgradedToStrictSchema =
                            capability.key === 'response_format' &&
                            activeFilters.includes('structured_outputs')
                          return (
                            <div
                              className="grid cursor-help grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 text-sm text-secondary-500 dark:text-secondary-400"
                              key={capability.key}
                              title={t(capability.tooltipKey)}
                            >
                              <Lock aria-hidden className="h-3.5 w-3.5" />
                              <span className="flex min-w-0 items-center gap-1 leading-snug">
                                <span
                                  className={`min-w-0 ${
                                    upgradedToStrictSchema
                                      ? 'line-through opacity-70'
                                      : ''
                                  }`}
                                >
                                  {t(capability.labelKey)}
                                </span>
                                {upgradedToStrictSchema ? (
                                  <span
                                    aria-label={t('capabilityUpgradedToStrict')}
                                    className="inline-flex shrink-0 items-center justify-center text-primary-600 dark:text-primary-400"
                                    role="img"
                                    title={t('capabilityUpgradedToStrict')}
                                  >
                                    <ArrowUpRight
                                      aria-hidden
                                      className="h-3.5 w-3.5"
                                    />
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      <div className="space-y-1 pt-2">
                        <p className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
                          {t('optionalCapabilities')}
                        </p>
                        {OPTIONAL_CAPABILITIES.map(capability => {
                          const count = capabilityModelCounts[capability.key]
                          return (
                            <div
                              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-sm text-secondary-700 dark:text-secondary-200"
                              key={capability.key}
                            >
                              <label
                                className="flex min-w-0 cursor-pointer items-start gap-2"
                                title={t(capability.tooltipKey)}
                              >
                                <input
                                  checked={activeFilters.includes(
                                    capability.key,
                                  )}
                                  className="mt-0.5 shrink-0"
                                  onChange={() =>
                                    handleToggleFilter(capability.key)
                                  }
                                  type="checkbox"
                                />
                                <span className="min-w-0 leading-snug">
                                  {t(capability.labelKey)}
                                </span>
                              </label>
                              {typeof count === 'number' ? (
                                <span className="whitespace-nowrap text-right text-xs tabular-nums text-secondary-400 dark:text-secondary-500">
                                  ({count}/{models.length})
                                </span>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </fieldset>
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                        {t('dataPolicySettings')}
                      </legend>
                      {DATA_POLICY_OPTIONS.map(policy => (
                        <label
                          className="flex min-w-0 items-start gap-2 text-sm text-secondary-700 dark:text-secondary-200"
                          key={policy.key}
                          title={t(policy.tooltipKey)}
                        >
                          <input
                            checked={dataPolicies.includes(policy.key)}
                            className="mt-0.5 shrink-0"
                            onChange={() => handleToggleDataPolicy(policy.key)}
                            type="checkbox"
                          />
                          <span className="min-w-0 leading-snug">
                            {t(policy.labelKey)}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  </div>
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
                  <p className="shrink-0 text-sm font-semibold text-secondary-900 dark:text-secondary-50">
                    {phase === 'thinking'
                      ? t('thinkingPhase')
                      : t('generatingPhase')}
                  </p>
                  <div
                    aria-live="polite"
                    className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2 text-sm leading-7 text-secondary-600 dark:text-secondary-300"
                  >
                    {thinking ? (
                      <p className="whitespace-pre-wrap">{thinking}</p>
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
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5" />
                      <div>
                        <p className="font-medium">
                          {error ?? t('validationErrors')}
                        </p>
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
                        disabled={repairing || !model}
                        onClick={handleRepair}
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
                      <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
                        <CheckCircle2 aria-hidden className="h-4 w-4" />
                        {t('selectedCandidates', { count: selectedRowCount })}
                      </p>
                      {stats ? (
                        <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                          {t('tokensCount', { count: stats.totalTokens })} · $
                          {stats.cost.toFixed(4)}
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
                            previewFieldDisplay(
                              row,
                              'priorityLevelId',
                              t('detailPriorityLevel'),
                              row.labels?.priorityLevel,
                              row.values.priorityLevelId,
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
                    <pre className="min-h-0 flex-1 overflow-auto rounded-lg bg-secondary-950 p-4 font-mono text-xs leading-6 text-secondary-50 whitespace-pre-wrap">
                      {thinking || t('noAnalysis')}
                    </pre>
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
                  title={aiGenerationDisabledMessage ?? undefined}
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
        {modelMenuOverlay}
        <AiRequestExplanationDialog
          candidateCount={candidateCount}
          dataPolicyLabels={selectedDataPolicyLabels}
          imageCount={images.length}
          importInstruction={scopedImportInstruction}
          importInstructionLoading={importInstructionLoading}
          locale={locale}
          modelName={selectedModelName}
          need={need}
          needPlaceholder={t('topicPlaceholder')}
          onClose={() => setAiRequestExplanationOpen(false)}
          onLoadImportInstruction={loadImportInstruction}
          open={aiRequestExplanationOpen}
          reasoningEffortLabel={reasoningEffortLabel}
        />
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
