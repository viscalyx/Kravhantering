import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod'
import {
  createUiSettingsLoader,
  type UiSettingsLoader,
} from '@/lib/dal/ui-settings'
import {
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
import {
  buildRequirementViewUri,
  createRequirementsService,
  type GenerateRequirementsInput,
  type GetRequirementInput,
  type ManageRequirementInput,
  type QueryCatalogInput,
  type RequirementsService,
  type TransitionRequirementInput,
  toResponseFormat,
  toResponseLocale,
} from '@/lib/requirements/service'
import {
  applyUiTerminologyMessages,
  getDefaultUiTerminology,
  getLocalizedUiTerm,
  type UiLocale,
} from '@/lib/ui-terminology'
import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

const HTML_BASE_MESSAGES = {
  en: enMessages,
  sv: svMessages,
} satisfies Record<UiLocale, Record<string, unknown>>

const PaginationSchema = z
  .object({
    count: z.number(),
    hasMore: z.boolean(),
    limit: z.number(),
    nextOffset: z.number().nullable(),
    offset: z.number(),
    total: z.number(),
  })
  .strict()

const ResponseFormatSchema = z
  .enum(['json', 'markdown'])
  .default('markdown')
  .describe('Use "json" for machine-readable text, or "markdown" for display.')

const ResponseLocaleSchema = z
  .enum(['en', 'sv'])
  .default('en')
  .describe('Response language for names and messages.')

const QueryCatalogOutputSchema = z
  .object({
    catalog: z
      .enum([
        'requirements',
        'areas',
        'categories',
        'types',
        'quality_characteristics',
        'risk_levels',
        'statuses',
        'requirement_packages',
        'transitions',
      ])
      .describe('Catalog that was returned.'),
    items: z
      .array(z.record(z.string(), z.unknown()))
      .describe('Catalog rows. Shape depends on the selected catalog.'),
    message: z.string(),
    pagination: PaginationSchema.nullable().describe(
      'Pagination metadata for catalog "requirements"; null for lookup catalogs.',
    ),
  })
  .strict()

const RequirementVersionOutputSchema = z
  .record(z.string(), z.unknown())
  .describe(
    'Requirement version object. Includes numeric id and opaque revisionToken. For edit preconditions, fetch requirements_get_requirement with view: "history" and use requirement.versions[0].id as requirement.baseVersionId plus requirement.versions[0].revisionToken as requirement.baseRevisionToken.',
  )

const RequirementDetailOutputSchema = z
  .record(z.string(), z.unknown())
  .describe(
    'Requirement detail object. Its versions array contains selected version objects; with view: "history", requirement.versions[0] is the latest overall version and the edit base.',
  )

const GetRequirementOutputSchema = z
  .object({
    message: z.string(),
    requirement: RequirementDetailOutputSchema,
    requirementResourceUri: z.string(),
    requirementViewUri: z.string(),
    version: RequirementVersionOutputSchema.optional().describe(
      'Requested version object when view is "version". Includes revisionToken.',
    ),
    versions: z
      .array(RequirementVersionOutputSchema)
      .optional()
      .describe(
        'All version objects when view is "history"; versions[0] is the latest overall version and includes id plus revisionToken for edit base fields.',
      ),
  })
  .strict()

const ManageRequirementOutputSchema = z
  .object({
    detail: RequirementDetailOutputSchema.optional().describe(
      'Updated requirement snapshot. On stale edit conflicts, error details.latest contains the latest snapshot with revisionToken.',
    ),
    message: z.string(),
    operation: z.string(),
    result: z
      .record(z.string(), z.unknown())
      .describe(
        'Operation result. Edit results include the updated version id.',
      ),
  })
  .strict()

const TransitionRequirementOutputSchema = z
  .object({
    detail: RequirementDetailOutputSchema,
    message: z.string(),
    version: RequirementVersionOutputSchema.describe(
      'Transitioned version object with the newly rotated revisionToken.',
    ),
  })
  .strict()

const ListSuggestionsOutputSchema = z
  .object({
    counts: z
      .object({
        dismissed: z.number(),
        pending: z.number(),
        resolved: z.number(),
        total: z.number(),
      })
      .strict(),
    message: z.string(),
    suggestions: z.array(
      z
        .object({
          content: z.string(),
          createdAt: z.string(),
          createdBy: z.string().nullable(),
          id: z.number(),
          isReviewRequested: z.number(),
          requirementId: z.number(),
          requirementVersionId: z.number().nullable(),
          resolution: z.number().nullable(),
          resolutionMotivation: z.string().nullable(),
          resolvedAt: z.string().nullable(),
          resolvedBy: z.string().nullable(),
          updatedAt: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict()

const ManageSuggestionOutputSchema = z
  .object({
    message: z.string(),
    result: z
      .record(z.string(), z.unknown())
      .describe('Created or updated suggestion data, or an operation result.'),
  })
  .strict()

const GeneratedRequirementOutputSchema = z
  .object({
    acceptanceCriteria: z.string().nullable().optional(),
    categoryId: z.number().optional(),
    description: z.string(),
    qualityCharacteristicId: z.number().optional(),
    rationale: z.string(),
    requiresTesting: z.boolean(),
    riskLevelId: z.number().optional(),
    requirementPackageIds: z.array(z.number()).optional(),
    typeId: z.number(),
    verificationMethod: z.string().nullable().optional(),
  })
  .strict()

const GenerateRequirementsOutputSchema = z
  .object({
    message: z.string(),
    model: z.string(),
    requirements: z.array(GeneratedRequirementOutputSchema),
    stats: z
      .object({
        completionTokens: z.number(),
        cost: z.number(),
        promptTokens: z.number(),
        reasoningTokens: z.number(),
        totalTokens: z.number(),
      })
      .strict(),
    thinking: z.string(),
  })
  .strict()

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getSafeReferenceHref(uri: string) {
  try {
    const parsed = new URL(uri)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? uri : null
  } catch {
    return null
  }
}

function getMessageString(
  messages: Record<string, unknown>,
  path: readonly string[],
  fallback: string,
) {
  let current: unknown = messages

  for (const segment of path) {
    if (
      typeof current !== 'object' ||
      current === null ||
      Array.isArray(current)
    ) {
      return fallback
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return typeof current === 'string' ? current : fallback
}

function getBaseContext(
  request: Request,
  toolName?: string,
): Promise<RequestContext> {
  return createRequestContext(request, 'mcp', toolName)
}

function getRequirementUniqueIdFromResourceUri(
  uri: URL,
  variables: { uniqueId?: string | string[] },
) {
  const pathSegments = uri.pathname
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)
  const lastPathSegment = pathSegments[pathSegments.length - 1]
  const variableValue =
    typeof variables.uniqueId === 'string' ? variables.uniqueId : undefined
  const rawUniqueId = lastPathSegment ?? variableValue ?? ''
  return decodeURIComponent(rawUniqueId)
}

function toRequirementResourceUri(uniqueId: string, versionNumber?: number) {
  const query = versionNumber != null ? `?version=${versionNumber}` : ''
  return `requirements://requirement/${encodeURIComponent(uniqueId)}${query}`
}

function formatError(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'An internal error occurred'

  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${message}`,
      },
    ],
    isError: true,
  }
}

function createUiResourceLink(uniqueId: string, versionNumber?: number) {
  const uri = buildRequirementViewUri({ uniqueId }, versionNumber)

  return {
    mimeType: 'text/html',
    name: versionNumber
      ? `Requirement ${uniqueId} v${versionNumber} view`
      : `Requirement ${uniqueId} view`,
    type: 'resource_link' as const,
    uri,
  }
}

function createRequirementResourceLink(
  uniqueId: string,
  versionNumber?: number,
) {
  return {
    mimeType: 'application/json',
    name: versionNumber
      ? `Requirement ${uniqueId} v${versionNumber} data`
      : `Requirement ${uniqueId} data`,
    type: 'resource_link' as const,
    uri: toRequirementResourceUri(uniqueId, versionNumber),
  }
}

function renderRequirementHtml(
  payload: Awaited<ReturnType<RequirementsService['getRequirement']>>,
  locale: 'en' | 'sv',
  terminology = getDefaultUiTerminology(),
) {
  const localizedMessages = applyUiTerminologyMessages(
    HTML_BASE_MESSAGES[locale],
    locale,
    terminology,
  ) as Record<string, unknown>
  const detail = payload.requirement
  const selectedVersion = payload.version ?? detail.versions[0]

  const normReferences = Array.isArray(selectedVersion?.versionNormReferences)
    ? (
        selectedVersion.versionNormReferences as {
          normReference?: {
            name?: string
            reference?: string
            uri?: string | null
          }
        }[]
      ).filter(r => r?.normReference)
    : []
  const requirementPackages = Array.isArray(
    selectedVersion?.versionRequirementPackages,
  )
    ? (selectedVersion.versionRequirementPackages as {
        requirementPackage?: { nameEn?: string | null; nameSv?: string | null }
      }[])
    : []

  const title = `${detail.uniqueId}${selectedVersion?.versionNumber ? ` v${selectedVersion.versionNumber}` : ''}`
  const statusLabel =
    locale === 'sv'
      ? (selectedVersion?.statusNameSv as string | undefined)
      : (selectedVersion?.statusNameEn as string | undefined)
  const requiresTestingLabel = getLocalizedUiTerm(
    terminology,
    'requiresTesting',
    locale,
    'singular',
  )
  const requiresTestingOffLabel = getLocalizedUiTerm(
    terminology,
    'requiresTestingOff',
    locale,
    'singular',
  )
  const noneLabel = getMessageString(
    localizedMessages,
    ['common', 'noneAvailable'],
    locale === 'sv' ? 'Inga' : 'None',
  )
  const unnamedReferenceLabel = getMessageString(
    localizedMessages,
    ['reference', 'unnamed'],
    getLocalizedUiTerm(terminology, 'references', locale, 'singular'),
  )

  const requirementPackageNames = requirementPackages
    .map(item =>
      locale === 'sv'
        ? (item.requirementPackage?.nameSv ?? item.requirementPackage?.nameEn)
        : (item.requirementPackage?.nameEn ?? item.requirementPackage?.nameSv),
    )
    .filter((name): name is string => Boolean(name))

  const normReferenceMarkup =
    normReferences.length > 0
      ? `<ul>${normReferences
          .map(item => {
            const nr = item.normReference
            const label = escapeHtml(
              nr?.name ?? nr?.reference ?? unnamedReferenceLabel,
            )
            const safeHref =
              typeof nr?.uri === 'string' ? getSafeReferenceHref(nr.uri) : null
            if (safeHref) {
              return `<li><a href="${escapeHtml(safeHref)}">${label}</a></li>`
            }
            if (nr?.uri) {
              return `<li>${label}: ${escapeHtml(nr.uri)}</li>`
            }
            return `<li>${label}</li>`
          })
          .join('')}</ul>`
      : `<p>${escapeHtml(noneLabel)}</p>`

  const requirementPackageMarkup =
    requirementPackageNames.length > 0
      ? `<ul>${requirementPackageNames
          .map(name => `<li>${escapeHtml(name)}</li>`)
          .join('')}</ul>`
      : `<p>${escapeHtml(noneLabel)}</p>`

  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(locale)}">`,
    '<head>',
    '  <meta charset="utf-8" />',
    `  <title>${escapeHtml(title)}</title>`,
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <style>',
    '    :root { color-scheme: light; }',
    '    body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: linear-gradient(135deg, #f2efe6, #fffdf8); color: #1f2937; }',
    '    main { max-width: 860px; margin: 0 auto; padding: 32px 20px 56px; }',
    '    .card { background: rgba(255,255,255,0.88); border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 24px; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08); padding: 28px; backdrop-filter: blur(10px); }',
    '    .eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; color: #6b7280; margin-bottom: 10px; }',
    '    h1 { font-size: clamp(30px, 5vw, 44px); line-height: 1.05; margin: 0 0 12px; }',
    '    .meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }',
    '    .pill { background: #eef2ff; border-radius: 999px; padding: 8px 14px; font-size: 14px; }',
    '    .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin: 24px 0; }',
    '    .panel { background: #f8fafc; border-radius: 18px; padding: 16px 18px; border: 1px solid rgba(15,23,42,0.08); }',
    '    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin: 0 0 8px; }',
    '    p, li { line-height: 1.6; }',
    '    ul { margin: 0; padding-left: 18px; }',
    '    .body-text { white-space: pre-wrap; font-size: 17px; }',
    '    .split { display: grid; gap: 18px; margin-top: 24px; }',
    '    @media (min-width: 768px) { .split { grid-template-columns: 1.4fr 1fr; } }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    '    <article class="card">',
    `      <div class="eyebrow">${escapeHtml(getLocalizedUiTerm(terminology, 'mcpRequirementView', locale, 'singular'))}</div>`,
    `      <h1>${escapeHtml(title)}</h1>`,
    '      <div class="meta">',
    `        <span class="pill">${escapeHtml(statusLabel ?? 'Unknown')}</span>`,
    `        <span class="pill">${escapeHtml(String(detail.area?.name ?? 'No area'))}</span>`,
    `        <span class="pill">${selectedVersion?.requiresTesting ? escapeHtml(requiresTestingLabel) : escapeHtml(requiresTestingOffLabel)}</span>`,
    selectedVersion?.verificationMethod
      ? `        <span class="pill">${escapeHtml(selectedVersion.verificationMethod)}</span>`
      : '',
    '      </div>',
    '      <section class="split">',
    '        <div>',
    `          <h2>${escapeHtml(getLocalizedUiTerm(terminology, 'description', locale, 'singular'))}</h2>`,
    `          <p class="body-text">${escapeHtml(String(selectedVersion?.description ?? ''))}</p>`,
    `          <h2>${escapeHtml(getLocalizedUiTerm(terminology, 'acceptanceCriteria', locale, 'singular'))}</h2>`,
    `          <p class="body-text">${escapeHtml(String(selectedVersion?.acceptanceCriteria ?? ''))}</p>`,
    '        </div>',
    '        <div class="grid">',
    `          <section class="panel"><h2>${escapeHtml(getLocalizedUiTerm(terminology, 'category', locale, 'singular'))}</h2><p>${escapeHtml(String((locale === 'sv' ? selectedVersion?.category?.nameSv : selectedVersion?.category?.nameEn) ?? '—'))}</p></section>`,
    `          <section class="panel"><h2>${escapeHtml(getLocalizedUiTerm(terminology, 'type', locale, 'singular'))}</h2><p>${escapeHtml(String((locale === 'sv' ? selectedVersion?.type?.nameSv : selectedVersion?.type?.nameEn) ?? '—'))}</p></section>`,
    `          <section class="panel"><h2>${escapeHtml(getLocalizedUiTerm(terminology, 'qualityCharacteristic', locale, 'singular'))}</h2><p>${escapeHtml(String((locale === 'sv' ? selectedVersion?.qualityCharacteristic?.nameSv : selectedVersion?.qualityCharacteristic?.nameEn) ?? '—'))}</p></section>`,
    `          <section class="panel"><h2>${escapeHtml(getLocalizedUiTerm(terminology, 'riskLevel', locale, 'singular'))}</h2><p>${escapeHtml(String((locale === 'sv' ? selectedVersion?.riskLevel?.nameSv : selectedVersion?.riskLevel?.nameEn) ?? '—'))}</p></section>`,
    `          <section class="panel"><h2>${escapeHtml(getLocalizedUiTerm(terminology, 'version', locale, 'singular'))}</h2><p>${escapeHtml(String(selectedVersion?.versionNumber ?? '—'))}</p></section>`,
    `          <section class="panel"><h2>${escapeHtml(getMessageString(localizedMessages, ['requirement', 'specificationCount'], locale === 'sv' ? 'Används i kravunderlag' : 'Used in specification'))}</h2><p>${escapeHtml(String(detail.specificationCount ?? 0))}</p></section>`,
    '        </div>',
    '      </section>',
    '      <section class="split">',
    `        <section class="panel"><h2>${escapeHtml(getLocalizedUiTerm(terminology, 'references', locale, 'plural'))}</h2>${normReferenceMarkup}</section>`,
    `        <section class="panel"><h2>${escapeHtml(getLocalizedUiTerm(terminology, 'requirementPackage', locale, 'plural'))}</h2>${requirementPackageMarkup}</section>`,
    '      </section>',
    '    </article>',
    '  </main>',
    '</body>',
    '</html>',
  ].join('\n')
}

function createQueryCatalogSchema() {
  return z
    .object({
      areaIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Requirement area IDs. Applies only to catalog "requirements".',
        ),
      catalog: z
        .enum([
          'requirements',
          'areas',
          'categories',
          'types',
          'quality_characteristics',
          'risk_levels',
          'statuses',
          'requirement_packages',
          'transitions',
        ])
        .default('requirements')
        .describe(
          'Catalog to return. Use "requirements" for paged requirement search; lookup catalogs ignore requirement filters.',
        ),
      categoryIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Requirement category IDs. Applies only to catalog "requirements".',
        ),
      descriptionSearch: z
        .string()
        .max(200)
        .optional()
        .describe(
          'Case-insensitive substring filter on requirement description. Applies only to catalog "requirements".',
        ),
      includeArchived: z
        .boolean()
        .optional()
        .describe(
          'Whether archived requirements are included. Applies only to catalog "requirements".',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Page size for catalog "requirements"; maximum 50.'),
      locale: ResponseLocaleSchema,
      normReferenceIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Norm reference IDs. Applies only to catalog "requirements".',
        ),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Zero-based offset for catalog "requirements".'),
      qualityCharacteristicIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Quality characteristic IDs. Applies only to catalog "requirements".',
        ),
      requiresTesting: z
        .array(z.boolean())
        .optional()
        .describe(
          'Filter by testing requirement. Applies only to catalog "requirements".',
        ),
      responseFormat: ResponseFormatSchema,
      riskLevelIds: z
        .array(z.number().int().positive())
        .optional()
        .describe('Risk level IDs. Applies only to catalog "requirements".'),
      sortBy: z
        .enum([
          'uniqueId',
          'description',
          'area',
          'category',
          'type',
          'qualityCharacteristic',
          'riskLevel',
          'status',
          'version',
        ])
        .optional()
        .describe(
          'Sort field for catalog "requirements". Defaults to uniqueId.',
        ),
      sortDirection: z
        .enum(['asc', 'desc'])
        .optional()
        .describe(
          'Sort direction for catalog "requirements". Defaults to asc.',
        ),
      statuses: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Requirement status IDs. Applies only to catalog "requirements".',
        ),
      typeId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Requirement type ID used only to filter catalog "quality_characteristics".',
        ),
      typeIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Requirement type IDs. Applies only to catalog "requirements".',
        ),
      uniqueIdSearch: z
        .string()
        .max(100)
        .optional()
        .describe(
          'Case-insensitive substring filter on requirement uniqueId. Applies only to catalog "requirements".',
        ),
      requirementPackageIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Requirements package IDs. Applies only to catalog "requirements".',
        ),
    })
    .strict()
}

