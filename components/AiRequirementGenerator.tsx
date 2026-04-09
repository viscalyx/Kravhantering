'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  HelpCircle,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import {
  type GeneratedRequirement,
  getDefaultInstruction,
} from '@/lib/ai/requirement-prompt'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiRequirementGeneratorProps {
  areas: Array<{ id: number; name: string }>
  onClose: () => void
  onCreated: () => void
  open: boolean
}

interface ModelInfo {
  name: string
  parameter_size?: string
  size: number
}

interface RequirementWithId extends GeneratedRequirement {
  _id: string
}

type Phase = 'done' | 'error' | 'generating' | 'idle' | 'thinking'

const richTags = { strong: (chunks: ReactNode) => <strong>{chunks}</strong> }

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

  // Model list
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  // Inline help state
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())

  // Generation state
  const [phase, setPhase] = useState<Phase>('idle')
  const [thinking, setThinking] = useState('')
  const [error, setError] = useState('')
  const [stats, setStats] = useState<{
    evalCount: number
    evalDuration: number
    totalDuration: number
  } | null>(null)

  // Results state
  const [requirements, setRequirements] = useState<RequirementWithId[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState(false)

  // Refs
  const abortRef = useRef<AbortController | null>(null)
  const thinkingRef = useRef<HTMLPreElement>(null)
  const modelRef = useRef(model)
  modelRef.current = model

  // Load models on open
  useEffect(() => {
    if (!open) return
    setModelsLoading(true)
    fetch('/api/ai/models')
      .then(r => r.json() as Promise<{ models?: ModelInfo[] }>)
      .then(data => {
        const list = data.models ?? []
        setModelsError(null)
        setModels(list)
        if (list.length > 0 && !modelRef.current) {
          const defaultModel =
            process.env.NEXT_PUBLIC_OLLAMA_MODEL ?? 'qwen3:14b'
          const found = list.find(m => m.name === defaultModel)
          setModel(found ? found.name : list[0].name)
        }
      })
      .catch((err: unknown) => {
        setModels([])
        setModelsError(
          err instanceof Error ? err.message : 'Failed to load models',
        )
      })
      .finally(() => setModelsLoading(false))
  }, [open])

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
      setTopic('')
      setAreaId('')
      setCustomInstruction('')
      setShowAdvanced(false)
      setShowDefaultInstruction(false)
      setShowSystemPrompt(false)
      setSystemPrompt('')
      setPhase('idle')
      setThinking('')
      setError('')
      setStats(null)
      setRequirements([])
      setSelected(new Set())
      setCreating(false)
      setOpenHelp(new Set())
    }
  }, [open])

  // Auto-scroll thinking
  // biome-ignore lint/correctness/useExhaustiveDependencies: thinking triggers scroll
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight
    }
  }, [thinking])

  const inProgress = phase === 'thinking' || phase === 'generating'

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
      disabled={inProgress}
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

  // Pending work = form has content or results exist
  const hasPendingWork =
    topic.trim().length > 0 || requirements.length > 0 || inProgress

  const handleClose = useCallback(async () => {
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
  }, [hasPendingWork, inProgress, onClose, confirm, t, tc])

  // ── Generate ────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || !areaId) return

    setPhase('thinking')
    setThinking('')

    setError('')
    setStats(null)
    setRequirements([])
    setSelected(new Set())

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const response = await fetch('/api/ai/generate-requirements', {
        body: JSON.stringify({
          customInstruction: customInstruction || undefined,
          locale,
          model: model || undefined,
          topic: topic.trim(),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: ac.signal,
      })

      if (!response.ok || !response.body) {
        setPhase('error')
        setError(`HTTP ${response.status}`)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

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
              const rawContent = payload.rawContent as string
              let parsed: { requirements: GeneratedRequirement[] }
              try {
                parsed = JSON.parse(rawContent) as {
                  requirements: GeneratedRequirement[]
                }
              } catch {
                setPhase('error')
                setError(t('parseError'))
                return
              }
              const reqs = (parsed.requirements ?? []).map(r => ({
                ...r,
                _id: crypto.randomUUID(),
              }))
              setRequirements(reqs)
              setSelected(new Set(reqs.map((_, i) => i)))
              setThinking(payload.thinking as string)
              setStats(
                payload.stats as {
                  evalCount: number
                  evalDuration: number
                  totalDuration: number
                },
              )
              setPhase('done')
              break
            }
            case 'error':
              setPhase('error')
              setError(payload.message as string)
              break
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setPhase('idle')
      } else {
        setPhase('error')
        setError((err as Error).message)
      }
    }
  }, [topic, areaId, model, customInstruction, locale, t])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setPhase('idle')
  }, [])

  // ── Create selected requirements ────────────────────────────────────
  const handleCreate = useCallback(async () => {
    const selectedReqs = requirements.filter((_, i) => selected.has(i))
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
      for (const req of selectedReqs) {
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
            message?: string
          } | null
          console.error('[AI Create] POST failed:', res.status, errBody)
          errors.push(errBody?.message ?? `HTTP ${res.status}`)
        } else {
          console.log('[AI Create] POST succeeded:', res.status)
        }
      }
      if (errors.length > 0) {
        setPhase('error')
        setError(`${t('createError')}: ${errors[0]}`)
        return
      }
      onCreated()
      onClose()
    } catch (err) {
      console.error('Failed to create AI-generated requirements:', err)
      setPhase('error')
      setError(t('createError'))
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

  // Speed calculation
  const speed =
    stats && stats.evalDuration > 0
      ? ((stats.evalCount / stats.evalDuration) * 1e9).toFixed(1)
      : null

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
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-secondary-900"
            exit={{ opacity: 0, scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-secondary-200 px-6 py-4 dark:border-secondary-700">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                <Sparkles
                  aria-hidden="true"
                  className="h-5 w-5 text-primary-500"
                />
                {t('generateTitle')}
              </h2>
              <button
                aria-label={tc('close')}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 text-secondary-500 transition-colors hover:bg-secondary-100 hover:text-secondary-700 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-200"
                onClick={handleClose}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
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
                    disabled={inProgress}
                    id="ai-topic"
                    onChange={e => setTopic(e.target.value)}
                    placeholder={t('topicPlaceholder')}
                    rows={3}
                    value={topic}
                  />
                </div>

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
                      disabled={inProgress}
                      id="ai-area"
                      onChange={e =>
                        setAreaId(e.target.value ? Number(e.target.value) : '')
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
                    </div>
                    {helpPanel('modelHelp', 'model')}
                    <select
                      className="w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100"
                      disabled={inProgress || modelsLoading}
                      id="ai-model"
                      onChange={e => setModel(e.target.value)}
                      value={model}
                    >
                      {modelsLoading && <option>{tc('loading')}</option>}
                      {!modelsLoading && models.length === 0 && (
                        <option>{modelsError ?? t('noModels')}</option>
                      )}
                      {models.map(m => (
                        <option key={m.name} value={m.name}>
                          {m.name}
                          {m.parameter_size ? ` (${m.parameter_size})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Advanced */}
                <div>
                  <button
                    aria-controls="advanced-section"
                    aria-expanded={showAdvanced}
                    className="flex min-h-11 min-w-11 items-center gap-1 text-sm text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400 dark:hover:text-primary-300 dark:focus-visible:ring-primary-400"
                    disabled={inProgress}
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
                              setShowDefaultInstruction(!showDefaultInstruction)
                            }
                            type="button"
                          >
                            {showDefaultInstruction ? (
                              <EyeOff
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                              />
                            ) : (
                              <Eye aria-hidden="true" className="h-3.5 w-3.5" />
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
                          disabled={inProgress}
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
                                setSystemPrompt('Failed to load system prompt')
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
                            {systemPromptLoading ? tc('loading') : systemPrompt}
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
                  {thinking && (
                    <pre
                      className="max-h-40 overflow-y-auto rounded-lg bg-secondary-50 p-3 font-mono text-xs text-secondary-500 dark:bg-secondary-800/50 dark:text-secondary-400"
                      ref={thinkingRef}
                    >
                      {thinking}
                    </pre>
                  )}
                </div>
              )}

              {/* Error */}
              {phase === 'error' && error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Stats */}
              {phase === 'done' && stats && speed && (
                <div className="mt-4 text-xs text-secondary-500 dark:text-secondary-400">
                  {t('speed', { speed })} · {requirements.length}{' '}
                  {t('requirementsGenerated')}
                </div>
              )}

              {/* Results */}
              {phase === 'done' && requirements.length > 0 && (
                <div className="mt-4 space-y-3">
                  {/* Thinking trace */}
                  {thinking && (
                    <details className="rounded-lg border border-secondary-200 dark:border-secondary-700">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-50 dark:text-secondary-300 dark:hover:bg-secondary-800">
                        {t('thinkingTrace')}
                      </summary>
                      <pre className="max-h-60 overflow-y-auto border-t border-secondary-200 p-3 font-mono text-xs text-secondary-500 dark:border-secondary-700 dark:text-secondary-400">
                        {thinking}
                      </pre>
                    </details>
                  )}

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
                    {requirements.map((req, i) => (
                      <div
                        className={`rounded-lg border p-3 transition-colors ${
                          selected.has(i)
                            ? 'border-primary-300 bg-primary-50/50 dark:border-primary-700 dark:bg-primary-900/20'
                            : 'border-secondary-200 bg-white dark:border-secondary-700 dark:bg-secondary-800'
                        }`}
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
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                                    req.riskLevelId === 3
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                      : req.riskLevelId === 2
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  }`}
                                >
                                  {req.riskLevelId === 3
                                    ? t('riskHigh')
                                    : req.riskLevelId === 2
                                      ? t('riskMedium')
                                      : t('riskLow')}
                                </span>
                              )}
                            </div>
                            {req.rationale && (
                              <p className="text-xs italic text-secondary-500 dark:text-secondary-400">
                                {t('rationale')}: {req.rationale}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-secondary-200 px-6 py-4 dark:border-secondary-700">
              <div className="flex gap-2">
                {inProgress ? (
                  <button
                    className="min-h-11 rounded-lg border border-secondary-300 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 dark:border-secondary-600 dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-secondary-500"
                    onClick={handleCancel}
                    type="button"
                  >
                    {t('cancelButton')}
                  </button>
                ) : (
                  <button
                    className="min-h-11 rounded-lg border border-secondary-300 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 dark:border-secondary-600 dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-secondary-500"
                    onClick={handleClose}
                    type="button"
                  >
                    {tc('close')}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {phase === 'done' && requirements.length > 0 && (
                  <button
                    className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 dark:bg-primary-500 dark:hover:bg-primary-600 dark:focus-visible:ring-primary-400"
                    disabled={selected.size === 0 || creating}
                    onClick={handleCreate}
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
                    className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 dark:bg-primary-500 dark:hover:bg-primary-600 dark:focus-visible:ring-primary-400"
                    disabled={
                      !topic.trim() || !areaId || inProgress || modelsLoading
                    }
                    onClick={handleGenerate}
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
