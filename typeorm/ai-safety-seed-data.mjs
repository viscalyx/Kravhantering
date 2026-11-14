import { reconcileSeedRecord } from './seed-reconciliation.mjs'

const AI_SAFETY_SEED_TIMESTAMP = '2026-07-03 00:00:00'

export const AI_SAFETY_RULE_SEED_ROWS = Object.freeze([
  [
    'instruction_override',
    'prompt_injection',
    'Promptinjektion: instruktionsövertagande',
    'Prompt injection: instruction override',
    'Stoppar promptinjektion som försöker få AI:n att bortse från tidigare instruktioner eller säkerhetspolicy.',
    'Blocks prompt injection attempts that try to make the AI ignore earlier instructions or safety policy.',
    'paired_terms',
    80,
    10,
  ],
  [
    'system_prompt_extraction',
    'prompt_extraction',
    'Läckage av systemprompt',
    'System prompt leakage',
    'Stoppar försök att läsa ut systempromptar, dolda instruktioner, utvecklarmeddelanden eller promptmallar.',
    'Blocks attempts to extract system prompts, hidden instructions, developer messages, or prompt templates.',
    'paired_terms',
    80,
    20,
  ],
  [
    'encoded_smuggling',
    'encoded_smuggling',
    'Promptinjektion via kodning och maskering',
    'Prompt injection via encoding and obfuscation',
    'Stoppar promptinjektion som försöker gömma instruktioner med kodning, alternativa representationer eller maskering.',
    'Blocks prompt injection attempts that try to hide instructions through encoding, alternate representations, or obfuscation.',
    'bidirectional_pair',
    120,
    30,
  ],
  [
    'secret_extraction_request',
    'secret_extraction',
    'Känslig informationsutläsning: hemligheter',
    'Sensitive information disclosure: secrets',
    'Stoppar försök att läsa ut nycklar, tokenvärden, lösenord eller andra hemligheter.',
    'Blocks attempts to disclose keys, token values, passwords, or other secrets.',
    'paired_terms',
    80,
    40,
  ],
  [
    'harmful_generation_request',
    'harmful_content',
    'Begäran om skadligt innehåll',
    'Harmful content generation request',
    'Stoppar begäran om skadlig kod, nätfiske, credential theft och liknande innehåll.',
    'Blocks requests for malware, phishing, credential theft, and similar content.',
    'paired_terms',
    80,
    50,
  ],
  [
    'sensitive_backend_leak',
    'backend_leakage',
    'Läckage av systemnära innehåll',
    'System-adjacent content leakage',
    'Stoppar modellutdata som innehåller interna tokenvärden, systemnära markörer eller promptgränser.',
    'Blocks model output that contains internal token values, system-adjacent markers, or prompt boundaries.',
    'direct_markers',
    null,
    60,
  ],
])

