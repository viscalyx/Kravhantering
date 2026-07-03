import { recordSecurityEvent, type SecurityEventName } from '@/lib/auth/audit'
import {
  type ActiveAiSafetyRule,
  type ActiveAiSafetyRuleSet,
  type ActiveAiSafetyRuleTerm,
  type AiSafetyRuleId,
  getCachedAiSafetyRuleSet,
} from '@/lib/dal/ai-safety-rules'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'

export type { AiSafetyRuleId } from '@/lib/dal/ai-safety-rules'

export interface AiSafetyDecision {
  allowed: boolean
  categories: readonly string[]
  ruleIds: readonly AiSafetyRuleId[]
  textLength: number
}

const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g
const UNICODE_WORD_CHAR = String.raw`[\p{L}\p{N}_]`

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

function alternationPattern(terms: readonly ActiveAiSafetyRuleTerm[]): string {
  return terms.map(term => termPattern(term.termText)).join('|')
}

function termsByType(
  rule: ActiveAiSafetyRule,
  direction: 'input' | 'output',
  termType: ActiveAiSafetyRuleTerm['termType'],
): readonly ActiveAiSafetyRuleTerm[] {
  return rule.terms.filter(
    term =>
      term.termType === termType &&
      (term.direction === 'input_output' || term.direction === direction),
  )
}

function directMatch(
  text: string,
  terms: readonly ActiveAiSafetyRuleTerm[],
): boolean {
  const alternation = alternationPattern(terms)
  return alternation.length > 0
    ? new RegExp(`(?:${alternation})`, 'iu').test(text)
    : false
}

function pairedMatch(
  text: string,
  firstTerms: readonly ActiveAiSafetyRuleTerm[],
  secondTerms: readonly ActiveAiSafetyRuleTerm[],
  windowChars: number,
  bidirectional = false,
): boolean {
  const first = alternationPattern(firstTerms)
  const second = alternationPattern(secondTerms)
  if (!first || !second) return false
  const gap = String.raw`[\s\S]{0,${windowChars}}`
  const forward = new RegExp(`(?:${first})${gap}(?:${second})`, 'iu')
  if (forward.test(text)) return true
  if (!bidirectional) return false
  return new RegExp(`(?:${second})${gap}(?:${first})`, 'iu').test(text)
}

function ruleMatches(
  rule: ActiveAiSafetyRule,
  text: string,
  direction: 'input' | 'output',
): boolean {
  const windowChars = rule.windowChars ?? 80
  const actions = termsByType(rule, direction, 'action')
  const targets = termsByType(rule, direction, 'target')
  const coding = termsByType(rule, direction, 'coding')
  const directMarkers = termsByType(rule, direction, 'direct_marker')

  switch (rule.ruleId) {
    case 'instruction_override':
      return (
        directMatch(text, directMarkers) ||
        pairedMatch(text, actions, targets, windowChars)
      )
    case 'encoded_smuggling':
      return pairedMatch(text, coding, targets, windowChars, true)
    case 'sensitive_backend_leak':
      return directMatch(text, directMarkers)
    case 'harmful_generation_request':
    case 'secret_extraction_request':
    case 'system_prompt_extraction':
      return pairedMatch(text, actions, targets, windowChars)
  }
}

function uniqueSorted<T extends string>(values: Iterable<T>): readonly T[] {
  return [...new Set(values)].sort()
}

function screenTextParts(
  ruleSet: ActiveAiSafetyRuleSet,
  direction: 'input' | 'output',
  textParts: readonly string[],
): AiSafetyDecision {
  const text = normalizeSafetyText(textParts.filter(Boolean).join('\n\n'))
  const matches = ruleSet.rules.filter(rule =>
    ruleMatches(rule, text, direction),
  )
  const ruleIds = uniqueSorted(matches.map(match => match.ruleId))
  return {
    allowed: ruleIds.length === 0,
    categories: uniqueSorted(matches.map(match => match.category)),
    ruleIds,
    textLength: text.length,
  }
}

export function screenAiInputWithRuleSet(
  ruleSet: ActiveAiSafetyRuleSet,
  textParts: readonly string[],
): AiSafetyDecision {
  return screenTextParts(ruleSet, 'input', textParts)
}

export function screenAiOutputWithRuleSet(
  ruleSet: ActiveAiSafetyRuleSet,
  textParts: readonly string[],
): AiSafetyDecision {
  return screenTextParts(ruleSet, 'output', textParts)
}

export async function screenAiInput(
  db: SqlServerDatabase,
  textParts: readonly string[],
): Promise<AiSafetyDecision> {
  return screenAiInputWithRuleSet(await getCachedAiSafetyRuleSet(db), textParts)
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

function textLengthBucket(textLength: number): string {
  if (textLength <= 1000) return '0-1k'
  if (textLength <= 4000) return '1k-4k'
  if (textLength <= 16000) return '4k-16k'
  return '16k+'
}

export function recordAiSafetyDecision(args: {
  context: RequestContext
  decision: AiSafetyDecision
  event: Extract<
    SecurityEventName,
    'ai.input_safety.blocked' | 'ai.output_safety.blocked'
  >
  model?: string
  operation: string
  provider?: string
  request: Request
}): void {
  recordSecurityEvent({
    actor: {
      source: args.context.actor.source,
      ...(args.context.actor.id ? { sub: args.context.actor.id } : {}),
    },
    detail: {
      categories: args.decision.categories,
      correlationId: args.context.correlationId,
      decision: 'blocked',
      operation: args.operation,
      requestId: args.context.requestId,
      ruleIds: args.decision.ruleIds,
      source: args.context.source,
      textLengthBucket: textLengthBucket(args.decision.textLength),
      ...(args.model ? { model: args.model } : {}),
      ...(args.provider ? { provider: args.provider } : {}),
    },
    event: args.event,
    outcome: 'failure',
    request: args.context.request ?? args.request,
  })
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
