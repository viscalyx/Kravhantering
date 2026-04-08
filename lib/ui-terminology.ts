export const UI_TERM_KEYS = [
  'description',
  'area',
  'category',
  'type',
  'status',
  'qualityCharacteristic',
  'riskLevel',
  'requiresTesting',
  'requiresTestingOff',
  'version',
  'acceptanceCriteria',
  'scenario',
  'normReferences',
  'responsibilityArea',
  'implementationType',
  'lifecycleStatus',
  'referenceData',
  'references',
  'improvementSuggestion',
  'mcpRequirementView',
] as const

export type UiTermKey = (typeof UI_TERM_KEYS)[number]
export type UiLocale = 'en' | 'sv'
export type UiTermForm = 'definitePlural' | 'plural' | 'singular'

export interface UiTermForms {
  definitePlural: string
  plural: string
  singular: string
}

export interface UiTermTranslation {
  en: UiTermForms
  key: UiTermKey
  sv: UiTermForms
}

type MessagesObject = Record<string, unknown>

const MESSAGE_BINDINGS: Record<
  UiTermKey,
  Partial<Record<UiTermForm, readonly string[][]>>
> = {
  description: {
    singular: [['requirement', 'description']],
  },
  area: {
    plural: [['nav', 'areas']],
    singular: [['requirement', 'area']],
  },
  category: {
    singular: [['requirement', 'category']],
  },
  type: {
    plural: [['nav', 'types']],
    singular: [['requirement', 'type']],
  },
  status: {
    plural: [['nav', 'statuses']],
    singular: [['requirement', 'status']],
  },
  qualityCharacteristic: {
    plural: [['nav', 'qualityCharacteristics']],
    singular: [['requirement', 'qualityCharacteristic']],
  },
  riskLevel: {
    plural: [['nav', 'riskLevels']],
    singular: [['requirement', 'riskLevel']],
  },
  requiresTesting: {
    singular: [['requirement', 'requiresTesting']],
  },
  requiresTestingOff: {
    singular: [['requirement', 'requiresTestingOff']],
  },
  version: {
    plural: [['common', 'versions']],
    singular: [['common', 'version']],
  },
  acceptanceCriteria: {
    singular: [['requirement', 'acceptanceCriteria']],
  },
  scenario: {
    plural: [['nav', 'scenarios']],
    singular: [['requirement', 'scenario']],
  },
  normReferences: {
    plural: [
      ['nav', 'normReferences'],
      ['requirement', 'normReferences'],
    ],
    singular: [['requirement', 'normReference']],
  },
  responsibilityArea: {
    plural: [
      ['nav', 'responsibilityAreas'],
      ['responsibilityAreaMgmt', 'title'],
    ],
    singular: [['package', 'responsibilityArea']],
  },
  implementationType: {
    plural: [
      ['nav', 'implementationTypes'],
      ['implementationTypeMgmt', 'title'],
    ],
    singular: [['package', 'implementationType']],
  },
  lifecycleStatus: {
    plural: [
      ['nav', 'lifecycleStatuses'],
      ['lifecycleStatusMgmt', 'title'],
    ],
    singular: [['package', 'lifecycleStatus']],
  },
  referenceData: {
    plural: [
      ['nav', 'taxonomy'],
      ['nav', 'referenceData'],
    ],
  },
  references: {
    singular: [['reference', 'unnamed']],
  },
  improvementSuggestion: {
    singular: [['improvementSuggestion', 'title']],
  },
  mcpRequirementView: {},
}

export const DEFAULT_UI_TERMINOLOGY: Record<
  UiTermKey,
  Omit<UiTermTranslation, 'key'>