function createGetRequirementSchema() {
  return z
    .object({
      id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Numeric requirement ID. Use either id or uniqueId.'),
      locale: ResponseLocaleSchema,
      responseFormat: ResponseFormatSchema,
      uniqueId: z
        .string()
        .max(64)
        .optional()
        .describe('Stable requirement ID, e.g. "REQ-001".'),
      versionNumber: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Required when view is "version".'),
      view: z
        .enum(['detail', 'history', 'version'])
        .default('detail')
        .describe(
          'Use "detail" for the latest published version, "version" with versionNumber for one historical version, or "history" before editing so requirement.versions[0] is the latest overall version.',
        ),
    })
    .strict()
    .superRefine((val, ctx) => {
      if ((val.id == null) === (val.uniqueId == null)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Provide exactly one of id or uniqueId.',
          path: ['id'],
        })
      }
      if (val.view === 'version' && val.versionNumber == null) {
        ctx.addIssue({
          code: 'custom',
          message: 'versionNumber is required when view is "version".',
          path: ['versionNumber'],
        })
      }
    })
}

const RequirementMutationSchema = z
  .object({
    acceptanceCriteria: z
      .string()
      .max(4000)
      .optional()
      .describe('Acceptance criteria text for the requirement version.'),
    areaId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Requirement area ID. Required when creating.'),
    baseRevisionToken: z
      .uuid()
      .optional()
      .describe(
        'Required for operation "edit". First call requirements_get_requirement with view: "history", then copy requirement.versions[0].revisionToken.',
      ),
    baseVersionId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Required for operation "edit". First call requirements_get_requirement with view: "history", then copy requirement.versions[0].id.',
      ),
    categoryId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Requirement category ID.'),
    createdBy: z
      .string()
      .max(200)
      .optional()
      .describe('Optional actor/user label for the created or edited version.'),
    description: z
      .string()
      .max(4000)
      .optional()
      .describe('Requirement description text. Required for create and edit.'),
    requiresTesting: z
      .boolean()
      .optional()
      .describe('Whether the requirement must be verified by test.'),
    verificationMethod: z
      .string()
      .max(4000)
      .optional()
      .describe(
        'How the requirement should be verified when requiresTesting is true.',
      ),
    requirementPackageIds: z
      .array(z.number().int().positive())
      .optional()
      .describe('Requirements package IDs linked to the version.'),
    normReferenceIds: z
      .array(z.number().int().positive())
      .optional()
      .describe('Norm reference IDs linked to the version.'),
    qualityCharacteristicId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Quality characteristic ID.'),
    riskLevelId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Risk level ID.'),
    typeId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Requirement type ID.'),
  })
  .strict()

