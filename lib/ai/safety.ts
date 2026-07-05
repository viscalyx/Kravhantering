import {
  recordSecurityEvent,
  type SecurityEventName,
  type SecurityEventRequest,
} from '@/lib/auth/audit'
import {
  type ActiveAiSafetyRule,
  type ActiveAiSafetyRuleSet,
  type ActiveAiSafetyRuleTerm,
  type AiSafetyRuleId,
  type AiSafetyTermType,
  getCachedAiSafetyRuleSet,
} from '@/lib/dal/ai-safety-rules'
import { getCachedAiSafetyRuntimeSettings } from '@/lib/dal/ai-settings'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'

export type { AiSafetyRuleId } from '@/lib/dal/ai-safety-rules'

export type AiSafetyDirection = 'input' | 'output'

export type AiSafetyBlockedStep =
  | 'ai_request_input'
  | 'final_model_output'
  | 'repair_input'
  | 'repaired_model_output'
  | 'streamed_reasoning'

export interface AiSafetyDecision {
  allowed: boolean
  categories: readonly string[]
  primaryRuleId: AiSafetyRuleId | null
  primaryRuleType: string | null
  ruleIds: readonly AiSafetyRuleId[]
  ruleTypes: readonly string[]
  textLength: number
}

export interface AiSafetyScreenPart {
  label: string
  text: string
}

export interface AiSafetyForensicTriggerTerm {
  configuredTerm: string
  matchedText: string
  termType: AiSafetyTermType
}

export interface AiSafetyForensicEvidence {
  partLabel: string
  patternKind: ActiveAiSafetyRule['patternKind']
  ruleId: AiSafetyRuleId
  terms: readonly AiSafetyForensicTriggerTerm[]
}

export interface AiSafetyScreeningResult {
  contentParts: readonly AiSafetyScreenPart[]
  decision: AiSafetyDecision
  forensicEvidence: readonly AiSafetyForensicEvidence[]
}

const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g
const UNICODE_WORD_CHAR = String.raw`[\p{L}\p{N}_]`
const AI_SAFETY_BLOCK_REASON = 'ai_safety_rule_match'
const COMBINED_PART_LABEL = 'combined'
const DEFAULT_PAIR_WINDOW_CHARS = 80
const MAX_PAIR_WINDOW_CHARS = 1000

type PairRegexCache = Map<string, RegExp>

const AI_SAFETY_RULE_PRIORITY: readonly AiSafetyRuleId[] = [
  'instruction_override',
  'system_prompt_extraction',
  'encoded_smuggling',
  'secret_extraction_request',
  'harmful_generation_request',
  'sensitive_backend_leak',
]

const AI_SAFETY_RULE_TYPE_NAMES: Record<
  AiSafetyRuleId,
  Record<'en' | 'sv', string>
> = {
  encoded_smuggling: {
    en: 'Prompt injection via encoding and obfuscation',
    sv: 'Promptinjektion via kodning och maskering',
  },
  harmful_generation_request: {
    en: 'Harmful content generation request',
    sv: 'Begäran om skadligt innehåll',
  },
  instruction_override: {
    en: 'Prompt injection: instruction override',
    sv: 'Promptinjektion: instruktionsövertagande',
  },
  secret_extraction_request: {
    en: 'Sensitive information disclosure: secrets',
    sv: 'Känslig informationsutläsning: hemligheter',
  },
  sensitive_backend_leak: {
    en: 'System-adjacent content leakage',
    sv: 'Läckage av systemnära innehåll',
  },
  system_prompt_extraction: {
    en: 'System prompt leakage',
    sv: 'Läckage av systemprompt',
  },
}

function normalizeSafetyText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(ZERO_WIDTH_CHARS, '')
    .replace(/\s+/g, ' ')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function termPattern(termText: string): string {
  const normalized = normalizeSafetyText(termText).trim()
  const escapedParts = normalized.split(' ').filter(Boolean).map(escapeRegExp)
  const pattern = escapedParts.join(String.raw`\s*`)
  const usesOnlyWordAndSpace = /^[\p{L}\p{N}_ ]+$/u.test(normalized)
  if (!usesOnlyWordAndSpace) return pattern
  return `(?<!${UNICODE_WORD_CHAR})${pattern}(?!${UNICODE_WORD_CHAR})`
}

