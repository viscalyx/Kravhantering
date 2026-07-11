import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod'
import {
  MCP_IMPORT_MAX_ROWS_DEFAULT,
  MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'
import type { McpRuntimeSettings } from '@/lib/dal/ai-settings'
import type { SqlServerDatabase } from '@/lib/db'
import {
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
import {
  isRequirementsServiceError,
  type RequirementsErrorCode,
} from '@/lib/requirements/errors'
import { createRequirementsRuntime } from '@/lib/requirements/server'
import {
  buildRequirementViewUri,
  type GetRequirementInput,
  type GraduateSpecificationLocalRequirementInput,
  type ListGraduationTargetAreasInput,
  type ManageImportInput,
  type ManageNeedsReferenceInput,
  type ManageNormReferenceInput,
  type ManageRequirementInput,
  type QueryCatalogInput,
  type RequirementsService,
  type TransitionRequirementInput,
  toResponseFormat,
  toResponseLocale,
} from '@/lib/requirements/service'
import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

const HTML_BASE_MESSAGES = {
  en: enMessages,
  sv: svMessages,
} satisfies Record<'en' | 'sv', Record<string, unknown>>

const DEFAULT_MCP_RUNTIME_SETTINGS: McpRuntimeSettings = Object.freeze({
  mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
  mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
})

const READABLE_MCP_ERROR_CODES = new Set<RequirementsErrorCode>([
  'not_found',
  'validation',
  'conflict',
  'unauthorized',
  'forbidden',
])

const QueryCatalogKindSchema = z.enum([
  'requirements',
  'areas',
  'categories',
  'types',
  'quality_characteristics',
  'priority_levels',
  'specification_item_statuses',
  'statuses',
  'requirement_packages',
  'transitions',
])

const ResponseFormatSchema = z
  .enum(['json', 'markdown'])
  .default('markdown')
  .describe('Use "json" for machine-readable text, or "markdown" for display.')

const ResponseLocaleSchema = z
  .enum(['en', 'sv'])
  .default('en')
  .describe(
    'Response language for names, messages, and generated artifacts. Supported values: "en" and "sv". Defaults to "en".',
  )

const ImportInstructionOutputSchema = z
  .object({
    importInstruction: z
      .string()
      .describe('Canonical import instruction Markdown.'),
  })
  .strict()

const ImportSchemaOutputSchema = z
  .object({})
  .catchall(z.unknown())
  .describe('Canonical requirement import JSON Schema object.')

const QueryCatalogOutputSchema = z
  .object({
    result: z
      .array(z.record(z.string(), z.unknown()))
      .describe(
        'Catalog rows for operation "list" or "search". Search rows include top-level match metadata.',
      ),
  })
  .strict()
  .describe('Structured catalog output. Rows are always in result.')

const McpSearchMatchOutputSchema = z
  .object({
    matchedFields: z.array(z.string()),
    quality: z.enum(['exact', 'normalizedExact', 'startsWith', 'contains']),
  })
  .strict()

const McpIssueOutputSchema = z
  .object({
    code: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    message: z.string(),
    path: z.string(),
    severity: z.enum(['error', 'warning']),
  })
  .strict()

const LibraryDestinationRefSchema = z
  .object({
    areaId: z
      .number()
      .int()
      .positive()
      .describe(
        'Requirement area ID from requirements_manage_import list_destinations/search_destinations result[].areaId.',
      ),
    kind: z.literal('requirements_library'),
  })
  .strict()

const SpecificationDestinationRefSchema = z
  .object({
    kind: z.literal('requirements_specification'),
    specificationId: z
      .number()
      .int()
      .positive()
      .describe(
        'Requirements specification ID from requirements_manage_import list_destinations/search_destinations result[].specificationId.',
      ),
  })
  .strict()

const ImportDestinationRefSchema = z.discriminatedUnion('kind', [
  LibraryDestinationRefSchema,
  SpecificationDestinationRefSchema,
])

const LibraryImportInstructionDestinationRefSchema = z
  .object({
    kind: z.literal('requirements_library'),
  })
  .strict()

const ImportInstructionDestinationRefSchema = z.discriminatedUnion('kind', [
  LibraryImportInstructionDestinationRefSchema,
  SpecificationDestinationRefSchema,
])

const ImportDestinationOutputSchema = z
  .union([
    LibraryDestinationRefSchema.extend({
      match: McpSearchMatchOutputSchema.optional(),
      name: z.string(),
      prefix: z.string(),
    }).strict(),
    SpecificationDestinationRefSchema.extend({
      match: McpSearchMatchOutputSchema.optional(),
      name: z.string(),
      specificationCode: z.string(),
    }).strict(),
  ])
  .describe(
    'Import destination. Pass exactly kind plus areaId or specificationId back to validate.',
  )

const ManageImportOutputSchema = z
  .object({
    destination: ImportDestinationOutputSchema.optional(),
    expiresAt: z.string().optional(),
    hasErrors: z.boolean().optional(),
    hasWarnings: z.boolean().optional(),
    importedRows: z.array(z.record(z.string(), z.unknown())).optional(),
    issues: z.array(McpIssueOutputSchema).optional(),
    needsReferenceProposals: z
      .array(z.record(z.string(), z.unknown()))
      .optional(),
    notImportedRows: z.array(z.record(z.string(), z.unknown())).optional(),
    payloadHash: z.string().optional(),
    proposals: z.array(z.record(z.string(), z.unknown())).optional(),
    referenceData: z.record(z.string(), z.unknown()).optional(),
    result: z.array(ImportDestinationOutputSchema).optional(),
    rows: z.array(z.record(z.string(), z.unknown())).optional(),
    submittedPayload: z.record(z.string(), z.unknown()).optional(),
    summary: z
      .object({
        importedCount: z.number(),
        notImportedCount: z.number(),
        totalRowCount: z.number(),
      })
      .strict()
      .optional(),
    validationToken: z.string().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (Object.hasOwn(val, 'result')) {
      rejectUnexpectedFields(ctx, val, ['result'])
      return
    }
    if (Object.hasOwn(val, 'submittedPayload')) {
      for (const field of [
        'destination',
        'expiresAt',
        'payloadHash',
        'needsReferenceProposals',
        'proposals',
        'referenceData',
        'rows',
        'submittedPayload',
      ] as const) {
        requireField(ctx, val, field)
      }
      rejectUnexpectedFields(ctx, val, [
        'destination',
        'expiresAt',
        'payloadHash',
        'needsReferenceProposals',
        'proposals',
        'referenceData',
        'rows',
        'submittedPayload',
      ])
      return
    }
    if (
      Object.hasOwn(val, 'importedRows') ||
      Object.hasOwn(val, 'notImportedRows') ||
      Object.hasOwn(val, 'summary')
    ) {
      for (const field of [
        'destination',
        'importedRows',
        'notImportedRows',
        'summary',
      ] as const) {
        requireField(ctx, val, field)
      }
      rejectUnexpectedFields(ctx, val, [
        'destination',
        'importedRows',
        'notImportedRows',
        'summary',
      ])
      return
    }

    for (const field of ['hasErrors', 'hasWarnings', 'issues'] as const) {
      requireField(ctx, val, field)
    }
    rejectUnexpectedFields(ctx, val, [
      'expiresAt',
      'hasErrors',
      'hasWarnings',
      'issues',
      'validationToken',
    ])
  })
  .describe('Import management result. Shape depends on operation.')

const NeedsReferenceOutputSchema = z
  .object({
    createdAt: z.string(),
    description: z.string().nullable(),
    id: z.number(),
    libraryItemCount: z.number(),
    linkedItemCount: z.number(),
    match: McpSearchMatchOutputSchema.optional(),
    specificationLocalRequirementCount: z.number(),
    text: z.string(),
    updatedAt: z.string(),
  })
  .strict()

const ManageNeedsReferenceOutputSchema = z
  .object({
    needsReference: NeedsReferenceOutputSchema.optional(),
    result: z.array(NeedsReferenceOutputSchema).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (Object.hasOwn(val, 'result')) {
      rejectUnexpectedFields(ctx, val, ['result'])
      return
    }
    requireField(ctx, val, 'needsReference')
    rejectUnexpectedFields(ctx, val, ['needsReference'])
  })
  .describe(
    'Specification needs-reference management result. Shape depends on operation: result or needsReference.',
  )

const NormReferenceOutputSchema = z
  .object({
    createdAt: z.string(),
    id: z.number(),
    isArchived: z.boolean(),
    issuer: z.string(),
    match: McpSearchMatchOutputSchema.optional(),
    name: z.string(),
    normReferenceId: z.string(),
    reference: z.string(),
    type: z.string(),
    updatedAt: z.string(),
    uri: z.string().nullable(),
    version: z.string().nullable(),
  })
  .strict()

const ConnectedNormReferenceRequirementSchema = z
  .object({
    id: z.number(),
    uniqueId: z.string(),
  })
  .strict()

const NormReferenceIdConflictReasonSchema = z.enum([
  'norm_reference_id_exists',
  'norm_reference_id_generation_exhausted',
])

const NormReferenceManagementErrorOutputSchema = z
  .object({
    error: z
      .object({
        code: z.literal('conflict'),
        reason: NormReferenceIdConflictReasonSchema,
      })
      .strict(),
  })
  .strict()

const ManageNormReferenceOutputSchema = z
  .object({
    error: NormReferenceManagementErrorOutputSchema.shape.error.optional(),
    normReference: NormReferenceOutputSchema.optional(),
    requirements: z.array(ConnectedNormReferenceRequirementSchema).optional(),
    result: z.array(NormReferenceOutputSchema).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (Object.hasOwn(val, 'error')) {
      rejectUnexpectedFields(ctx, val, ['error'])
      return
    }
    if (Object.hasOwn(val, 'result')) {
      rejectUnexpectedFields(ctx, val, ['result'])
      return
    }
    if (Object.hasOwn(val, 'requirements')) {
      rejectUnexpectedFields(ctx, val, ['requirements'])
      return
    }
    requireField(ctx, val, 'normReference')
    rejectUnexpectedFields(ctx, val, ['normReference'])
  })
  .describe(
    'Normbibliotek management result. Shape depends on operation: result, normReference, requirements, or error.',
  )

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

const GraduateLocalRequirementOutputSchema = z
  .object({
    detail: RequirementDetailOutputSchema,
    message: z.string(),
    requirementResourceUri: z.string(),
    requirementViewUri: z.string(),
    result: z.record(z.string(), z.unknown()),
  })
  .strict()

const GraduationTargetAreasOutputSchema = z
  .object({
    areas: z.array(
      z
        .object({
          id: z.number(),
          name: z.string(),
          prefix: z.string(),
        })
        .strict(),
    ),
    message: z.string(),
  })
  .strict()

const DeletedDraftRequirementVersionOutputSchema = z
  .object({
    type: z.literal('draftRequirementVersion'),
    requirementUniqueId: z.string(),
    versionNumber: z.number().int().positive(),
  })
  .strict()

const DeletedRequirementOutputSchema = z
  .object({
    type: z.literal('requirement'),
    requirementUniqueId: z.string(),
  })
  .strict()

const DeleteDraftResultOutputSchema = z
  .object({
    deleted: z
      .array(
        z.discriminatedUnion('type', [
          DeletedDraftRequirementVersionOutputSchema,
          DeletedRequirementOutputSchema,
        ]),
      )
      .min(1)
      .max(2),
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
      .union([DeleteDraftResultOutputSchema, z.record(z.string(), z.unknown())])
      .describe(
        'Operation result. Edit results include the updated version id. Delete-draft results include a deleted array with the draftRequirementVersion entry first and the parent requirement entry second when the requirement was also deleted.',
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
) {
  let current: unknown = messages

  for (const segment of path) {
    if (
      typeof current !== 'object' ||
      current === null ||
      Array.isArray(current)
    ) {
      return path.join('.')
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return typeof current === 'string' ? current : path.join('.')
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
    isRequirementsServiceError(error) &&
    READABLE_MCP_ERROR_CODES.has(error.code)
      ? error.message
      : 'An internal error occurred'

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

function formatNormReferenceError(error: unknown) {
  const reason =
    isRequirementsServiceError(error) && error.code === 'conflict'
      ? error.details?.reason
      : undefined
  const parsedReason = NormReferenceIdConflictReasonSchema.safeParse(reason)
  if (!parsedReason.success || !isRequirementsServiceError(error)) {
    return formatError(error)
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${error.message}`,
      },
    ],
    isError: true,
    structuredContent: {
      error: {
        code: 'conflict' as const,
        reason: parsedReason.data,
      },
    },
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
) {
  const localizedMessages = HTML_BASE_MESSAGES[locale]
  const detailLabel = (key: string) =>
    getMessageString(localizedMessages, ['requirements', 'detailLabels', key])
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
        requirementPackage?: { name?: string | null }
      }[])
    : []

  const title = `${detail.uniqueId}${selectedVersion?.versionNumber ? ` v${selectedVersion.versionNumber}` : ''}`
  const statusLabel =
    locale === 'sv'
      ? (selectedVersion?.statusNameSv as string | undefined)
      : (selectedVersion?.statusNameEn as string | undefined)
  const verifiableLabel = detailLabel('verifiable')
  const verifiableOffLabel = detailLabel('verifiableOff')
  const noneLabel = getMessageString(localizedMessages, [
    'common',
    'noneAvailable',
  ])
  const unnamedReferenceLabel = getMessageString(localizedMessages, [
    'reference',
    'unnamed',
  ])

  const requirementPackageNames = requirementPackages
    .map(item => item.requirementPackage?.name)
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
    `      <div class="eyebrow">${escapeHtml(detailLabel('mcpRequirementView'))}</div>`,
    `      <h1>${escapeHtml(title)}</h1>`,
    '      <div class="meta">',
    `        <span class="pill">${escapeHtml(statusLabel ?? 'Unknown')}</span>`,
    `        <span class="pill">${escapeHtml(String(detail.area?.name ?? 'No area'))}</span>`,
    `        <span class="pill">${selectedVersion?.verifiable ? escapeHtml(verifiableLabel) : escapeHtml(verifiableOffLabel)}</span>`,
    selectedVersion?.verificationMethod
      ? `        <span class="pill">${escapeHtml(selectedVersion.verificationMethod)}</span>`
      : '',
    '      </div>',
    '      <section class="split">',
    '        <div>',
    `          <h2>${escapeHtml(detailLabel('description'))}</h2>`,
    `          <p class="body-text">${escapeHtml(String(selectedVersion?.description ?? ''))}</p>`,
    `          <h2>${escapeHtml(detailLabel('acceptanceCriteria'))}</h2>`,
    `          <p class="body-text">${escapeHtml(String(selectedVersion?.acceptanceCriteria ?? ''))}</p>`,
    '        </div>',
    '        <div class="grid">',
    `          <section class="panel"><h2>${escapeHtml(detailLabel('category'))}</h2><p>${escapeHtml(String((locale === 'sv' ? selectedVersion?.category?.nameSv : selectedVersion?.category?.nameEn) ?? '—'))}</p></section>`,
    `          <section class="panel"><h2>${escapeHtml(detailLabel('type'))}</h2><p>${escapeHtml(String((locale === 'sv' ? selectedVersion?.type?.nameSv : selectedVersion?.type?.nameEn) ?? '—'))}</p></section>`,
    `          <section class="panel"><h2>${escapeHtml(detailLabel('qualityCharacteristic'))}</h2><p>${escapeHtml(String((locale === 'sv' ? selectedVersion?.qualityCharacteristic?.nameSv : selectedVersion?.qualityCharacteristic?.nameEn) ?? '—'))}</p></section>`,
    `          <section class="panel"><h2>${escapeHtml(detailLabel('priorityLevel'))}</h2><p>${escapeHtml(String((locale === 'sv' ? selectedVersion?.priorityLevel?.nameSv : selectedVersion?.priorityLevel?.nameEn) ?? '—'))}</p></section>`,
    `          <section class="panel"><h2>${escapeHtml(detailLabel('version'))}</h2><p>${escapeHtml(String(selectedVersion?.versionNumber ?? '—'))}</p></section>`,
    `          <section class="panel"><h2>${escapeHtml(getMessageString(localizedMessages, ['requirement', 'specificationCount']))}</h2><p>${escapeHtml(String(detail.specificationCount ?? 0))}</p></section>`,
    '        </div>',
    '      </section>',
    '      <section class="split">',
    `        <section class="panel"><h2>${escapeHtml(detailLabel('references'))}</h2>${normReferenceMarkup}</section>`,
    `        <section class="panel"><h2>${escapeHtml(detailLabel('requirementPackage'))}</h2>${requirementPackageMarkup}</section>`,
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
      catalog: QueryCatalogKindSchema.describe(
        'Catalog to list or search. Use "requirements" for requirement rows or a lookup catalog for reference rows.',
      ),
      categoryIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Requirement category IDs. Applies only to catalog "requirements".',
        ),
      includeArchived: z
        .boolean()
        .optional()
        .describe(
          'Whether archived requirements are included. Applies only to catalog "requirements".',
        ),
      locale: ResponseLocaleSchema,
      normReferenceIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Norm reference IDs. Applies only to catalog "requirements".',
        ),
      operation: z
        .enum(['list', 'search'])
        .describe(
          '"list" returns all matching rows in structuredContent.result. "search" returns matching rows with top-level match metadata.',
        ),
      qualityCharacteristicIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Quality characteristic IDs. Applies only to catalog "requirements".',
        ),
      verifiable: z
        .array(z.boolean())
        .optional()
        .describe(
          'Filter by verifiability. Applies only to catalog "requirements".',
        ),
      priorityLevelIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Priority level IDs. Applies only to catalog "requirements".',
        ),
      sortBy: z
        .enum([
          'uniqueId',
          'description',
          'area',
          'category',
          'type',
          'qualityCharacteristic',
          'priorityLevel',
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
      search: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .optional()
        .describe(
          'Search text for operation "search". Requirement search matches id, uniqueId, version.description, and version.acceptanceCriteria; lookup search matches stable lookup fields.',
        ),
      statuses: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Requirement version status IDs. Applies only to catalog "requirements".',
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
      requirementPackageIds: z
        .array(z.number().int().positive())
        .optional()
        .describe(
          'Requirements package IDs. Applies only to catalog "requirements".',
        ),
    })
    .strict()
    .superRefine((val, ctx) => {
      if (val.operation === 'search' && !val.search?.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'search is required for operation "search".',
          path: ['search'],
        })
      }
      if (val.operation === 'list' && val.search != null) {
        ctx.addIssue({
          code: 'custom',
          message: 'search is allowed only for operation "search".',
          path: ['search'],
        })
      }
    })
}

function requireField(
  ctx: z.RefinementCtx,
  val: Record<string, unknown>,
  field: string,
): void {
  if (!Object.hasOwn(val, field) || val[field] === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: `${field} is required for this operation.`,
      path: [field],
    })
  }
}

function rejectUnexpectedFields(
  ctx: z.RefinementCtx,
  val: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const allowed = new Set(allowedFields)
  for (const field of Object.keys(val)) {
    if (!allowed.has(field)) {
      ctx.addIssue({
        code: 'custom',
        message: `${field} is not allowed for this operation.`,
        path: [field],
      })
    }
  }
}

function createManageImportSchema() {
  return z
    .object({
      destination: ImportDestinationRefSchema.optional().describe(
        'Exact destination object. Use {kind:"requirements_library", areaId} or {kind:"requirements_specification", specificationId} from list_destinations/search_destinations.',
      ),
      kind: z
        .enum(['requirements_library', 'requirements_specification'])
        .optional()
        .describe('Optional destination-kind filter.'),
      operation: z
        .enum([
          'list_destinations',
          'search_destinations',
          'validate',
          'execute',
          'inspect_validation',
        ])
        .describe('Import management operation.'),
      payload: z
        .unknown()
        .optional()
        .describe(
          'Kravimportfil JSON object that should follow requirements_get_import_schema. The service validates this raw payload and creates a persisted validation session when the schema is valid.',
        ),
      search: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .optional()
        .describe(
          'Destination search text. Matches names, IDs, prefixes, and slugs with exact, normalized exact, starts-with, and contains metadata.',
        ),
      validationToken: z
        .string()
        .trim()
        .min(1)
        .max(512)
        .optional()
        .describe(
          'Opaque validationToken returned by operation "validate". Execute imports every unconsumed row without errors; warnings do not block execution.',
        ),
    })
    .strict()
    .superRefine((val, ctx) => {
      if (val.operation === 'list_destinations') {
        rejectUnexpectedFields(ctx, val, ['kind', 'operation'])
        return
      }
      if (val.operation === 'search_destinations') {
        requireField(ctx, val, 'search')
        rejectUnexpectedFields(ctx, val, ['kind', 'operation', 'search'])
        return
      }
      if (val.operation === 'validate') {
        requireField(ctx, val, 'destination')
        requireField(ctx, val, 'payload')
        rejectUnexpectedFields(ctx, val, [
          'destination',
          'operation',
          'payload',
        ])
        return
      }
      if (val.operation === 'execute') {
        requireField(ctx, val, 'validationToken')
        rejectUnexpectedFields(ctx, val, ['operation', 'validationToken'])
        return
      }

      requireField(ctx, val, 'validationToken')
      rejectUnexpectedFields(ctx, val, ['operation', 'validationToken'])
    })
}

function createManageNeedsReferenceSchema() {
  return z
    .object({
      description: z
        .string()
        .trim()
        .max(4000)
        .nullable()
        .optional()
        .describe(
          'Optional description for a new needs reference. Allowed only for operation "create".',
        ),
      needsReferenceId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Needs reference ID from this tool result[].id or needsReference.id. Required for operation "get".',
        ),
      operation: z
        .enum(['list', 'search', 'get', 'create'])
        .describe('Specification needs-reference management operation.'),
      search: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .optional()
        .describe(
          'Search text for operation "search". Matches id, text, and description with match metadata.',
        ),
      specificationId: z
        .number()
        .int()
        .positive()
        .describe(
          'Requirements specification ID from requirements_manage_import list_destinations/search_destinations result[].specificationId.',
        ),
      text: z
        .string()
        .trim()
        .min(1)
        .max(255)
        .optional()
        .describe(
          'Needs-reference text for operation "create". Returned id can be used as requirements[].needsReferenceId in a Kravimportfil.',
        ),
    })
    .strict()
    .superRefine((val, ctx) => {
      if (val.operation === 'list') {
        rejectUnexpectedFields(ctx, val, ['operation', 'specificationId'])
        return
      }
      if (val.operation === 'search') {
        requireField(ctx, val, 'search')
        rejectUnexpectedFields(ctx, val, [
          'operation',
          'search',
          'specificationId',
        ])
        return
      }
      if (val.operation === 'get') {
        requireField(ctx, val, 'needsReferenceId')
        rejectUnexpectedFields(ctx, val, [
          'needsReferenceId',
          'operation',
          'specificationId',
        ])
        return
      }

      requireField(ctx, val, 'text')
      rejectUnexpectedFields(ctx, val, [
        'description',
        'operation',
        'specificationId',
        'text',
      ])
    })
}

function createManageNormReferenceSchema() {
  return z
    .object({
      id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Numeric norm reference database ID. For get/list_connected_requirement_ids, provide exactly one of id or normReferenceId.',
        ),
      includeArchived: z
        .boolean()
        .optional()
        .describe(
          'Defaults to false. Archived norm references are listed/searchable only for diagnostics and are not valid import references.',
        ),
      issuer: z.string().trim().min(1).max(255).optional(),
      name: z.string().trim().min(1).max(255).optional(),
      normReferenceId: z
        .string()
        .trim()
        .min(1)
        .max(255)
        .optional()
        .describe(
          'Stable norm reference business ID. If omitted for create, the server assigns one using the existing REST creation rules. For get/list_connected_requirement_ids, provide exactly one of id or normReferenceId.',
        ),
      operation: z
        .enum([
          'list',
          'search',
          'create',
          'get',
          'list_connected_requirement_ids',
        ])
        .describe('Norm reference management operation.'),
      reference: z.string().trim().min(1).max(255).optional(),
      search: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .optional()
        .describe(
          'Norm reference search text. Matches ID, issuer, name, reference, type, URI, and version with match metadata.',
        ),
      type: z.string().trim().min(1).max(255).optional(),
      uri: z.string().trim().max(4000).nullable().optional(),
      version: z.string().trim().max(4000).nullable().optional(),
    })
    .strict()
    .superRefine((val, ctx) => {
      if (val.operation === 'list') {
        rejectUnexpectedFields(ctx, val, ['includeArchived', 'operation'])
        return
      }
      if (val.operation === 'search') {
        requireField(ctx, val, 'search')
        rejectUnexpectedFields(ctx, val, [
          'includeArchived',
          'operation',
          'search',
        ])
        return
      }
      if (
        val.operation === 'get' ||
        val.operation === 'list_connected_requirement_ids'
      ) {
        const hasId = Object.hasOwn(val, 'id') && val.id !== undefined
        const hasNormReferenceId =
          Object.hasOwn(val, 'normReferenceId') &&
          val.normReferenceId !== undefined
        if (hasId === hasNormReferenceId) {
          ctx.addIssue({
            code: 'custom',
            message:
              'Provide exactly one of id or normReferenceId for this operation.',
            path: ['id'],
          })
        }
        rejectUnexpectedFields(ctx, val, ['id', 'normReferenceId', 'operation'])
        return
      }

      for (const field of ['issuer', 'name', 'reference', 'type'] as const) {
        requireField(ctx, val, field)
      }
      rejectUnexpectedFields(ctx, val, [
        'issuer',
        'name',
        'normReferenceId',
        'operation',
        'reference',
        'type',
        'uri',
        'version',
      ])
    })
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
    verifiable: z
      .boolean()
      .optional()
      .describe(
        'Whether the requirement version has objective conditions that can be checked.',
      ),
    verificationMethod: z
      .string()
      .max(4000)
      .optional()
      .describe(
        'How the requirement should be verified when verifiable is true.',
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
    priorityLevelId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Priority level ID.'),
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
        'Requirement fields for create/edit. For create, pass at least requirement.areaId and requirement.description; optional fields include acceptanceCriteria, typeId, categoryId, qualityCharacteristicId, priorityLevelId, verifiable, verificationMethod, requirementPackageIds, normReferenceIds, and createdBy. For edit, first call requirements_get_requirement with view: "history" and copy requirement.versions[0].id to baseVersionId plus requirement.versions[0].revisionToken to baseRevisionToken.',
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
          'Target requirement version status ID. Use requirements_query_catalog with operation "list" and catalog "transitions" or "statuses" before choosing this value.',
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

function createGraduationTargetAreasSchema() {
  return z
    .object({
      locale: ResponseLocaleSchema,
      localRequirementId: z
        .number()
        .int()
        .positive()
        .describe(
          'Numeric ID of the specification-local requirement to inspect; clients must send it as localRequirementId (also called unique requirement in the UI).',
        ),
      responseFormat: ResponseFormatSchema,
      specificationId: z
        .number()
        .int()
        .positive()
        .describe('Numeric ID of the source requirements specification.'),
    })
    .strict()
}

function createGraduateLocalRequirementSchema() {
  return z
    .object({
      locale: ResponseLocaleSchema,
      localRequirementId: z
        .number()
        .int()
        .positive()
        .describe(
          'Numeric ID of the specification-local requirement to copy; clients must send it as localRequirementId (also called unique requirement in the UI).',
        ),
      requirementAreaId: z
        .number()
        .int()
        .positive()
        .describe(
          'Target library requirement area ID where the new draft should be created. Use requirements_list_graduation_target_areas first and choose one returned areas[].id value.',
        ),
      responseFormat: ResponseFormatSchema,
      specificationId: z
        .number()
        .int()
        .positive()
        .describe('Numeric ID of the source requirements specification.'),
    })
    .strict()
}

function toCatalogInput(
  input: z.infer<ReturnType<typeof createQueryCatalogSchema>>,
): QueryCatalogInput {
  return {
    areaIds: input.areaIds,
    catalog: input.catalog,
    categoryIds: input.categoryIds,
    includeArchived: input.includeArchived,
    locale: toResponseLocale(input.locale),
    normReferenceIds: input.normReferenceIds,
    operation: input.operation,
    verifiable: input.verifiable,
    search: input.search,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
    statuses: input.statuses,
    qualityCharacteristicIds: input.qualityCharacteristicIds,
    priorityLevelIds: input.priorityLevelIds,
    typeId: input.typeId,
    typeIds: input.typeIds,
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

function toGraduationTargetAreasInput(
  input: z.infer<ReturnType<typeof createGraduationTargetAreasSchema>>,
): ListGraduationTargetAreasInput {
  return {
    locale: toResponseLocale(input.locale),
    localRequirementId: input.localRequirementId,
    responseFormat: toResponseFormat(input.responseFormat),
    specificationId: input.specificationId,
  }
}

function toGraduateLocalRequirementInput(
  input: z.infer<ReturnType<typeof createGraduateLocalRequirementSchema>>,
): GraduateSpecificationLocalRequirementInput {
  return {
    locale: toResponseLocale(input.locale),
    localRequirementId: input.localRequirementId,
    requirementAreaId: input.requirementAreaId,
    responseFormat: toResponseFormat(input.responseFormat),
    specificationId: input.specificationId,
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

function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024)
  return Number.isInteger(mib)
    ? `${mib} MiB (${bytes} bytes)`
    : `${bytes} bytes`
}

export function createKravhanteringMcpServer(
  service: RequirementsService,
  request: Request,
  mcpSettings: McpRuntimeSettings = DEFAULT_MCP_RUNTIME_SETTINGS,
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

  const specificationIdCopyPath =
    'Copy requirements_list_specifications.specifications[].specificationId -> specificationId.'
  const addRequirementIdsCopyPath =
    'Copy requirements_query_catalog.result[].id -> requirementIds.'
  const removeRequirementIdsCopyPath =
    'Copy requirements_get_specification_items.items[].id -> requirementIds.'

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
      return {
        contents: [
          {
            mimeType: 'text/html',
            text: renderRequirementHtml(payload, locale),
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
        'List or search the requirements library and lookup catalogs: requirements, areas, categories, types, quality_characteristics, priority_levels, specification_item_statuses, statuses, requirement_packages, and transitions. Requirement filters and sorting apply when catalog is "requirements"; typeId filters quality_characteristics.',
      inputSchema: createQueryCatalogSchema(),
      outputSchema: QueryCatalogOutputSchema,
      title: 'Query Requirements Library',
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
              text: 'Structured result returned in structuredContent.result.',
              type: 'text',
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  server.registerTool(
    'requirements_get_import_schema',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        'Return the canonical JSON Schema for producing a Kravimportfil (requirement import file). Use this locale-free schema as the mandatory machine contract for generated import JSON before calling requirements_manage_import validate.',
      inputSchema: z.object({}).strict(),
      outputSchema: ImportSchemaOutputSchema,
      title: 'Get Requirement Import Schema',
    },
    async () => {
      try {
        const payload = await service.getImportSchema(
          await getBaseContext(request, 'requirements_get_import_schema'),
          {
            locale: 'en',
          },
        )
        return {
          content: [
            {
              text: 'Requirement import JSON Schema returned in structuredContent.',
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
    'requirements_get_import_instruction',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        'Return the canonical destination-specific Importinstruktion (import instruction) Markdown for producing a Kravimportfil. Use requirements_get_import_schema as the mandatory JSON contract; this instruction is Kravhantering guidance and does not override or replace the schema. destination is required. If the destination is unknown, ask the user whether the import targets a requirements library or a requirements specification. Use {kind:"requirements_library"} for requirements library imports. For requirements specification imports, use requirements_manage_import list_destinations/search_destinations to resolve the specificationId before calling this tool.',
      inputSchema: z
        .object({
          destination: ImportInstructionDestinationRefSchema.describe(
            'Required import-instruction destination object. Use {kind:"requirements_library"} for requirements library imports. Use {kind:"requirements_specification", specificationId} for requirements specification imports; resolve specificationId with requirements_manage_import list_destinations/search_destinations when needed.',
          ),
          locale: ResponseLocaleSchema,
        })
        .strict(),
      outputSchema: ImportInstructionOutputSchema,
      title: 'Get Requirement Import Instruction',
    },
    async input => {
      try {
        const payload = await service.getImportInstruction(
          await getBaseContext(request, 'requirements_get_import_instruction'),
          {
            destination: input.destination,
            locale: toResponseLocale(input.locale),
          },
        )
        return {
          content: [
            {
              text: 'Requirement import instruction returned in structuredContent.importInstruction.',
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
    'requirements_manage_import',
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: `Manage MCP requirement import. Normal flow: call list_destinations or search_destinations when an exact validate destination or specificationId is needed; call requirements_get_import_schema; call requirements_get_import_instruction with {kind:"requirements_library"} for library imports or {kind:"requirements_specification", specificationId} for specification imports; create a Kravimportfil payload; call validate with exactly {kind:"requirements_library", areaId} or {kind:"requirements_specification", specificationId}; optionally resolve missing norm references with requirements_manage_norm_reference and specification needs references with requirements_manage_needs_reference; then call execute with validationToken. For requirements_specification imports, use needsReferenceId from requirements_manage_needs_reference result[].id/needsReference.id when a row belongs to an existing or newly created needs reference. Ask the user before creating missing needs references; if the user does not approve creation, ask whether importing without the needs-reference link is acceptable and stop when the link is central to why the row belongs in the specification. Do not rely on unresolved proposedNeedsReferences being resolved after MCP execute; MCP has no human import-review step between validate and execute. Validation sessions are immutable after validate, and execute accepts only validationToken. Use inspect_validation to troubleshoot full row/proposal detail or recover row state after a lost or uncertain execute response. To retry, build a corrected Kravimportfil from rows that were not successfully imported, then run validate and execute the new token. Do not copy successfully imported rows into the corrected payload because the server does not do generic duplicate detection across validation sessions. validate accepts at most ${mcpSettings.mcpImportMaxRows} rows and ${formatBytes(mcpSettings.mcpMaxRequestBytes)} per request/session. validationToken expires after ${mcpSettings.mcpImportValidationTtlMinutes} minute(s). execute imports all unconsumed rows without errors; warning rows are importable.`,
      inputSchema: createManageImportSchema(),
      outputSchema: ManageImportOutputSchema,
      title: 'Manage Requirement Import',
    },
    async input => {
      try {
        const payload = await service.manageImport(
          await getBaseContext(request, 'requirements_manage_import'),
          input as ManageImportInput,
        )
        const text =
          'result' in payload
            ? 'Structured result returned in structuredContent.result.'
            : 'validationToken' in payload || 'hasErrors' in payload
              ? 'Requirement import validation result returned in structuredContent.'
              : 'submittedPayload' in payload
                ? 'Requirement import validation inspection returned in structuredContent.'
                : 'Requirement import execution receipt returned in structuredContent.'
        return {
          content: [{ text, type: 'text' }],
          structuredContent: payload,
        }
      } catch (error) {
        return formatError(error)
      }
    },
  )

  server.registerTool(
    'requirements_manage_needs_reference',
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'List, search, get, or create specification-scoped needs references for a requirements specification. First choose a requirements specification with requirements_manage_import list_destinations/search_destinations and copy result[].specificationId to specificationId. Use list/search/get before generating a Kravimportfil; copy result[].id or needsReference.id to requirements[].needsReferenceId. Ask the user before calling create. Use create only after approval, then copy needsReference.id to requirements[].needsReferenceId before execute. If creation is not approved, ask whether importing without the needs-reference link is acceptable; stop when the link is central to why the row belongs in the specification.',
      inputSchema: createManageNeedsReferenceSchema(),
      outputSchema: ManageNeedsReferenceOutputSchema,
      title: 'Manage Needs Reference',
    },
    async input => {
      try {
        const payload = await service.manageNeedsReference(
          await getBaseContext(request, 'requirements_manage_needs_reference'),
          input as ManageNeedsReferenceInput,
        )
        return {
          content: [
            {
              text:
                'result' in payload
                  ? 'Structured result returned in structuredContent.result.'
                  : 'Needs reference returned in structuredContent.needsReference.',
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
    'requirements_manage_norm_reference',
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'List, search, get, create, or inspect connected library Krav IDs for Normbibliotek norm references. Use list/search to resolve normReferenceIds before generating a Kravimportfil; these discovery operations return full norm-reference properties but no connected krav rows, IDs, or counts. Use get with exactly one of id or normReferenceId for an exact lookup, including archived rows, and use list_connected_requirement_ids with the same selector to return connected library Krav IDs as {id, uniqueId}. Create allocates missing IDs as a deterministic base or suffix. An explicit duplicate or generated-ID exhaustion returns isError with structuredContent.error {code:"conflict", reason:"norm_reference_id_exists"|"norm_reference_id_generation_exhausted"}. Archived norm references are excluded from list/search by default and are not valid for import.',
      inputSchema: createManageNormReferenceSchema(),
      outputSchema: ManageNormReferenceOutputSchema,
      title: 'Manage Norm Reference',
    },
    async input => {
      try {
        const payload = await service.manageNormReference(
          await getBaseContext(request, 'requirements_manage_norm_reference'),
          input as ManageNormReferenceInput,
        )
        return {
          content: [
            {
              text:
                'result' in payload
                  ? 'Structured result returned in structuredContent.result.'
                  : 'requirements' in payload
                    ? 'Connected requirement IDs returned in structuredContent.requirements.'
                    : 'Norm reference returned in structuredContent.normReference.',
              type: 'text',
            },
          ],
          structuredContent: payload,
        }
      } catch (error) {
        return formatNormReferenceError(error)
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
      description: `List all requirements specifications, optionally filtered by name. Returns specificationId, specificationCode, names, item count, governance object type, and implementation type for each specification. ${specificationIdCopyPath}`,
      inputSchema: z
        .object({
          locale: ResponseLocaleSchema,
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
                specificationId: z.number(),
                specificationCode: z.string(),
                implementationType: z
                  .object({ nameEn: z.string(), nameSv: z.string() })
                  .nullable(),
                itemCount: z.number(),
                name: z.string(),
                governanceObjectType: z
                  .object({ nameEn: z.string(), nameSv: z.string() })
                  .nullable(),
              })
              .strict(),
          ),
        })
        .strict(),
      title: 'List requirements specifications',
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
        const structuredPayload = {
          ...payload,
          specifications: payload.specifications.map(
            ({ id, ...specification }) => ({
              ...specification,
              specificationId: id,
            }),
          ),
        }
        return {
          content: [{ text: payload.message, type: 'text' }],
          structuredContent: structuredPayload as unknown as Record<
            string,
            unknown
          >,
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
      description: `List requirements (krav) linked to a specific requirements specification, with optional description search. Identify the specification with specificationId from requirements_list_specifications. ${specificationIdCopyPath}`,
      inputSchema: z
        .object({
          descriptionSearch: z
            .string()
            .optional()
            .describe(
              'Case-insensitive substring filter on the requirement description.',
            ),
          locale: ResponseLocaleSchema,
          specificationId: z
            .number()
            .int()
            .positive()
            .describe(
              `Numeric ID of the requirements specification. ${specificationIdCopyPath}`,
            ),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict(),
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
      title: 'Get Requirement Applications',
    },
    async input => {
      try {
        const payload = await service.getSpecificationItems(
          await getBaseContext(request, 'requirements_get_specification_items'),
          {
            descriptionSearch: input.descriptionSearch,
            locale: toResponseLocale(input.locale),
            specificationId: input.specificationId,
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
    'requirements_list_graduation_target_areas',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        'List the requirement areas this actor may use as targets when copying a unique requirement into the library, regardless of its usage status. Use requirements_list_specifications and requirements_get_specification_items to identify the source, pass the same specificationId plus localRequirementId here, then use one returned areas[].id value as requirements_graduate_local_requirement requirementAreaId.',
      inputSchema: createGraduationTargetAreasSchema(),
      outputSchema: GraduationTargetAreasOutputSchema,
      title: 'List Graduation Target Requirement Areas',
    },
    async input => {
      try {
        const payload = await service.listGraduationTargetAreas(
          await getBaseContext(
            request,
            'requirements_list_graduation_target_areas',
          ),
          toGraduationTargetAreasInput(input),
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
    'requirements_graduate_local_requirement',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'Copy a unique requirement into a chosen library requirement area as a new Draft library requirement, regardless of its usage status. The source unique requirement remains unchanged in its specification, and deviations stay attached to the unique requirement. Use requirements_list_specifications and requirements_get_specification_items to identify the source, then call requirements_list_graduation_target_areas and use one returned areas[].id value as requirementAreaId.',
      inputSchema: createGraduateLocalRequirementSchema(),
      outputSchema: GraduateLocalRequirementOutputSchema,
      title: 'Graduate Local Requirement to Library',
    },
    async input => {
      try {
        const payload = await service.graduateSpecificationLocalRequirement(
          await getBaseContext(
            request,
            'requirements_graduate_local_requirement',
          ),
          toGraduateLocalRequirementInput(input),
        )
        const versionNumber = payload.result.version.versionNumber

        return {
          _meta: {
            'openai/outputTemplate': payload.requirementViewUri,
          },
          content: [
            { text: payload.message, type: 'text' },
            createRequirementResourceLink(
              payload.detail.uniqueId,
              versionNumber,
            ),
            createUiResourceLink(payload.detail.uniqueId, versionNumber),
          ],
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
      description: `Link one or more requirements to a requirements specification. Requirements must have a published version; those without are skipped and returned in skippedIds. Optionally attach an existing needsReferenceId or create a new needsReferenceText plus needsReferenceDescription for all added items. Identify the specification with specificationId. ${specificationIdCopyPath} ${addRequirementIdsCopyPath}`,
      inputSchema: z
        .object({
          locale: ResponseLocaleSchema,
          needsReferenceDescription: z
            .string()
            .optional()
            .describe(
              'Optional description for a new needs reference. Requires needsReferenceText.',
            ),
          needsReferenceId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              'Optional existing needs reference ID from the same requirements specification.',
            ),
          needsReferenceText: z
            .string()
            .optional()
            .describe(
              'Optional new needs reference text applied to all added requirements. Duplicate text in the same specification is rejected.',
            ),
          specificationId: z
            .number()
            .int()
            .positive()
            .describe(
              `Numeric ID of the requirements specification. ${specificationIdCopyPath}`,
            ),
          requirementIds: z
            .array(z.number().int().positive())
            .min(1)
            .describe(
              `Numeric requirement IDs (not uniqueId strings) to add to the specification. ${addRequirementIdsCopyPath}`,
            ),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict()
        .superRefine((val, ctx) => {
          if (val.needsReferenceId != null && val.needsReferenceText != null) {
            ctx.addIssue({
              code: 'custom',
              message:
                'Provide either needsReferenceId or needsReferenceText, not both.',
              path: ['needsReferenceText'],
            })
          }
          if (
            val.needsReferenceDescription != null &&
            val.needsReferenceText == null
          ) {
            ctx.addIssue({
              code: 'custom',
              message: 'needsReferenceDescription requires needsReferenceText.',
              path: ['needsReferenceDescription'],
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
            needsReferenceDescription: input.needsReferenceDescription,
            needsReferenceId: input.needsReferenceId,
            needsReferenceText: input.needsReferenceText,
            specificationId: input.specificationId,
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
      description: `Unlink one or more requirements from a requirements specification. The requirements themselves are not deleted. Identify the specification with specificationId. ${specificationIdCopyPath} ${removeRequirementIdsCopyPath}`,
      inputSchema: z
        .object({
          locale: ResponseLocaleSchema,
          specificationId: z
            .number()
            .int()
            .positive()
            .describe(
              `Numeric ID of the requirements specification. ${specificationIdCopyPath}`,
            ),
          requirementIds: z
            .array(z.number().int().positive())
            .min(1)
            .describe(
              `Numeric requirement IDs to remove from the specification. ${removeRequirementIdsCopyPath}`,
            ),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict(),
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

  return server
}

export function createRequirementsMcpServerFromDb(
  db: SqlServerDatabase,
  request: Request,
): McpServer {
  const { service } = createRequirementsRuntime(db)
  return createKravhanteringMcpServer(service, request)
}