function createManageRequirementSchema() {
  return z
    .object({
      id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Numeric requirement ID. Required for non-create operations when uniqueId is not provided.',
        ),
      locale: ResponseLocaleSchema,
      operation: z
        .enum(['archive', 'create', 'delete_draft', 'edit', 'restore_version'])
        .describe(
          'Operation to perform. Create has no existing requirement ID; all other operations require id or uniqueId.',
        ),
      requirement: RequirementMutationSchema.optional().describe(
        'Requirement fields for create/edit. For create, pass at least requirement.areaId and requirement.description; optional fields include acceptanceCriteria, typeId, categoryId, qualityCharacteristicId, riskLevelId, requiresTesting, verificationMethod, requirementPackageIds, normReferenceIds, and createdBy. For edit, first call requirements_get_requirement with view: "history" and copy requirement.versions[0].id to baseVersionId plus requirement.versions[0].revisionToken to baseRevisionToken.',
      ),
      responseFormat: ResponseFormatSchema,
      uniqueId: z
        .string()
        .max(64)
        .optional()
        .describe(
          'Stable requirement ID, e.g. "REQ-001". Required for non-create operations when id is not provided.',
        ),
      versionNumber: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Required for operation "restore_version".'),
    })
    .strict()
    .superRefine((val, ctx) => {
      if (
        val.operation !== 'create' &&
        (val.id == null) === (val.uniqueId == null)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Provide exactly one of id or uniqueId for this operation.',
          path: ['id'],
        })
      }

      if (val.operation === 'create') {
        if (!val.requirement?.areaId) {
          ctx.addIssue({
            code: 'custom',
            message: 'requirement.areaId is required for operation "create".',
            path: ['requirement', 'areaId'],
          })
        }
        if (!val.requirement?.description) {
          ctx.addIssue({
            code: 'custom',
            message:
              'requirement.description is required for operation "create".',
            path: ['requirement', 'description'],
          })
        }
      }

      if (val.operation === 'edit') {
        if (!val.requirement?.description) {
          ctx.addIssue({
            code: 'custom',
            message:
              'requirement.description is required for operation "edit".',
            path: ['requirement', 'description'],
          })
        }
        if (val.requirement?.baseVersionId == null) {
          ctx.addIssue({
            code: 'custom',
            message:
              'requirement.baseVersionId is required for operation "edit".',
            path: ['requirement', 'baseVersionId'],
          })
        }
        if (val.requirement?.baseRevisionToken == null) {
          ctx.addIssue({
            code: 'custom',
            message:
              'requirement.baseRevisionToken is required for operation "edit".',
            path: ['requirement', 'baseRevisionToken'],
          })
        }
      }

      if (val.operation === 'restore_version' && val.versionNumber == null) {
        ctx.addIssue({
          code: 'custom',
          message: 'versionNumber is required for operation "restore_version".',
          path: ['versionNumber'],
        })
      }
    })
}