function termsByType(
  rule: ActiveAiSafetyRule,
  direction: AiSafetyDirection,
  termType: ActiveAiSafetyRuleTerm['termType'],
): readonly ActiveAiSafetyRuleTerm[] {
  return rule.terms.filter(
    term =>
      term.termType === termType &&
      (term.direction === 'input_output' || term.direction === direction),
  )
}

function matchTerm(
  text: string,
  term: ActiveAiSafetyRuleTerm,
): readonly string[] {
  const regex = new RegExp(termPattern(term.termText), 'giu')
  return [...text.matchAll(regex)].map(match => match[0])
}

function safePairWindowChars(windowChars: number | null | undefined): number {
  const numeric =
    typeof windowChars === 'number' && Number.isFinite(windowChars)
      ? Math.trunc(windowChars)
      : DEFAULT_PAIR_WINDOW_CHARS
  return Math.min(MAX_PAIR_WINDOW_CHARS, Math.max(0, numeric))
}

function pairRegexCacheKey(
  rule: ActiveAiSafetyRule,
  firstTerm: ActiveAiSafetyRuleTerm,
  secondTerm: ActiveAiSafetyRuleTerm,
  windowChars: number,
): string {
  return JSON.stringify([
    rule.ruleId,
    rule.patternKind,
    windowChars,
    firstTerm.direction,
    firstTerm.termType,
    firstTerm.termText,
    secondTerm.direction,
    secondTerm.termType,
    secondTerm.termText,
  ])
}

function getPairRegex(args: {
  cache: PairRegexCache
  firstTerm: ActiveAiSafetyRuleTerm
  rule: ActiveAiSafetyRule
  secondTerm: ActiveAiSafetyRuleTerm
  windowChars: number
}): RegExp {
  const key = pairRegexCacheKey(
    args.rule,
    args.firstTerm,
    args.secondTerm,
    args.windowChars,
  )
  const cached = args.cache.get(key)
  if (cached) return cached

  const gap = String.raw`[\s\S]{0,${args.windowChars}}`
  const regex = new RegExp(
    `(${termPattern(args.firstTerm.termText)})${gap}(${termPattern(
      args.secondTerm.termText,
    )})`,
    'giu',
  )
  args.cache.set(key, regex)
  return regex
}

function directEvidence(
  text: string,
  rule: ActiveAiSafetyRule,
  terms: readonly ActiveAiSafetyRuleTerm[],
  partLabel: string,
): AiSafetyForensicEvidence[] {
  const evidence: AiSafetyForensicEvidence[] = []
  for (const term of terms) {
    for (const matchedText of matchTerm(text, term)) {
      evidence.push({
        partLabel,
        patternKind: rule.patternKind,
        ruleId: rule.ruleId,
        terms: [
          {
            configuredTerm: term.termText,
            matchedText,
            termType: term.termType,
          },
        ],
      })
    }
  }
  return evidence
}

function pairedEvidenceOneWay(
  text: string,
  rule: ActiveAiSafetyRule,
  firstTerms: readonly ActiveAiSafetyRuleTerm[],
  secondTerms: readonly ActiveAiSafetyRuleTerm[],
  windowChars: number,
  partLabel: string,
  pairRegexCache: PairRegexCache,
): AiSafetyForensicEvidence[] {
  const evidence: AiSafetyForensicEvidence[] = []
  for (const firstTerm of firstTerms) {
    for (const secondTerm of secondTerms) {
      const regex = getPairRegex({
        cache: pairRegexCache,
        firstTerm,
        rule,
        secondTerm,
        windowChars,
      })
      regex.lastIndex = 0
      for (const match of text.matchAll(regex)) {
        const firstMatchedText = match[1]
        const secondMatchedText = match[2]
        if (!firstMatchedText || !secondMatchedText) continue
        evidence.push({
          partLabel,
          patternKind: rule.patternKind,
          ruleId: rule.ruleId,
          terms: [
            {
              configuredTerm: firstTerm.termText,
              matchedText: firstMatchedText,
              termType: firstTerm.termType,
            },
            {
              configuredTerm: secondTerm.termText,
              matchedText: secondMatchedText,
              termType: secondTerm.termType,
            },
          ],
        })
      }
    }
  }
  return evidence
}

