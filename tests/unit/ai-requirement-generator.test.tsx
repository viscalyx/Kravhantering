import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const translate = Object.assign(
  (key: string, params?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      analysisTab: 'AI analysis',
      candidateCount: 'Number of requirement candidates',
      continueToImport: 'Preview requirements in import',
      imageErrorCount: 'You can attach up to {max} images.',
      imageErrorRead:
        'Failed to read one or more image files. Please try again.',
      generationFailed: 'Generation failed',
      technicalErrorCode: 'Technical error code: {code}.',
      imageErrorSize: '{name} exceeds the 10 MB size limit.',
      imageErrorType: 'Unsupported file type: {name}.',
      needsReferenceProposalRows: '{count} requirement row',
      needsReferenceProposals: 'Proposed needs references',
      noNeedsReferenceProposals: 'No proposed needs references are loaded.',
      rawResultTab: 'Raw result',
      repairFailed: 'Repair failed',
      repairSucceeded: 'The generated JSON was repaired successfully.',
      resolvedNeedsReferenceId: 'Existing needs reference #{id}',
      thinkingPhase: 'Analyzing need…',
      'authoringProfile.connection': 'AI connection',
      'authoringProfile.dataPolicy': 'Data policy',
      'authoringProfile.title': 'Administrator-managed AI profile',
      'profileUnavailable.blocked': 'This AI action is blocked.',
      'profileUnavailable.missing': 'No active profile is configured.',
      'profileUnavailable.suspended': 'This AI action is suspended.',
      'requestExplanation.actionTypeLabel': 'AI action',
      'requestExplanation.actionWithImages':
        'Generate requirement candidates with images',
      'requestExplanation.actionWithoutImages':
        'Generate requirement candidates without images',
      'requestExplanation.adminProfileHelp':
        'The administrator selects the connection and policy.',
      'requestExplanation.adminProfileTitle': 'Administrator-managed execution',
      'requestExplanation.profileUnavailable': 'Unavailable',
      'requestExplanation.aiInstructionLabel': 'AI instruction',
      'requestExplanation.aiInstructionValue':
        "The application's writing rules for requirement candidates",
      'requestExplanation.applicationRulesSummary':
        'The application first assembles rules that control how the model should work and how the answer can be imported.',
      'requestExplanation.applicationRulesTitle': 'Application control',
      'requestExplanation.badgeFixed': 'Fixed rule',
      'requestExplanation.badgeForm': 'From the form',
      'requestExplanation.badgeFormat': 'Mandatory format',
      'requestExplanation.buttonHelp':
        'See which instructions, form values, and format rules are sent when candidates are created.',
      'requestExplanation.emptyNeed': '(not filled in yet)',
      'requestExplanation.exactMessagesHelp':
        'The parts are shown in the order the model receives them.',
      'requestExplanation.exactMessagesTitle': 'Show exact text sent',
      'requestExplanation.formatLabel': 'Format',
      'requestExplanation.fullSchemaLabel': 'Full schema',
      'requestExplanation.imageCount': '{count} images',
      'requestExplanation.imagesLabel': 'Images',
      'requestExplanation.importRulesSummary':
        'The import rules contain current reference data and which fields the import accepts.',
      'requestExplanation.importViewsValue': 'Available in the import views',
      'requestExplanation.intro':
        'The AI request consists of application rules, your request, and a mandatory response format.',
      'requestExplanation.jsonSchemaValue': 'JSON schema',
      'requestExplanation.mandatoryFormatValue': 'Mandatory response format',
      'requestExplanation.noDataPolicies': 'No special choices',
      'requestExplanation.nonOverrideSummary':
        "The user's need cannot override the import rules or the response format.",
      'requestExplanation.otherChoicesTitle':
        'Other choices that affect the request',
      'requestExplanation.responseFormatTitle': 'Response format requirement',
      'requestExplanation.schemaNote':
        'The JSON schema is not shown here because it is sent separately in the API request as a mandatory response format.',
      'requestExplanation.sentAsLabel': 'Sent as',
      'requestExplanation.systemInstructionSummary':
        'The system instruction sets the role and says that the import rules apply.',
      'requestExplanation.systemInstructionTitle': 'System instruction',
      'requestExplanation.title': 'How the AI request is built',
      'requestExplanation.userOrderExactTitle': 'User request',
      'requestExplanation.userOrderTitle': 'User request',
    }
    const template = messages[key] ?? key
    if (params) {
      return Object.entries(params).reduce(
        (s, [k, v]) => s.replace(`{${k}}`, String(v)),
        template,
      )
    }
    return template
  },
  {
    rich: (key: string) => key,
  },
)

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => translate,
}))

const confirmState = vi.hoisted(() => ({ confirm: vi.fn() }))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({
    confirm: confirmState.confirm,
  }),
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import AiRequirementGenerator from '@/components/AiRequirementGenerator'
import type { ImportRequirementsPayload } from '@/lib/requirements/import-schema'

const testAreas = [
  { id: 1, name: 'Security' },
  { id: 2, name: 'Performance' },
]

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function authoringProfilesResponse(overrides: Record<string, unknown> = {}) {
  const available = {
    available: true,
    connectionName: 'Approved AI service',
    dataPolicySummary: 'EU processing; no training',
  }
  return {
    json: async () => ({
      enabled: true,
      profiles: {
        generate_with_images: available,
        generate_without_images: available,
        repair_invalid_import_json: available,
      },
      ...overrides,
    }),
    ok: true,
  }
}

function generationStreamResponse(payload: Record<string, unknown>) {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: done\ndata: ${JSON.stringify(payload)}\n\n`,
          ),
        )
        controller.close()
      },
    }),
    ok: true,
  }
}

function generationErrorStreamResponse(code: string, technicalCode?: string) {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: error\ndata: ${JSON.stringify({
              code,
              message: 'Untrusted server English',
              ...(technicalCode ? { technicalCode } : {}),
            })}\n\n`,
          ),
        )
        controller.close()
      },
    }),
    ok: true,
  }
}

function generationErrorStreamResponseWithoutMessage(code: string) {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: error\ndata: ${JSON.stringify({ code })}\n\n`,
          ),
        )
        controller.close()
      },
    }),
    ok: true,
  }
}

function thinkingStreamResponse(thinkingSoFar: string) {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: thinking\ndata: ${JSON.stringify({ thinkingSoFar })}\n\n`,
          ),
        )
        controller.close()
      },
    }),
    ok: true,
  }
}