function createTransitionRequirementSchema() {
  return z
    .object({
      id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Numeric requirement ID. Use either id or uniqueId.'),
      locale: ResponseLocaleSchema,
      responseFormat: ResponseFormatSchema,
      toStatusId: z
        .number()
        .int()
        .positive()
        .describe(
          'Target requirement status ID. Use requirements_query_catalog with catalog "transitions" or "statuses" before choosing this value.',
        ),
      uniqueId: z
        .string()
        .max(64)
        .optional()
        .describe('Stable requirement ID, e.g. "REQ-001".'),
    })
    .strict()
    .superRefine((val, ctx) => {
      if ((val.id == null) === (val.uniqueId == null)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Provide exactly one of id or uniqueId.',
          path: ['id'],
        })
      }
    })
}

function toCatalogInput(
  input: z.infer<ReturnType<typeof createQueryCatalogSchema>>,
): QueryCatalogInput {
  return {
    areaIds: input.areaIds,
    catalog: input.catalog,
    categoryIds: input.categoryIds,
    descriptionSearch: input.descriptionSearch,
    includeArchived: input.includeArchived,
    limit: input.limit,
    locale: toResponseLocale(input.locale),
    normReferenceIds: input.normReferenceIds,
    offset: input.offset,
    requiresTesting: input.requiresTesting,
    responseFormat: toResponseFormat(input.responseFormat),
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
    statuses: input.statuses,
    qualityCharacteristicIds: input.qualityCharacteristicIds,
    riskLevelIds: input.riskLevelIds,
    typeId: input.typeId,
    typeIds: input.typeIds,
    uniqueIdSearch: input.uniqueIdSearch,
    requirementPackageIds: input.requirementPackageIds,
  }
}