function pairedEvidence(
  text: string,
  rule: ActiveAiSafetyRule,
  firstTerms: readonly ActiveAiSafetyRuleTerm[],
  secondTerms: readonly ActiveAiSafetyRuleTerm[],
  windowChars: number,
  partLabel: string,
  pairRegexCache: PairRegexCache,
  bidirectional = false,
): AiSafetyForensicEvidence[] {
  const evidence = pairedEvidenceOneWay(
    text,
    rule,
    firstTerms,
    secondTerms,
    windowChars,
    partLabel,
    pairRegexCache,
  )
  if (!bidirectional) return evidence
  return [
    ...evidence,
    ...pairedEvidenceOneWay(
      text,
      rule,
      secondTerms,
      firstTerms,
      windowChars,
      partLabel,
      pairRegexCache,
    ),
  ]
}

function ruleEvidence(
  rule: ActiveAiSafetyRule,
  text: string,
  direction: AiSafetyDirection,
  partLabel: string,
  pairRegexCache: PairRegexCache,
): AiSafetyForensicEvidence[] {
  const windowChars = safePairWindowChars(rule.windowChars)
  const actions = termsByType(rule, direction, 'action')
  const targets = termsByType(rule, direction, 'target')
  const coding = termsByType(rule, direction, 'coding')
  const directMarkers = termsByType(rule, direction, 'direct_marker')

  switch (rule.ruleId) {
    case 'instruction_override':
      return [
        ...directEvidence(text, rule, directMarkers, partLabel),
        ...pairedEvidence(
          text,
          rule,
          actions,
          targets,
          windowChars,
          partLabel,
          pairRegexCache,
        ),
      ]
    case 'encoded_smuggling':
      return pairedEvidence(
        text,
        rule,
        coding,
        targets,
        windowChars,
        partLabel,
        pairRegexCache,
        true,
      )
    case 'sensitive_backend_leak':
      return directEvidence(text, rule, directMarkers, partLabel)
    case 'harmful_generation_request':
    case 'secret_extraction_request':
    case 'system_prompt_extraction':
      return pairedEvidence(
        text,
        rule,
        actions,
        targets,
        windowChars,
        partLabel,
        pairRegexCache,
      )
  }
}

function unique<T extends string>(values: Iterable<T>): readonly T[] {
  return [...new Set(values)]
}

function rulePriority(ruleId: AiSafetyRuleId): number {
  const index = AI_SAFETY_RULE_PRIORITY.indexOf(ruleId)
  return index === -1 ? AI_SAFETY_RULE_PRIORITY.length : index
}

function sortRuleIdsByPriority(
  ruleIds: Iterable<AiSafetyRuleId>,
): readonly AiSafetyRuleId[] {
  return [...new Set(ruleIds)].sort(
    (left, right) => rulePriority(left) - rulePriority(right),
  )
}

export function getAiSafetyRuleTypeName(
  ruleId: AiSafetyRuleId,
  locale: 'en' | 'sv',
): string {
  return AI_SAFETY_RULE_TYPE_NAMES[ruleId][locale]
}

function forensicEvidenceKey(evidence: AiSafetyForensicEvidence): string {
  return JSON.stringify({
    partLabel: evidence.partLabel,
    ruleId: evidence.ruleId,
    terms: evidence.terms,
  })
}

