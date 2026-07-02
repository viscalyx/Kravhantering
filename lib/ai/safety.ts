import { recordSecurityEvent, type SecurityEventName } from '@/lib/auth/audit'
import type { RequestContext } from '@/lib/requirements/auth'

export type AiSafetyRuleId =
  | 'encoded_smuggling'
  | 'harmful_generation_request'
  | 'instruction_override'
  | 'secret_extraction_request'
  | 'sensitive_backend_leak'
  | 'system_prompt_extraction'

export interface AiSafetyDecision {
  allowed: boolean
  categories: readonly string[]
  ruleIds: readonly AiSafetyRuleId[]
  textLength: number
}

interface AiSafetyRule {
  category: string
  id: AiSafetyRuleId
  test: (text: string) => boolean
}

const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g

const INSTRUCTION_OVERRIDE_RULE: AiSafetyRule = {
  category: 'prompt_injection',
  id: 'instruction_override',
  test: text =>
    /\b(?:ignore|disregard|forget|override)\b.{0,120}\b(?:previous|above|earlier|all|system|developer|policy|instructions?)\b/i.test(
      text,
    ) ||
    /\b(?:you are now|developer mode|jailbreak|do anything now|unfiltered mode)\b/i.test(
      text,
    ),
}

const SYSTEM_PROMPT_EXTRACTION_RULE: AiSafetyRule = {
  category: 'prompt_extraction',
  id: 'system_prompt_extraction',
  test: text =>
    /\b(?:show|reveal|print|dump|exfiltrate|leak|return)\b.{0,120}\b(?:system prompt|developer message|hidden instructions?|internal instructions?|prompt template|backend prompt)\b/i.test(
      text,
    ),
}

const ENCODED_SMUGGLING_RULE: AiSafetyRule = {
  category: 'encoded_smuggling',
  id: 'encoded_smuggling',
  test: text =>
    /\b(?:base64|rot13|hex|unicode|decode|encoded)\b.{0,160}\b(?:ignore|system prompt|developer message|hidden instructions?|jailbreak|bypass)\b/i.test(
      text,
    ) ||
    /\b(?:ignore|system prompt|developer message|hidden instructions?|jailbreak|bypass)\b.{0,160}\b(?:base64|rot13|hex|unicode|decode|encoded)\b/i.test(
      text,
    ),
}

const SECRET_EXTRACTION_RULE: AiSafetyRule = {
  category: 'secret_extraction',
  id: 'secret_extraction_request',
  test: text =>
    /\b(?:show|print|reveal|return|include|exfiltrate)\b.{0,120}\b(?:api key|bearer token|authorization header|jwt|password|secret|openrouter key)\b/i.test(
      text,
    ),
}

const HARMFUL_GENERATION_RULE: AiSafetyRule = {
  category: 'harmful_content',
  id: 'harmful_generation_request',
  test: text =>
    /\b(?:write|create|generate|build|provide|help)\b.{0,120}\b(?:malware|ransomware|phishing|credential theft|steal credentials|keylogger|exploit code)\b/i.test(
      text,
    ),
}

const SENSITIVE_BACKEND_LEAK_RULE: AiSafetyRule = {
  category: 'backend_leakage',
  id: 'sensitive_backend_leak',
  test: text =>
    /\b(?:authorization:\s*bearer|sk-or-v1-|employeeHsaId|begin system prompt|begin developer message|<\|system\|>|system prompt:\s*["'])/i.test(
      text,
    ),
}

const INPUT_RULES: readonly AiSafetyRule[] = [
  INSTRUCTION_OVERRIDE_RULE,
  SYSTEM_PROMPT_EXTRACTION_RULE,
  ENCODED_SMUGGLING_RULE,
  SECRET_EXTRACTION_RULE,
  HARMFUL_GENERATION_RULE,
]

const OUTPUT_RULES: readonly AiSafetyRule[] = [
  INSTRUCTION_OVERRIDE_RULE,
  SYSTEM_PROMPT_EXTRACTION_RULE,
  ENCODED_SMUGGLING_RULE,
  SECRET_EXTRACTION_RULE,
  HARMFUL_GENERATION_RULE,
  SENSITIVE_BACKEND_LEAK_RULE,
]

function normalizeSafetyText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(ZERO_WIDTH_CHARS, '')
    .replace(/\s+/g, ' ')
}

function uniqueSorted<T extends string>(values: Iterable<T>): readonly T[] {
  return [...new Set(values)].sort()
}

function screenTextParts(
  rules: readonly AiSafetyRule[],
  textParts: readonly string[],
): AiSafetyDecision {
  const text = normalizeSafetyText(textParts.filter(Boolean).join('\n\n'))
  const matches = rules.filter(rule => rule.test(text))
  const ruleIds = uniqueSorted(matches.map(match => match.id))
  return {
    allowed: ruleIds.length === 0,
    categories: uniqueSorted(matches.map(match => match.category)),
    ruleIds,
    textLength: text.length,
  }
}

export function screenAiInput(textParts: readonly string[]): AiSafetyDecision {
  return screenTextParts(INPUT_RULES, textParts)
}

export function screenAiOutput(textParts: readonly string[]): AiSafetyDecision {
  return screenTextParts(OUTPUT_RULES, textParts)
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
  errorName: string
  operation: string
  request: Request
}): void {
  recordSecurityEvent({
    actor: {
      source: args.context.actor.source,
      ...(args.context.actor.id ? { sub: args.context.actor.id } : {}),
    },
    detail: {
      correlationId: args.context.correlationId,
      decision: 'failed',
      errorName: args.errorName,
      operation: args.operation,
      requestId: args.context.requestId,
      source: args.context.source,
    },
    event: 'ai.safety_filter.failed',
    outcome: 'failure',
    request: args.context.request ?? args.request,
  })
}