const TERM_DEFINITIONS = [
  {
    direction: 'input_output',
    ruleId: 'instruction_override',
    terms: {
      action: [
        'ignore',
        'disregard',
        'forget',
        'override',
        'ignorera',
        'bortse från',
        'glöm',
        'åsidosätt',
      ],
      target: [
        'previous',
        'above',
        'earlier',
        'all',
        'system',
        'developer',
        'safety policy',
        'content policy',
        'instruction',
        'instructions',
        'tidigare',
        'ovanstående',
        'alla',
        'systeminstruktion',
        'systeminstruktioner',
        'utvecklar',
        'säkerhetspolicy',
        'instruktion',
        'instruktionen',
        'instruktioner',
        'instruktionerna',
      ],
      direct_marker: [
        'you are now',
        'developer mode',
        'jailbreak',
        'do anything now',
        'unfiltered mode',
      ],
    },
  },
  {
    direction: 'input_output',
    ruleId: 'system_prompt_extraction',
    terms: {
      action: [
        'show',
        'reveal',
        'print',
        'dump',
        'exfiltrate',
        'leak',
        'return',
        'visa',
        'avslöja',
        'skriv ut',
        'dumpa',
        'läck',
        'returnera',
      ],
      target: [
        'developer message',
        'hidden instruction',
        'hidden instructions',
        'internal instruction',
        'internal instructions',
        'prompt template',
        'backend prompt',
        'utvecklarmeddelande',
        'dold instruktion',
        'dolda instruktioner',
        'intern instruktion',
        'interna instruktioner',
        'promptmall',
        'backendprompt',
      ],
    },
  },
  {
    direction: 'input_output',
    ruleId: 'encoded_smuggling',
    terms: {
      coding: ['base64', 'rot13', 'hex', 'unicode', 'decode', 'encoded'],
      target: [
        'ignore',
        'system prompt',
        'developer message',
        'hidden instruction',
        'hidden instructions',
        'jailbreak',
        'bypass',
      ],
    },
  },
  {
    direction: 'input_output',
    ruleId: 'secret_extraction_request',
    terms: {
      action: [
        'show',
        'print',
        'reveal',
        'return',
        'include',
        'exfiltrate',
        'visa',
        'skriv ut',
        'avslöja',
        'returnera',
        'inkludera',
        'läck',
      ],
      target: [
        'api key',
        'bearer token',
        'jwt',
        'password',
        'secret',
        'openrouter key',
        'session token',
        'session tokens',
        'api-nyckel',
        'bearer-token',
        'lösenord',
        'hemlighet',
        'openrouter-nyckel',
        'sessionstoken',
      ],
    },
  },
  {
    direction: 'input_output',
    ruleId: 'harmful_generation_request',
    terms: {
      action: [
        'write',
        'create',
        'generate',
        'build',
        'provide',
        'help',
        'skriv',
        'skapa',
        'generera',
        'bygg',
        'ge',
        'hjälp',
      ],
      target: [
        'malware',
        'ransomware',
        'phishing',
        'credential theft',
        'steal credentials',
        'keylogger',
        'exploit code',
        'skadlig kod',
        'nätfiske',
        'lösenordsstöld',
        'stjäla inlogg',
        'exploitkod',
      ],
    },
  },
  {
    direction: 'output',
    ruleId: 'sensitive_backend_leak',
    terms: {
      direct_marker: [
        'authorization: bearer',
        'sk-or-v1-',
        'employeeHsaId',
        'begin system prompt',
        'begin developer message',
        '<|system|>',
        'system prompt: "',
        "system prompt: '",
      ],
    },
  },
]

export const AI_SAFETY_TERM_SEED_ROWS = Object.freeze(
  TERM_DEFINITIONS.flatMap(definition =>
    Object.entries(definition.terms).flatMap(([termType, terms]) =>
      terms.map((term, index) => [
        definition.ruleId,
        termType,
        term,
        normalizeAiSafetyTerm(term),
        definition.direction,
        index + 1,
      ]),
    ),
  ),
)

export function normalizeAiSafetyTerm(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('sv-SE')
}

export async function seedAiSafetyRules(executor) {
  const entries = []
  const ruleIds = new Map()
  const metadata = [
    'category',
    'name_sv',
    'name_en',
    'description_sv',
    'description_en',
    'pattern_kind',
    'window_chars',
    'sort_order',
  ]
  for (const row of AI_SAFETY_RULE_SEED_ROWS) {
    const values = Object.fromEntries(
      ['rule_id', ...metadata].map((column, index) => [column, row[index]]),
    )
    const result = await reconcileSeedRecord(executor, {
      table: 'ai_safety_rules',
      values: {
        ...values,
        created_at: AI_SAFETY_SEED_TIMESTAMP,
        updated_at: AI_SAFETY_SEED_TIMESTAMP,
      },
      keys: ['rule_id'],
      update: metadata,
      timestamp: new Date(),
    })
    ruleIds.set(row[0], result.id)
    entries.push(result)
  }
  for (const [
    ruleKey,
    termType,
    text,
    normalized,
    direction,
    order,
  ] of AI_SAFETY_TERM_SEED_ROWS) {
    const result = await reconcileSeedRecord(executor, {
      table: 'ai_safety_rule_terms',
      values: {
        rule_id: ruleIds.get(ruleKey),
        term_type: termType,
        term_text: text,
        normalized_term: normalized,
        direction,
        standard_direction: direction,
        is_standard: 1,
        is_active: 1,
        sort_order: order,
        created_at: AI_SAFETY_SEED_TIMESTAMP,
        updated_at: AI_SAFETY_SEED_TIMESTAMP,
      },
      keys: ['rule_id', 'term_type', 'normalized_term'],
      update: ['term_text', 'standard_direction', 'is_standard', 'sort_order'],
      timestamp: new Date(),
    })
    // Reports use the stable application key, never a database-specific rule ID.
    result.identity = `rule_id=${ruleKey},term_type=${termType},normalized_term=${normalized}`
    entries.push(result)
  }
  return entries
}
