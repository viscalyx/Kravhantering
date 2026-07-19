'use client'

import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleMinus,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldHelpButton from '@/components/FieldHelpButton'
import {
  type AdminAiSettings,
  AI_SAFETY_RULE_CACHE_TTL_MAX_SECONDS,
  AI_SAFETY_RULE_CACHE_TTL_MIN_SECONDS,
  addMcpMaxRequestBytesSteps,
  coerceAiSafetyRuleCacheTtlSeconds,
  coerceMcpImportMaxRows,
  coerceMcpImportValidationTtlMinutes,
  coerceMcpMaxRequestBytes,
  DEFAULT_ADMIN_AI_SETTINGS,
  formatMcpRequestPayloadKiB,
  MCP_IMPORT_MAX_ROWS_DEFAULT,
  MCP_IMPORT_MAX_ROWS_MAX,
  MCP_IMPORT_MAX_ROWS_MIN,
  MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  MCP_IMPORT_VALIDATION_TTL_MAX_MINUTES,
  MCP_IMPORT_VALIDATION_TTL_MIN_MINUTES,
  MCP_REQUEST_PAYLOAD_MAX_BYTES,
  MCP_REQUEST_PAYLOAD_MIN_BYTES,
  MCP_REQUEST_PAYLOAD_STEP_KIB,
} from '@/lib/ai/generation-availability'
import type {
  AiSafetyRuleAdminItem,
  AiSafetyRuleAdminTerm,
  AiSafetyRuleId,
  AiSafetyTermDirection,
  AiSafetyTermType,
} from '@/lib/dal/ai-safety-rules'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'

const MIN_ALLOWED_MCP_REQUEST_BYTES = coerceMcpMaxRequestBytes(
  MCP_REQUEST_PAYLOAD_MIN_BYTES,
)
const MAX_ALLOWED_MCP_REQUEST_BYTES = coerceMcpMaxRequestBytes(
  MCP_REQUEST_PAYLOAD_MAX_BYTES,
)

function formatMcpRequestLimitInputKiB(bytes: number): string {
  return formatMcpRequestPayloadKiB(bytes)
}