function dedupeForensicEvidence(
  evidence: readonly AiSafetyForensicEvidence[],
): readonly AiSafetyForensicEvidence[] {
  const seen = new Set<string>()
  const out: AiSafetyForensicEvidence[] = []
  for (const item of evidence) {
    const key = forensicEvidenceKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function normalizeScreenParts(
  parts: readonly AiSafetyScreenPart[],
): readonly AiSafetyScreenPart[] {
  return parts
    .filter(part => part.text.length > 0)
    .map(part => ({
      label: part.label,
      text: normalizeSafetyText(part.text),
    }))
}

function labeledPartsFromStrings(
  textParts: readonly string[],
): readonly AiSafetyScreenPart[] {
  return textParts.map((text, index) => ({
    label: `part${index + 1}`,
    text,
  }))
}

function collectEvidence(
  ruleSet: ActiveAiSafetyRuleSet,
  direction: AiSafetyDirection,
  normalizedParts: readonly AiSafetyScreenPart[],
): readonly AiSafetyForensicEvidence[] {
  const evidence: AiSafetyForensicEvidence[] = []
  const pairRegexCache: PairRegexCache = new Map()
  for (const part of normalizedParts) {
    for (const rule of ruleSet.rules) {
      evidence.push(
        ...ruleEvidence(rule, part.text, direction, part.label, pairRegexCache),
      )
    }
  }

  if (normalizedParts.length > 1) {
    const matchedRuleIds = new Set(evidence.map(item => item.ruleId))
    const combinedText = normalizedParts.map(part => part.text).join('\n\n')
    for (const rule of ruleSet.rules) {
      if (matchedRuleIds.has(rule.ruleId)) continue
      evidence.push(
        ...ruleEvidence(
          rule,
          combinedText,
          direction,
          COMBINED_PART_LABEL,
          pairRegexCache,
        ),
      )
    }
  }

  return dedupeForensicEvidence(evidence)
}

function decisionFromEvidence(args: {
  evidence: readonly AiSafetyForensicEvidence[]
  ruleSet: ActiveAiSafetyRuleSet
  textLength: number
}): AiSafetyDecision {
  const rulesById = new Map(args.ruleSet.rules.map(rule => [rule.ruleId, rule]))
  const ruleIds = sortRuleIdsByPriority(args.evidence.map(item => item.ruleId))
  const primaryRuleId = ruleIds[0] ?? null
  const ruleTypes = ruleIds.map(ruleId => getAiSafetyRuleTypeName(ruleId, 'en'))
  return {
    allowed: ruleIds.length === 0,
    categories: unique(
      ruleIds.flatMap(ruleId => {
        const category = rulesById.get(ruleId)?.category
        return category ? [category] : []
      }),
    ),
    primaryRuleId,
    primaryRuleType: primaryRuleId
      ? getAiSafetyRuleTypeName(primaryRuleId, 'en')
      : null,
    ruleIds,
    ruleTypes,
    textLength: args.textLength,
  }
}

function screenLabeledTextParts(
  ruleSet: ActiveAiSafetyRuleSet,
  direction: AiSafetyDirection,
  textParts: readonly AiSafetyScreenPart[],
): AiSafetyScreeningResult {
  const contentParts = textParts.filter(part => part.text.length > 0)
  const normalizedParts = normalizeScreenParts(contentParts)
  const normalizedText = normalizedParts.map(part => part.text).join('\n\n')
  const forensicEvidence = collectEvidence(ruleSet, direction, normalizedParts)
  return {
    contentParts,
    decision: decisionFromEvidence({
      evidence: forensicEvidence,
      ruleSet,
      textLength: normalizedText.length,
    }),
    forensicEvidence,
  }
}

export function screenAiInputWithRuleSet(
  ruleSet: ActiveAiSafetyRuleSet,
  textParts: readonly string[],
): AiSafetyDecision {
  return screenAiInputDetailedWithRuleSet(
    ruleSet,
    labeledPartsFromStrings(textParts),
  ).decision
}

export function screenAiOutputWithRuleSet(
  ruleSet: ActiveAiSafetyRuleSet,
  textParts: readonly string[],
): AiSafetyDecision {
  return screenAiOutputDetailedWithRuleSet(
    ruleSet,
    labeledPartsFromStrings(textParts),
  ).decision
}

export function screenAiInputDetailedWithRuleSet(
  ruleSet: ActiveAiSafetyRuleSet,
  textParts: readonly AiSafetyScreenPart[],
): AiSafetyScreeningResult {
  return screenLabeledTextParts(ruleSet, 'input', textParts)
}

export function screenAiOutputDetailedWithRuleSet(
  ruleSet: ActiveAiSafetyRuleSet,
  textParts: readonly AiSafetyScreenPart[],
): AiSafetyScreeningResult {
  return screenLabeledTextParts(ruleSet, 'output', textParts)
}

export async function screenAiInput(
  db: SqlServerDatabase,
  textParts: readonly string[],
): Promise<AiSafetyDecision> {
  return screenAiInputWithRuleSet(await getCachedAiSafetyRuleSet(db), textParts)
}

export async function screenAiInputDetailed(
  db: SqlServerDatabase,
  textParts: readonly AiSafetyScreenPart[],
): Promise<AiSafetyScreeningResult> {
  return screenAiInputDetailedWithRuleSet(
    await getCachedAiSafetyRuleSet(db),
    textParts,
  )
}

export async function screenAiOutput(
  db: SqlServerDatabase,
  textParts: readonly string[],
): Promise<AiSafetyDecision> {
  return screenAiOutputWithRuleSet(
    await getCachedAiSafetyRuleSet(db),
    textParts,
  )
}

export async function screenAiOutputDetailed(
  db: SqlServerDatabase,
  textParts: readonly AiSafetyScreenPart[],
): Promise<AiSafetyScreeningResult> {
  return screenAiOutputDetailedWithRuleSet(
    await getCachedAiSafetyRuleSet(db),
    textParts,
  )
}

function textLengthBucket(textLength: number): string {
  if (textLength <= 1000) return '0-1k'
  if (textLength <= 4000) return '1k-4k'
  if (textLength <= 16000) return '4k-16k'
  return '16k+'
}

function requestForForensicEvent(
  context: RequestContext,
  request: Request,
): SecurityEventRequest {
  if (context.request) return context.request
  let path = ''
  try {
    path = new URL(request.url).pathname
  } catch {
    path = request.url.split(/[?#]/, 1)[0] ?? ''
  }
  return {
    method: request.method,
    path,
    requestId: context.requestId,
  }
}

function forensicEventName(
  event: Extract<
    SecurityEventName,
    'ai.input_safety.blocked' | 'ai.output_safety.blocked'
  >,
) {
  return event === 'ai.input_safety.blocked'
    ? 'ai.input_safety.blocked_content_captured'
    : 'ai.output_safety.blocked_content_captured'
}

function safeForensicLogString(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

export function recordAiSafetyDecision(args: {
  blockedStep?: AiSafetyBlockedStep
  context: RequestContext
  decision: AiSafetyDecision
  direction?: AiSafetyDirection
  eventId?: string
  event: Extract<
    SecurityEventName,
    'ai.input_safety.blocked' | 'ai.output_safety.blocked'
  >
  model?: string
  operation: string
  provider?: string
  request: Request
}): string {
  const eventId = args.eventId ?? crypto.randomUUID()
  const direction =
    args.direction ??
    (args.event === 'ai.input_safety.blocked' ? 'input' : 'output')
  recordSecurityEvent({
    actor: {
      source: args.context.actor.source,
      ...(args.context.actor.id ? { sub: args.context.actor.id } : {}),
    },
    detail: {
      eventId,
      blockedStep: args.blockedStep ?? 'ai_request_input',
      categories: args.decision.categories,
      correlationId: args.context.correlationId,
      decision: 'blocked',
      operation: args.operation,
      primaryRuleId: args.decision.primaryRuleId ?? '',
      primaryRuleType: args.decision.primaryRuleType ?? '',
      reason: AI_SAFETY_BLOCK_REASON,
      requestId: args.context.requestId,
      ruleIds: args.decision.ruleIds,
      ruleTypes: args.decision.ruleTypes,
      safetyRuleDirection: direction,
      source: args.context.source,
      textLengthBucket: textLengthBucket(args.decision.textLength),
      ...(args.model ? { model: args.model } : {}),
      ...(args.provider ? { provider: args.provider } : {}),
    },
    event: args.event,
    outcome: 'failure',
    request: args.context.request ?? args.request,
  })
  return eventId
}

function recordAiSafetyForensicEvent(args: {
  blockedStep: AiSafetyBlockedStep
  context: RequestContext
  direction: AiSafetyDirection
  event: Extract<
    SecurityEventName,
    'ai.input_safety.blocked' | 'ai.output_safety.blocked'
  >
  eventId: string
  model?: string
  operation: string
  provider?: string
  request: Request
  screening: AiSafetyScreeningResult
}): void {
  try {
    const request = requestForForensicEvent(args.context, args.request)
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        actor: {
          source: args.context.actor.source,
          ...(args.context.actor.id ? { sub: args.context.actor.id } : {}),
        },
        blockedStep: args.blockedStep,
        channel: 'security-forensics',
        content: args.screening.contentParts,
        correlationId: args.context.correlationId,
        detail: {
          blockedStep: args.blockedStep,
          categories: args.screening.decision.categories,
          correlationId: args.context.correlationId,
          decision: 'blocked',
          eventId: args.eventId,
          operation: args.operation,
          primaryRuleId: args.screening.decision.primaryRuleId,
          primaryRuleType: args.screening.decision.primaryRuleType,
          reason: AI_SAFETY_BLOCK_REASON,
          requestId: args.context.requestId,
          ruleIds: args.screening.decision.ruleIds,
          ruleTypes: args.screening.decision.ruleTypes,
          safetyRuleDirection: args.direction,
          source: args.context.source,
          textLengthBucket: textLengthBucket(
            args.screening.decision.textLength,
          ),
          ...(args.model ? { model: args.model } : {}),
          ...(args.provider ? { provider: args.provider } : {}),
        },
        event: forensicEventName(args.event),
        eventId: args.eventId,
        evidence: args.screening.forensicEvidence,
        operation: args.operation,
        outcome: 'failure',
        primaryRuleId: args.screening.decision.primaryRuleId,
        primaryRuleType: args.screening.decision.primaryRuleType,
        request,
        requestId: args.context.requestId,
        ruleIds: args.screening.decision.ruleIds,
        ruleTypes: args.screening.decision.ruleTypes,
        safetyRuleDirection: args.direction,
        ts: new Date().toISOString(),
      }),
    )
  } catch (error) {
    try {
      // eslint-disable-next-line no-console
      console.error(
        '[security-forensics] failed to record AI safety blocked content',
        safeForensicLogString(error),
      )
    } catch {
      /* best-effort forensic logging must not break the request */
    }
  }
}

export async function recordAiSafetyBlock(args: {
  blockedStep: AiSafetyBlockedStep
  context: RequestContext
  db: SqlServerDatabase
  direction: AiSafetyDirection
  event: Extract<
    SecurityEventName,
    'ai.input_safety.blocked' | 'ai.output_safety.blocked'
  >
  model?: string
  operation: string
  provider?: string
  request: Request
  screening: AiSafetyScreeningResult
}): Promise<void> {
  const eventId = recordAiSafetyDecision({
    blockedStep: args.blockedStep,
    context: args.context,
    decision: args.screening.decision,
    direction: args.direction,
    event: args.event,
    model: args.model,
    operation: args.operation,
    provider: args.provider,
    request: args.request,
  })

  try {
    const settings = await getCachedAiSafetyRuntimeSettings(args.db)
    if (!settings.aiSafetyForensicLoggingEnabled) return
    recordAiSafetyForensicEvent({
      blockedStep: args.blockedStep,
      context: args.context,
      direction: args.direction,
      event: args.event,
      eventId,
      model: args.model,
      operation: args.operation,
      provider: args.provider,
      request: args.request,
      screening: args.screening,
    })
  } catch (error) {
    try {
      // eslint-disable-next-line no-console
      console.error(
        '[security-forensics] failed to load AI safety runtime settings',
        safeForensicLogString(error),
      )
    } catch {
      /* best-effort forensic logging must not break the request */
    }
  }
}

export function recordAiSafetyFilterFailure(args: {
  context: RequestContext
  error: unknown
  operation: string
  request: Request
}): void {
  const errorName = args.error instanceof Error ? args.error.name : 'Error'
  recordSecurityEvent({
    actor: {
      source: args.context.actor.source,
      ...(args.context.actor.id ? { sub: args.context.actor.id } : {}),
    },
    detail: {
      correlationId: args.context.correlationId,
      decision: 'failed',
      errorName,
      operation: args.operation,
      requestId: args.context.requestId,
      source: args.context.source,
    },
    event: 'ai.safety_filter.failed',
    outcome: 'failure',
    request: args.context.request ?? args.request,
  })
}