function toGetInput(
  input: z.infer<ReturnType<typeof createGetRequirementSchema>>,
): GetRequirementInput {
  return {
    id: input.id,
    locale: toResponseLocale(input.locale),
    responseFormat: toResponseFormat(input.responseFormat),
    uniqueId: input.uniqueId,
    versionNumber: input.versionNumber,
    view: input.view,
  }
}

function toManageInput(
  input: z.infer<ReturnType<typeof createManageRequirementSchema>>,
): ManageRequirementInput {
  return {
    id: input.id,
    locale: toResponseLocale(input.locale),
    operation: input.operation,
    requirement: input.requirement,
    responseFormat: toResponseFormat(input.responseFormat),
    uniqueId: input.uniqueId,
    versionNumber: input.versionNumber,
  }
}

function toTransitionInput(
  input: z.infer<ReturnType<typeof createTransitionRequirementSchema>>,
): TransitionRequirementInput {
  return {
    id: input.id,
    locale: toResponseLocale(input.locale),
    responseFormat: toResponseFormat(input.responseFormat),
    toStatusId: input.toStatusId,
    uniqueId: input.uniqueId,
  }
}

function getRequirementLinkPayload(
  payload: Awaited<ReturnType<RequirementsService['getRequirement']>>,
) {
  const versionNumber =
    payload.version?.versionNumber ??
    (Array.isArray(payload.requirement.versions)
      ? (
          payload.requirement.versions[0] as
            | { versionNumber?: number }
            | undefined
        )?.versionNumber
      : undefined)

  return {
    requirementLink: createRequirementResourceLink(
      payload.requirement.uniqueId,
      versionNumber,
    ),
    uiLink: createUiResourceLink(payload.requirement.uniqueId, versionNumber),
  }
}

