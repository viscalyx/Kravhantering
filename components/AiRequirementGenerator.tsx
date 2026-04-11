'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  HelpCircle,
  ImagePlus,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  Settings,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useConfirmModal } from '@/components/ConfirmModal'
import {
  type GeneratedRequirement,
  getDefaultInstruction,
  type TaxonomyData,
} from '@/lib/ai/requirement-prompt'
import { devMarker } from '@/lib/developer-mode-markers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiRequirementGeneratorProps {
  areas: Array<{ id: number; name: string }>
  onClose: () => void
  onCreated: () => void
  open: boolean
}

interface OpenRouterModel {
  contextLength: number
  id: string
  name: string
  pricing: { completion: string; prompt: string; reasoning: string }
  provider: string
  supportedParameters: string[]
}

interface RequirementWithId extends GeneratedRequirement {
  _id: string
}

interface CreditInfo {
  isFreeTier: boolean
  limit: number | null
  limitRemaining: number | null
  managementKeyMissing: boolean
  totalCredits: number | null
  usage: number
}

type Phase = 'done' | 'error' | 'generating' | 'idle' | 'thinking'

const richTags = {
  em: (chunks: ReactNode) => <em>{chunks}</em>,
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
}

// ---------------------------------------------------------------------------
// Provider display names
// ---------------------------------------------------------------------------

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

function formatProvider(slug: string): string {
  return PROVIDER_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1)
}

function formatPrice(priceStr: string, freeLabel: string): string {
  const perToken = Number.parseFloat(priceStr)
  if (Number.isNaN(perToken) || perToken === 0) return freeLabel
  // Price per million tokens
  const perMillion = perToken * 1_000_000
  if (perMillion < 0.01) return '<$0.01/M'
  return `$${perMillion.toFixed(2)}/M`
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const FAVORITES_KEY = 'ai-favorite-models'
const FILTERS_KEY = 'ai-model-filters'

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    /* empty */
  }
  return new Set()
}

function saveFavorites(favorites: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]))
}

function loadFilters(): string[] {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (raw) return JSON.parse(raw) as string[]
  } catch {
    /* empty */
  }
  return []
}

function saveFilters(filters: string[]) {
  localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
}

const DATA_POLICIES_KEY = 'ai-data-policies'
const DATA_POLICIES_DEFAULT = ['data_collection']

function loadDataPolicies(): string[] {
  try {
    const raw = localStorage.getItem(DATA_POLICIES_KEY)
    if (raw) return JSON.parse(raw) as string[]
  } catch {
    /* empty */
  }
  return DATA_POLICIES_DEFAULT
}

function saveDataPolicies(policies: string[]) {
  localStorage.setItem(DATA_POLICIES_KEY, JSON.stringify(policies))
}

// Optional capability toggles (shown in settings when they'd filter results)
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
    key: 'logprobs',
    labelKey: 'capabilityLogprobs',
    tooltipKey: 'capabilityLogprobsTooltip',
  },
  {
    key: 'vision',
    labelKey: 'capabilityVision',
    tooltipKey: 'capabilityVisionTooltip',
  },
] as const

// Image attachment constraints
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]
const MAX_IMAGES = 3
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

interface AttachedImage {
  dataUrl: string
  id: string
  name: string
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AiRequirementGenerator({
  areas,
  onClose,
  onCreated,
  open,
}: AiRequirementGeneratorProps) {
  const t = useTranslations('ai')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()

  // Input state
  const [topic, setTopic] = useState('')
  const [areaId, setAreaId] = useState<number | ''>('')
  const [model, setModel] = useState('')
  const [customInstruction, setCustomInstruction] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showDefaultInstruction, setShowDefaultInstruction] = useState(false)
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [systemPromptLoading, setSystemPromptLoading] = useState(false)

  // Image attachments
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [imageError, setImageError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadSessionRef = useRef(0)

  // Model list
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  // Favorites & capability filters
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [dataPolicies, setDataPolicies] = useState<string[]>(
    DATA_POLICIES_DEFAULT,
  )
  const [showCapSettings, setShowCapSettings] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [reasoningEffort, setReasoningEffort] = useState('high')

  // Credits
  const [credits, setCredits] = useState<CreditInfo | null>(null)
  const [creditsError, setCreditsError] = useState<string | null>(null)

  // Inline help state
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())

  // Generation state
  const [phase, setPhase] = useState<Phase>('idle')
  const [thinking, setThinking] = useState('')
  const [error, setError] = useState('')
  const [rawResponse, setRawResponse] = useState('')
  const [stats, setStats] = useState<{
    completionTokens: number
    cost: number
    promptTokens: number
    reasoningTokens: number
    totalTokens: number
  } | null>(null)

  // Results state
  const [requirements, setRequirements] = useState<RequirementWithId[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [taxonomy, setTaxonomy] = useState<TaxonomyData | null>(null)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set(),
  )

  // Refs
  const abortRef = useRef<AbortController | null>(null)
  const thinkingRef = useRef<HTMLPreElement>(null)
  const modelRef = useRef(model)
  const modelsAbortRef = useRef<AbortController | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownBtnRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{
    right: number
    top: number
  } | null>(null)
  modelRef.current = model

  // Load favorites & filters from localStorage on open
  useEffect(() => {
    if (!open) return
    setFavorites(loadFavorites())
    setActiveFilters(loadFilters())
    setDataPolicies(loadDataPolicies())
  }, [open])

  // Fetch models (reacts to activeFilters changes)
  const fetchModels = useCallback(
    (refresh = false) => {
      modelsAbortRef.current?.abort()
      const ac = new AbortController()
      modelsAbortRef.current = ac
      setModelsLoading(true)
      const params = new URLSearchParams()
      if (refresh) params.set('refresh', '1')
      if (activeFilters.length > 0) {
        params.set('supported_parameters', activeFilters.join(','))
      }
      const qs = params.toString()
      fetch(`/api/ai/models${qs ? `?${qs}` : ''}`, { signal: ac.signal })
        .then(
          r =>
            r.json() as Promise<{ error?: string; models?: OpenRouterModel[] }>,
        )
        .then(data => {
          if (ac.signal.aborted) return
          const list = data.models ?? []
          setModelsError(data.error ?? null)
          setModels(list)
          if (list.length > 0) {
            const needsSelection =
              !modelRef.current || !list.some(m => m.id === modelRef.current)
            if (needsSelection) {
              // Pick first favorite, then NEXT_PUBLIC_DEFAULT_MODEL, then first model
              const savedFavorites = loadFavorites()
              const favModel = list.find(m => savedFavorites.has(m.id))
              const defaultModel = process.env.NEXT_PUBLIC_DEFAULT_MODEL ?? ''
              const defModel = defaultModel
                ? list.find(m => m.id === defaultModel)
                : undefined
              setModel(favModel?.id ?? defModel?.id ?? list[0].id)
            }
          }
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return
          setModels([])
          setModelsError(
            err instanceof Error ? err.message : t('errors.failedToLoadModels'),
          )
        })
        .finally(() => {
          if (!ac.signal.aborted) setModelsLoading(false)
        })
    },
    [activeFilters, t],
  )