function validationErrorStreamResponse() {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: validation_error\ndata: ${JSON.stringify({
              issues: [
                {
                  code: 'invalid_json',
                  message: 'Generated response is not valid JSON.',
                  path: '$',
                },
              ],
              message: 'validationErrors',
              rawContent: '{"requirements":',
            })}\n\n`,
          ),
        )
        controller.close()
      },
    }),
    ok: true,
  }
}

function generatedImportPayload(description: string) {
  return {
    requirements: [
      {
        description,
        priorityLevelId: null,
        verifiable: true,
        typeId: 1,
      },
    ],
    schemaVersion: 'requirement-import.v4',
  }
}

function previewResponse(
  description: string,
  overrides: Partial<{
    acceptanceCriteria: string | null
    categoryId: number | null
    errors: Array<{
      code: string
      field?: string
      level: 'error' | 'info' | 'warning'
      message: string
      originalValue?: string
    }>
    labels: {
      category: string | null
      priorityLevel: string | null
      qualityCharacteristic: string | null
      type: string | null
    }
    priorityLevelId: number | null
    resolvedPriorityLevel: {
      code: string
      color: string
      iconName: string | null
      name: string
    }
    qualityCharacteristicId: number | null
    needsReferenceProposals: Array<{
      description: string | null
      key: string
      referencedCount: number
      resolvedNeedsReferenceId: number | null
      text: string
      warnings: Array<{
        code: string
        field?: string
        level: 'error' | 'info' | 'warning'
        message: string
        originalValue?: string
      }>
    }>
    proposals: Array<{
      issuer: string
      key: string
      name: string
      normReferenceId: string | null
      reference: string
      referencedCount: number
      resolvedNormReferenceDbId: number | null
      type: string
      uri: string | null
      version?: string | null
      warnings: Array<{
        code: string
        field?: string
        level: 'error' | 'info' | 'warning'
        message: string
        originalValue?: string
      }>
    }>
    proposedNeedsReferenceKey: string | null
    proposedNormReferenceKeys: string[]
    reviewRowId: string
    typeId: number | null
    warnings: Array<{
      code: string
      field?: string
      level: 'error' | 'info' | 'warning'
      message: string
      originalValue?: string
    }>
  }> = {},
) {
  return {
    json: async () => ({
      needsReferenceProposals: overrides.needsReferenceProposals ?? [],
      previewToken: 'preview-token',
      proposals: overrides.proposals ?? [],
      rows: [
        {
          errors: overrides.errors ?? [],
          infos: [],
          labels: overrides.labels ?? {
            category: null,
            priorityLevel: null,
            qualityCharacteristic: null,
            type: 'Functional',
          },
          proposedNeedsReferenceKey:
            overrides.proposedNeedsReferenceKey ?? null,
          proposedNormReferenceKeys: overrides.proposedNormReferenceKeys ?? [],
          resolvedPriorityLevel: overrides.resolvedPriorityLevel,
          reviewRowId: overrides.reviewRowId ?? 'row-1',
          selected: true,
          sourceIndex: 0,
          values: {
            acceptanceCriteria: overrides.acceptanceCriteria ?? null,
            categoryId: overrides.categoryId ?? null,
            description,
            needsReferenceId: null,
            normReferenceIds: [],
            priorityLevelId: overrides.priorityLevelId ?? null,
            qualityCharacteristicId: overrides.qualityCharacteristicId ?? null,
            requirementPackageIds: [],
            verifiable: true,
            typeId: overrides.typeId ?? 1,
            verificationMethod: null,
          },
          warnings: overrides.warnings ?? [],
        },
      ],
      summary: {
        errorCount: 0,
        rowCount: 1,
        warningCount: 0,
      },
    }),
    ok: true,
  }
}

async function renderOpenGenerator(overrides?: {
  aiGenerationAvailability?: {
    disabledByEnvironment: boolean
    effectiveRequirementGenerationEnabled: boolean
  }
  areas?: Array<{
    id: number
    name: string
    permissions?: { canAuthor?: boolean }
  }>
  expectedModelName?: string
  loadModels?: boolean
  mode?: 'library' | 'specification-local'
  onClose?: () => void
  onImportPreview?: (
    payload: ImportRequirementsPayload,
    options: { areaId?: number; preview?: unknown },
  ) => void
  selectArea?: boolean
  specificationId?: number
}) {
  const mode = overrides?.mode ?? 'library'
  render(
    <AiRequirementGenerator
      aiGenerationAvailability={overrides?.aiGenerationAvailability}
      areas={overrides?.areas ?? testAreas}
      mode={mode}
      onClose={overrides?.onClose ?? vi.fn()}
      onImportPreview={overrides?.onImportPreview ?? vi.fn()}
      open
      specificationId={overrides?.specificationId}
    />,
  )

  const loadModels =
    overrides?.loadModels ??
    overrides?.aiGenerationAvailability
      ?.effectiveRequirementGenerationEnabled !== false
  const selectArea = overrides?.selectArea ?? (mode === 'library' && loadModels)
  if (selectArea) {
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
  }

  if (
    overrides?.aiGenerationAvailability
      ?.effectiveRequirementGenerationEnabled !== false
  ) {
    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(
          ([url]) => url === '/api/ai/authoring-profiles',
        ),
      ).toBe(true)
      expect(screen.queryByText('loading')).not.toBeInTheDocument()
    })
  }
  if (loadModels) {
    await screen.findByText('Approved AI service')
  }
}

describe('AiRequirementGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmState.confirm.mockResolvedValue(true)
    window.localStorage.clear()
    // Default: all administrator-managed authoring actions are available.
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url.startsWith('/api/requirements/import/instruction')
      ) {
        return {
          ok: true,
          text: async () => '# Import instruction\n\nUse schemaVersion.',
        }
      }
      if (
        typeof url === 'string' &&
        url === '/api/requirements/import/preview'
      ) {
        return previewResponse('Generated security requirement')
      }
      return { json: async () => ({}), ok: true }
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  it('renders when open', async () => {
    await renderOpenGenerator()

    expect(screen.getByText('generateTitle')).toBeInTheDocument()
    expect(screen.getByLabelText('topicLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('areaLabel')).toBeInTheDocument()
    expect(screen.getByText('Administrator-managed AI profile')).toBeVisible()
    expect(screen.getByText('Approved AI service')).toBeVisible()
  })

  it('does not render when closed', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onImportPreview={vi.fn()}
        open={false}
      />,
    )

    expect(screen.queryByText('generateTitle')).not.toBeInTheDocument()
  })

  it('keeps page scrolling available while embedded', async () => {
    const previousOverflow = document.body.style.overflow
    render(
      <AiRequirementGenerator
        areas={testAreas}
        embedded
        onClose={vi.fn()}
        onImportPreview={vi.fn()}
        open
      />,
    )

    expect(
      await screen.findByRole('dialog', { name: 'generateTitle' }),
    ).toBeVisible()
    expect(document.body.style.overflow).toBe(previousOverflow)
  })

  it('locks and restores page scrolling while the modal is open', async () => {
    const previousOverflow = document.body.style.overflow
    const { unmount } = render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onImportPreview={vi.fn()}
        open
      />,
    )

    expect(
      await screen.findByRole('dialog', { name: 'generateTitle' }),
    ).toBeVisible()
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe(previousOverflow)
  })

  it('renders area options', async () => {
    await renderOpenGenerator({ loadModels: false })

    const areaSelect = screen.getByLabelText('areaLabel')
    expect(areaSelect).toBeInTheDocument()
    expect(areaSelect).toHaveValue('')
    expect(areaSelect).toBeRequired()
    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(screen.getByText('Performance')).toBeInTheDocument()
  })

  it('only shows requirement areas where the user can author requirements', async () => {
    await renderOpenGenerator({
      areas: [
        { id: 1, name: 'Security', permissions: { canAuthor: true } },
        { id: 2, name: 'Performance', permissions: { canAuthor: false } },
      ],
      loadModels: false,
    })

    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(screen.queryByText('Performance')).not.toBeInTheDocument()
  })

  it('loads the administrator-managed action profile before an area is selected', async () => {
    await renderOpenGenerator({ selectArea: false })

    expect(screen.getByLabelText('areaLabel')).toHaveValue('')
    expect(screen.getByText('Approved AI service')).toBeVisible()
    expect(screen.getByText('EU processing; no training')).toBeVisible()
    expect(
      mockFetch.mock.calls.some(([url]) => String(url).includes('scopeId=')),
    ).toBe(false)
  })

  it('disables generation when Admin Center turns availability off', async () => {
    const user = userEvent.setup()
    await renderOpenGenerator({
      aiGenerationAvailability: {
        disabledByEnvironment: false,
        effectiveRequirementGenerationEnabled: false,
      },
      loadModels: false,
    })

    await user.type(screen.getByLabelText('topicLabel'), 'audit logging')
    await user.selectOptions(screen.getByLabelText('areaLabel'), '1')

    const generateButton = screen.getByRole('button', {
      name: 'generateButton',
    })
    expect(generateButton).toBeDisabled()
    expect(generateButton).toHaveAttribute('title', 'generationDisabledByAdmin')
    expect(screen.getByText('generationDisabledByAdmin')).toBeInTheDocument()

    await user.click(generateButton)

    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/ai/generate-requirement-import',
      expect.anything(),
    )
  })

  it('disables only the authoring action whose profile is unavailable', async () => {
    const available = {
      available: true,
      connectionName: 'Vision service',
      dataPolicySummary: 'Approved image processing',
    }
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse({
          profiles: {
            generate_with_images: available,
            generate_without_images: {
              available: false,
              reason: 'missing',
            },
            repair_invalid_import_json: available,
          },
        })
      }
      return { json: async () => ({}), ok: true }
    })
    await renderOpenGenerator({ loadModels: false })
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Review diagram')
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')

    const generateButton = screen.getByRole('button', {
      name: 'generateButton',
    })
    expect(generateButton).toBeDisabled()
    expect(generateButton).toHaveAttribute(
      'title',
      'No active profile is configured.',
    )
    const profileStatus = screen
      .getByText('No active profile is configured.')
      .closest('[role="status"]')
    expect(profileStatus).not.toBeNull()
    expect(
      profileStatus?.querySelector('svg[aria-hidden="true"]'),
    ).not.toBeNull()

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['image'], 'diagram.png', { type: 'image/png' })],
      },
    })

    await waitFor(() => expect(generateButton).toBeEnabled())
    expect(screen.getByText('Vision service')).toBeVisible()
  })

  it('preserves validation errors and raw output when repair is unavailable', async () => {
    const available = {
      available: true,
      connectionName: 'Approved AI service',
      dataPolicySummary: 'EU processing; no training',
    }
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse({
          profiles: {
            generate_with_images: available,
            generate_without_images: available,
            repair_invalid_import_json: {
              available: false,
              reason: 'suspended',
            },
          },
        })
      }
      if (url === '/api/ai/generate-requirement-import') {
        return validationErrorStreamResponse()
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(await screen.findByText('validationErrors')).toBeVisible()
    expect(
      screen.getByText('$: Generated response is not valid JSON.'),
    ).toBeVisible()
    expect(screen.getByText('Raw result')).toBeVisible()
    expect(screen.getByText('{"requirements":')).toBeInTheDocument()

    const repairButton = screen.getByRole('button', { name: 'repair' })
    expect(repairButton).toBeDisabled()
    expect(repairButton).toHaveAttribute(
      'title',
      'This AI action is suspended.',
    )
    await userEvent.click(repairButton)
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/ai/repair-requirement-import-json',
      expect.anything(),
    )
  })

  it('shows how the AI request is built without loading the import schema', async () => {
    await renderOpenGenerator()

    await userEvent.click(
      screen.getByRole('button', { name: /How the AI request is built/ }),
    )

    expect(
      screen.getByRole('dialog', {
        name: 'How the AI request is built',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Application control')).toBeInTheDocument()
    expect(screen.getAllByText('User request').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Response format requirement').length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('Mandatory response format')).toBeInTheDocument()
    expect(
      screen.getByText(/not shown here because it is sent separately/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Import instruction and schema/ }),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Show exact text sent'))

    await waitFor(() => {
      expect(
        screen.getByText(/experienced requirements engineer/),
      ).toBeInTheDocument()
    })
    expect(screen.getAllByText(/Import instruction/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Use schemaVersion/).length).toBeGreaterThan(0)
    expect(
      mockFetch.mock.calls.some(([url]) =>
        String(url).startsWith('/api/requirements/import/schema'),
      ),
    ).toBe(false)
  })

  it('loads the library import instruction before a requirement area is selected', async () => {
    await renderOpenGenerator({ selectArea: false })

    await userEvent.click(
      screen.getByRole('button', { name: /How the AI request is built/ }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', {
          name: 'How the AI request is built',
        }),
      ).toBeInTheDocument()
    })
    await userEvent.click(screen.getByText('Show exact text sent'))
    expect(
      screen.getByText(/experienced requirements engineer/),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Import instruction/).length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(screen.getByText(/Use schemaVersion/)).toBeInTheDocument()
    })
    expect(
      mockFetch.mock.calls
        .map(([url]) => String(url))
        .filter(url => url.includes('/api/requirements/import/instruction')),
    ).toEqual([
      '/api/requirements/import/instruction?locale=en&kind=requirements_library',
    ])
  })

  it('does not store failed import instruction responses as instruction text', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url.startsWith('/api/requirements/import/instruction')
      ) {
        return {
          ok: false,
          text: async () =>
            '# Import instruction\n\nServer failure should not be stored.',
        }
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator({ selectArea: false })

    await userEvent.click(
      screen.getByRole('button', { name: /How the AI request is built/ }),
    )
    await userEvent.click(screen.getByText('Show exact text sent'))

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([url]) =>
          String(url).includes('/api/requirements/import/instruction'),
        ),
      ).toBe(true)
    })
    expect(
      screen.queryByText(/Server failure should not be stored/),
    ).not.toBeInTheDocument()
  })

  it('loads specification-local import instruction with destination-specific reference data', async () => {
    await renderOpenGenerator({
      mode: 'specification-local',
      specificationId: 8,
    })

    await userEvent.click(
      screen.getByRole('button', { name: /How the AI request is built/ }),
    )
    await userEvent.click(screen.getByText('Show exact text sent'))

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(
          ([url]) =>
            String(url) ===
            '/api/requirements/import/instruction?locale=en&kind=requirements_specification&specificationId=8',
        ),
      ).toBe(true)
    })
  })

  it('traps focus in the AI request explanation dialog and restores focus on close', async () => {
    await renderOpenGenerator()
    const trigger = screen.getByRole('button', {
      name: /How the AI request is built/,
    })

    await userEvent.click(trigger)

    const dialog = screen.getByRole('dialog', {
      name: 'How the AI request is built',
    })
    const closeButton = within(dialog).getByLabelText('close')

    await waitFor(() => expect(closeButton).toHaveFocus())

    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('disables generate button when topic or area is empty', async () => {
    await renderOpenGenerator({ loadModels: false })

    const generateButton = screen.getByRole('button', {
      name: /generateButton/i,
    })
    expect(generateButton).toBeDisabled()
  })

  it('has a close button that calls onClose', async () => {
    const onClose = vi.fn()
    await renderOpenGenerator({ onClose })
    expect(screen.getByLabelText('areaLabel')).toHaveValue('1')

    const closeButton = screen.getByLabelText('close')
    expect(closeButton).toBeInTheDocument()
    await userEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('areaLabel')).toHaveValue('')
  })

  it('starts a fresh authoring session when the dialog reopens', async () => {
    const props = {
      areas: testAreas,
      onClose: vi.fn(),
      onImportPreview: vi.fn(),
    }
    const { rerender } = render(<AiRequirementGenerator {...props} open />)

    await screen.findByText('Approved AI service')
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Old prompt')
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '2')
    fireEvent.change(
      screen.getByLabelText('Number of requirement candidates'),
      {
        target: { value: '20' },
      },
    )
    await userEvent.click(screen.getByLabelText('help: topicLabel'))
    await userEvent.click(
      screen.getByRole('button', { name: /How the AI request is built/ }),
    )
    expect(screen.getByLabelText('topicLabel')).toHaveValue('Old prompt')
    expect(screen.getByLabelText('areaLabel')).toHaveValue('2')
    expect(
      screen.getByLabelText('Number of requirement candidates'),
    ).toHaveValue(20)
    expect(screen.getByLabelText('help: topicLabel')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(
      screen.getByRole('dialog', { name: 'How the AI request is built' }),
    ).toBeInTheDocument()
    rerender(<AiRequirementGenerator {...props} open={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<AiRequirementGenerator {...props} open />)
    await screen.findByText('Approved AI service')
    expect(screen.getByLabelText('topicLabel')).toHaveValue('')
    expect(screen.getByLabelText('areaLabel')).toHaveValue('')
    expect(
      screen.getByLabelText('Number of requirement candidates'),
    ).toHaveValue(8)
    expect(screen.getByLabelText('help: topicLabel')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(
      screen.queryByRole('dialog', { name: 'How the AI request is built' }),
    ).not.toBeInTheDocument()
  })

  it('renders help buttons for form fields', async () => {
    await renderOpenGenerator()

    expect(screen.getByLabelText('help: topicLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('help: areaLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('help: imageAttachLabel')).toBeInTheDocument()
  })

  it('keeps every AI form help target at the 24px policy default', async () => {
    await renderOpenGenerator()
    await screen.findByLabelText('help: imageAttachLabel')

    for (const helpId of [
      'ai-need-help',
      'ai-image-help',
      'ai-area-help',
      'ai-candidate-count-help',
    ]) {
      expect(
        document.querySelector(`button[aria-controls="${helpId}"]`),
      ).toHaveClass('min-h-6', 'min-w-6')
    }
  })

  it('toggles help panel on help button click', async () => {
    await renderOpenGenerator()

    const helpButton = screen.getByLabelText('help: topicLabel')
    expect(helpButton).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(helpButton)
    expect(helpButton).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('ai-need-help')).toBeInTheDocument()
  })

  it('associates combined image validation feedback with the image control', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()

    const imageButton = await screen.findByRole('button', {
      name: 'imageSelectButton',
    })
    const fileInput =
      document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()

    const unsupportedFile = new File(['not an image'], 'notes.txt', {
      type: 'text/plain',
    })
    const oversizedFile = new File(['image'], 'large.png', {
      type: 'image/png',
    })
    Object.defineProperty(oversizedFile, 'size', {
      value: 10 * 1024 * 1024 + 1,
    })
    const additionalUnsupportedFile = new File(
      ['not an image'],
      'more-notes.txt',
      {
        type: 'text/plain',
      },
    )
    const overflowFile = new File(['image'], 'overflow.png', {
      type: 'image/png',
    })

    imageButton.focus()
    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [
          unsupportedFile,
          oversizedFile,
          additionalUnsupportedFile,
          overflowFile,
        ],
      },
    })

    const imageError = await screen.findByText(
      'You can attach up to 3 images. Unsupported file type: notes.txt. large.png exceeds the 10 MB size limit. Unsupported file type: more-notes.txt.',
      { selector: '#ai-image-validation-error' },
    )
    expect(imageButton).toHaveAttribute(
      'aria-describedby',
      'ai-image-validation-error',
    )
    expect(imageError).toHaveAttribute('id', 'ai-image-validation-error')
    expect(imageButton).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent(imageError.textContent)
  })

  it('clears the image capacity error after an attached image is removed', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()

    const imageButton = await screen.findByRole('button', {
      name: 'imageSelectButton',
    })
    const fileInput =
      document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [
          new File(['image'], 'diagram.png', { type: 'image/png' }),
          new File(['image'], 'diagram-2.png', { type: 'image/png' }),
          new File(['image'], 'diagram-3.png', { type: 'image/png' }),
        ],
      },
    })

    const removeButtons = await screen.findAllByRole('button', {
      name: 'imageRemove',
    })
    expect(removeButtons).toHaveLength(3)

    await userEvent.click(imageButton)
    expect(
      await screen.findByText('You can attach up to 3 images.', {
        selector: '#ai-image-validation-error',
      }),
    ).toBeInTheDocument()

    await userEvent.click(removeButtons[0])

    await waitFor(() => {
      expect(imageButton).not.toHaveAttribute('aria-describedby')
      expect(
        screen.queryByText('You can attach up to 3 images.', {
          selector: '#ai-image-validation-error',
        }),
      ).not.toBeInTheDocument()
    })
  })

  it('provides a 24px target for removing an attached image', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()

    const fileInput =
      document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(['image'], 'diagram.png', { type: 'image/png' })],
      },
    })

    const removeButton = await screen.findByRole('button', {
      name: 'imageRemove',
    })
    expect(removeButton).toHaveClass(
      'min-h-6',
      'min-w-6',
      'focus-visible:ring-2',
    )
    expect(removeButton).toHaveAttribute(
      'data-developer-mode-context',
      'ai-requirement-generator',
    )
    expect(removeButton).toHaveAttribute(
      'data-developer-mode-value',
      'remove image attachment',
    )

    await userEvent.click(removeButton)
    expect(
      screen.queryByRole('button', { name: 'imageRemove' }),
    ).not.toBeInTheDocument()
  })

  it('keeps a draft open when close confirmation is rejected and closes it when accepted', async () => {
    const onClose = vi.fn()
    confirmState.confirm
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    await renderOpenGenerator({ onClose })
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Draft topic')

    await userEvent.click(screen.getByRole('button', { name: 'cancelButton' }))
    expect(confirmState.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelText: 'cancel',
        confirmText: 'close',
        message: 'closeConfirm',
      }),
    )
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'cancelButton' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('disables specification-local generation without specification context', async () => {
    await renderOpenGenerator({ mode: 'specification-local' })

    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')

    expect(
      screen.getByRole('button', { name: /generateButton/i }),
    ).toBeDisabled()
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/ai/generate-requirement-import',
      expect.anything(),
    )
  })

  it('sends only app-owned authoring inputs when generating candidates', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        const payload = {
          ...generatedImportPayload('Generated security requirement'),
          proposedNeedsReferences: [
            {
              description: 'Access needs from the operational service.',
              key: 'need-access',
              text: 'Operational access need',
            },
          ],
          proposedNormReferences: [
            {
              issuer: 'ISO',
              key: 'iso-27001',
              name: 'ISO 27001',
              reference: 'ISO/IEC 27001:2022',
              type: 'Standard',
              version: '2022',
            },
          ],
          requirements: [
            {
              acceptanceCriteria: 'Audit events are encrypted at rest.',
              description: 'Generated security requirement',
              needsReferenceKey: 'need-access',
              priorityLevelId: 1,
              proposedNormReferenceKeys: ['iso-27001'],
              typeId: 1,
              verifiable: true,
            },
          ],
        }
        return generationStreamResponse({
          payload,
          rawContent: JSON.stringify(payload),
          stats: {
            completionTokens: 12,
            cost: 0,
            promptTokens: 10,
            reasoningTokens: 2,
            totalTokens: 24,
          },
          thinking: 'Reasoning trace',
        })
      }
      if (
        typeof url === 'string' &&
        url === '/api/requirements/import/preview'
      ) {
        return previewResponse('Generated security requirement')
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    const generateCall = mockFetch.mock.calls.find(([url]) => {
      return url === '/api/ai/generate-requirement-import'
    })
    const generateBody = JSON.parse(
      (generateCall?.[1] as { body: string } | undefined)?.body as string,
    ) as Record<string, unknown>
    expect(generateBody).toEqual({
      areaId: 1,
      count: 8,
      images: [],
      locale: 'en',
      mode: 'library',
      need: 'Encrypt logs',
    })
  })

  it('clears generated results when the area changes after generation', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        const payload = generatedImportPayload('Generated security requirement')
        return generationStreamResponse({
          payload,
          rawContent: JSON.stringify(payload),
          stats: {
            completionTokens: 12,
            cost: 0,
            promptTokens: 10,
            reasoningTokens: 0,
            totalTokens: 22,
          },
          thinking: 'Prior thinking trace',
        })
      }
      if (
        typeof url === 'string' &&
        url === '/api/requirements/import/preview'
      ) {
        return previewResponse('Generated security requirement')
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    const generateCall = mockFetch.mock.calls.find(([url]) => {
      return url === '/api/ai/generate-requirement-import'
    })
    const generateBody = JSON.parse(
      (generateCall?.[1] as { body: string } | undefined)?.body as string,
    ) as Record<string, unknown>
    expect(generateBody).not.toHaveProperty('supportedParameters')

    expect(
      await screen.findByText('Generated security requirement'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Prior thinking trace')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'AI analysis' }))
    expect(screen.getByText('Prior thinking trace')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Raw result' }))
    expect(screen.getByText(/"requirements": \[/)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '2')

    await waitFor(() => {
      expect(
        screen.queryByText('Generated security requirement'),
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Prior thinking trace')).not.toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: /createSelected/i }),
    ).not.toBeInTheDocument()
  })

  it('shows proposed needs references in a tab before AI analysis', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        const payload = generatedImportPayload('Generated security requirement')
        return generationStreamResponse({
          payload,
          rawContent: JSON.stringify(payload),
          stats: {
            completionTokens: 12,
            cost: 0,
            promptTokens: 10,
            reasoningTokens: 0,
            totalTokens: 22,
          },
          thinking: 'Prior thinking trace',
        })
      }
      if (
        typeof url === 'string' &&
        url === '/api/requirements/import/preview'
      ) {
        return previewResponse('Generated security requirement', {
          needsReferenceProposals: [
            {
              description: 'Access needs from the operational service.',
              key: 'need-access',
              referencedCount: 1,
              resolvedNeedsReferenceId: null,
              text: 'Operational access need',
              warnings: [],
            },
          ],
          proposedNeedsReferenceKey: 'need-access',
        })
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(
      await screen.findByText('Generated security requirement'),
    ).toBeInTheDocument()

    const needsReferenceTab = screen.getByRole('button', {
      name: /Proposed needs references \(1\)/,
    })
    const analysisTab = screen.getByRole('button', { name: 'AI analysis' })
    expect(
      needsReferenceTab.compareDocumentPosition(analysisTab) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await userEvent.click(needsReferenceTab)

    expect(screen.getByText('Operational access need')).toBeInTheDocument()
    expect(screen.getByText('need-access')).toBeInTheDocument()
    expect(screen.getByText('1 requirement row')).toBeInTheDocument()
    expect(
      screen.getByText('Access needs from the operational service.'),
    ).toBeInTheDocument()
  })

  it('hands the generated preview payload to the import preview callback', async () => {
    const onImportPreview = vi.fn()
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        const payload = generatedImportPayload('Generated security requirement')
        return generationStreamResponse({
          payload,
          rawContent: JSON.stringify(payload),
          stats: {
            completionTokens: 12,
            cost: 0,
            promptTokens: 10,
            reasoningTokens: 0,
            totalTokens: 22,
          },
          thinking: '',
        })
      }
      if (
        typeof url === 'string' &&
        url === '/api/requirements/import/preview'
      ) {
        return previewResponse('Generated security requirement', {
          acceptanceCriteria: 'Audit events are encrypted at rest.',
          labels: {
            category: 'Security',
            priorityLevel: 'Must',
            qualityCharacteristic: 'Confidentiality',
            type: 'Functional',
          },
          needsReferenceProposals: [
            {
              description: 'Access needs from the operational service.',
              key: 'need-access',
              referencedCount: 1,
              resolvedNeedsReferenceId: 42,
              text: 'Operational access need',
              warnings: [
                {
                  code: 'existing_match',
                  level: 'info',
                  message: 'Matches an existing needs reference.',
                },
              ],
            },
          ],
          proposedNeedsReferenceKey: 'need-access',
          proposedNormReferenceKeys: ['iso-27001'],
          proposals: [
            {
              issuer: 'ISO',
              key: 'iso-27001',
              name: 'ISO 27001',
              normReferenceId: null,
              reference: 'ISO/IEC 27001:2022',
              referencedCount: 1,
              resolvedNormReferenceDbId: null,
              type: 'Standard',
              uri: null,
              version: '2022',
              warnings: [
                {
                  code: 'review_reference',
                  level: 'warning',
                  message: 'Review the proposed reference.',
                },
              ],
            },
          ],
          resolvedPriorityLevel: {
            code: 'MUST',
            color: '#dc2626',
            iconName: null,
            name: 'Must',
          },
          warnings: [
            {
              code: 'review_row',
              level: 'warning',
              message: 'Review this generated row.',
            },
          ],
        })
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator({ onImportPreview })
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(
      await screen.findByText('Generated security requirement'),
    ).toBeInTheDocument()
    const candidateCheckbox = screen.getByRole('checkbox', {
      name: 'selectRequirement',
    })
    expect(candidateCheckbox).toHaveClass('h-5', 'w-5')
    expect(candidateCheckbox).not.toHaveClass('min-h-6', 'min-w-6')

    await userEvent.click(screen.getByRole('button', { name: 'deselectAll' }))
    expect(candidateCheckbox).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'selectAll' }))
    expect(candidateCheckbox).toBeChecked()
    await userEvent.click(candidateCheckbox)
    await userEvent.click(candidateCheckbox)

    await userEvent.click(screen.getByRole('button', { name: 'proposals (1)' }))
    const proposalCheckbox = screen.getByRole('checkbox', {
      name: 'ISO 27001 proposals',
    })
    expect(proposalCheckbox).toHaveClass('h-5', 'w-5')
    expect(proposalCheckbox).not.toHaveClass('min-h-6', 'min-w-6')
    await userEvent.click(proposalCheckbox)
    await userEvent.click(proposalCheckbox)

    await userEvent.click(
      screen.getByRole('button', {
        name: /Proposed needs references \(1\)/,
      }),
    )
    expect(screen.getByText('Operational access need')).toBeInTheDocument()
    expect(screen.getByText('Existing needs reference #42')).toBeInTheDocument()
    expect(
      screen.getByText('Matches an existing needs reference.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'AI analysis' }))
    expect(screen.getByText('noAnalysis')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Raw result' }))
    expect(
      screen.getByText(/Generated security requirement/),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Preview requirements in import',
      }),
    )

    expect(onImportPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        requirements: [
          expect.objectContaining({
            description: 'Generated security requirement',
          }),
        ],
        schemaVersion: 'requirement-import.v4',
      }),
      {
        areaId: 1,
        preview: expect.objectContaining({
          previewToken: 'preview-token',
          rows: [
            expect.objectContaining({
              reviewRowId: 'row-1',
              selected: true,
            }),
          ],
        }),
      },
    )
  })

  it('streams analysis text in the right pane and follows appended content', async () => {
    const finishGeneration = createDeferred<void>()
    const scrollIntoView = vi.fn()
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        return {
          body: new ReadableStream({
            async start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `event: thinking\ndata: ${JSON.stringify({
                    thinkingSoFar:
                      '# First analysis\n\n- Second analysis line.',
                  })}\n\n`,
                ),
              )
              await finishGeneration.promise
              const payload = generatedImportPayload(
                'Generated analysis requirement',
              )
              controller.enqueue(
                new TextEncoder().encode(
                  `event: done\ndata: ${JSON.stringify({
                    payload,
                    rawContent: JSON.stringify(payload),
                    stats: {
                      completionTokens: 12,
                      cost: 0,
                      promptTokens: 10,
                      reasoningTokens: 0,
                      totalTokens: 22,
                    },
                    thinking: '# First analysis\n\n- Second analysis line.',
                  })}\n\n`,
                ),
              )
              controller.close()
            },
          }),
          ok: true,
        }
      }
      if (
        typeof url === 'string' &&
        url === '/api/requirements/import/preview'
      ) {
        return previewResponse('Generated analysis requirement')
      }
      return { json: async () => ({}), ok: true }
    })

    try {
      await renderOpenGenerator()
      await userEvent.type(screen.getByLabelText('topicLabel'), 'Grade access')
      await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
      await userEvent.click(
        screen.getByRole('button', { name: /generateButton/i }),
      )

      expect(
        await screen.findByRole('heading', {
          level: 3,
          name: 'First analysis',
        }),
      ).toBeInTheDocument()
      expect(screen.queryByText('Analyzing need…')).not.toBeInTheDocument()
      expect(screen.getByText('Second analysis line.')).toBeInTheDocument()
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 150)
      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalled()
      })
      finishGeneration.resolve()
      expect(
        await screen.findByText('Generated analysis requirement'),
      ).toBeInTheDocument()
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
      setTimeoutSpy.mockRestore()
    }
  })

  it('pauses streamed analysis auto-follow until the user scrolls back to the bottom', async () => {
    const sendSecondThinking = createDeferred<void>()
    const sendThirdThinking = createDeferred<void>()
    const finishGeneration = createDeferred<void>()
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        return {
          body: new ReadableStream({
            async start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `event: thinking\ndata: ${JSON.stringify({
                    thinkingSoFar: '# First analysis',
                  })}\n\n`,
                ),
              )
              await sendSecondThinking.promise
              controller.enqueue(
                new TextEncoder().encode(
                  `event: thinking\ndata: ${JSON.stringify({
                    thinkingSoFar: '# First analysis\n\nSecond analysis line.',
                  })}\n\n`,
                ),
              )
              await sendThirdThinking.promise
              controller.enqueue(
                new TextEncoder().encode(
                  `event: thinking\ndata: ${JSON.stringify({
                    thinkingSoFar:
                      '# First analysis\n\nSecond analysis line.\n\nThird analysis line.',
                  })}\n\n`,
                ),
              )
              await finishGeneration.promise
              const payload = generatedImportPayload(
                'Generated pinned-scroll requirement',
              )
              controller.enqueue(
                new TextEncoder().encode(
                  `event: done\ndata: ${JSON.stringify({
                    payload,
                    rawContent: JSON.stringify(payload),
                    stats: {
                      completionTokens: 12,
                      cost: 0,
                      promptTokens: 10,
                      reasoningTokens: 0,
                      totalTokens: 22,
                    },
                    thinking:
                      '# First analysis\n\nSecond analysis line.\n\nThird analysis line.',
                  })}\n\n`,
                ),
              )
              controller.close()
            },
          }),
          ok: true,
        }
      }
      if (
        typeof url === 'string' &&
        url === '/api/requirements/import/preview'
      ) {
        return previewResponse('Generated pinned-scroll requirement')
      }
      return { json: async () => ({}), ok: true }
    })

    try {
      await renderOpenGenerator()
      await userEvent.type(screen.getByLabelText('topicLabel'), 'Grade access')
      await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
      await userEvent.click(
        screen.getByRole('button', { name: /generateButton/i }),
      )

      expect(
        await screen.findByRole('heading', {
          level: 3,
          name: 'First analysis',
        }),
      ).toBeInTheDocument()
      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalled()
      })

      const scrollPane = screen
        .getByRole('heading', { level: 3, name: 'First analysis' })
        .closest('[aria-live="polite"]') as HTMLElement
      let scrollTop = 20
      Object.defineProperties(scrollPane, {
        clientHeight: { configurable: true, get: () => 100 },
        scrollHeight: { configurable: true, get: () => 400 },
        scrollTop: {
          configurable: true,
          get: () => scrollTop,
          set: value => {
            scrollTop = Number(value)
          },
        },
      })
      fireEvent.scroll(scrollPane)

      scrollIntoView.mockClear()
      sendSecondThinking.resolve()
      expect(
        await screen.findByText('Second analysis line.'),
      ).toBeInTheDocument()
      expect(scrollIntoView).not.toHaveBeenCalled()

      scrollTop = 276
      fireEvent.scroll(scrollPane)

      scrollIntoView.mockClear()
      sendThirdThinking.resolve()
      expect(
        await screen.findByText('Third analysis line.'),
      ).toBeInTheDocument()
      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalled()
      })

      finishGeneration.resolve()
      expect(
        await screen.findByText('Generated pinned-scroll requirement'),
      ).toBeInTheDocument()
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
    }
  })

  it('shows an error when the AI stream closes without a terminal event', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        return thinkingStreamResponse('Partial analysis')
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Grade access')
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Generation failed: createError')

    const errorSummary = screen.getByRole('heading', {
      name: 'Generation failed',
    })
    await waitFor(() => expect(errorSummary).toHaveFocus())
  })

  it('announces the localized request-validation issue returned before streaming', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (url === '/api/ai/generate-requirement-import') {
        return Response.json(
          {
            error: 'Invalid request',
            issues: [
              {
                code: 'custom',
                message: 'Each uploaded image must be unique.',
                path: 'images.1.dataUrl',
              },
            ],
          },
          { status: 400 },
        )
      }
      return Response.json({})
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Grade access')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Each uploaded image must be unique.',
    )
  })

  it.each([
    ['import_content_bytes_exceeded', 'generatedImportContentLimitExceeded'],
    ['import_json_depth_cap_exceeded', 'generatedImportJsonDepthLimitExceeded'],
    [
      'import_nested_collection_cap_exceeded',
      'generatedImportNestedItemsLimitExceeded',
    ],
    [
      'import_proposed_needs_reference_count_cap_exceeded',
      'generatedImportNeedsProposalLimitExceeded',
    ],
    [
      'import_proposed_norm_reference_count_cap_exceeded',
      'generatedImportNormProposalLimitExceeded',
    ],
    ['import_row_count_cap_exceeded', 'generatedImportRowLimitExceeded'],
  ])('localizes the %s generation stream error', async (code, messageKey) => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (url === '/api/ai/generate-requirement-import') {
        return generationErrorStreamResponse(code)
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(messageKey)
    expect(screen.queryByText('Untrusted server English')).toBeNull()
  })

  it('preserves the existing server message for non-budget stream errors', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (url === '/api/ai/generate-requirement-import') {
        return generationErrorStreamResponse('ai_provider_rate_limited')
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Untrusted server English',
    )
  })

  it('shows a safe technical code with the actionable provider error', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (url === '/api/ai/generate-requirement-import') {
        return generationErrorStreamResponse(
          'ai_provider_invalid_response',
          'invalid_upstream_stream_event',
        )
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Untrusted server English Technical error code: invalid_upstream_stream_event.',
    )
  })

  it('uses the localized fallback for a non-budget stream error without a message', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (url === '/api/ai/generate-requirement-import') {
        return generationErrorStreamResponseWithoutMessage(
          'ai_provider_rate_limited',
        )
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('createError')
  })

  it('ignores data-less and unknown SSE blocks before handling a minimal validation error', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (url === '/api/ai/generate-requirement-import') {
        return {
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'event: keepalive\n\ndata: {}\n\nevent: validation_error\ndata: {}\n\n',
                ),
              )
              controller.close()
            },
          }),
          ok: true,
        }
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(await screen.findByText('validationErrors')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'repairButton' })).toBeNull()
  })

  it('shows empty preview states when generation returns no candidates or proposals', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (url === '/api/ai/generate-requirement-import') {
        return generationStreamResponse({
          payload: { requirements: [], schemaVersion: 'requirement-import.v4' },
        })
      }
      if (url === '/api/requirements/import/preview') {
        return {
          json: async () => ({
            needsReferenceProposals: [],
            previewToken: null,
            proposals: [],
            rows: [],
            summary: { errorCount: 0, rowCount: 0, warningCount: 0 },
          }),
          ok: true,
        }
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'No candidates')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(await screen.findByText('noProposals')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'candidates' }))
    expect(screen.getByText('noCandidates')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: /Proposed needs references \(0\)/ }),
    )
    expect(
      screen.getByText('No proposed needs references are loaded.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'AI analysis' }))
    expect(screen.getByText('noAnalysis')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Raw result' }))
    expect(screen.getByText(/"requirements": \[\]/)).toBeInTheDocument()
  })

  it('does not announce an error when an active generation is cancelled', async () => {
    const onClose = vi.fn()
    let generationSignal: AbortSignal | undefined
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        generationSignal = init?.signal ?? undefined
        return {
          body: new ReadableStream({
            start() {
              // Deliberately keep the stream open until the caller aborts it.
            },
          }),
          ok: true,
        }
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator({ onClose })
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Grade access')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )
    await waitFor(() => expect(generationSignal).toBeDefined())

    await userEvent.click(screen.getByLabelText('close'))

    expect(onClose).toHaveBeenCalledOnce()
    expect(generationSignal?.aborted).toBe(true)
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })

  it('retains repair focus after failure and moves focus to repaired results', async () => {
    let repairAttempt = 0
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url.startsWith('/api/requirements/import/instruction')
      ) {
        return {
          ok: true,
          text: async () => '# Import instruction\n\nUse schemaVersion.',
        }
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        return validationErrorStreamResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/repair-requirement-import-json'
      ) {
        repairAttempt += 1
        if (repairAttempt === 1) {
          return {
            json: async () => ({ error: 'Repair service unavailable.' }),
            ok: false,
          }
        }
        const payload = generatedImportPayload('Repaired requirement')
        return {
          json: async () => ({
            payload,
            rawContent: JSON.stringify(payload),
            stats: {
              completionTokens: 12,
              cost: 0,
              promptTokens: 10,
              reasoningTokens: 2,
              totalTokens: 24,
            },
            thinking: '',
          }),
          ok: true,
        }
      }
      if (
        typeof url === 'string' &&
        url === '/api/requirements/import/preview'
      ) {
        return previewResponse('Repaired requirement')
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Grade access')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    const repairButton = await screen.findByRole('button', { name: 'repair' })
    await userEvent.click(repairButton)

    const firstRepairRequest = mockFetch.mock.calls.find(
      ([url]) => url === '/api/ai/repair-requirement-import-json',
    )
    expect(firstRepairRequest).toBeDefined()
    const firstRepairBody = JSON.parse(
      String((firstRepairRequest?.[1] as RequestInit | undefined)?.body),
    ) as { errors: string[]; rawJson: string }
    expect(firstRepairBody).toMatchObject({
      errors: ['$: Generated response is not valid JSON.'],
      rawJson: '{"requirements":',
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Repair failed: Repair service unavailable.',
    )
    expect(screen.getByRole('button', { name: 'repair' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'repair' }))

    const resultsHeading = await screen.findByRole('heading', {
      name: 'selectedCandidates',
    })
    expect(
      screen.getByText('The generated JSON was repaired successfully.'),
    ).toHaveAttribute('role', 'status')
    await waitFor(() => expect(resultsHeading).toHaveFocus())
  })

  it('renders the server-resolved priority snapshot as the shared badge', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        const payload = generatedImportPayload('Critical generated requirement')
        return generationStreamResponse({
          payload,
          rawContent: JSON.stringify(payload),
          stats: {
            completionTokens: 12,
            cost: 0,
            promptTokens: 10,
            reasoningTokens: 0,
            totalTokens: 22,
          },
          thinking: 'Prior thinking trace',
        })
      }
      if (
        typeof url === 'string' &&
        url === '/api/requirements/import/preview'
      ) {
        return previewResponse('Critical generated requirement', {
          labels: {
            category: 'IT requirement',
            priorityLevel: 'P5 – Very high',
            qualityCharacteristic: 'Functional correctness',
            type: 'Functional',
          },
          categoryId: 2,
          priorityLevelId: 42,
          qualityCharacteristicId: 3,
          resolvedPriorityLevel: {
            code: 'P5',
            color: '#ef4444',
            iconName: 'AlertTriangle',
            name: 'Very high',
          },
        })
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Continuity')
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(
      await screen.findByText('Critical generated requirement'),
    ).toBeInTheDocument()
    const priorityBadge = screen
      .getByText('P5 – Very high')
      .closest('.status-badge')
    expect(priorityBadge).toHaveAttribute('data-accent-color', '#ef4444')
    expect(priorityBadge?.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('detailType: Functional')).toBeInTheDocument()
    expect(
      screen.getByText('detailCategory: IT requirement'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('detailQuality: Functional correctness'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('detailPriorityLevel: 42'),
    ).not.toBeInTheDocument()
    const regenerateButton = screen.getByRole('button', {
      name: 'regenerateButton',
    })
    const deselectAllButton = screen.getByRole('button', {
      name: 'deselectAll',
    })
    expect(
      regenerateButton.compareDocumentPosition(deselectAllButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('shows unresolved taxonomy raw values with warning markers', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return authoringProfilesResponse()
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        const payload = generatedImportPayload('Generated security requirement')
        return generationStreamResponse({
          payload,
          rawContent: JSON.stringify(payload),
          stats: {
            completionTokens: 12,
            cost: 0,
            promptTokens: 10,
            reasoningTokens: 0,
            totalTokens: 22,
          },
          thinking: 'Prior thinking trace',
        })
      }
      if (
        typeof url === 'string' &&
        url === '/api/requirements/import/preview'
      ) {
        return previewResponse('Generated security requirement', {
          errors: [
            {
              code: 'review_required',
              level: 'error',
              message: 'Review is required.',
            },
          ],
          labels: {
            category: null,
            priorityLevel: null,
            qualityCharacteristic: null,
            type: 'Functional',
          },
          priorityLevelId: null,
          warnings: [
            {
              code: 'import_invalid_id_omitted',
              field: 'priorityLevelId',
              level: 'warning',
              message:
                'priorityLevelId ID was not found and will not be saved.',
              originalValue: '99',
            },
          ],
        })
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(
      await screen.findByText('Generated security requirement'),
    ).toBeInTheDocument()
    expect(screen.getByText('detailPriorityLevel: 99')).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: 'priorityLevelId ID was not found and will not be saved. (99)',
      }),
    ).toBeInTheDocument()
  })
})
