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

const QueryCatalogOutputSchema = z
  .object({
    catalog: z.string(),
    items: z.array(z.record(z.string(), z.unknown())),
    message: z.string(),
    pagination: PaginationSchema.nullable(),
  })
  .strict()

const GetRequirementOutputSchema = z
  .object({
    message: z.string(),
    requirement: z.record(z.string(), z.unknown()),
    requirementResourceUri: z.string(),
    requirementViewUri: z.string(),
    version: z.record(z.string(), z.unknown()).optional(),
    versions: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .strict()

const ManageRequirementOutputSchema = z
  .object({
    detail: z.record(z.string(), z.unknown()).optional(),
    message: z.string(),
    operation: z.string(),
    result: z.record(z.string(), z.unknown()),
  })
  .strict()

const TransitionRequirementOutputSchema = z
  .object({
    detail: z.record(z.string(), z.unknown()),
    message: z.string(),
    version: z.record(z.string(), z.unknown()),
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

function getBaseContext(request: Request, toolName?: string): RequestContext {
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
  const scenarios = Array.isArray(selectedVersion?.versionScenarios)
    ? (selectedVersion.versionScenarios as {
        scenario?: { nameEn?: string | null; nameSv?: string | null }
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

  const scenarioNames = scenarios
    .map(item =>
      locale === 'sv'
        ? (item.scenario?.nameSv ?? item.scenario?.nameEn)
        : (item.scenario?.nameEn ?? item.scenario?.nameSv),
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

  const scenarioMarkup =
    scenarioNames.length > 0
      ? `<ul>${scenarioNames
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
    `          <section class="panel"><h2>${escapeHtml(getMessageString(localizedMessages, ['requirement', 'packageCount'], locale === 'sv' ? 'Används i kravpaket' : 'Used in packages'))}</h2><p>${escapeHtml(String(detail.packageCount ?? 0))}</p></section>`,
    '        </div>',
    '      </section>',
    '      <section class="split">',
    `        <section class="panel"><h2>${escapeHtml(getLocalizedUiTerm(terminology, 'references', locale, 'plural'))}</h2>${normReferenceMarkup}</section>`,
    `        <section class="panel"><h2>${escapeHtml(getLocalizedUiTerm(terminology, 'scenario', locale, 'plural'))}</h2>${scenarioMarkup}</section>`,
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
      areaIds: z.array(z.number().int().positive()).optional(),
      catalog: z
        .enum([
          'requirements',
          'areas',
          'categories',
          'types',
          'quality_characteristics',
          'statuses',
          'scenarios',
          'transitions',
        ])
        .default('requirements'),
      categoryIds: z.array(z.number().int().positive()).optional(),
      descriptionSearch: z.string().max(200).optional(),
      includeArchived: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).default(20),
      locale: z.enum(['en', 'sv']).default('en'),
      offset: z.number().int().min(0).default(0),
      requiresTesting: z.array(z.boolean()).optional(),
      responseFormat: z.enum(['json', 'markdown']).default('markdown'),
      statuses: z.array(z.number().int().positive()).optional(),
      qualityCharacteristicIds: z.array(z.number().int().positive()).optional(),
      riskLevelIds: z.array(z.number().int().positive()).optional(),
      typeId: z.number().int().positive().optional(),
      typeIds: z.array(z.number().int().positive()).optional(),
      uniqueIdSearch: z.string().max(100).optional(),
    })
    .strict()
}

function createGetRequirementSchema() {
  return z
    .object({
      id: z.number().int().positive().optional(),
      locale: z.enum(['en', 'sv']).default('en'),
      responseFormat: z.enum(['json', 'markdown']).default('markdown'),
      uniqueId: z.string().max(64).optional(),
      versionNumber: z.number().int().positive().optional(),
      view: z.enum(['detail', 'history', 'version']).default('detail'),
    })
    .strict()
}

const RequirementMutationSchema = z
  .object({
    acceptanceCriteria: z.string().max(4000).optional(),
    areaId: z.number().int().positive().optional(),
    categoryId: z.number().int().positive().optional(),
    createdBy: z.string().max(200).optional(),
    description: z.string().max(4000).optional(),
    requiresTesting: z.boolean().optional(),
    verificationMethod: z.string().max(4000).optional(),
    scenarioIds: z.array(z.number().int().positive()).optional(),
    normReferenceIds: z.array(z.number().int().positive()).optional(),
    qualityCharacteristicId: z.number().int().positive().optional(),
    riskLevelId: z.number().int().positive().optional(),
    typeId: z.number().int().positive().optional(),
  })
  .strict()

function createManageRequirementSchema() {
  return z
    .object({
      id: z.number().int().positive().optional(),
      locale: z.enum(['en', 'sv']).default('en'),
      operation: z.enum([
        'archive',
        'create',
        'delete_draft',
        'edit',
        'restore_version',
      ]),
      requirement: RequirementMutationSchema.optional(),
      responseFormat: z.enum(['json', 'markdown']).default('markdown'),
      uniqueId: z.string().max(64).optional(),
      versionNumber: z.number().int().positive().optional(),
    })
    .strict()
}

function createTransitionRequirementSchema() {
  return z
    .object({
      id: z.number().int().positive().optional(),
      locale: z.enum(['en', 'sv']).default('en'),
      responseFormat: z.enum(['json', 'markdown']).default('markdown'),
      toStatusId: z.number().int().positive(),
      uniqueId: z.string().max(64).optional(),
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
    descriptionSearch: input.descriptionSearch,
    includeArchived: input.includeArchived,
    limit: input.limit,
    locale: toResponseLocale(input.locale),
    offset: input.offset,
    requiresTesting: input.requiresTesting,
    responseFormat: toResponseFormat(input.responseFormat),
    statuses: input.statuses,
    qualityCharacteristicIds: input.qualityCharacteristicIds,
    riskLevelIds: input.riskLevelIds,
    typeId: input.typeId,
    typeIds: input.typeIds,
    uniqueIdSearch: input.uniqueIdSearch,
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
        getBaseContext(request, 'requirements_get_requirement'),
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
        getBaseContext(request, 'requirements_get_requirement'),
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
        'List or search requirements and supporting lookup catalogs such as areas, categories, types, scenarios, statuses, and transitions.',
      inputSchema: createQueryCatalogSchema(),
      outputSchema: QueryCatalogOutputSchema,
      title: 'Query Requirements Catalog',
    },
    async input => {
      try {
        const payload = await service.queryCatalog(
          getBaseContext(request, 'requirements_query_catalog'),
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
        'Fetch the current requirement detail, a specific version, or the full version history by stable requirement ID.',
      inputSchema: createGetRequirementSchema(),
      outputSchema: GetRequirementOutputSchema,
      title: 'Get Requirement',
    },
    async input => {
      try {
        const payload = await service.getRequirement(
          getBaseContext(request, 'requirements_get_requirement'),
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
        'Create, edit, archive, delete a latest draft, or restore a historical requirement version.',
      inputSchema: createManageRequirementSchema(),
      outputSchema: ManageRequirementOutputSchema,
      title: 'Manage Requirement',
    },
    async input => {
      try {
        const payload = await service.manageRequirement(
          getBaseContext(request, 'requirements_manage_requirement'),
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
        'Transition a requirement version through the lifecycle states defined in requirement_status_transitions.',
      inputSchema: createTransitionRequirementSchema(),
      outputSchema: TransitionRequirementOutputSchema,
      title: 'Transition Requirement',
    },
    async input => {
      try {
        const payload = await service.transitionRequirement(
          getBaseContext(request, 'requirements_transition_requirement'),
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
    'requirements_list_packages',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        'List all requirement packages, optionally filtered by name. Returns id, uniqueId (slug), names, item count, responsibility area, and implementation type for each package.',
      inputSchema: z
        .object({
          locale: z.enum(['en', 'sv']).default('en'),
          nameSearch: z
            .string()
            .optional()
            .describe(
              'Case-insensitive substring filter applied to both Swedish and English package names.',
            ),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict(),
      outputSchema: z
        .object({
          message: z.string(),
          packages: z.array(
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
      title: 'List Requirement Packages',
    },
    async input => {
      try {
        const payload = await service.listPackages(
          getBaseContext(request, 'requirements_list_packages'),
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
    'requirements_get_package_items',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        'List requirements (krav) linked to a specific requirement package, with optional description search. Identify the package with packageId (numeric) or packageSlug (e.g. "SAKLYFT-Q2") from requirements_list_packages.',
      inputSchema: z
        .object({
          descriptionSearch: z
            .string()
            .optional()
            .describe(
              'Case-insensitive substring filter on the requirement description.',
            ),
          locale: z.enum(['en', 'sv']).default('en'),
          packageId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Numeric ID of the requirement package.'),
          packageSlug: z
            .string()
            .optional()
            .describe(
              'Slug (uniqueId) of the requirement package, e.g. "SAKLYFT-Q2".',
            ),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict()
        .superRefine((val, ctx) => {
          if ((val.packageId == null) === (val.packageSlug == null)) {
            ctx.addIssue({
              code: 'custom',
              message: 'Provide exactly one of packageId or packageSlug.',
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
          packageId: z.number(),
        })
        .strict(),
      title: 'Get Package Items',
    },
    async input => {
      try {
        const payload = await service.getPackageItems(
          getBaseContext(request, 'requirements_get_package_items'),
          {
            descriptionSearch: input.descriptionSearch,
            locale: toResponseLocale(input.locale),
            packageId: input.packageId,
            packageSlug: input.packageSlug,
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
    'requirements_add_to_package',
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'Link one or more requirements to a requirement package. Requirements must have a published version; those without are skipped and returned in skippedIds. Optionally attach a needs reference text to all added items. Identify the package with packageId (numeric) or packageSlug (e.g. "SAKLYFT-Q2").',
      inputSchema: z
        .object({
          locale: z.enum(['en', 'sv']).default('en'),
          needsReferenceText: z
            .string()
            .optional()
            .describe(
              'Optional needs reference text applied to all added requirements. An existing reference with the same text will be reused.',
            ),
          packageId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Numeric ID of the requirement package.'),
          packageSlug: z
            .string()
            .optional()
            .describe(
              'Slug (uniqueId) of the requirement package, e.g. "SAKLYFT-Q2".',
            ),
          requirementIds: z
            .array(z.number().int().positive())
            .min(1)
            .describe(
              'Numeric requirement IDs (not uniqueId strings) to add to the package.',
            ),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict()
        .superRefine((val, ctx) => {
          if ((val.packageId == null) === (val.packageSlug == null)) {
            ctx.addIssue({
              code: 'custom',
              message: 'Provide exactly one of packageId or packageSlug.',
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
      title: 'Add Requirements to Package',
    },
    async input => {
      try {
        const payload = await service.addToPackage(
          getBaseContext(request, 'requirements_add_to_package'),
          {
            locale: toResponseLocale(input.locale),
            needsReferenceText: input.needsReferenceText,
            packageId: input.packageId,
            packageSlug: input.packageSlug,
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
    'requirements_remove_from_package',
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        'Unlink one or more requirements from a requirement package. The requirements themselves are not deleted. Identify the package with packageId (numeric) or packageSlug (e.g. "SAKLYFT-Q2").',
      inputSchema: z
        .object({
          locale: z.enum(['en', 'sv']).default('en'),
          packageId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Numeric ID of the requirement package.'),
          packageSlug: z
            .string()
            .optional()
            .describe(
              'Slug (uniqueId) of the requirement package, e.g. "SAKLYFT-Q2".',
            ),
          requirementIds: z
            .array(z.number().int().positive())
            .min(1)
            .describe('Numeric requirement IDs to remove from the package.'),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict()
        .superRefine((val, ctx) => {
          if ((val.packageId == null) === (val.packageSlug == null)) {
            ctx.addIssue({
              code: 'custom',
              message: 'Provide exactly one of packageId or packageSlug.',
            })
          }
        }),
      outputSchema: z
        .object({
          message: z.string(),
          removedCount: z.number(),
        })
        .strict(),
      title: 'Remove Requirements from Package',
    },
    async input => {
      try {
        const payload = await service.removeFromPackage(
          getBaseContext(request, 'requirements_remove_from_package'),
          {
            locale: toResponseLocale(input.locale),
            packageId: input.packageId,
            packageSlug: input.packageSlug,
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
          locale: z.enum(['en', 'sv']).default('en'),
          requirementId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Numeric ID of the requirement.'),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
          uniqueId: z
            .string()
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
      title: 'List Improvement Suggestions for Requirement',
    },
    async input => {
      try {
        const payload = await service.listSuggestions(
          getBaseContext(request, 'requirements_list_improvement_suggestions'),
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
            .optional()
            .describe('Suggestion text content. Required for create and edit.'),
          createdBy: z
            .string()
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
          locale: z.enum(['en', 'sv']).default('en'),
          operation: z.enum([
            'create',
            'delete',
            'dismiss',
            'edit',
            'request_review',
            'resolve',
            'revert_to_draft',
          ]),
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
            .optional()
            .describe('Motivation text for resolve/dismiss.'),
          resolvedBy: z
            .string()
            .optional()
            .describe('Who resolved/dismissed the suggestion.'),
          responseFormat: z.enum(['json', 'markdown']).default('markdown'),
        })
        .strict(),
      title: 'Manage Improvement Suggestion',
    },
    async input => {
      try {
        const payload = await service.manageSuggestion(
          getBaseContext(request, 'requirements_manage_improvement_suggestion'),
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
  db: Parameters<typeof createRequirementsService>[0],
  request: Request,
): McpServer {
  const uiSettings = createUiSettingsLoader(db)
  const service = createRequirementsService(db, { uiSettings })
  return createKravhanteringMcpServer(service, request, uiSettings)
}