> = {
  description: {
    en: {
      definitePlural: 'Requirement texts',
      plural: 'Requirement texts',
      singular: 'Requirement text',
    },
    sv: {
      definitePlural: 'Kravtexterna',
      plural: 'Kravtexter',
      singular: 'Kravtext',
    },
  },
  area: {
    en: {
      definitePlural: 'Areas',
      plural: 'Areas',
      singular: 'Area',
    },
    sv: {
      definitePlural: 'Områdena',
      plural: 'Områden',
      singular: 'Område',
    },
  },
  category: {
    en: {
      definitePlural: 'Categories',
      plural: 'Categories',
      singular: 'Category',
    },
    sv: {
      definitePlural: 'Kategorierna',
      plural: 'Kategorier',
      singular: 'Kategori',
    },
  },
  type: {
    en: {
      definitePlural: 'Types',
      plural: 'Types',
      singular: 'Type',
    },
    sv: {
      definitePlural: 'Typerna',
      plural: 'Typer',
      singular: 'Typ',
    },
  },
  status: {
    en: {
      definitePlural: 'Statuses',
      plural: 'Statuses',
      singular: 'Status',
    },
    sv: {
      definitePlural: 'Statusarna',
      plural: 'Statusar',
      singular: 'Status',
    },
  },
  qualityCharacteristic: {
    en: {
      definitePlural: 'Quality characteristics',
      plural: 'Quality characteristics',
      singular: 'Quality characteristic',
    },
    sv: {
      definitePlural: 'Kvalitetsegenskaperna',
      plural: 'Kvalitetsegenskaper',
      singular: 'Kvalitetsegenskap',
    },
  },
  riskLevel: {
    en: {
      definitePlural: 'Risk levels',
      plural: 'Risk levels',
      singular: 'Risk level',
    },
    sv: {
      definitePlural: 'Risknivåerna',
      plural: 'Risknivåer',
      singular: 'Risknivå',
    },
  },
  requiresTesting: {
    en: {
      definitePlural: 'Verifiable',
      plural: 'Verifiable',
      singular: 'Verifiable',
    },
    sv: {
      definitePlural: 'Verifierbara',
      plural: 'Verifierbara',
      singular: 'Verifierbar',
    },
  },
  requiresTestingOff: {
    en: {
      definitePlural: 'Not verifiable',
      plural: 'Not verifiable',
      singular: 'Not verifiable',
    },
    sv: {
      definitePlural: 'Inte verifierbara',
      plural: 'Inte verifierbara',
      singular: 'Inte verifierbar',
    },
  },
  version: {
    en: {
      definitePlural: 'Versions',
      plural: 'Versions',
      singular: 'Version',
    },
    sv: {
      definitePlural: 'Versionerna',
      plural: 'Versioner',
      singular: 'Version',
    },
  },
  acceptanceCriteria: {
    en: {
      definitePlural: 'Acceptance criteria',
      plural: 'Acceptance criteria',
      singular: 'Acceptance criterion',
    },
    sv: {
      definitePlural: 'Acceptanskriterierna',
      plural: 'Acceptanskriterier',
      singular: 'Acceptanskriterium',
    },
  },
  scenario: {
    en: {
      definitePlural: 'Usage scenarios',
      plural: 'Usage scenarios',
      singular: 'Usage scenario',
    },
    sv: {
      definitePlural: 'Användningsscenarierna',
      plural: 'Användningsscenarier',
      singular: 'Användningsscenario',
    },
  },
  normReferences: {
    en: {
      definitePlural: 'Norm references',
      plural: 'Norm references',
      singular: 'Norm reference',
    },
    sv: {
      definitePlural: 'Normreferenserna',
      plural: 'Normreferenser',
      singular: 'Normreferens',
    },
  },
  responsibilityArea: {
    en: {
      definitePlural: 'Business objects',
      plural: 'Business objects',
      singular: 'Business object',
    },
    sv: {
      definitePlural: 'Verksamhetsobjekten',
      plural: 'Verksamhetsobjekt',
      singular: 'Verksamhetsobjekt',
    },
  },
  implementationType: {
    en: {
      definitePlural: 'Implementation types',
      plural: 'Implementation types',
      singular: 'Implementation type',
    },
    sv: {
      definitePlural: 'Genomförandeformerna',
      plural: 'Genomförandeformer',
      singular: 'Genomförandeform',
    },
  },
  lifecycleStatus: {
    en: {
      definitePlural: 'Lifecycle statuses',
      plural: 'Lifecycle statuses',
      singular: 'Lifecycle status',
    },
    sv: {
      definitePlural: 'Livscykelstatusarna',
      plural: 'Livscykelstatusar',
      singular: 'Livscykelstatus',
    },
  },
  referenceData: {
    en: {
      definitePlural: 'Reference data',
      plural: 'Reference data',
      singular: 'Reference data',
    },
    sv: {
      definitePlural: 'Referensdata',
      plural: 'Referensdata',
      singular: 'Referensdata',
    },
  },
  references: {
    en: {
      definitePlural: 'References',
      plural: 'References',
      singular: 'Reference',
    },
    sv: {
      definitePlural: 'Referenserna',
      plural: 'Referenser',
      singular: 'Referens',
    },
  },
  improvementSuggestion: {
    en: {
      definitePlural: 'Improvement suggestions',
      plural: 'Improvement suggestions',
      singular: 'Improvement suggestion',
    },
    sv: {
      definitePlural: 'Förbättringsförslagen',
      plural: 'Förbättringsförslag',
      singular: 'Förbättringsförslag',
    },
  },
  mcpRequirementView: {
    en: {
      definitePlural: 'MCP Requirement View',
      plural: 'MCP Requirement View',
      singular: 'MCP Requirement View',
    },
    sv: {
      definitePlural: 'Kravvy från MCP',
      plural: 'Kravvy från MCP',
      singular: 'Kravvy från MCP',
    },
  },
}