function formatMcpRequestLimit(bytes: number, locale: string): string {
  if (bytes === 1024 * 1024) return '1024 KiB (1 MiB)'
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)} MiB`
  const kib = bytes / 1024
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(kib) ? 0 : 1,
  })
  return `${formatter.format(kib)} KiB`
}

function formatMcpRequestConstraintValue(
  bytes: number,
  locale: string,
): string {
  const mebibyte = 1024 * 1024
  if (bytes % mebibyte === 0) return `${bytes / mebibyte} MiB`
  return formatMcpRequestLimit(bytes, locale)
}

function normalizeAdminAiSettings(
  payload: Partial<AdminAiSettings>,
  fallback: AdminAiSettings = DEFAULT_ADMIN_AI_SETTINGS,
): AdminAiSettings {
  return {
    ...fallback,
    ...payload,
    constraints: payload.constraints ?? fallback.constraints,
  }
}

type AiSettingSaveKey =
  | 'aiSafetyForensicLoggingEnabled'
  | 'aiSafetyRuleCacheTtlSeconds'
  | 'mcpImportMaxRows'
  | 'mcpImportValidationTtlMinutes'
  | 'mcpMaxRequestBytes'
  | 'requirementGenerationEnabled'

type AiSettingsPatch = Partial<
  Pick<
    AdminAiSettings,
    | 'aiSafetyForensicLoggingEnabled'
    | 'aiSafetyRuleCacheTtlSeconds'
    | 'mcpImportMaxRows'
    | 'mcpImportValidationTtlMinutes'
    | 'mcpMaxRequestBytes'
    | 'requirementGenerationEnabled'
  >
>

interface AiSafetyRulesResponse {
  rules: AiSafetyRuleAdminItem[]
}

interface AiSafetyTermForm {
  direction: AiSafetyTermDirection
  termText: string
  termType: AiSafetyTermType
}

const AI_SETTING_SAVE_KEYS: readonly AiSettingSaveKey[] = [
  'requirementGenerationEnabled',
  'aiSafetyForensicLoggingEnabled',
  'mcpMaxRequestBytes',
  'mcpImportMaxRows',
  'mcpImportValidationTtlMinutes',
  'aiSafetyRuleCacheTtlSeconds',
]

const AI_SAFETY_TERM_GROUPS: readonly AiSafetyTermType[] = [
  'action',
  'target',
  'direct_marker',
  'coding',
]

const AI_SAFETY_TERM_DIRECTIONS: readonly AiSafetyTermDirection[] = [
  'input_output',
  'input',
  'output',
]

function initialAiSettingSaveStates(): Record<AiSettingSaveKey, SaveState> {
  return Object.fromEntries(
    AI_SETTING_SAVE_KEYS.map(key => [key, 'idle']),
  ) as Record<AiSettingSaveKey, SaveState>
}

function defaultAiSafetyTermForm(): AiSafetyTermForm {
  return {
    direction: 'input_output',
    termText: '',
    termType: 'action',
  }
}

function termHasStandardDeviation(term: AiSafetyRuleAdminTerm): boolean {
  return (
    term.isStandard &&
    (!term.isActive || term.direction !== term.standardDirection)
  )
}

function safetyRuleDeviationCount(rule: AiSafetyRuleAdminItem): number {
  return rule.terms.filter(termHasStandardDeviation).length
}

function safetyRuleActiveTermCount(rule: AiSafetyRuleAdminItem): number {
  return rule.terms.filter(term => term.isActive).length
}

function selectedTermsInRule(
  rule: AiSafetyRuleAdminItem,
  selectedTermIds: ReadonlySet<number>,
): AiSafetyRuleAdminTerm[] {
  return rule.terms.filter(term => selectedTermIds.has(term.id))
}

function updateSafetyTermInRules(
  rules: readonly AiSafetyRuleAdminItem[],
  termId: number,
  patch: Partial<AiSafetyRuleAdminTerm>,
): AiSafetyRuleAdminItem[] {
  return rules.map(rule => ({
    ...rule,
    terms: rule.terms.map(term =>
      term.id === termId ? { ...term, ...patch } : term,
    ),
  }))
}

function removeOrDeactivateSafetyTermsInRules(
  rules: readonly AiSafetyRuleAdminItem[],
  termIds: ReadonlySet<number>,
): AiSafetyRuleAdminItem[] {
  return rules.map(rule => ({
    ...rule,
    terms: rule.terms
      .filter(term => term.isStandard || !termIds.has(term.id))
      .map(term =>
        termIds.has(term.id) && term.isStandard
          ? { ...term, isActive: false }
          : term,
      ),
  }))
}

function restoreSafetyRuleDefaultsInRules(
  rules: readonly AiSafetyRuleAdminItem[],
  ruleId: AiSafetyRuleId,
): AiSafetyRuleAdminItem[] {
  return rules.map(rule =>
    rule.ruleId === ruleId
      ? {
          ...rule,
          terms: rule.terms.map(term =>
            term.isStandard
              ? {
                  ...term,
                  direction: term.standardDirection,
                  isActive: true,
                }
              : term,
          ),
        }
      : rule,
  )
}

export default function AiSettingsPanel({
  embedded = false,
  onSettingsSettled,
}: {
  embedded?: boolean
  onSettingsSettled?: () => void
}) {
  const locale = useLocale()
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const { confirm } = useConfirmModal()
  const [settings, setSettings] = useState<AdminAiSettings>(
    DEFAULT_ADMIN_AI_SETTINGS,
  )
  const [settingSaveStates, setSettingSaveStates] = useState(
    initialAiSettingSaveStates,
  )
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [safetyRules, setSafetyRules] = useState<AiSafetyRuleAdminItem[]>([])
  const [isRulesLoading, setIsRulesLoading] = useState(true)
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null)
  const [expandedRuleIds, setExpandedRuleIds] = useState<Set<AiSafetyRuleId>>(
    () => new Set(),
  )
  const [selectedTermIds, setSelectedTermIds] = useState<Set<number>>(
    () => new Set(),
  )
  const [termRowStates, setTermRowStates] = useState<Record<number, SaveState>>(
    {},
  )
  const [ruleActionStates, setRuleActionStates] = useState<
    Record<string, SaveState>
  >({})
  const [termForms, setTermForms] = useState<
    Partial<Record<AiSafetyRuleId, AiSafetyTermForm>>
  >({})
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isMcpLimitHelpOpen, setIsMcpLimitHelpOpen] = useState(false)
  const [isMcpImportRowsHelpOpen, setIsMcpImportRowsHelpOpen] = useState(false)
  const [isMcpImportTtlHelpOpen, setIsMcpImportTtlHelpOpen] = useState(false)
  const [isForensicLoggingHelpOpen, setIsForensicLoggingHelpOpen] =
    useState(false)
  const [isCacheTtlHelpOpen, setIsCacheTtlHelpOpen] = useState(false)
  const [isRulesHelpOpen, setIsRulesHelpOpen] = useState(false)
  const settingSaveTokensRef = useRef<Record<AiSettingSaveKey, number>>({
    aiSafetyForensicLoggingEnabled: 0,
    aiSafetyRuleCacheTtlSeconds: 0,
    mcpImportMaxRows: 0,
    mcpImportValidationTtlMinutes: 0,
    mcpMaxRequestBytes: 0,
    requirementGenerationEnabled: 0,
  })
  const loadErrorMessage = ta('ai.loadError')
  const saveErrorMessage = ta('ai.saveError')
  const safetyRulesLoadErrorMessage = ta('ai.safetyRulesLoadError')
  const toggleId = 'admin-ai-requirement-generation-enabled'
  const helpId = `${toggleId}-help`
  const mcpLimitId = 'admin-ai-mcp-max-request-kib'
  const mcpLimitHelpId = `${mcpLimitId}-help`
  const mcpImportRowsId = 'admin-ai-mcp-import-max-rows'
  const mcpImportRowsHelpId = `${mcpImportRowsId}-help`
  const mcpImportTtlId = 'admin-ai-mcp-import-validation-ttl-minutes'
  const mcpImportTtlHelpId = `${mcpImportTtlId}-help`
  const forensicLoggingId = 'admin-ai-safety-forensic-logging-enabled'
  const forensicLoggingHelpId = `${forensicLoggingId}-help`
  const cacheTtlId = 'admin-ai-safety-rule-cache-ttl-seconds'
  const cacheTtlHelpId = `${cacheTtlId}-help`
  const cacheTtlConstraintId = `${cacheTtlId}-constraint`
  const rulesHelpId = 'admin-ai-safety-rules-help'
  const mcpLimitConstraintId = `${mcpLimitId}-constraint`
  const mcpImportRowsConstraintId = `${mcpImportRowsId}-constraint`
  const mcpImportTtlConstraintId = `${mcpImportTtlId}-constraint`
  const committedMcpLimitKiB = formatMcpRequestLimitInputKiB(
    settings.mcpMaxRequestBytes,
  )
  const [mcpLimitInputKiB, setMcpLimitInputKiB] = useState(committedMcpLimitKiB)
  const currentMcpImportMaxRows =
    settings.mcpImportMaxRows ?? MCP_IMPORT_MAX_ROWS_DEFAULT
  const committedMcpImportRows = String(currentMcpImportMaxRows)
  const [mcpImportRowsInput, setMcpImportRowsInput] = useState(
    committedMcpImportRows,
  )
  const committedMcpImportTtlMinutes = String(
    settings.mcpImportValidationTtlMinutes ??
      MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  )
  const [mcpImportTtlInputMinutes, setMcpImportTtlInputMinutes] = useState(
    committedMcpImportTtlMinutes,
  )
  const committedCacheTtlSeconds = String(settings.aiSafetyRuleCacheTtlSeconds)
  const [cacheTtlInputSeconds, setCacheTtlInputSeconds] = useState(
    committedCacheTtlSeconds,
  )
  const constraints = settings.constraints
  const cacheTtlConstraintText = ta('ai.safetyRuleCacheTtlConstraint', {
    max: constraints.aiSafetyRuleCacheTtlSeconds.max,
    min: constraints.aiSafetyRuleCacheTtlSeconds.min,
    step: constraints.aiSafetyRuleCacheTtlSeconds.step,
  })
  const mcpLimitConstraintText = ta('ai.mcpMaxRequestLimitConstraint', {
    max: formatMcpRequestConstraintValue(
      constraints.mcpMaxRequestBytes.max,
      locale,
    ),
    min: formatMcpRequestConstraintValue(
      constraints.mcpMaxRequestBytes.min,
      locale,
    ),
    step: formatMcpRequestConstraintValue(
      constraints.mcpMaxRequestBytes.step,
      locale,
    ),
  })
  const mcpImportRowsConstraintText = ta('ai.mcpImportMaxRowsConstraint', {
    max: constraints.mcpImportMaxRows.max,
    min: constraints.mcpImportMaxRows.min,
    step: constraints.mcpImportMaxRows.step,
  })
  const mcpImportTtlConstraintText = ta('ai.mcpImportValidationTtlConstraint', {
    max: constraints.mcpImportValidationTtlMinutes.max,
    min: constraints.mcpImportValidationTtlMinutes.min,
    step: constraints.mcpImportValidationTtlMinutes.step,
  })

  function setSettingSaveState(key: AiSettingSaveKey, state: SaveState) {
    setSettingSaveStates(current => ({ ...current, [key]: state }))
  }

  function isSettingSaving(key: AiSettingSaveKey): boolean {
    return settingSaveStates[key] === 'saving'
  }

  async function saveSettingsPatch(
    key: AiSettingSaveKey,
    patch: AiSettingsPatch,
    optimistic: (current: AdminAiSettings) => AdminAiSettings,
  ) {
    const requestToken = settingSaveTokensRef.current[key] + 1
    settingSaveTokensRef.current[key] = requestToken
    const previousValue = settings[key]
    setSettings(current => optimistic(current))
    setSettingSaveState(key, 'saving')
    setMessage(null)

    const revertFailedKey = () => {
      setSettings(current => ({ ...current, [key]: previousValue }))
    }

    try {
      const response = await apiFetch('/api/admin/ai-settings', {
        body: JSON.stringify(patch),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      if (requestToken !== settingSaveTokensRef.current[key]) return
      if (!response.ok) {
        revertFailedKey()
        setSettingSaveState(key, 'error')
        setMessage((await readResponseMessage(response)) ?? saveErrorMessage)
        return
      }

      const payload = (await response.json()) as Partial<AdminAiSettings>
      if (requestToken !== settingSaveTokensRef.current[key]) return
      setSettings(current => normalizeAdminAiSettings(payload, current))
      setSettingSaveState(key, 'saved')
    } catch {
      if (requestToken !== settingSaveTokensRef.current[key]) return
      revertFailedKey()
      setSettingSaveState(key, 'error')
      setMessage(saveErrorMessage)
    }
  }

  function updateMcpMaxRequestBytes(nextValue: number) {
    const next = coerceMcpMaxRequestBytes(nextValue)
    setMcpLimitInputKiB(formatMcpRequestLimitInputKiB(next))
    if (next === settings.mcpMaxRequestBytes) return
    void saveSettingsPatch(
      'mcpMaxRequestBytes',
      { mcpMaxRequestBytes: next },
      current => ({ ...current, mcpMaxRequestBytes: next }),
    )
  }

  function commitMcpMaxRequestBytesInput(rawValue = mcpLimitInputKiB) {
    const trimmed = rawValue.trim()
    if (trimmed === '') {
      setMcpLimitInputKiB(committedMcpLimitKiB)
      return
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setMcpLimitInputKiB(committedMcpLimitKiB)
      return
    }

    updateMcpMaxRequestBytes(parsed * 1024)
  }

  function updateMcpImportMaxRows(nextValue: number) {
    const next = coerceMcpImportMaxRows(nextValue)
    setMcpImportRowsInput(String(next))
    if (next === currentMcpImportMaxRows) return
    void saveSettingsPatch(
      'mcpImportMaxRows',
      { mcpImportMaxRows: next },
      current => ({ ...current, mcpImportMaxRows: next }),
    )
  }

  function commitMcpImportMaxRowsInput(rawValue = mcpImportRowsInput) {
    const trimmed = rawValue.trim()
    if (trimmed === '') {
      setMcpImportRowsInput(committedMcpImportRows)
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setMcpImportRowsInput(committedMcpImportRows)
      return
    }
    updateMcpImportMaxRows(parsed)
  }

  function updateMcpImportValidationTtlMinutes(nextValue: number) {
    const next = coerceMcpImportValidationTtlMinutes(nextValue)
    setMcpImportTtlInputMinutes(String(next))
    if (next === Number(committedMcpImportTtlMinutes)) return
    void saveSettingsPatch(
      'mcpImportValidationTtlMinutes',
      { mcpImportValidationTtlMinutes: next },
      current => ({ ...current, mcpImportValidationTtlMinutes: next }),
    )
  }

  function commitMcpImportValidationTtlInput(
    rawValue = mcpImportTtlInputMinutes,
  ) {
    const trimmed = rawValue.trim()
    if (trimmed === '') {
      setMcpImportTtlInputMinutes(committedMcpImportTtlMinutes)
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setMcpImportTtlInputMinutes(committedMcpImportTtlMinutes)
      return
    }
    updateMcpImportValidationTtlMinutes(parsed)
  }

  function updateAiSafetyRuleCacheTtlSeconds(nextValue: number) {
    const next = coerceAiSafetyRuleCacheTtlSeconds(nextValue)
    setCacheTtlInputSeconds(String(next))
    if (next === settings.aiSafetyRuleCacheTtlSeconds) return
    void saveSettingsPatch(
      'aiSafetyRuleCacheTtlSeconds',
      { aiSafetyRuleCacheTtlSeconds: next },
      current => ({ ...current, aiSafetyRuleCacheTtlSeconds: next }),
    )
  }

  function commitAiSafetyRuleCacheTtlInput(rawValue = cacheTtlInputSeconds) {
    const trimmed = rawValue.trim()
    if (trimmed === '') {
      setCacheTtlInputSeconds(committedCacheTtlSeconds)
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setCacheTtlInputSeconds(committedCacheTtlSeconds)
      return
    }
    updateAiSafetyRuleCacheTtlSeconds(parsed)
  }

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    setMessage(null)
    try {
      const response = await apiFetch('/api/admin/ai-settings')
      if (!response.ok) {
        setMessage((await readResponseMessage(response)) ?? loadErrorMessage)
        return
      }
      const payload = (await response.json()) as Partial<AdminAiSettings>
      setSettings(normalizeAdminAiSettings(payload))
      setSettingSaveStates(initialAiSettingSaveStates())
    } catch {
      setMessage(loadErrorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [loadErrorMessage])

  const loadSafetyRules = useCallback(async () => {
    setIsRulesLoading(true)
    setSafetyMessage(null)
    try {
      const response = await apiFetch('/api/admin/ai-safety-rules')
      if (!response.ok) {
        setSafetyMessage(
          (await readResponseMessage(response)) ?? safetyRulesLoadErrorMessage,
        )
        return
      }
      const payload = (await response.json()) as AiSafetyRulesResponse
      setSafetyRules(payload.rules)
      setTermRowStates({})
      setRuleActionStates({})
      setSelectedTermIds(new Set())
    } catch {
      setSafetyMessage(safetyRulesLoadErrorMessage)
    } finally {
      setIsRulesLoading(false)
    }
  }, [safetyRulesLoadErrorMessage])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    void loadSafetyRules()
  }, [loadSafetyRules])

  useEffect(() => {
    if (!isLoading && !isRulesLoading) onSettingsSettled?.()
  }, [isLoading, isRulesLoading, onSettingsSettled])

  useEffect(() => {
    setMcpLimitInputKiB(committedMcpLimitKiB)
  }, [committedMcpLimitKiB])

  useEffect(() => {
    setMcpImportRowsInput(committedMcpImportRows)
  }, [committedMcpImportRows])

  useEffect(() => {
    setMcpImportTtlInputMinutes(committedMcpImportTtlMinutes)
  }, [committedMcpImportTtlMinutes])

  useEffect(() => {
    setCacheTtlInputSeconds(committedCacheTtlSeconds)
  }, [committedCacheTtlSeconds])

  function termGroupLabel(termType: AiSafetyTermType): string {
    return ta(`ai.safetyTermTypes.${termType}`)
  }

  function directionLabel(direction: AiSafetyTermDirection): string {
    return ta(`ai.safetyDirections.${direction}`)
  }

  function ruleName(rule: AiSafetyRuleAdminItem): string {
    return locale === 'en' ? rule.nameEn : rule.nameSv
  }

  function ruleDescription(rule: AiSafetyRuleAdminItem): string | null {
    return locale === 'en' ? rule.descriptionEn : rule.descriptionSv
  }

  function formForRule(ruleId: AiSafetyRuleId): AiSafetyTermForm {
    return termForms[ruleId] ?? defaultAiSafetyTermForm()
  }

  function updateTermForm(
    ruleId: AiSafetyRuleId,
    patch: Partial<AiSafetyTermForm>,
  ) {
    setTermForms(current => ({
      ...current,
      [ruleId]: { ...formForRule(ruleId), ...patch },
    }))
  }

  function toggleRule(ruleId: AiSafetyRuleId) {
    setExpandedRuleIds(current => {
      const next = new Set(current)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
  }

  function toggleSelectedTerm(termId: number, selected: boolean) {
    setSelectedTermIds(current => {
      const next = new Set(current)
      if (selected) next.add(termId)
      else next.delete(termId)
      return next
    })
  }

  async function updateSafetyTerm(
    term: AiSafetyRuleAdminTerm,
    patch: { direction?: AiSafetyTermDirection; isActive?: boolean },
  ) {
    const previousRules = safetyRules
    setSafetyRules(current => updateSafetyTermInRules(current, term.id, patch))
    setTermRowStates(current => ({ ...current, [term.id]: 'saving' }))
    setSafetyMessage(null)
    try {
      const response = await apiFetch(
        `/api/admin/ai-safety-rules/terms/${term.id}`,
        {
          body: JSON.stringify(patch),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        },
      )
      if (!response.ok) {
        setSafetyRules(previousRules)
        setTermRowStates(current => ({ ...current, [term.id]: 'error' }))
        setSafetyMessage(
          (await readResponseMessage(response)) ?? ta('ai.safetyTermSaveError'),
        )
        return
      }
      const payload = (await response.json()) as {
        term: AiSafetyRuleAdminTerm
      }
      setSafetyRules(current =>
        updateSafetyTermInRules(current, term.id, payload.term),
      )
      setTermRowStates(current => ({ ...current, [term.id]: 'saved' }))
    } catch {
      setSafetyRules(previousRules)
      setTermRowStates(current => ({ ...current, [term.id]: 'error' }))
      setSafetyMessage(ta('ai.safetyTermSaveError'))
    }
  }

  async function addSafetyTerm(rule: AiSafetyRuleAdminItem) {
    const form = formForRule(rule.ruleId)
    const termText = form.termText.trim()
    if (!termText) return
    setRuleActionStates(current => ({ ...current, [rule.ruleId]: 'saving' }))
    setSafetyMessage(null)
    try {
      const response = await apiFetch('/api/admin/ai-safety-rules', {
        body: JSON.stringify({
          direction: form.direction,
          ruleId: rule.ruleId,
          termText,
          termType: form.termType,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setRuleActionStates(current => ({ ...current, [rule.ruleId]: 'error' }))
        setSafetyMessage(
          (await readResponseMessage(response)) ?? ta('ai.safetyTermAddError'),
        )
        return
      }
      await loadSafetyRules()
      setTermForms(current => ({
        ...current,
        [rule.ruleId]: { ...form, termText: '' },
      }))
      setRuleActionStates(current => ({ ...current, [rule.ruleId]: 'saved' }))
    } catch {
      setRuleActionStates(current => ({ ...current, [rule.ruleId]: 'error' }))
      setSafetyMessage(ta('ai.safetyTermAddError'))
    }
  }

  async function removeSelectedSafetyTerms(
    rule: AiSafetyRuleAdminItem,
    event?: MouseEvent<HTMLButtonElement>,
  ) {
    const anchorEl = event?.currentTarget
    const selectedTerms = selectedTermsInRule(rule, selectedTermIds)
    if (selectedTerms.length === 0) return
    const standardCount = selectedTerms.filter(term => term.isStandard).length
    const customCount = selectedTerms.length - standardCount
    const confirmed = await confirm({
      anchorEl,
      confirmText: ta('ai.removeSelectedTerms'),
      icon: 'caution',
      message: ta('ai.removeSelectedTermsConfirmMessage', {
        customCount,
        standardCount,
      }),
      title: ta('ai.removeSelectedTermsConfirmTitle'),
      variant: 'danger',
    })
    if (!confirmed) return

    const previousRules = safetyRules
    const selectedIds = new Set(selectedTerms.map(term => term.id))
    setSafetyRules(current =>
      removeOrDeactivateSafetyTermsInRules(current, selectedIds),
    )
    setTermRowStates(current => ({
      ...current,
      ...Object.fromEntries(
        selectedTerms.map(term => [term.id, 'saving' as SaveState]),
      ),
    }))
    setSafetyMessage(null)
    try {
      const response = await apiFetch(
        '/api/admin/ai-safety-rules/terms/remove',
        {
          body: JSON.stringify({ termIds: [...selectedIds] }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      if (!response.ok) {
        setSafetyRules(previousRules)
        setSafetyMessage(
          (await readResponseMessage(response)) ??
            ta('ai.safetyTermRemoveError'),
        )
        return
      }
      setSelectedTermIds(current => {
        const next = new Set(current)
        for (const id of selectedIds) next.delete(id)
        return next
      })
      await loadSafetyRules()
    } catch {
      setSafetyRules(previousRules)
      setSafetyMessage(ta('ai.safetyTermRemoveError'))
    }
  }

  async function restoreRuleDefaults(
    rule: AiSafetyRuleAdminItem,
    event?: MouseEvent<HTMLButtonElement>,
  ) {
    const confirmed = await confirm({
      anchorEl: event?.currentTarget,
      confirmText: ta('ai.restoreRuleDefaults'),
      icon: 'caution',
      message: ta('ai.restoreRuleDefaultsConfirmMessage'),
      title: ta('ai.restoreRuleDefaultsConfirmTitle'),
      variant: 'danger',
    })
    if (!confirmed) return

    const previousRules = safetyRules
    setSafetyRules(current =>
      restoreSafetyRuleDefaultsInRules(current, rule.ruleId),
    )
    setRuleActionStates(current => ({ ...current, [rule.ruleId]: 'saving' }))
    setSafetyMessage(null)
    try {
      const response = await apiFetch(
        `/api/admin/ai-safety-rules/${rule.ruleId}/restore-defaults`,
        { method: 'POST' },
      )
      if (!response.ok) {
        setSafetyRules(previousRules)
        setRuleActionStates(current => ({ ...current, [rule.ruleId]: 'error' }))
        setSafetyMessage(
          (await readResponseMessage(response)) ??
            ta('ai.safetyRuleRestoreError'),
        )
        return
      }
      await loadSafetyRules()
      setRuleActionStates(current => ({ ...current, [rule.ruleId]: 'saved' }))
    } catch {
      setSafetyRules(previousRules)
      setRuleActionStates(current => ({ ...current, [rule.ruleId]: 'error' }))
      setSafetyMessage(ta('ai.safetyRuleRestoreError'))
    }
  }

  return (
    <section
      aria-labelledby={embedded ? 'admin-settings-ai-title' : 'ai-tab'}
      className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
      {...devMarker({
        context: 'admin center',
        name: 'tab panel',
        priority: 340,
        value: 'ai',
      })}
      id={embedded ? 'admin-settings-ai-section' : 'ai-panel'}
      role={embedded ? undefined : 'tabpanel'}
    >
      <div className="flex flex-col gap-4 border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-secondary-950 dark:text-secondary-50">
            <Sparkles
              aria-hidden="true"
              className="h-5 w-5 text-primary-700 dark:text-primary-300"
            />
            <span id={embedded ? 'admin-settings-ai-title' : undefined}>
              {ta('ai.title')}
            </span>
          </h2>
          <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
            {ta('ai.description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {message ? (
            <>
              <span
                className="text-sm font-medium text-red-700 dark:text-red-400"
                role="alert"
              >
                {message}
              </span>
              {!isLoading ? (
                <button
                  className="btn-secondary px-4! py-2! text-sm"
                  onClick={() => void loadSettings()}
                  type="button"
                >
                  {tc('retry')}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <div className="grid gap-4">
          <div>
            <h3 className="text-base font-semibold text-secondary-950 dark:text-secondary-50">
              {ta('ai.assistanceTitle')}
            </h3>
            <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
              {ta('ai.assistanceDescription')}
            </p>
          </div>

          <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <label
                    className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
                    htmlFor={toggleId}
                  >
                    {ta('ai.requirementGenerationEnabled')}
                  </label>
                  <FieldHelpButton
                    controls={helpId}
                    expanded={isHelpOpen}
                    label={`${tc('help')}: ${ta('ai.requirementGenerationEnabled')}`}
                    onClick={() => setIsHelpOpen(open => !open)}
                  />
                </div>
                <AnimatedHelpPanel id={helpId} isOpen={isHelpOpen}>
                  {ta('ai.fieldHelp.requirementGenerationEnabled')}
                </AnimatedHelpPanel>
                {settings.disabledByEnvironment ? (
                  <p
                    className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100"
                    role="status"
                  >
                    {ta('ai.environmentOverrideNotice')}
                  </p>
                ) : null}
              </div>
              <label className="inline-flex min-h-11 items-center gap-3 rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200">
                <input
                  checked={settings.requirementGenerationEnabled}
                  disabled={
                    isLoading || isSettingSaving('requirementGenerationEnabled')
                  }
                  id={toggleId}
                  onChange={event => {
                    const checked = event.target.checked
                    void saveSettingsPatch(
                      'requirementGenerationEnabled',
                      { requirementGenerationEnabled: checked },
                      current => ({
                        ...current,
                        effectiveRequirementGenerationEnabled:
                          checked && !current.disabledByEnvironment,
                        requirementGenerationEnabled: checked,
                      }),
                    )
                  }}
                  type="checkbox"
                />
                <span>
                  {settings.requirementGenerationEnabled
                    ? ta('ai.adminPreferenceEnabled')
                    : ta('ai.adminPreferenceDisabled')}
                </span>
              </label>
            </div>
            {settingSaveStates.requirementGenerationEnabled !== 'idle' ? (
              <p className="mt-2 text-xs font-medium text-secondary-500 dark:text-secondary-400">
                {settingSaveStates.requirementGenerationEnabled === 'saving'
                  ? tc('saving')
                  : settingSaveStates.requirementGenerationEnabled === 'saved'
                    ? ta('saved')
                    : ta('ai.rowSaveError')}
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="text-base font-semibold text-secondary-950 dark:text-secondary-50">
              {ta('ai.aiSecurityTitle')}
            </h3>
            <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
              {ta('ai.aiSecurityDescription')}
            </p>
          </div>

          <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <label
                    className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
                    htmlFor={forensicLoggingId}
                  >
                    {ta('ai.aiSafetyForensicLogging')}
                  </label>
                  <FieldHelpButton
                    controls={forensicLoggingHelpId}
                    expanded={isForensicLoggingHelpOpen}
                    label={`${tc('help')}: ${ta('ai.aiSafetyForensicLogging')}`}
                    onClick={() => setIsForensicLoggingHelpOpen(open => !open)}
                  />
                </div>
                <AnimatedHelpPanel
                  id={forensicLoggingHelpId}
                  isOpen={isForensicLoggingHelpOpen}
                >
                  {ta('ai.fieldHelp.aiSafetyForensicLogging')}
                </AnimatedHelpPanel>
              </div>
              <label className="inline-flex min-h-11 items-center gap-3 rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200">
                <input
                  checked={settings.aiSafetyForensicLoggingEnabled}
                  disabled={
                    isLoading ||
                    isSettingSaving('aiSafetyForensicLoggingEnabled')
                  }
                  id={forensicLoggingId}
                  onChange={event => {
                    const checked = event.target.checked
                    void saveSettingsPatch(
                      'aiSafetyForensicLoggingEnabled',
                      { aiSafetyForensicLoggingEnabled: checked },
                      current => ({
                        ...current,
                        aiSafetyForensicLoggingEnabled: checked,
                      }),
                    )
                  }}
                  type="checkbox"
                />
                <span>
                  {settings.aiSafetyForensicLoggingEnabled
                    ? ta('ai.adminPreferenceEnabled')
                    : ta('ai.adminPreferenceDisabled')}
                </span>
              </label>
            </div>
            {settingSaveStates.aiSafetyForensicLoggingEnabled !== 'idle' ? (
              <p className="mt-2 text-xs font-medium text-secondary-500 dark:text-secondary-400">
                {settingSaveStates.aiSafetyForensicLoggingEnabled === 'saving'
                  ? tc('saving')
                  : settingSaveStates.aiSafetyForensicLoggingEnabled === 'saved'
                    ? ta('saved')
                    : ta('ai.rowSaveError')}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <label
                      className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
                      htmlFor={cacheTtlId}
                    >
                      {ta('ai.safetyRuleCacheTtl')}
                    </label>
                    <FieldHelpButton
                      controls={cacheTtlHelpId}
                      expanded={isCacheTtlHelpOpen}
                      label={`${tc('help')}: ${ta('ai.safetyRuleCacheTtl')}`}
                      onClick={() => setIsCacheTtlHelpOpen(open => !open)}
                    />
                  </div>
                  <AnimatedHelpPanel
                    id={cacheTtlHelpId}
                    isOpen={isCacheTtlHelpOpen}
                  >
                    {ta('ai.fieldHelp.safetyRuleCacheTtl')}
                  </AnimatedHelpPanel>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <div className="flex min-h-11 items-center overflow-hidden rounded-full border border-secondary-200 bg-white text-sm font-medium text-secondary-800 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100">
                    <input
                      aria-describedby={`${cacheTtlHelpId} ${cacheTtlConstraintId}`}
                      className="h-11 w-28 border-0 bg-transparent px-3 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500"
                      disabled={
                        isLoading ||
                        isSettingSaving('aiSafetyRuleCacheTtlSeconds')
                      }
                      id={cacheTtlId}
                      inputMode="numeric"
                      max={AI_SAFETY_RULE_CACHE_TTL_MAX_SECONDS}
                      min={AI_SAFETY_RULE_CACHE_TTL_MIN_SECONDS}
                      onBlur={event => {
                        commitAiSafetyRuleCacheTtlInput(
                          event.currentTarget.value,
                        )
                      }}
                      onChange={event => {
                        setCacheTtlInputSeconds(event.target.value)
                        setSettingSaveState(
                          'aiSafetyRuleCacheTtlSeconds',
                          'idle',
                        )
                        setMessage(null)
                      }}
                      onKeyDown={event => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        commitAiSafetyRuleCacheTtlInput(
                          event.currentTarget.value,
                        )
                      }}
                      step={1}
                      type="number"
                      value={cacheTtlInputSeconds}
                    />
                    <span className="px-3 text-xs text-secondary-500 dark:text-secondary-400">
                      {ta('ai.seconds')}
                    </span>
                  </div>
                  <p
                    className="max-w-xs text-xs text-secondary-500 dark:text-secondary-400 sm:text-right"
                    id={cacheTtlConstraintId}
                  >
                    {cacheTtlConstraintText}
                  </p>
                </div>
              </div>
              {settingSaveStates.aiSafetyRuleCacheTtlSeconds !== 'idle' ? (
                <p className="mt-2 text-xs font-medium text-secondary-500 dark:text-secondary-400">
                  {settingSaveStates.aiSafetyRuleCacheTtlSeconds === 'saving'
                    ? tc('saving')
                    : settingSaveStates.aiSafetyRuleCacheTtlSeconds === 'saved'
                      ? ta('saved')
                      : ta('ai.rowSaveError')}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-secondary-200/70 bg-white p-4 dark:border-secondary-700/60 dark:bg-secondary-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1">
                  <h4 className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                    {ta('ai.safetyRulesTitle')}
                  </h4>
                  <FieldHelpButton
                    controls={rulesHelpId}
                    expanded={isRulesHelpOpen}
                    label={`${tc('help')}: ${ta('ai.safetyRulesTitle')}`}
                    onClick={() => setIsRulesHelpOpen(open => !open)}
                  />
                </div>
                <AnimatedHelpPanel id={rulesHelpId} isOpen={isRulesHelpOpen}>
                  {ta('ai.fieldHelp.safetyRules')}
                </AnimatedHelpPanel>
              </div>
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary-200 bg-white px-3 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                disabled={isRulesLoading}
                onClick={() => void loadSafetyRules()}
                type="button"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                {ta('ai.reloadSafetyRules')}
              </button>
            </div>
            {safetyMessage ? (
              <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-400">
                {safetyMessage}
              </p>
            ) : null}

            <div className="mt-3 divide-y divide-secondary-200 overflow-hidden rounded-2xl border border-secondary-200 dark:divide-secondary-700 dark:border-secondary-700">
              {isRulesLoading ? (
                <p className="p-4 text-sm text-secondary-600 dark:text-secondary-300">
                  {tc('loading')}
                </p>
              ) : null}
              {!isRulesLoading && safetyRules.length === 0 ? (
                <p className="p-4 text-sm text-secondary-600 dark:text-secondary-300">
                  {ta('ai.noSafetyRules')}
                </p>
              ) : null}
              {safetyRules.map(rule => {
                const expanded = expandedRuleIds.has(rule.ruleId)
                const form = formForRule(rule.ruleId)
                const selectedTerms = selectedTermsInRule(rule, selectedTermIds)
                const deviationCount = safetyRuleDeviationCount(rule)
                const activeCount = safetyRuleActiveTermCount(rule)
                return (
                  <div
                    className="bg-white dark:bg-secondary-900"
                    key={rule.ruleId}
                  >
                    <button
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-secondary-800/60"
                      onClick={() => toggleRule(rule.ruleId)}
                      type="button"
                    >
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-secondary-200 text-secondary-500 dark:border-secondary-700 dark:text-secondary-300">
                        {expanded ? (
                          <ChevronDown aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <ChevronRight
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-secondary-950 dark:text-secondary-50">
                          {ruleName(rule)}
                        </span>
                        {ruleDescription(rule) ? (
                          <span className="mt-1 block text-sm text-secondary-600 dark:text-secondary-300">
                            {ruleDescription(rule)}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 flex-wrap justify-end gap-2">
                        <span className="rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-medium text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                          {ta('ai.activeTermCount', {
                            activeCount,
                            totalCount: rule.terms.length,
                          })}
                        </span>
                        {deviationCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            <CircleAlert
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                            {ta('ai.deviationCount', { count: deviationCount })}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {expanded ? (
                      <div className="space-y-4 border-t border-secondary-200 bg-secondary-50/50 p-4 dark:border-secondary-700 dark:bg-secondary-950/30">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                          <select
                            aria-label={ta('ai.termType')}
                            className="min-h-11 rounded-xl border border-secondary-200 bg-white px-3 py-2 text-sm text-secondary-900 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
                            onChange={event =>
                              updateTermForm(rule.ruleId, {
                                termType: event.target
                                  .value as AiSafetyTermType,
                              })
                            }
                            value={form.termType}
                          >
                            {AI_SAFETY_TERM_GROUPS.map(termType => (
                              <option key={termType} value={termType}>
                                {termGroupLabel(termType)}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label={ta('ai.termText')}
                            className="min-h-11 rounded-xl border border-secondary-200 bg-white px-3 py-2 text-sm text-secondary-900 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
                            onChange={event =>
                              updateTermForm(rule.ruleId, {
                                termText: event.target.value,
                              })
                            }
                            placeholder={ta('ai.termTextPlaceholder')}
                            type="text"
                            value={form.termText}
                          />
                          <select
                            aria-label={ta('ai.direction')}
                            className="min-h-11 rounded-xl border border-secondary-200 bg-white px-3 py-2 text-sm text-secondary-900 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
                            onChange={event =>
                              updateTermForm(rule.ruleId, {
                                direction: event.target
                                  .value as AiSafetyTermDirection,
                              })
                            }
                            value={form.direction}
                          >
                            {AI_SAFETY_TERM_DIRECTIONS.map(direction => (
                              <option key={direction} value={direction}>
                                {directionLabel(direction)}
                              </option>
                            ))}
                          </select>
                          <button
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
                            disabled={
                              ruleActionStates[rule.ruleId] === 'saving' ||
                              form.termText.trim().length === 0
                            }
                            onClick={() => void addSafetyTerm(rule)}
                            type="button"
                          >
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            {ta('ai.addTerm')}
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
                            {ruleActionStates[rule.ruleId] === 'saving'
                              ? tc('saving')
                              : ruleActionStates[rule.ruleId] === 'saved'
                                ? ta('saved')
                                : ruleActionStates[rule.ruleId] === 'error'
                                  ? ta('ai.rowSaveError')
                                  : ta('ai.safetyRulesHint')}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary-200 bg-white px-3 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                              disabled={
                                selectedTerms.length === 0 ||
                                ruleActionStates[rule.ruleId] === 'saving'
                              }
                              onClick={event =>
                                void removeSelectedSafetyTerms(rule, event)
                              }
                              type="button"
                            >
                              <CircleMinus
                                aria-hidden="true"
                                className="h-4 w-4"
                              />
                              {ta('ai.removeSelectedTerms')}
                            </button>
                            <button
                              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary-200 bg-white px-3 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                              disabled={
                                ruleActionStates[rule.ruleId] === 'saving'
                              }
                              onClick={event =>
                                void restoreRuleDefaults(rule, event)
                              }
                              type="button"
                            >
                              <RotateCcw
                                aria-hidden="true"
                                className="h-4 w-4"
                              />
                              {ta('ai.restoreRuleDefaults')}
                            </button>
                          </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-secondary-200 bg-white dark:border-secondary-700 dark:bg-secondary-900">
                          <table className="min-w-full divide-y divide-secondary-200 text-sm dark:divide-secondary-700">
                            <thead className="bg-secondary-50 text-xs uppercase text-secondary-500 dark:bg-secondary-950 dark:text-secondary-400">
                              <tr>
                                <th className="w-12 px-3 py-2 text-left">
                                  <span className="sr-only">
                                    {ta('ai.selectTerm')}
                                  </span>
                                </th>
                                <th className="px-3 py-2 text-left">
                                  {ta('ai.termText')}
                                </th>
                                <th className="px-3 py-2 text-left">
                                  {ta('ai.direction')}
                                </th>
                                <th className="px-3 py-2 text-left">
                                  {ta('ai.standard')}
                                </th>
                                <th className="px-3 py-2 text-left">
                                  {ta('ai.active')}
                                </th>
                                <th className="px-3 py-2 text-left">
                                  {ta('ai.status')}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
                              {AI_SAFETY_TERM_GROUPS.flatMap(termType => {
                                const terms = rule.terms.filter(
                                  term => term.termType === termType,
                                )
                                if (terms.length === 0) return []
                                return [
                                  <tr
                                    className="bg-secondary-50/70 dark:bg-secondary-950/50"
                                    key={`${rule.ruleId}-${termType}-heading`}
                                  >
                                    <td
                                      className="px-3 py-2 text-xs font-semibold uppercase text-secondary-500 dark:text-secondary-400"
                                      colSpan={6}
                                    >
                                      {termGroupLabel(termType)}
                                    </td>
                                  </tr>,
                                  ...terms.map(term => (
                                    <tr key={term.id}>
                                      <td className="px-3 py-2 text-center align-middle">
                                        {/* WCAG 2.5.8 target-size exception: spacing —
                                            24 CSS-pixel circles around term-selection checkboxes do not intersect; verified by ai-settings.spec.ts. */}
                                        <input
                                          aria-label={ta('ai.selectTermNamed', {
                                            term: term.termText,
                                          })}
                                          checked={selectedTermIds.has(term.id)}
                                          className="h-4 w-4"
                                          onChange={event =>
                                            toggleSelectedTerm(
                                              term.id,
                                              event.target.checked,
                                            )
                                          }
                                          type="checkbox"
                                        />
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-secondary-900 dark:text-secondary-100">
                                            {term.termText}
                                          </span>
                                          {termHasStandardDeviation(term) ? (
                                            <CircleAlert
                                              aria-label={ta(
                                                'ai.standardDeviation',
                                              )}
                                              className="h-4 w-4 text-amber-600 dark:text-amber-300"
                                            />
                                          ) : null}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2">
                                        <select
                                          aria-label={ta(
                                            'ai.directionForTerm',
                                            {
                                              term: term.termText,
                                            },
                                          )}
                                          className="min-h-10 rounded-lg border border-secondary-200 bg-white px-2 py-1 text-sm text-secondary-900 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
                                          disabled={
                                            termRowStates[term.id] === 'saving'
                                          }
                                          onChange={event =>
                                            void updateSafetyTerm(term, {
                                              direction: event.target
                                                .value as AiSafetyTermDirection,
                                            })
                                          }
                                          value={term.direction}
                                        >
                                          {AI_SAFETY_TERM_DIRECTIONS.map(
                                            direction => (
                                              <option
                                                key={direction}
                                                value={direction}
                                              >
                                                {directionLabel(direction)}
                                              </option>
                                            ),
                                          )}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className="rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-medium text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                                          {term.isStandard
                                            ? tc('yes')
                                            : ta('ai.customTerm')}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <label className="inline-flex items-center gap-2">
                                          <input
                                            checked={term.isActive}
                                            disabled={
                                              termRowStates[term.id] ===
                                              'saving'
                                            }
                                            onChange={event =>
                                              void updateSafetyTerm(term, {
                                                isActive: event.target.checked,
                                              })
                                            }
                                            type="checkbox"
                                          />
                                          <span className="text-xs text-secondary-600 dark:text-secondary-300">
                                            {term.isActive
                                              ? ta('ai.active')
                                              : ta('ai.inactive')}
                                          </span>
                                        </label>
                                      </td>
                                      <td className="px-3 py-2 text-xs font-medium text-secondary-500 dark:text-secondary-400">
                                        {termRowStates[term.id] === 'saving'
                                          ? tc('saving')
                                          : termRowStates[term.id] === 'saved'
                                            ? ta('saved')
                                            : termRowStates[term.id] === 'error'
                                              ? ta('ai.rowSaveError')
                                              : ''}
                                      </td>
                                    </tr>
                                  )),
                                ]
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-secondary-950 dark:text-secondary-50">
              {ta('ai.mcpInterfaceTitle')}
            </h3>
            <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
              {ta('ai.mcpInterfaceDescription')}
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <label
                      className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
                      htmlFor={mcpLimitId}
                    >
                      {ta('ai.mcpMaxRequestLimit')}
                    </label>
                    <FieldHelpButton
                      controls={mcpLimitHelpId}
                      expanded={isMcpLimitHelpOpen}
                      label={`${tc('help')}: ${ta('ai.mcpMaxRequestLimit')}`}
                      onClick={() => setIsMcpLimitHelpOpen(open => !open)}
                    />
                  </div>
                  <AnimatedHelpPanel
                    id={mcpLimitHelpId}
                    isOpen={isMcpLimitHelpOpen}
                  >
                    {ta('ai.fieldHelp.mcpMaxRequestLimit')}
                  </AnimatedHelpPanel>
                  <p className="mt-2 text-xs font-medium text-secondary-500 dark:text-secondary-400">
                    {ta('ai.mcpMaxRequestLimitCurrent', {
                      value: formatMcpRequestLimit(
                        settings.mcpMaxRequestBytes,
                        locale,
                      ),
                    })}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <div className="flex min-h-11 items-center overflow-hidden rounded-full border border-secondary-200 bg-white text-sm font-medium text-secondary-800 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100">
                    <button
                      aria-label={ta('ai.decreaseMcpMaxRequestLimit')}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center border-r border-secondary-200 transition-colors hover:bg-secondary-100 disabled:opacity-50 dark:border-secondary-700 dark:hover:bg-secondary-800"
                      disabled={
                        isLoading ||
                        isSettingSaving('mcpMaxRequestBytes') ||
                        settings.mcpMaxRequestBytes <=
                          MIN_ALLOWED_MCP_REQUEST_BYTES
                      }
                      onClick={() =>
                        updateMcpMaxRequestBytes(
                          addMcpMaxRequestBytesSteps(
                            settings.mcpMaxRequestBytes,
                            -1,
                          ),
                        )
                      }
                      type="button"
                    >
                      <CircleMinus aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <input
                      aria-describedby={`${mcpLimitHelpId} ${mcpLimitConstraintId}`}
                      className="h-11 w-24 border-0 bg-transparent px-3 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500"
                      disabled={
                        isLoading || isSettingSaving('mcpMaxRequestBytes')
                      }
                      id={mcpLimitId}
                      inputMode="numeric"
                      max={MAX_ALLOWED_MCP_REQUEST_BYTES / 1024}
                      min={Number(
                        formatMcpRequestPayloadKiB(
                          MIN_ALLOWED_MCP_REQUEST_BYTES,
                        ),
                      )}
                      onBlur={event => {
                        commitMcpMaxRequestBytesInput(event.currentTarget.value)
                      }}
                      onChange={event => {
                        setMcpLimitInputKiB(event.target.value)
                        setSettingSaveState('mcpMaxRequestBytes', 'idle')
                        setMessage(null)
                      }}
                      onKeyDown={event => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        commitMcpMaxRequestBytesInput(event.currentTarget.value)
                      }}
                      step={MCP_REQUEST_PAYLOAD_STEP_KIB}
                      type="number"
                      value={mcpLimitInputKiB}
                    />
                    <span className="px-2 text-xs text-secondary-500 dark:text-secondary-400">
                      KiB
                    </span>
                    <button
                      aria-label={ta('ai.increaseMcpMaxRequestLimit')}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center border-l border-secondary-200 transition-colors hover:bg-secondary-100 disabled:opacity-50 dark:border-secondary-700 dark:hover:bg-secondary-800"
                      disabled={
                        isLoading ||
                        isSettingSaving('mcpMaxRequestBytes') ||
                        settings.mcpMaxRequestBytes >=
                          MAX_ALLOWED_MCP_REQUEST_BYTES
                      }
                      onClick={() =>
                        updateMcpMaxRequestBytes(
                          addMcpMaxRequestBytesSteps(
                            settings.mcpMaxRequestBytes,
                            1,
                          ),
                        )
                      }
                      type="button"
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                  <p
                    className="max-w-xs text-xs text-secondary-500 dark:text-secondary-400 sm:text-right"
                    id={mcpLimitConstraintId}
                  >
                    {mcpLimitConstraintText}
                  </p>
                </div>
              </div>
              {settingSaveStates.mcpMaxRequestBytes !== 'idle' ? (
                <p className="mt-2 text-xs font-medium text-secondary-500 dark:text-secondary-400">
                  {settingSaveStates.mcpMaxRequestBytes === 'saving'
                    ? tc('saving')
                    : settingSaveStates.mcpMaxRequestBytes === 'saved'
                      ? ta('saved')
                      : ta('ai.rowSaveError')}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <label
                      className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
                      htmlFor={mcpImportRowsId}
                    >
                      {ta('ai.mcpImportMaxRows')}
                    </label>
                    <FieldHelpButton
                      controls={mcpImportRowsHelpId}
                      expanded={isMcpImportRowsHelpOpen}
                      label={`${tc('help')}: ${ta('ai.mcpImportMaxRows')}`}
                      onClick={() => setIsMcpImportRowsHelpOpen(open => !open)}
                    />
                  </div>
                  <AnimatedHelpPanel
                    id={mcpImportRowsHelpId}
                    isOpen={isMcpImportRowsHelpOpen}
                  >
                    {ta('ai.fieldHelp.mcpImportMaxRows')}
                  </AnimatedHelpPanel>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <div className="flex min-h-11 items-center overflow-hidden rounded-full border border-secondary-200 bg-white text-sm font-medium text-secondary-800 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100">
                    <input
                      aria-describedby={`${mcpImportRowsHelpId} ${mcpImportRowsConstraintId}`}
                      className="h-11 w-28 border-0 bg-transparent px-3 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500"
                      disabled={
                        isLoading || isSettingSaving('mcpImportMaxRows')
                      }
                      id={mcpImportRowsId}
                      inputMode="numeric"
                      max={MCP_IMPORT_MAX_ROWS_MAX}
                      min={MCP_IMPORT_MAX_ROWS_MIN}
                      onBlur={event => {
                        commitMcpImportMaxRowsInput(event.currentTarget.value)
                      }}
                      onChange={event => {
                        setMcpImportRowsInput(event.target.value)
                        setSettingSaveState('mcpImportMaxRows', 'idle')
                        setMessage(null)
                      }}
                      onKeyDown={event => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        commitMcpImportMaxRowsInput(event.currentTarget.value)
                      }}
                      step={1}
                      type="number"
                      value={mcpImportRowsInput}
                    />
                    <span className="px-3 text-xs text-secondary-500 dark:text-secondary-400">
                      {ta('ai.rows')}
                    </span>
                  </div>
                  <p
                    className="max-w-xs text-xs text-secondary-500 dark:text-secondary-400 sm:text-right"
                    id={mcpImportRowsConstraintId}
                  >
                    {mcpImportRowsConstraintText}
                  </p>
                </div>
              </div>
              {settingSaveStates.mcpImportMaxRows !== 'idle' ? (
                <p className="mt-2 text-xs font-medium text-secondary-500 dark:text-secondary-400">
                  {settingSaveStates.mcpImportMaxRows === 'saving'
                    ? tc('saving')
                    : settingSaveStates.mcpImportMaxRows === 'saved'
                      ? ta('saved')
                      : ta('ai.rowSaveError')}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <label
                      className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
                      htmlFor={mcpImportTtlId}
                    >
                      {ta('ai.mcpImportValidationTtl')}
                    </label>
                    <FieldHelpButton
                      controls={mcpImportTtlHelpId}
                      expanded={isMcpImportTtlHelpOpen}
                      label={`${tc('help')}: ${ta('ai.mcpImportValidationTtl')}`}
                      onClick={() => setIsMcpImportTtlHelpOpen(open => !open)}
                    />
                  </div>
                  <AnimatedHelpPanel
                    id={mcpImportTtlHelpId}
                    isOpen={isMcpImportTtlHelpOpen}
                  >
                    {ta('ai.fieldHelp.mcpImportValidationTtl')}
                  </AnimatedHelpPanel>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <div className="flex min-h-11 items-center overflow-hidden rounded-full border border-secondary-200 bg-white text-sm font-medium text-secondary-800 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100">
                    <input
                      aria-describedby={`${mcpImportTtlHelpId} ${mcpImportTtlConstraintId}`}
                      className="h-11 w-28 border-0 bg-transparent px-3 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500"
                      disabled={
                        isLoading ||
                        isSettingSaving('mcpImportValidationTtlMinutes')
                      }
                      id={mcpImportTtlId}
                      inputMode="numeric"
                      max={MCP_IMPORT_VALIDATION_TTL_MAX_MINUTES}
                      min={MCP_IMPORT_VALIDATION_TTL_MIN_MINUTES}
                      onBlur={event => {
                        commitMcpImportValidationTtlInput(
                          event.currentTarget.value,
                        )
                      }}
                      onChange={event => {
                        setMcpImportTtlInputMinutes(event.target.value)
                        setSettingSaveState(
                          'mcpImportValidationTtlMinutes',
                          'idle',
                        )
                        setMessage(null)
                      }}
                      onKeyDown={event => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        commitMcpImportValidationTtlInput(
                          event.currentTarget.value,
                        )
                      }}
                      step={1}
                      type="number"
                      value={mcpImportTtlInputMinutes}
                    />
                    <span className="px-3 text-xs text-secondary-500 dark:text-secondary-400">
                      {ta('ai.minutes')}
                    </span>
                  </div>
                  <p
                    className="max-w-xs text-xs text-secondary-500 dark:text-secondary-400 sm:text-right"
                    id={mcpImportTtlConstraintId}
                  >
                    {mcpImportTtlConstraintText}
                  </p>
                </div>
              </div>
              {settingSaveStates.mcpImportValidationTtlMinutes !== 'idle' ? (
                <p className="mt-2 text-xs font-medium text-secondary-500 dark:text-secondary-400">
                  {settingSaveStates.mcpImportValidationTtlMinutes === 'saving'
                    ? tc('saving')
                    : settingSaveStates.mcpImportValidationTtlMinutes ===
                        'saved'
                      ? ta('saved')
                      : ta('ai.rowSaveError')}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