export function createKravhanteringMcpServer(
  service: RequirementsService,
  request: Request,
  uiSettings: Pick<UiSettingsLoader, 'getTerminology'> = {
    getTerminology: async () => getDefaultUiTerminology(),
  },
): McpServer {
  const server = new McpServer(
    {
      name: 'requirement-management-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        logging: {},
      },
    },
  )

  const requirementResourceTemplate = new ResourceTemplate(
    'requirements://requirement/{uniqueId}',
    {
      list: undefined,
    },
  )

  server.registerResource(
    'requirements_requirement_resource',
    requirementResourceTemplate,
    {
      description:
        'Read a requirement detail payload by unique requirement ID.',
      mimeType: 'application/json',
      title: 'Requirement Resource',
    },
    async (uri, variables) => {
      const versionNumber = uri.searchParams.get('version')
      const uniqueId = getRequirementUniqueIdFromResourceUri(uri, variables)
      const payload = await service.getRequirement(
        await getBaseContext(request, 'requirements_get_requirement'),
        {
          locale: toResponseLocale(uri.searchParams.get('locale') ?? undefined),
          responseFormat: 'json',
          uniqueId,
          versionNumber: versionNumber ? Number(versionNumber) : undefined,
          view: versionNumber ? 'version' : 'detail',
        },
      )

      return {
        contents: [
          {
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                requirement: payload.requirement,
                version: payload.version ?? null,
              },
              null,
              2,
            ),
            uri: uri.toString(),
          },
        ],
      }
    },
  )

  const uiResourceTemplate = new ResourceTemplate(
    'ui://requirements/requirement-detail/{uniqueId}',
    {
      list: undefined,
    },
  )

  server.registerResource(
    'requirements_requirement_view',
    uiResourceTemplate,
    {
      description: 'HTML requirement view for MCP Apps-capable hosts.',
      mimeType: 'text/html',
      title: 'Requirement View',
    },
    async (uri, variables) => {
      const versionNumber = uri.searchParams.get('version')
      const locale = toResponseLocale(
        uri.searchParams.get('locale') ?? undefined,
      )
      const uniqueId = getRequirementUniqueIdFromResourceUri(uri, variables)
      const payload = await service.getRequirement(
        await getBaseContext(request, 'requirements_get_requirement'),
        {
          locale,
          responseFormat: 'markdown',
          uniqueId,
          versionNumber: versionNumber ? Number(versionNumber) : undefined,
          view: versionNumber ? 'version' : 'detail',
        },
      )
      let terminology = getDefaultUiTerminology()

      try {
        terminology = await uiSettings.getTerminology()
      } catch {
        // Keep the HTML resource readable when stored UI settings are unavailable.
      }

      return {
        contents: [
          {
            mimeType: 'text/html',
            text: renderRequirementHtml(
              payload,
              locale as UiLocale,
              terminology,
            ),
            uri: uri.toString(),
          },
        ],
      }
    },
  )

  server.registerTool(
    'requirements_query_catalog',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        'List/search paginated requirements or fetch lookup catalogs: areas, categories, types, quality_characteristics, risk_levels, statuses, requirement_packages, and transitions. Requirement filters, sorting, limit, and offset apply only when catalog is "requirements".',
      inputSchema: createQueryCatalogSchema(),
      outputSchema: QueryCatalogOutputSchema,
      title: 'Query Requirements Catalog',
    },
    async input => {
      try {
        const payload = await service.queryCatalog(
          await getBaseContext(request, 'requirements_query_catalog'),
          toCatalogInput(input),
        )
        return {
          content: [
            {
              text: payload.message,
              type: 'text',
            },
          ],
          structuredContent: payload,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  server.registerTool(
    'requirements_get_requirement',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        'Fetch the current requirement detail, a specific version, or the full version history by stable requirement ID. Before editing, call with view: "history" and use requirement.versions[0].id plus requirement.versions[0].revisionToken as the edit base.',
      inputSchema: createGetRequirementSchema(),
      outputSchema: GetRequirementOutputSchema,
      title: 'Get Requirement',
    },
    async input => {
      try {
        const payload = await service.getRequirement(
          await getBaseContext(request, 'requirements_get_requirement'),
          toGetInput(input),
        )
        const links = getRequirementLinkPayload(payload)

        return {
          _meta: {
            'openai/outputTemplate': payload.requirementViewUri,
          },
          content: [
            {
              text: payload.message,
              type: 'text',
            },
            links.requirementLink,
            links.uiLink,
          ],
          structuredContent: payload,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  server.registerTool(
    'requirements_manage_requirement',
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'Create, edit, archive, delete a latest draft, or restore a historical requirement version. For operation "create", pass requirement.areaId and requirement.description, plus optional classification/verification fields. For operation "edit", first call requirements_get_requirement with view: "history", then pass requirement.versions[0].id as requirement.baseVersionId and requirement.versions[0].revisionToken as requirement.baseRevisionToken.',
      inputSchema: createManageRequirementSchema(),
      outputSchema: ManageRequirementOutputSchema,
      title: 'Manage Requirement',
    },
    async input => {
      try {
        const payload = await service.manageRequirement(
          await getBaseContext(request, 'requirements_manage_requirement'),
          toManageInput(input),
        )
        const content: Array<
          | { text: string; type: 'text' }
          | ReturnType<typeof createRequirementResourceLink>
        > = [
          {
            text: payload.message,
            type: 'text',
          },
        ]

        if (payload.detail) {
          const latestVersion = Array.isArray(payload.detail.versions)
            ? (
                payload.detail.versions[0] as
                  | { versionNumber?: number }
                  | undefined
              )?.versionNumber
            : undefined
          content.push(
            createRequirementResourceLink(
              payload.detail.uniqueId,
              latestVersion,
            ),
          )
          content.push(
            createUiResourceLink(payload.detail.uniqueId, latestVersion),
          )
        }

        return {
          _meta: payload.detail
            ? {
                'openai/outputTemplate': buildRequirementViewUri(
                  { uniqueId: payload.detail.uniqueId },
                  Array.isArray(payload.detail.versions)
                    ? (
                        payload.detail.versions[0] as
                          | { versionNumber?: number }
                          | undefined
                      )?.versionNumber
                    : undefined,
                ),
              }
            : undefined,
          content,
          structuredContent: payload,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  server.registerTool(
    'requirements_transition_requirement',
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'Transition a requirement version through the lifecycle states defined in requirement_status_transitions. A transition rotates the version revisionToken; refetch with requirements_get_requirement before a later edit.',
      inputSchema: createTransitionRequirementSchema(),
      outputSchema: TransitionRequirementOutputSchema,
      title: 'Transition Requirement',
    },
    async input => {
      try {
        const payload = await service.transitionRequirement(
          await getBaseContext(request, 'requirements_transition_requirement'),
          toTransitionInput(input),
        )

        return {
          _meta: {
            'openai/outputTemplate': buildRequirementViewUri(
              { uniqueId: payload.detail.uniqueId },
              payload.version.versionNumber as number | undefined,
            ),
          },
          content: [
            {
              text: payload.message,
              type: 'text',
            },
            createRequirementResourceLink(
              payload.detail.uniqueId,
              payload.version.versionNumber as number | undefined,
            ),
            createUiResourceLink(
              payload.detail.uniqueId,
              payload.version.versionNumber as number | undefined,
            ),
          ],
          structuredContent: payload,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  server.registerTool(
    'requirements_list_specifications',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        'List all requirements specifications, optionally filtered by name. Returns id, uniqueId (slug), names, item count, responsibility area, and implementation type for each specification.',
      inputSchema: z
        .object({
          locale: z.enum(['en', 'sv']).default('en'),
          nameSearch: z
            .string()
            .optional()
            .describe(
              'Case-insensitive substring filter applied to the specification primary name (p.name) only.',
            ),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict(),
      outputSchema: z
        .object({
          message: z.string(),
          specifications: z.array(
            z
              .object({
                businessNeedsReference: z.string().nullable(),
                id: z.number(),
                implementationType: z
                  .object({ nameEn: z.string(), nameSv: z.string() })
                  .nullable(),
                itemCount: z.number(),
                name: z.string(),
                responsibilityArea: z
                  .object({ nameEn: z.string(), nameSv: z.string() })
                  .nullable(),
                uniqueId: z.string(),
              })
              .strict(),
          ),
        })
        .strict(),
      title: 'List Requirements Specifications',
    },
    async input => {
      try {
        const payload = await service.listSpecifications(
          await getBaseContext(request, 'requirements_list_specifications'),
          {
            locale: toResponseLocale(input.locale),
            nameSearch: input.nameSearch,
            responseFormat: toResponseFormat(input.responseFormat),
          },
        )
        return {
          content: [{ text: payload.message, type: 'text' }],
          structuredContent: payload as unknown as Record<string, unknown>,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  server.registerTool(
    'requirements_get_specification_items',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        'List requirements (krav) linked to a specific requirements specification, with optional description search. Identify the specification with specificationId (numeric) or specificationSlug (e.g. "SAKLYFT-INFOR-Q2") from requirements_list_specifications.',
      inputSchema: z
        .object({
          descriptionSearch: z
            .string()
            .optional()
            .describe(
              'Case-insensitive substring filter on the requirement description.',
            ),
          locale: z.enum(['en', 'sv']).default('en'),
          specificationId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Numeric ID of the requirements specification.'),
          specificationSlug: z
            .string()
            .optional()
            .describe(
              'Slug (uniqueId) of the requirements specification, e.g. "SAKLYFT-INFOR-Q2".',
            ),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict()
        .superRefine((val, ctx) => {
          if (
            (val.specificationId == null) ===
            (val.specificationSlug == null)
          ) {
            ctx.addIssue({
              code: 'custom',
              message:
                'Provide exactly one of specificationId or specificationSlug.',
            })
          }
        }),
      outputSchema: z
        .object({
          items: z.array(
            z
              .object({
                area: z.string().nullable(),
                category: z.string().nullable(),
                description: z.string().nullable(),
                id: z.number(),
                needsReference: z.string().nullable(),
                status: z.string().nullable(),
                type: z.string().nullable(),
                uniqueId: z.string(),
              })
              .strict(),
          ),
          message: z.string(),
          specificationId: z.number(),
        })
        .strict(),
      title: 'Get Specification Items',
    },
    async input => {
      try {
        const payload = await service.getSpecificationItems(
          await getBaseContext(request, 'requirements_get_specification_items'),
          {
            descriptionSearch: input.descriptionSearch,
            locale: toResponseLocale(input.locale),
            specificationId: input.specificationId,
            specificationSlug: input.specificationSlug,
            responseFormat: toResponseFormat(input.responseFormat),
          },
        )
        return {
          content: [{ text: payload.message, type: 'text' }],
          structuredContent: payload as unknown as Record<string, unknown>,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  server.registerTool(
    'requirements_add_to_specification',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'Link one or more requirements to a requirements specification. Requirements must have a published version; those without are skipped and returned in skippedIds. Optionally attach a needs reference text to all added items. Identify the specification with specificationId (numeric) or specificationSlug (e.g. "SAKLYFT-INFOR-Q2").',
      inputSchema: z
        .object({
          locale: z.enum(['en', 'sv']).default('en'),
          needsReferenceText: z
            .string()
            .optional()
            .describe(
              'Optional needs reference text applied to all added requirements. An existing reference with the same text will be reused.',
            ),
          specificationId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Numeric ID of the requirements specification.'),
          specificationSlug: z
            .string()
            .optional()
            .describe(
              'Slug (uniqueId) of the requirements specification, e.g. "SAKLYFT-INFOR-Q2".',
            ),
          requirementIds: z
            .array(z.number().int().positive())
            .min(1)
            .describe(
              'Numeric requirement IDs (not uniqueId strings) to add to the specification.',
            ),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict()
        .superRefine((val, ctx) => {
          if (
            (val.specificationId == null) ===
            (val.specificationSlug == null)
          ) {
            ctx.addIssue({
              code: 'custom',
              message:
                'Provide exactly one of specificationId or specificationSlug.',
            })
          }
        }),
      outputSchema: z
        .object({
          addedCount: z.number(),
          message: z.string(),
          skippedCount: z.number(),
          skippedIds: z.array(z.number()),
        })
        .strict(),
      title: 'Add Requirements to Specification',
    },
    async input => {
      try {
        const payload = await service.addToSpecification(
          await getBaseContext(request, 'requirements_add_to_specification'),
          {
            locale: toResponseLocale(input.locale),
            needsReferenceText: input.needsReferenceText,
            specificationId: input.specificationId,
            specificationSlug: input.specificationSlug,
            requirementIds: input.requirementIds,
            responseFormat: toResponseFormat(input.responseFormat),
          },
        )
        return {
          content: [{ text: payload.message, type: 'text' }],
          structuredContent: payload as unknown as Record<string, unknown>,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  server.registerTool(
    'requirements_remove_from_specification',
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'Unlink one or more requirements from a requirements specification. The requirements themselves are not deleted. Identify the specification with specificationId (numeric) or specificationSlug (e.g. "SAKLYFT-INFOR-Q2").',
      inputSchema: z
        .object({
          locale: z.enum(['en', 'sv']).default('en'),
          specificationId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Numeric ID of the requirements specification.'),
          specificationSlug: z
            .string()
            .optional()
            .describe(
              'Slug (uniqueId) of the requirements specification, e.g. "SAKLYFT-INFOR-Q2".',
            ),
          requirementIds: z
            .array(z.number().int().positive())
            .min(1)
            .describe(
              'Numeric requirement IDs to remove from the specification.',
            ),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict()
        .superRefine((val, ctx) => {
          if (
            (val.specificationId == null) ===
            (val.specificationSlug == null)
          ) {
            ctx.addIssue({
              code: 'custom',
              message:
                'Provide exactly one of specificationId or specificationSlug.',
            })
          }
        }),
      outputSchema: z
        .object({
          message: z.string(),
          removedCount: z.number(),
        })
        .strict(),
      title: 'Remove Requirements from Specification',
    },
    async input => {
      try {
        const payload = await service.removeFromSpecification(
          await getBaseContext(
            request,
            'requirements_remove_from_specification',
          ),
          {
            locale: toResponseLocale(input.locale),
            specificationId: input.specificationId,
            specificationSlug: input.specificationSlug,
            requirementIds: input.requirementIds,
            responseFormat: toResponseFormat(input.responseFormat),
          },
        )
        return {
          content: [{ text: payload.message, type: 'text' }],
          structuredContent: payload as unknown as Record<string, unknown>,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  // ---------- Improvement suggestion tools ----------

  server.registerTool(
    'requirements_list_improvement_suggestions',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        'List improvement suggestions for a specific requirement. Identify the requirement by numeric requirementId or by uniqueId (e.g. "REQ-001").',
      inputSchema: z
        .object({
          locale: ResponseLocaleSchema,
          requirementId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Numeric ID of the requirement.'),
          responseFormat: ResponseFormatSchema,
          uniqueId: z
            .string()
            .max(64)
            .optional()
            .describe('Unique requirement ID, e.g. "REQ-001".'),
        })
        .strict()
        .superRefine((val, ctx) => {
          if ((val.requirementId == null) === (val.uniqueId == null)) {
            ctx.addIssue({
              code: 'custom',
              message: 'Provide exactly one of requirementId or uniqueId.',
            })
          }
        }),
      outputSchema: ListSuggestionsOutputSchema,
      title: 'List Improvement Suggestions for Requirement',
    },
    async input => {
      try {
        const payload = await service.listSuggestions(
          await getBaseContext(
            request,
            'requirements_list_improvement_suggestions',
          ),
          {
            locale: toResponseLocale(input.locale),
            requirementId: input.requirementId,
            responseFormat: toResponseFormat(input.responseFormat),
            uniqueId: input.uniqueId,
          },
        )
        return {
          content: [{ text: payload.message, type: 'text' }],
          structuredContent: payload as unknown as Record<string, unknown>,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  server.registerTool(
    'requirements_manage_improvement_suggestion',
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'Create, edit, delete, request review, revert to draft, resolve, or dismiss an improvement suggestion on a requirement.',
      inputSchema: z
        .object({
          content: z
            .string()
            .max(4000)
            .optional()
            .describe('Suggestion text content. Required for create and edit.'),
          createdBy: z
            .string()
            .max(200)
            .optional()
            .describe('Who created the suggestion.'),
          suggestionId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              'Numeric suggestion ID. Required for all operations except create.',
            ),
          locale: ResponseLocaleSchema,
          operation: z
            .enum([
              'create',
              'delete',
              'dismiss',
              'edit',
              'request_review',
              'resolve',
              'revert_to_draft',
            ])
            .describe('Suggestion operation to perform.'),
          requirementId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Numeric requirement ID. Required for create.'),
          requirementVersionId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Optional version ID to link the suggestion to.'),
          resolutionMotivation: z
            .string()
            .max(4000)
            .optional()
            .describe('Motivation text. Required for resolve and dismiss.'),
          resolvedBy: z
            .string()
            .max(200)
            .optional()
            .describe(
              'Who resolved/dismissed the suggestion. Required for resolve/dismiss when the request actor has no ID.',
            ),
          responseFormat: ResponseFormatSchema,
        })
        .strict()
        .superRefine((data, ctx) => {
          switch (data.operation) {
            case 'create':
              if (!data.requirementId) {
                ctx.addIssue({
                  code: 'custom',
                  message: 'requirementId is required for the create operation',
                  path: ['requirementId'],
                })
              }
              if (!data.content) {
                ctx.addIssue({
                  code: 'custom',
                  message: 'content is required for the create operation',
                  path: ['content'],
                })
              }
              break
            case 'edit':
              if (!data.suggestionId) {
                ctx.addIssue({
                  code: 'custom',
                  message: 'suggestionId is required for the edit operation',
                  path: ['suggestionId'],
                })
              }
              if (!data.content) {
                ctx.addIssue({
                  code: 'custom',
                  message: 'content is required for the edit operation',
                  path: ['content'],
                })
              }
              break
            case 'resolve':
            case 'dismiss':
              if (!data.suggestionId) {
                ctx.addIssue({
                  code: 'custom',
                  message: `suggestionId is required for the ${data.operation} operation`,
                  path: ['suggestionId'],
                })
              }
              if (!data.resolutionMotivation) {
                ctx.addIssue({
                  code: 'custom',
                  message: `resolutionMotivation is required for the ${data.operation} operation`,
                  path: ['resolutionMotivation'],
                })
              }
              break
            case 'delete':
            case 'request_review':
            case 'revert_to_draft':
              if (!data.suggestionId) {
                ctx.addIssue({
                  code: 'custom',
                  message: `suggestionId is required for the ${data.operation} operation`,
                  path: ['suggestionId'],
                })
              }
              break
          }
        }),
      outputSchema: ManageSuggestionOutputSchema,
      title: 'Manage Improvement Suggestion',
    },
    async input => {
      try {
        const payload = await service.manageSuggestion(
          await getBaseContext(
            request,
            'requirements_manage_improvement_suggestion',
          ),
          {
            content: input.content,
            createdBy: input.createdBy,
            suggestionId: input.suggestionId,
            locale: toResponseLocale(input.locale),
            operation: input.operation,
            requirementId: input.requirementId,
            requirementVersionId: input.requirementVersionId,
            resolutionMotivation: input.resolutionMotivation,
            resolvedBy: input.resolvedBy,
            responseFormat: toResponseFormat(input.responseFormat),
          },
        )
        return {
          content: [{ text: payload.message, type: 'text' }],
          structuredContent: payload as unknown as Record<string, unknown>,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  // ── AI Requirement Generation ───────────────────────────────────────
  server.registerTool(
    'requirements_generate_requirements',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description:
        'Generate system requirements using AI (OpenRouter) based on a topic. ' +
        'Returns generated requirements with thinking trace. ' +
        'To create the generated requirements, call requirements_manage_requirement ' +
        'with operation "create" for each requirement, using the generated fields as the requirement object and setting requirement.areaId ' +
        "to the areaId provided in this tool's input.",
      inputSchema: z
        .object({
          areaId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              'Area ID to assign to generated requirements when creating them via requirements_manage_requirement',
            ),
          customInstruction: z
            .string()
            .max(5000)
            .optional()
            .describe(
              'Custom instruction to override the default generation prompt',
            ),
          locale: z
            .enum(['en', 'sv'])
            .default('en')
            .describe('Locale for taxonomy names in the prompt'),
          model: z
            .string()
            .max(100)
            .optional()
            .describe(
              'OpenRouter model ID (e.g. "anthropic/claude-sonnet-4"). Uses NEXT_PUBLIC_DEFAULT_MODEL env var if omitted.',
            ),
          topic: z
            .string()
            .min(1)
            .max(1000)
            .describe(
              'The topic or system context to generate requirements for',
            ),
        })
        .strict(),
      outputSchema: GenerateRequirementsOutputSchema,
      title: 'Generate Requirements (AI)',
    },
    async input => {
      try {
        const payload = await service.generateRequirements(
          await getBaseContext(request, 'requirements_generate_requirements'),
          input as GenerateRequirementsInput,
        )

        const reqSummary = payload.requirements
          .map(
            (r, i) =>
              `${i + 1}. [Type ${r.typeId}] ${r.description.slice(0, 120)}`,
          )
          .join('\n')

        const areaNote = (input as { areaId?: number }).areaId
          ? ` Set \`areaId: ${(input as { areaId?: number }).areaId}\` on each requirement.`
          : ' Remember to set `areaId` on each requirement.'

        const text = [
          `Generated ${payload.requirements.length} requirements (model: ${payload.model})`,
          '',
          '## Requirements',
          reqSummary,
          '',
          '## Thinking Trace',
          payload.thinking
            ? payload.thinking.slice(0, 2000)
            : '(no thinking trace)',
          '',
          '---',
          `To create these requirements, call \`requirements_manage_requirement\` with \`operation: "create"\` for each one.${areaNote}`,
        ].join('\n')

        return {
          content: [{ text, type: 'text' }],
          structuredContent: payload as unknown as Record<string, unknown>,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  return server
}

export function createRequirementsMcpServerFromDb(
  db: Parameters<typeof createRequirementsService>[0],
  request: Request,
): McpServer {
  const uiSettings = createUiSettingsLoader(db)
  const service = createRequirementsService(db, { uiSettings })
  return createKravhanteringMcpServer(service, request, uiSettings)
}