function isMessagesObject(value: unknown): value is MessagesObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneMessages<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function setMessageValue(
  target: MessagesObject,
  path: readonly string[],
  value: string,
) {
  let current = target

  for (const segment of path.slice(0, -1)) {
    const existing = current[segment]
    if (!isMessagesObject(existing)) {
      current[segment] = {}
    }
    current = current[segment] as MessagesObject
  }

  current[path[path.length - 1]] = value
}

function mergeMessages(
  target: MessagesObject,
  source: MessagesObject,
): MessagesObject {
  const next = cloneMessages(target)

  for (const [key, value] of Object.entries(source)) {
    if (isMessagesObject(value) && isMessagesObject(next[key])) {
      next[key] = mergeMessages(next[key] as MessagesObject, value)
      continue
    }

    next[key] = cloneMessages(value)
  }

  return next
}

export function isUiTermKey(value: string): value is UiTermKey {
  return UI_TERM_KEYS.includes(value as UiTermKey)
}

export function getDefaultUiTerminology(): Record<
  UiTermKey,
  UiTermTranslation
> {
  return Object.fromEntries(
    UI_TERM_KEYS.map(key => [
      key,
      {
        key,
        en: cloneMessages(DEFAULT_UI_TERMINOLOGY[key].en) as UiTermForms,
        sv: cloneMessages(DEFAULT_UI_TERMINOLOGY[key].sv) as UiTermForms,
      },
    ]),
  ) as Record<UiTermKey, UiTermTranslation>
}

export function normalizeUiTerminology(
  terms: readonly Partial<UiTermTranslation>[] | null | undefined,
): Record<UiTermKey, UiTermTranslation> {
  const normalized = getDefaultUiTerminology()

  for (const entry of terms ?? []) {
    if (!entry.key || !isUiTermKey(entry.key)) {
      continue
    }

    normalized[entry.key] = {
      key: entry.key,
      en: {
        ...normalized[entry.key].en,
        ...(entry.en ?? {}),
      },
      sv: {
        ...normalized[entry.key].sv,
        ...(entry.sv ?? {}),
      },
    }
  }

  return normalized
}

export function getLocalizedUiTerm(
  terminology: Record<UiTermKey, UiTermTranslation>,
  key: UiTermKey,
  locale: UiLocale,
  form: UiTermForm,
): string {
  return (
    terminology[key]?.[locale]?.[form] ??
    DEFAULT_UI_TERMINOLOGY[key][locale][form]
  )
}