  useEffect(() => {
    if (!open) return
    fetchModels()
  }, [open, fetchModels])

  // Fetch credits on open
  useEffect(() => {
    if (!open) return
    fetch('/api/ai/credits')
      .then(r => r.json() as Promise<CreditInfo & { error?: string }>)
      .then(data => {
        if (data.error) {
          setCreditsError(data.error)
        } else {
          setCredits(data)
          setCreditsError(null)
        }
      })
      .catch(() => {
        setCreditsError(t('creditsUnreachable'))
      })
  }, [open, t])

  // Lock body scroll while modal is open
  useEffect(() => {
    if (open) {
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = previousOverflow
      }
    }
  }, [open])

  // Reset form state on close
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
      modelsAbortRef.current?.abort()
      modelsAbortRef.current = null
      setTopic('')
      setAreaId('')
      setCustomInstruction('')
      setShowAdvanced(false)
      setShowDefaultInstruction(false)
      setShowSystemPrompt(false)
      setSystemPrompt('')
      setSystemPromptLoading(false)
      setShowCapSettings(false)
      setModelDropdownOpen(false)
      setDropdownPos(null)
      setAttachedImages([])
      setImageError('')
      setPhase('idle')
      setThinking('')
      setError('')
      setRawResponse('')
      setCreateError('')
      setStats(null)
      setRequirements([])
      setSelected(new Set())
      setCreating(false)
      setOpenHelp(new Set())
      setCredits(null)
      setCreditsError(null)
    }
  }, [open])

  // Auto-scroll thinking
  // biome-ignore lint/correctness/useExhaustiveDependencies: thinking triggers scroll
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight
    }
  }, [thinking])

  // Position and close model dropdown
  useEffect(() => {
    if (!modelDropdownOpen) return
    // Anchor panel to the right edge of the trigger button, vertically centered
    function updatePos() {
      if (!dropdownBtnRef.current) return
      const rect = dropdownBtnRef.current.getBoundingClientRect()
      const panelHeight = window.innerHeight * 0.8
      const idealTop = rect.top + rect.height / 2 - panelHeight / 2
      const top = Math.max(
        8,
        Math.min(idealTop, window.innerHeight - panelHeight - 8),
      )
      // sm breakpoint = 640px; below that the panel is calc(100vw-2rem)
      const panelWidth = window.innerWidth < 640 ? window.innerWidth - 32 : 384
      const idealRight = window.innerWidth - rect.right
      const right = Math.max(
        8,
        Math.min(idealRight, window.innerWidth - panelWidth - 8),
      )
      setDropdownPos({ right, top })
    }
    updatePos()
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        dropdownRef.current?.contains(target) ||
        dropdownBtnRef.current?.contains(target)
      ) {
        return
      }
      setModelDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setModelDropdownOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    // Reposition on scroll within the modal content area
    const scrollParent = dropdownBtnRef.current?.closest('.overflow-y-auto')
    scrollParent?.addEventListener('scroll', updatePos)
    window.addEventListener('resize', updatePos)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
      scrollParent?.removeEventListener('scroll', updatePos)
      window.removeEventListener('resize', updatePos)
    }
  }, [modelDropdownOpen])

  const inProgress = phase === 'thinking' || phase === 'generating'
  const isBusy = inProgress || creating

  const toggleHelp = (field: string) => {
    setOpenHelp(prev => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  const helpButton = (field: string, label: string) => (
    <button
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
      disabled={isBusy}
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) =>
    openHelp.has(field) && (
      <p
        className="mb-2 mt-1 whitespace-pre-line rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-xs text-secondary-500 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-400"
        id={`help-${field}`}
      >
        {t.rich(helpKey, richTags)}
      </p>
    )

  const visionEnabled = activeFilters.includes('vision')

  // Pending work = form has content or results exist
  const hasPendingWork =
    topic.trim().length > 0 ||
    customInstruction.trim().length > 0 ||
    Boolean(areaId) ||
    attachedImages.length > 0 ||
    requirements.length > 0 ||
    inProgress

  const handleClose = useCallback(async () => {
    if (creating) return
    if (!hasPendingWork) {
      onClose()
      return
    }
    const confirmed = await confirm({
      confirmText: tc('close'),
      icon: 'warning',
      message: t('closeConfirm'),
      title: t('generateTitle'),
      variant: 'danger',
    })
    if (confirmed) {
      if (inProgress) {
        abortRef.current?.abort()
        abortRef.current = null
      }
      onClose()
    }
  }, [hasPendingWork, inProgress, creating, onClose, confirm, t, tc])

  // ── Generate ────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || !areaId) return

    setPhase('thinking')
    setThinking('')

    setError('')
    setRawResponse('')
    setCreateError('')
    setStats(null)
    setRequirements([])
    setSelected(new Set())

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const selectedModel = models.find(m => m.id === model)

      // Build provider preferences from active data policies
      const providerPreferences: Record<string, unknown> = {}
      if (dataPolicies.includes('data_collection')) {
        providerPreferences.data_collection = 'deny'
      }
      if (dataPolicies.includes('zdr')) {
        providerPreferences.zdr = true
      }
      if (dataPolicies.includes('enforce_distillable_text')) {
        providerPreferences.enforce_distillable_text = true
      }

      const response = await fetch('/api/ai/generate-requirements', {
        body: JSON.stringify({
          customInstruction: customInstruction || undefined,
          locale,
          model: model || undefined,
          providerPreferences:
            Object.keys(providerPreferences).length > 0
              ? providerPreferences
              : undefined,
          reasoningEffort,
          supportedParameters: selectedModel?.supportedParameters,
          topic: topic.trim(),
          ...(visionEnabled &&
            attachedImages.length > 0 && {
              images: attachedImages.map(img => ({ dataUrl: img.dataUrl })),
            }),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: ac.signal,
      })

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`
        try {
          const errorBody = (await response.json()) as Record<string, unknown>
          const extracted =
            typeof errorBody.error === 'string'
              ? errorBody.error
              : typeof errorBody.message === 'string'
                ? errorBody.message
                : null
          if (extracted) errorMessage = extracted
        } catch {
          try {
            const text = await response.text()
            if (text) errorMessage = text
          } catch {
            // keep default
          }
        }
        setPhase('error')
        setError(errorMessage)
        return
      }

      if (!response.body) {
        setPhase('error')
        setError(`HTTP ${response.status}`)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedTerminal = false

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const eventMatch = part.match(/^event:\s*(.+)$/m)
          const dataMatch = part.match(/^data:\s*(.+)$/m)
          if (!eventMatch || !dataMatch) continue

          const eventType = eventMatch[1]
          let payload: Record<string, unknown>
          try {
            payload = JSON.parse(dataMatch[1]) as Record<string, unknown>
          } catch {
            continue
          }

          switch (eventType) {
            case 'thinking':
              setPhase('thinking')
              setThinking(payload.thinkingSoFar as string)
              break
            case 'generating':
              setPhase('generating')
              break
            case 'done': {
              receivedTerminal = true
              const rawContent = payload.rawContent as string
              let parsed: { requirements: GeneratedRequirement[] }
              try {
                parsed = JSON.parse(rawContent) as {
                  requirements: GeneratedRequirement[]
                }
              } catch {
                setPhase('error')
                setError(t('parseError'))
                setRawResponse(rawContent)
                return
              }
              const reqs = (parsed.requirements ?? []).map(r => ({
                ...r,
                _id: crypto.randomUUID(),
              }))
              setRequirements(reqs)
              setSelected(new Set(reqs.map((_, i) => i)))
              setExpandedCards(new Set())
              setRawResponse(rawContent)
              setThinking(payload.thinking as string)
              if (payload.taxonomy) {
                setTaxonomy(payload.taxonomy as TaxonomyData)
              }
              setStats(
                payload.stats as {
                  completionTokens: number
                  cost: number
                  promptTokens: number
                  reasoningTokens: number
                  totalTokens: number
                },
              )
              setPhase('done')
              break
            }
            case 'error':
              receivedTerminal = true
              setPhase('error')
              setError(payload.message as string)
              break
          }
        }
      }

      // Handle unexpected EOF — stream ended without a done/error event
      if (!receivedTerminal && !ac.signal.aborted) {
        setPhase('error')
        setError(t('streamClosedUnexpectedly'))
        setThinking('')
        setStats(null)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setPhase('idle')
      } else {
        setPhase('error')
        setError((err as Error).message)
      }
    }
  }, [
    topic,
    areaId,
    model,
    models,
    customInstruction,
    dataPolicies,
    locale,
    reasoningEffort,
    attachedImages,
    visionEnabled,
    t,
  ])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setPhase('idle')
  }, [])

  // ── Create selected requirements ────────────────────────────────────
  const handleCreate = useCallback(async () => {
    const selectedIndices = [...selected].sort((a, b) => a - b)
    const selectedReqs = selectedIndices.map(i => requirements[i])
    if (selectedReqs.length === 0) return

    const areaName = areas.find(a => a.id === areaId)?.name ?? ''
    const confirmed = await confirm({
      confirmText: t('createSelected', { count: selectedReqs.length }),
      message: t('createConfirm', {
        area: areaName,
        count: selectedReqs.length,
      }),
      title: t('generateTitle'),
      variant: 'default',
    })
    if (!confirmed) return

    setCreating(true)
    try {
      const errors: string[] = []
      const succeededIndices: number[] = []
      for (let si = 0; si < selectedReqs.length; si++) {
        const req = selectedReqs[si]
        const res = await fetch('/api/requirements', {
          body: JSON.stringify({
            acceptanceCriteria: req.acceptanceCriteria,
            areaId,
            categoryId: req.categoryId,
            description: req.description,
            qualityCharacteristicId: req.qualityCharacteristicId,
            requiresTesting: req.requiresTesting,
            riskLevelId: req.riskLevelId,
            scenarioIds: req.scenarioIds,
            typeId: req.typeId,
            verificationMethod: req.verificationMethod,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as {
            error?: string
            message?: string
          } | null
          const errText =
            errBody?.error ?? errBody?.message ?? `HTTP ${res.status}`
          console.error('[AI Create] POST failed:', res.status, errText)
          errors.push(errText)
        } else {
          console.log('[AI Create] POST succeeded:', res.status)
          succeededIndices.push(selectedIndices[si])
        }
      }
      if (succeededIndices.length > 0) {
        setSelected(prev => {
          const next = new Set(prev)
          for (const idx of succeededIndices) next.delete(idx)
          return next
        })
      }
      if (errors.length > 0) {
        setCreateError(`${t('createError')}: ${errors[0]}`)
        return
      }
      onCreated()
      onClose()
    } catch (err) {
      console.error('Failed to create AI-generated requirements:', err)
      setCreateError(t('createError'))
    } finally {
      setCreating(false)
    }
  }, [requirements, selected, areaId, areas, confirm, t, onCreated, onClose])

  const toggleSelect = useCallback((index: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selected.size === requirements.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(requirements.map((_, i) => i)))
    }
  }, [selected.size, requirements])

  // Speed calculation (tokens per second)
  const speed =
    stats && stats.completionTokens > 0
      ? t('tokensCount', { count: stats.completionTokens })
      : null

  const toggleFavorite = useCallback((modelId: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(modelId)) next.delete(modelId)
      else next.add(modelId)
      saveFavorites(next)
      return next
    })
  }, [])

  const toggleFilter = useCallback((cap: string) => {
    setActiveFilters(prev => {
      const next = prev.includes(cap)
        ? prev.filter(c => c !== cap)
        : [...prev, cap]
      saveFilters(next)
      return next
    })
  }, [])

  const toggleDataPolicy = useCallback((key: string) => {
    setDataPolicies(prev => {
      const next = prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
      saveDataPolicies(next)
      return next
    })
  }, [])

  // ── Image attachment handling ───────────────────────────────────────

  // Clear stale image attachments when vision support is turned off
  useEffect(() => {
    if (!visionEnabled) {
      setAttachedImages([])
      setImageError('')
    }
  }, [visionEnabled])

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      setImageError('')
      const fileArr = Array.from(files)

      for (const f of fileArr) {
        if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
          setImageError(t('imageErrorType', { name: f.name }))
          return
        }
        if (f.size > MAX_IMAGE_BYTES) {
          setImageError(t('imageErrorSize', { name: f.name }))
          return
        }
      }

      // Read all files, then append in one state update
      const readFile = (f: File): Promise<AttachedImage> =>
        new Promise(resolve => {
          const reader = new FileReader()
          reader.onload = () =>
            resolve({
              id: crypto.randomUUID(),
              dataUrl: reader.result as string,
              name: f.name,
            })
          reader.readAsDataURL(f)
        })

      const session = ++uploadSessionRef.current
      void Promise.all(fileArr.map(readFile)).then(newImages => {
        if (uploadSessionRef.current !== session) return
        setAttachedImages(prev => {
          const remaining = MAX_IMAGES - prev.length
          if (remaining <= 0) {
            setImageError(t('imageErrorCount', { max: MAX_IMAGES }))
            return prev
          }
          const toAdd = newImages.slice(0, remaining)
          if (newImages.length > remaining) {
            setImageError(t('imageErrorCount', { max: MAX_IMAGES }))
          }
          return [...prev, ...toAdd]
        })
      })
    },
    [t],
  )

  const removeImage = useCallback((index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index))
    setImageError('')
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files)
      }
    },
    [processFiles],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // Group models: favorites first, then by provider
  const favoriteModels = models.filter(m => favorites.has(m.id))
  const nonFavoriteModels = models.filter(m => !favorites.has(m.id))
  const providerGroups = new Map<string, OpenRouterModel[]>()
  for (const m of nonFavoriteModels) {
    const list = providerGroups.get(m.provider) || []
    list.push(m)
    providerGroups.set(m.provider, list)
  }
  const sortedProviders = [...providerGroups.keys()].sort((a, b) =>
    formatProvider(a).localeCompare(formatProvider(b)),
  )

  // Compute which optional capabilities would actually filter.
  // Always keep active filters visible so users can uncheck them.
  const capabilityCounts = OPTIONAL_CAPABILITIES.map(cap => ({
    ...cap,
    count: models.filter(m => m.supportedParameters.includes(cap.key)).length,
  })).filter(
    cap =>
      activeFilters.includes(cap.key) ||
      (cap.count > 0 && cap.count < models.length),
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            aria-labelledby="ai-requirement-dialog-title"
            aria-modal="true"
            className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl transition-[max-width] duration-300 dark:bg-secondary-900 ${thinking || (rawResponse && phase === 'done') ? 'max-w-6xl' : 'max-w-3xl'}`}
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: 'ai-requirement-generator',
            })}
            exit={{ opacity: 0, scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.95 }}
            role="dialog"
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-secondary-200 px-6 py-4 dark:border-secondary-700">
              <div className="flex items-center gap-3">
                <h2
                  className="flex items-center gap-2 text-lg font-semibold text-secondary-900 dark:text-secondary-100"
                  id="ai-requirement-dialog-title"
                  {...devMarker({
                    context: 'ai-requirement-generator',
                    name: 'dialog title',
                  })}
                >
                  <Sparkles
                    aria-hidden="true"
                    className="h-5 w-5 text-primary-500"
                  />
                  {t('generateTitle')}
                </h2>
                {credits && (
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
                          tier,
                          keyBalance,
                          orgCredits: `$${credits.totalCredits.toFixed(2)}`,
                        })
                      }
                      return t('creditsBadge', { tier, balance: keyBalance })
                    })()}
                    {credits.managementKeyMissing && (
                      <span
                        className="inline-flex items-center gap-0.5 opacity-60"
                        title={t('orgCreditsMissingKey')}
                      >
                        {' · '}
                        <Lock aria-hidden="true" className="h-3 w-3" />
                        {t('totalCreditsLocked')}
                      </span>
                    )}
                  </span>
                )}
                {!credits && creditsError && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    <HelpCircle
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    {t('creditsErrorTooltip', { detail: creditsError })}
                  </span>
                )}
              </div>
              <button
                aria-label={tc('close')}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 text-secondary-500 transition-colors hover:bg-secondary-100 hover:text-secondary-700 disabled:opacity-50 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-200"
                disabled={creating}
                onClick={handleClose}
                {...devMarker({
                  context: 'ai-requirement-generator',
                  name: 'button',
                  value: 'close',
                })}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex min-h-0 flex-1">
              <div
                className={`flex-1 overflow-y-auto px-6 py-4 ${thinking ? 'min-w-0' : ''}`}
              >
                {/* Input section */}
                <div className="space-y-4">
                  {/* Topic */}
                  <div>
                    <div className="mb-1 flex items-center gap-1.5">
                      <label
                        className="text-sm font-medium text-secondary-700 dark:text-secondary-300"
                        htmlFor="ai-topic"
                      >
                        {t('topicLabel')}
                      </label>
                      {helpButton('topic', t('topicLabel'))}
                    </div>
                    {helpPanel('topicHelp', 'topic')}
                    <textarea
                      className="w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 dark:placeholder:text-secondary-500"
                      disabled={isBusy}
                      id="ai-topic"
                      onChange={e => setTopic(e.target.value)}
                      placeholder={t('topicPlaceholder')}
                      rows={3}
                      value={topic}
                    />
                  </div>

                  {/* Image attachments (visible when Vision filter is active) */}
                  {visionEnabled && (
                    <div>
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                          {t('imageAttachLabel')}
                        </span>
                        {helpButton('imageAttach', t('imageAttachLabel'))}
                      </div>
                      {helpPanel('imageAttachHelp', 'imageAttach')}
                      <button
                        aria-label={t('imageDropZone')}
                        className="flex min-h-[64px] w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-secondary-300 bg-secondary-50 px-4 py-3 text-sm text-secondary-500 transition-colors hover:border-primary-400 hover:bg-primary-50/50 dark:border-secondary-600 dark:bg-secondary-800/50 dark:text-secondary-400 dark:hover:border-primary-500 dark:hover:bg-primary-900/20"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        type="button"
                      >
                        <ImagePlus
                          aria-hidden="true"
                          className="mr-2 h-5 w-5"
                        />
                        <span>{t('imageDropZone')}</span>
                      </button>
                      <input
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                        multiple
                        onChange={e => {
                          if (e.target.files && e.target.files.length > 0) {
                            processFiles(e.target.files)
                            e.target.value = ''
                          }
                        }}
                        ref={fileInputRef}
                        type="file"
                      />
                      <p className="mt-1 text-xs text-secondary-400 dark:text-secondary-500">
                        {t('imageAttachHint')}
                      </p>

                      {/* Image previews */}
                      {attachedImages.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {attachedImages.map((img, i) => (
                            <div className="group relative" key={img.id}>
                              {/* biome-ignore lint/performance/noImgElement: base64 data URL preview thumbnails cannot be optimized by next/image */}
                              <img
                                alt={img.name}
                                className="h-16 w-16 rounded-md border border-secondary-200 object-cover dark:border-secondary-700"
                                src={img.dataUrl}
                              />
                              <button
                                aria-label={`${t('imageRemove')}: ${img.name}`}
                                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                                onClick={() => removeImage(i)}
                                type="button"
                              >
                                <X aria-hidden="true" className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Token cost warning */}
                      {attachedImages.length > 0 && (
                        <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                          <AlertTriangle
                            aria-hidden="true"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          />
                          <span>{t('imageTokenWarning')}</span>
                        </div>
                      )}

                      {/* Image error */}
                      {imageError && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {imageError}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Area + Model row */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 flex items-center gap-1.5">
                        <label
                          className="text-sm font-medium text-secondary-700 dark:text-secondary-300"
                          htmlFor="ai-area"
                        >
                          {t('areaLabel')}
                        </label>
                        {helpButton('area', t('areaLabel'))}
                      </div>
                      {helpPanel('areaHelp', 'area')}
                      <select
                        className="w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100"
                        disabled={isBusy}
                        id="ai-area"
                        onChange={e =>
                          setAreaId(
                            e.target.value ? Number(e.target.value) : '',
                          )
                        }
                        value={areaId}
                      >
                        <option value="">{t('selectArea')}</option>
                        {areas.map(area => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center gap-1.5">
                        <label
                          className="text-sm font-medium text-secondary-700 dark:text-secondary-300"
                          htmlFor="ai-model"
                        >
                          {t('modelLabel')}
                        </label>
                        {helpButton('model', t('modelLabel'))}
                        <button
                          aria-label={t('refreshModels')}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 dark:hover:text-primary-400"
                          disabled={isBusy || modelsLoading}
                          onClick={() => fetchModels(true)}
                          type="button"
                        >
                          <RefreshCw
                            aria-hidden="true"
                            className={`h-3.5 w-3.5 ${modelsLoading ? 'animate-spin' : ''}`}
                          />
                        </button>
                        <button
                          aria-expanded={showCapSettings}
                          aria-label={t('capabilitySettings')}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
                          disabled={isBusy}
                          onClick={() => setShowCapSettings(!showCapSettings)}
                          type="button"
                        >
                          <Settings
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                        </button>
                      </div>
                      {helpPanel('modelHelp', 'model')}

                      {/* Capability settings popover */}
                      {showCapSettings && (
                        <div className="mb-2 rounded-lg border border-secondary-200 bg-secondary-50 p-3 text-xs dark:border-secondary-700 dark:bg-secondary-800/50">
                          <div className="mb-2 font-medium text-secondary-700 dark:text-secondary-300">
                            {t('capabilitySettings')}
                          </div>
                          {/* Required capabilities (locked) */}
                          <div className="mb-1 flex items-center gap-1.5 text-secondary-500 dark:text-secondary-400">
                            <Lock aria-hidden="true" className="h-3 w-3" />
                            {t('capabilityReasoning')}
                            <button
                              aria-label={t('capabilityReasoningTooltip')}
                              className="cursor-help appearance-none rounded border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                              title={t('capabilityReasoningTooltip')}
                              type="button"
                            >
                              <Info
                                aria-hidden="true"
                                className="h-3 w-3 text-secondary-400 dark:text-secondary-500"
                              />
                            </button>
                          </div>
                          <div className="mb-1 flex items-center gap-1.5 text-secondary-500 dark:text-secondary-400">
                            <Lock aria-hidden="true" className="h-3 w-3" />
                            {t('capabilityStreaming')}
                            <button
                              aria-label={t('capabilityStreamingTooltip')}
                              className="cursor-help appearance-none rounded border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                              title={t('capabilityStreamingTooltip')}
                              type="button"
                            >
                              <Info
                                aria-hidden="true"
                                className="h-3 w-3 text-secondary-400 dark:text-secondary-500"
                              />
                            </button>
                          </div>
                          <div className="mb-2 flex items-center gap-1.5 text-secondary-500 dark:text-secondary-400">
                            <Lock aria-hidden="true" className="h-3 w-3" />
                            <span
                              className={
                                activeFilters.includes('structured_outputs')
                                  ? 'line-through opacity-60'
                                  : ''
                              }
                            >
                              {t('capabilityResponseFormat')}
                            </span>
                            <button
                              aria-label={t('capabilityResponseFormatTooltip')}
                              className="cursor-help appearance-none rounded border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                              title={t('capabilityResponseFormatTooltip')}
                              type="button"
                            >
                              <Info
                                aria-hidden="true"
                                className="h-3 w-3 text-secondary-400 dark:text-secondary-500"
                              />
                            </button>
                            {activeFilters.includes('structured_outputs') && (
                              <span className="text-primary-600 dark:text-primary-400">
                                → {t('capabilityStructuredOutputs')}
                              </span>
                            )}
                          </div>
                          {/* Optional toggles */}
                          {capabilityCounts.map(cap => (
                            <label
                              className="mb-1 flex cursor-pointer items-center gap-1.5 text-secondary-600 dark:text-secondary-300"
                              key={cap.key}
                            >
                              <input
                                checked={activeFilters.includes(cap.key)}
                                className="h-3.5 w-3.5 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                                onChange={() => toggleFilter(cap.key)}
                                type="checkbox"
                              />
                              {t(cap.labelKey)}
                              <button
                                aria-label={t(cap.tooltipKey)}
                                className="cursor-help appearance-none rounded border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                                title={t(cap.tooltipKey)}
                                type="button"
                              >
                                <Info
                                  aria-hidden="true"
                                  className="h-3 w-3 text-secondary-400 dark:text-secondary-500"
                                />
                              </button>
                              <span className="text-secondary-400 dark:text-secondary-500">
                                ({cap.count}/{models.length})
                              </span>
                            </label>
                          ))}
                          <div className="mt-2 text-secondary-400 dark:text-secondary-500">
                            {t('modelsMatch', { count: models.length })}
                          </div>

                          {/* Data privacy settings */}
                          <div className="mt-3 border-t border-secondary-200 pt-3 dark:border-secondary-700">
                            <div className="mb-1 flex items-center gap-1 font-medium text-secondary-700 dark:text-secondary-300">
                              {t('dataPolicySettings')}
                              <button
                                aria-controls="help-dataPolicy"
                                aria-expanded={openHelp.has('dataPolicy')}
                                aria-label={`${tc('help')}: ${t('dataPolicySettings')}`}
                                className="inline-flex items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
                                onClick={() => toggleHelp('dataPolicy')}
                                type="button"
                              >
                                <HelpCircle
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                              </button>
                            </div>
                            {openHelp.has('dataPolicy') && (
                              <p
                                className="mb-2 whitespace-pre-line rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-xs text-secondary-500 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-400"
                                id="help-dataPolicy"
                              >
                                {t('dataPolicyProviderNote')}
                              </p>
                            )}
                            {DATA_POLICY_OPTIONS.map(opt => (
                              <label
                                className="mb-1 flex cursor-pointer items-center gap-1.5 text-secondary-600 dark:text-secondary-300"
                                key={opt.key}
                              >
                                <input
                                  checked={dataPolicies.includes(opt.key)}
                                  className="h-3.5 w-3.5 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                                  onChange={() => toggleDataPolicy(opt.key)}
                                  type="checkbox"
                                />
                                {t(opt.labelKey)}
                                <button
                                  aria-label={t(opt.tooltipKey)}
                                  className="cursor-help appearance-none rounded border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                                  title={t(opt.tooltipKey)}
                                  type="button"
                                >
                                  <Info
                                    aria-hidden="true"
                                    className="h-3 w-3 text-secondary-400 dark:text-secondary-500"
                                  />
                                </button>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="relative">
                        <button
                          aria-expanded={modelDropdownOpen}
                          aria-haspopup="listbox"
                          className="flex w-full items-center justify-between rounded-lg border border-secondary-300 bg-white px-3 py-2 text-left text-sm text-secondary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100"
                          disabled={isBusy || modelsLoading}
                          id="ai-model"
                          onClick={() => setModelDropdownOpen(o => !o)}
                          ref={dropdownBtnRef}
                          {...devMarker({
                            context: 'ai-requirement-generator',
                            name: 'button',
                            value: 'model selector',
                          })}
                          type="button"
                        >
                          <span className="truncate">
                            {modelsLoading
                              ? tc('loading')
                              : !model || models.length === 0
                                ? (modelsError ?? t('noModels'))
                                : (() => {
                                    const sel = models.find(m => m.id === model)
                                    return sel
                                      ? `${sel.name} — ${formatPrice(sel.pricing.prompt, t('priceFree'))} ${t('pricingIn')} / ${formatPrice(sel.pricing.completion, t('priceFree'))} ${t('pricingOut')}`
                                      : model
                                  })()}
                          </span>
                          <ChevronDown
                            aria-hidden="true"
                            className={`ml-2 h-4 w-4 shrink-0 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {modelDropdownOpen &&
                          !modelsLoading &&
                          models.length > 0 &&
                          dropdownPos &&
                          createPortal(
                            <div
                              className="fixed z-9999 w-[calc(100vw-2rem)] overflow-auto rounded-lg border border-secondary-300 bg-white py-1 text-sm shadow-xl sm:w-96 dark:border-secondary-600 dark:bg-secondary-800"
                              ref={dropdownRef}
                              role="listbox"
                              style={{
                                height: '80vh',
                                right: dropdownPos.right,
                                top: dropdownPos.top,
                              }}
                            >
                              {favoriteModels.length > 0 && (
                                <>
                                  <div className="px-3 py-1 text-xs font-semibold text-secondary-500 dark:text-secondary-400">
                                    {t('favorites')}
                                  </div>
                                  {favoriteModels.map(m => (
                                    <div
                                      aria-selected={m.id === model}
                                      className={`flex cursor-pointer items-center gap-1.5 px-3 py-1.5 ${m.id === model ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-secondary-900 hover:bg-secondary-100 dark:text-secondary-100 dark:hover:bg-secondary-700'}`}
                                      key={m.id}
                                      onClick={() => {
                                        setModel(m.id)
                                        setModelDropdownOpen(false)
                                      }}
                                      onKeyDown={e => {
                                        if (
                                          e.key === 'Enter' ||
                                          e.key === ' '
                                        ) {
                                          e.preventDefault()
                                          setModel(m.id)
                                          setModelDropdownOpen(false)
                                        }
                                      }}
                                      role="option"
                                      tabIndex={0}
                                    >
                                      <span className="flex-1 truncate">
                                        {m.name} —{' '}
                                        {formatPrice(
                                          m.pricing.prompt,
                                          t('priceFree'),
                                        )}{' '}
                                        {t('pricingIn')} /{' '}
                                        {formatPrice(
                                          m.pricing.completion,
                                          t('priceFree'),
                                        )}{' '}
                                        {t('pricingOut')}
                                      </span>
                                      <button
                                        aria-label={t('removeFavorite')}
                                        className="shrink-0 p-0.5 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                                        onClick={e => {
                                          e.stopPropagation()
                                          toggleFavorite(m.id)
                                        }}
                                        type="button"
                                      >
                                        <Star
                                          aria-hidden="true"
                                          className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                                        />
                                      </button>
                                    </div>
                                  ))}
                                  <div className="my-1 border-t border-secondary-300 dark:border-secondary-600" />
                                </>
                              )}
                              {sortedProviders.map(provider => {
                                const group = providerGroups.get(provider)
                                if (!group) return null
                                return (
                                  <div key={provider}>
                                    <div className="px-3 py-1 text-xs font-semibold text-secondary-500 dark:text-secondary-400">
                                      {formatProvider(provider)}
                                    </div>
                                    {group.map(m => (
                                      <div
                                        aria-selected={m.id === model}
                                        className={`flex cursor-pointer items-center gap-1.5 px-3 py-1.5 ${m.id === model ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-secondary-900 hover:bg-secondary-100 dark:text-secondary-100 dark:hover:bg-secondary-700'}`}
                                        key={m.id}
                                        onClick={() => {
                                          setModel(m.id)
                                          setModelDropdownOpen(false)
                                        }}
                                        onKeyDown={e => {
                                          if (
                                            e.key === 'Enter' ||
                                            e.key === ' '
                                          ) {
                                            e.preventDefault()
                                            setModel(m.id)
                                            setModelDropdownOpen(false)
                                          }
                                        }}
                                        role="option"
                                        tabIndex={0}
                                      >
                                        <span className="flex-1 truncate">
                                          {m.name} —{' '}
                                          {formatPrice(
                                            m.pricing.prompt,
                                            t('priceFree'),
                                          )}{' '}
                                          {t('pricingIn')} /{' '}
                                          {formatPrice(
                                            m.pricing.completion,
                                            t('priceFree'),
                                          )}{' '}
                                          {t('pricingOut')}
                                        </span>
                                        <button
                                          aria-label={
                                            favorites.has(m.id)
                                              ? t('removeFavorite')
                                              : t('addFavorite')
                                          }
                                          className="shrink-0 p-0.5 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                                          onClick={e => {
                                            e.stopPropagation()
                                            toggleFavorite(m.id)
                                          }}
                                          type="button"
                                        >
                                          <Star
                                            aria-hidden="true"
                                            className={`h-3.5 w-3.5 ${favorites.has(m.id) ? 'fill-amber-400 text-amber-400' : 'text-secondary-300 hover:text-amber-400 dark:text-secondary-500 dark:hover:text-amber-400'}`}
                                          />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )
                              })}
                            </div>,
                            document.body,
                          )}
                      </div>
                    </div>

                    {/* Reasoning effort – right column, under Model */}
                    {models
                      .find(m => m.id === model)
                      ?.supportedParameters.includes('reasoning') && (
                      <div className="col-start-1 sm:col-start-2">
                        <div className="mb-1 flex items-center gap-1.5">
                          <label
                            className="text-sm font-medium text-secondary-700 dark:text-secondary-300"
                            htmlFor="ai-reasoning-effort"
                          >
                            {t('reasoningEffortLabel')}
                          </label>
                          {helpButton(
                            'reasoningEffort',
                            t('reasoningEffortLabel'),
                          )}
                        </div>
                        {helpPanel('reasoningEffortHelp', 'reasoningEffort')}
                        <select
                          className="w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100"
                          disabled={isBusy}
                          id="ai-reasoning-effort"
                          onChange={e => setReasoningEffort(e.target.value)}
                          value={reasoningEffort}
                        >
                          <option value="xhigh">{t('effortXhigh')}</option>
                          <option value="high">{t('effortHigh')}</option>
                          <option value="medium">{t('effortMedium')}</option>
                          <option value="low">{t('effortLow')}</option>
                          <option value="none">{t('effortNone')}</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Advanced */}
                  <div>
                    <button
                      aria-controls="advanced-section"
                      aria-expanded={showAdvanced}
                      className="flex min-h-11 min-w-11 items-center gap-1 text-sm text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400 dark:hover:text-primary-300 dark:focus-visible:ring-primary-400"
                      disabled={isBusy}
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      type="button"
                    >
                      {showAdvanced ? (
                        <ChevronDown aria-hidden="true" className="h-4 w-4" />
                      ) : (
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                      )}
                      {t('advancedLabel')}
                    </button>
                    {showAdvanced && (
                      <div className="mt-2 space-y-3" id="advanced-section">
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <label
                                className="text-sm font-medium text-secondary-700 dark:text-secondary-300"
                                htmlFor="ai-instruction"
                              >
                                {t('customInstructionLabel')}
                              </label>
                              {helpButton(
                                'customInstruction',
                                t('customInstructionLabel'),
                              )}
                            </div>
                            <button
                              aria-controls="default-instruction-content"
                              aria-expanded={showDefaultInstruction}
                              className="flex min-h-11 min-w-11 items-center gap-1 text-xs text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400 dark:hover:text-primary-300 dark:focus-visible:ring-primary-400"
                              onClick={() =>
                                setShowDefaultInstruction(
                                  !showDefaultInstruction,
                                )
                              }
                              type="button"
                            >
                              {showDefaultInstruction ? (
                                <EyeOff
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                              ) : (
                                <Eye
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                              )}
                              {showDefaultInstruction
                                ? t('hideDefaultInstruction')
                                : t('showDefaultInstruction')}
                            </button>
                          </div>
                          {helpPanel(
                            'customInstructionHelp',
                            'customInstruction',
                          )}
                          {showDefaultInstruction && (
                            <pre
                              className="mb-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-secondary-200 bg-secondary-50 p-3 text-xs text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-300"
                              id="default-instruction-content"
                            >
                              {getDefaultInstruction(locale as 'en' | 'sv')}
                            </pre>
                          )}
                          <textarea
                            className="w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 dark:placeholder:text-secondary-500"
                            disabled={isBusy}
                            id="ai-instruction"
                            onChange={e => setCustomInstruction(e.target.value)}
                            placeholder={t('customInstructionPlaceholder')}
                            rows={4}
                            value={customInstruction}
                          />
                        </div>
                        {/* System prompt toggle */}
                        <div>
                          <button
                            aria-controls="system-prompt-content"
                            aria-pressed={showSystemPrompt}
                            className="flex min-h-11 min-w-11 items-center gap-1 text-xs text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 dark:text-primary-400 dark:hover:text-primary-300 dark:focus-visible:ring-primary-400"
                            disabled={systemPromptLoading}
                            onClick={async () => {
                              if (systemPromptLoading) return
                              const next = !showSystemPrompt
                              setShowSystemPrompt(next)
                              if (next && !systemPrompt) {
                                setSystemPromptLoading(true)
                                try {
                                  const res = await fetch(
                                    `/api/ai/system-prompt?locale=${locale}`,
                                  )
                                  const data = (await res.json()) as {
                                    prompt?: string
                                  }
                                  setSystemPrompt(data.prompt ?? '')
                                } catch {
                                  setSystemPrompt(
                                    t('errors.failedToLoadSystemPrompt'),
                                  )
                                } finally {
                                  setSystemPromptLoading(false)
                                }
                              }
                            }}
                            type="button"
                          >
                            {showSystemPrompt ? (
                              <EyeOff
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                              />
                            ) : (
                              <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                            )}
                            {showSystemPrompt
                              ? t('hideSystemPrompt')
                              : t('showSystemPrompt')}
                          </button>
                          {showSystemPrompt && (
                            <pre
                              className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-secondary-200 bg-secondary-50 p-3 text-xs text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-300"
                              id="system-prompt-content"
                            >
                              {systemPromptLoading
                                ? tc('loading')
                                : systemPrompt}
                            </pre>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress section */}
                {inProgress && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400">
                      <Loader2
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                      {phase === 'thinking'
                        ? t('thinkingPhase')
                        : t('generatingPhase')}
                    </div>
                  </div>
                )}

                {/* Error */}
                {phase === 'error' && error && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    {error}
                    {rawResponse && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium underline">
                          {t('showRawResponse')}
                        </summary>
                        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-red-100 p-2 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-300">
                          {rawResponse}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                {/* Create error banner (shown during done phase) */}
                {phase === 'done' && createError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    {createError}
                  </div>
                )}

                {/* Stats */}
                {phase === 'done' && stats && speed && (
                  <div className="mt-4 text-xs text-secondary-500 dark:text-secondary-400">
                    {speed} · {requirements.length} {t('requirementsGenerated')}
                    {stats.cost > 0 && <> · ${stats.cost.toFixed(4)}</>}
                  </div>
                )}

                {/* Results */}
                {phase === 'done' && requirements.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {/* Select all */}
                    <div className="flex items-center gap-2">
                      <button
                        className="min-h-11 min-w-11 text-sm text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400 dark:hover:text-primary-300 dark:focus-visible:ring-primary-400"
                        onClick={toggleAll}
                        type="button"
                      >
                        {selected.size === requirements.length
                          ? t('deselectAll')
                          : t('selectAll')}
                      </button>
                      <span className="text-xs text-secondary-500 dark:text-secondary-400">
                        ({selected.size}/{requirements.length})
                      </span>
                    </div>

                    {/* Requirement cards */}
                    <div className="space-y-2">
                      {requirements.map((req, i) => {
                        const isExpanded = expandedCards.has(req._id)
                        const toggleExpand = () => {
                          setExpandedCards(prev => {
                            const next = new Set(prev)
                            if (next.has(req._id)) next.delete(req._id)
                            else next.add(req._id)
                            return next
                          })
                        }
                        const categoryName = req.categoryId
                          ? taxonomy?.categories.find(
                              c => c.id === req.categoryId,
                            )?.name
                          : undefined
                        const qcName = req.qualityCharacteristicId
                          ? (() => {
                              const qc = taxonomy?.qualityCharacteristics.find(
                                q => q.id === req.qualityCharacteristicId,
                              )
                              return qc
                                ? qc.parentName
                                  ? `${qc.parentName} > ${qc.name}`
                                  : qc.name
                                : undefined
                            })()
                          : undefined
                        const scenarioNames = req.scenarioIds
                          ?.map(
                            sid =>
                              taxonomy?.scenarios.find(s => s.id === sid)?.name,
                          )
                          .filter(Boolean)
                        const riskName = req.riskLevelId
                          ? (taxonomy?.riskLevels.find(
                              r => r.id === req.riskLevelId,
                            )?.name ??
                            (req.riskLevelId === 3
                              ? t('riskHigh')
                              : req.riskLevelId === 2
                                ? t('riskMedium')
                                : t('riskLow')))
                          : undefined
                        const riskColorClass =
                          req.riskLevelId === 3
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : req.riskLevelId === 2
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        const cardBorderClass = selected.has(i)
                          ? req.riskLevelId === 3
                            ? 'border-red-300 bg-red-50/30 dark:border-red-700 dark:bg-red-900/10'
                            : req.riskLevelId === 2
                              ? 'border-amber-300 bg-amber-50/30 dark:border-amber-700 dark:bg-amber-900/10'
                              : 'border-primary-300 bg-primary-50/50 dark:border-primary-700 dark:bg-primary-900/20'
                          : 'border-secondary-200 bg-white dark:border-secondary-700 dark:bg-secondary-800'
                        return (
                          <div
                            className={`rounded-lg border p-3 transition-colors ${cardBorderClass}`}
                            key={req._id}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                aria-label={t('selectRequirement', {
                                  index: i + 1,
                                })}
                                checked={selected.has(i)}
                                className="mt-1 h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                                onChange={() => toggleSelect(i)}
                                type="checkbox"
                              />
                              <div className="flex-1 space-y-1">
                                <p className="text-sm text-secondary-900 dark:text-secondary-100">
                                  {req.description}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  <span className="inline-flex items-center rounded-full bg-secondary-100 px-2 py-0.5 text-xs text-secondary-600 dark:bg-secondary-700 dark:text-secondary-300">
                                    {req.typeId === 1
                                      ? t('functional')
                                      : t('nonFunctional')}
                                  </span>
                                  {req.riskLevelId && (
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${riskColorClass}`}
                                    >
                                      {riskName}
                                    </span>
                                  )}
                                  {categoryName && (
                                    <span className="inline-flex items-center rounded-full bg-secondary-100 px-2 py-0.5 text-xs text-secondary-600 dark:bg-secondary-700 dark:text-secondary-300">
                                      {categoryName}
                                    </span>
                                  )}
                                </div>
                                {req.rationale && (
                                  <p className="text-xs italic text-secondary-500 dark:text-secondary-400">
                                    {t('rationale')}: {req.rationale}
                                  </p>
                                )}
                                <button
                                  className="mt-0.5 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                                  onClick={toggleExpand}
                                  type="button"
                                >
                                  {isExpanded ? (
                                    <ChevronDown
                                      aria-hidden="true"
                                      className="h-3 w-3"
                                    />
                                  ) : (
                                    <ChevronRight
                                      aria-hidden="true"
                                      className="h-3 w-3"
                                    />
                                  )}
                                  {isExpanded
                                    ? t('hideDetails')
                                    : t('showDetails')}
                                </button>
                                {isExpanded && (
                                  <div className="mt-1 space-y-1 rounded-md bg-secondary-50 p-2 text-xs text-secondary-700 dark:bg-secondary-800/60 dark:text-secondary-300">
                                    <div>
                                      <span className="font-medium">
                                        {t('detailRiskLevel')}:
                                      </span>{' '}
                                      {riskName ? (
                                        <span
                                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs ${riskColorClass}`}
                                        >
                                          {riskName}
                                        </span>
                                      ) : (
                                        '–'
                                      )}
                                    </div>
                                    {categoryName && (
                                      <div>
                                        <span className="font-medium">
                                          {t('detailCategory')}:
                                        </span>{' '}
                                        {categoryName}
                                      </div>
                                    )}
                                    {qcName && (
                                      <div>
                                        <span className="font-medium">
                                          {t('detailQuality')}:
                                        </span>{' '}
                                        {qcName}
                                      </div>
                                    )}
                                    {req.acceptanceCriteria && (
                                      <div>
                                        <span className="font-medium">
                                          {t('detailAcceptanceCriteria')}:
                                        </span>{' '}
                                        {req.acceptanceCriteria}
                                      </div>
                                    )}
                                    <div>
                                      <span className="font-medium">
                                        {t('detailRequiresTesting')}:
                                      </span>{' '}
                                      {req.requiresTesting
                                        ? t('detailYes')
                                        : t('detailNo')}
                                    </div>
                                    {req.verificationMethod && (
                                      <div>
                                        <span className="font-medium">
                                          {t('detailVerification')}:
                                        </span>{' '}
                                        {req.verificationMethod}
                                      </div>
                                    )}
                                    {scenarioNames &&
                                      scenarioNames.length > 0 && (
                                        <div>
                                          <span className="font-medium">
                                            {t('detailScenarios')}:
                                          </span>{' '}
                                          {scenarioNames.join(', ')}
                                        </div>
                                      )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Side panels: thinking trace + raw output */}
              {(thinking || (rawResponse && phase === 'done')) && (
                <div
                  className="flex w-full flex-col border-t border-secondary-200 sm:w-80 sm:shrink-0 sm:border-l sm:border-t-0 dark:border-secondary-700"
                  {...devMarker({
                    context: 'ai-requirement-generator',
                    name: 'side panel',
                  })}
                >
                  {thinking && (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="flex items-center gap-2 border-b border-secondary-200 px-4 py-3 dark:border-secondary-700">
                        {inProgress && (
                          <Loader2
                            aria-hidden="true"
                            className="h-3.5 w-3.5 animate-spin text-primary-500"
                          />
                        )}
                        <h3 className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                          {t('thinkingTrace')}
                        </h3>
                      </div>
                      <pre
                        className="flex-1 overflow-y-auto whitespace-pre-wrap break-words p-4 font-mono text-xs text-secondary-500 dark:text-secondary-400"
                        ref={thinkingRef}
                      >
                        {thinking}
                      </pre>
                    </div>
                  )}
                  {rawResponse && phase === 'done' && (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="flex items-center gap-2 border-b border-secondary-200 px-4 py-3 dark:border-secondary-700">
                        <h3 className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                          {t('rawOutput')}
                        </h3>
                      </div>
                      <pre className="flex-1 overflow-y-auto whitespace-pre-wrap break-words p-4 font-mono text-xs text-secondary-500 dark:text-secondary-400">
                        {rawResponse}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-2 border-t border-secondary-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0 dark:border-secondary-700">
              <div className="flex w-full justify-center gap-2 sm:w-auto sm:justify-start">
                {inProgress ? (
                  <button
                    className="min-h-11 w-full rounded-lg border border-secondary-300 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 sm:w-auto dark:border-secondary-600 dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-secondary-500"
                    onClick={handleCancel}
                    {...devMarker({
                      context: 'ai-requirement-generator',
                      name: 'button',
                      value: 'cancel',
                    })}
                    type="button"
                  >
                    {t('cancelButton')}
                  </button>
                ) : (
                  <button
                    className="min-h-11 w-full rounded-lg border border-secondary-300 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 disabled:opacity-50 sm:w-auto dark:border-secondary-600 dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-secondary-500"
                    disabled={creating}
                    onClick={handleClose}
                    {...devMarker({
                      context: 'ai-requirement-generator',
                      name: 'button',
                      value: 'close',
                    })}
                    type="button"
                  >
                    {creating ? tc('loading') : tc('close')}
                  </button>
                )}
              </div>
              <div className="flex w-full justify-center gap-2 sm:w-auto sm:justify-end">
                {phase === 'done' && requirements.length > 0 && (
                  <button
                    className="min-h-11 w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 sm:w-auto dark:bg-primary-500 dark:hover:bg-primary-600 dark:focus-visible:ring-primary-400"
                    disabled={selected.size === 0 || creating}
                    onClick={handleCreate}
                    {...devMarker({
                      context: 'ai-requirement-generator',
                      name: 'button',
                      value: 'create',
                    })}
                    type="button"
                  >
                    {creating
                      ? tc('loading')
                      : t('createSelected', { count: selected.size })}
                  </button>
                )}
                {(phase === 'idle' ||
                  phase === 'done' ||
                  phase === 'error') && (
                  <button
                    className="min-h-11 w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 sm:w-auto dark:bg-primary-500 dark:hover:bg-primary-600 dark:focus-visible:ring-primary-400"
                    disabled={
                      !topic.trim() ||
                      !areaId ||
                      isBusy ||
                      modelsLoading ||
                      !models.some(m => m.id === model)
                    }
                    onClick={handleGenerate}
                    {...devMarker({
                      context: 'ai-requirement-generator',
                      name: 'button',
                      value: 'generate',
                    })}
                    type="button"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles aria-hidden="true" className="h-4 w-4" />
                      {t('generateButton')}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