export function buildUiTerminologyPayload(
  terminology: Record<UiTermKey, UiTermTranslation>,
): UiTermTranslation[] {
  return UI_TERM_KEYS.map(key => terminology[key])
}

export function createUiTerminologyMessageOverrides(
  locale: UiLocale,
  terminology: Record<UiTermKey, UiTermTranslation>,
): MessagesObject {
  const overrides: MessagesObject = {}

  for (const key of UI_TERM_KEYS) {
    const entry = terminology[key]
    const localized = entry[locale]

    setMessageValue(
      overrides,
      ['terminology', key, 'singular'],
      localized.singular,
    )
    setMessageValue(overrides, ['terminology', key, 'plural'], localized.plural)
    setMessageValue(
      overrides,
      ['terminology', key, 'definitePlural'],
      localized.definitePlural,
    )

    const bindings = MESSAGE_BINDINGS[key]

    for (const [form, paths] of Object.entries(bindings) as Array<
      [UiTermForm, readonly string[][]]
    >) {
      for (const path of paths) {
        setMessageValue(overrides, path, localized[form])
      }
    }
  }

  return overrides
}

export function applyUiTerminologyMessages(
  baseMessages: MessagesObject,
  locale: UiLocale,
  terminology: Record<UiTermKey, UiTermTranslation>,
): MessagesObject {
  return mergeMessages(
    baseMessages,
    createUiTerminologyMessageOverrides(locale, terminology),
  )
}

export function getRequirementCsvHeaders(
  locale: UiLocale,
  terminology: Record<UiTermKey, UiTermTranslation>,
): string[] {
  return [
    locale === 'sv' ? 'Krav-ID' : 'Requirement ID',
    getLocalizedUiTerm(terminology, 'description', locale, 'singular'),
    getLocalizedUiTerm(terminology, 'area', locale, 'singular'),
    getLocalizedUiTerm(terminology, 'category', locale, 'singular'),
    getLocalizedUiTerm(terminology, 'type', locale, 'singular'),
    getLocalizedUiTerm(
      terminology,
      'qualityCharacteristic',
      locale,
      'singular',
    ),
    getLocalizedUiTerm(terminology, 'riskLevel', locale, 'singular'),
    getLocalizedUiTerm(terminology, 'status', locale, 'singular'),
    getLocalizedUiTerm(terminology, 'requiresTesting', locale, 'singular'),
    getLocalizedUiTerm(terminology, 'version', locale, 'singular'),
    getLocalizedUiTerm(terminology, 'normReferences', locale, 'plural'),
    locale === 'sv' ? 'Normreferens-URI' : 'Norm reference URI',
  ]
}

export function getCatalogTitle(
  catalog:
    | 'areas'
    | 'categories'
    | 'requirements'
    | 'risk_levels'
    | 'scenarios'
    | 'statuses'
    | 'transitions'
    | 'quality_characteristics'
    | 'types',
  locale: UiLocale,
  terminology: Record<UiTermKey, UiTermTranslation>,
): string {
  switch (catalog) {
    case 'areas':
      return getLocalizedUiTerm(terminology, 'area', locale, 'plural')
    case 'categories':
      return getLocalizedUiTerm(terminology, 'category', locale, 'plural')
    case 'types':
      return getLocalizedUiTerm(terminology, 'type', locale, 'plural')
    case 'quality_characteristics':
      return getLocalizedUiTerm(
        terminology,
        'qualityCharacteristic',
        locale,
        'plural',
      )
    case 'risk_levels':
      return getLocalizedUiTerm(terminology, 'riskLevel', locale, 'plural')
    case 'statuses':
      return getLocalizedUiTerm(terminology, 'status', locale, 'plural')
    case 'scenarios':
      return getLocalizedUiTerm(terminology, 'scenario', locale, 'plural')
    case 'transitions':
      return locale === 'sv' ? 'Övergångar' : 'Transitions'
    case 'requirements':
      return locale === 'sv' ? 'Krav' : 'Requirements'
  }
}
