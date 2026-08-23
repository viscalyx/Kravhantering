import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import type { AiConnectionTrustConfiguration } from '@/lib/ai/connection-trust'
import {
  AiRunTrustBoundaryError,
  createAiRunTrustBoundary,
} from '@/lib/ai/run-trust-boundary'
import { buildRequirementsImportJsonSchema } from '@/lib/requirements/import-schema'

const trustConfiguration: AiConnectionTrustConfiguration = {
  authenticationType: 'static_secret',
  dataPolicy: {
    isPersonalDataProcessed: false,
    isTrainingAllowed: false,
    maximumInformationClass: 'internal',
    maximumRetentionDays: 0,
    processingRegions: ['SE'],
    subprocessors: [],
  },
  egressPolicyKey: 'public',
  endpointUrl: 'https://ai.example.test/v1',
  tlsPolicyKey: 'web-pki',
}

function setup(overrides: Record<string, unknown> = {}) {
  const screenInput = vi.fn(async () => ({ allowed: true }))
  const screenOutput = vi.fn(async () => ({ allowed: true }))
  const fetchPinned = vi.fn(async () => new Response('{}'))
  const boundary = createAiRunTrustBoundary({
    deployment: {
      dataPolicies: {
        generate_with_images: {
          allowedProcessingRegions: ['SE'],
          informationClassOrder: ['public', 'internal'],
          maximumInformationClass: 'internal',
          maximumRetentionDays: 0,
          personalDataAllowed: false,
          requireTrainingProhibited: true,
        },
        generate_without_images: {
          allowedProcessingRegions: ['SE'],
          informationClassOrder: ['public', 'internal'],
          maximumInformationClass: 'internal',
          maximumRetentionDays: 0,
          personalDataAllowed: false,
          requireTrainingProhibited: true,
        },
      },
      egressPolicies: {
        public: {
          allowedOrigins: ['https://ai.example.test'],
          privateSidecarOrigins: [],
        },
      },
      environment: 'production',
      resolveHostname: vi.fn(async () => ['93.184.216.34']),
      tlsPolicies: {
        'web-pki': {
          certificateValidation: 'required',
          fetchPinned,
          trustSource: 'public_web_pki',
        },
      },
    },
    imageLimits: {
      maximumBytes: 1024 * 1024,
      maximumFrames: 1,
      maximumHeight: 128,
      maximumPixels: 16384,
      maximumWidth: 128,
    },
    safetyFilter: { screenInput, screenOutput },
    ...overrides,
  })
  return { boundary, fetchPinned, screenInput, screenOutput }
}

describe('AI run trust boundary', () => {
  it('loads safety rules during preflight and fails closed on read errors', async () => {
    const screenInput = vi.fn(async () => {
      throw new Error('rule store unavailable')
    })
    const { boundary } = setup({
      safetyFilter: {
        screenInput,
        screenOutput: vi.fn(async () => ({ allowed: true })),
      },
    })

    await expect(boundary.preflightSafetyRules()).rejects.toMatchObject({
      code: 'safety_filter_failed',
    })
    expect(screenInput).toHaveBeenCalledWith([])
  })

  it('screens all text and replaces images with sanitized PNG before egress', async () => {
    const { boundary, screenInput } = setup()
    const jpeg = await sharp({
      create: {
        background: 'red',
        channels: 3,
        height: 3,
        width: 2,
      },
    })
      .jpeg()
      .toBuffer()

    const prepared = await boundary.prepareRun({
      runType: 'generate_with_images',
      task: {
        content: [
          { text: 'untrusted requirement', type: 'text' },
          { data: jpeg, mediaType: 'image/jpeg', type: 'image' },
        ],
        instructions: 'app-owned instruction',
        responseSchema: { type: 'object' },
        validationSchema: { type: 'object' },
      },
      trustConfiguration,
    })

    expect(screenInput).toHaveBeenCalledWith([
      'app-owned instruction',
      'untrusted requirement',
    ])
    expect(prepared.task.content[1]).toMatchObject({
      mediaType: 'image/png',
      type: 'image',
    })
  })

  it('holds an independent deeply frozen response-schema snapshot', async () => {
    const { boundary } = setup()
    const responseSchema: Record<string, unknown> = {
      additionalProperties: false,
      properties: { title: { type: 'string' } },
      type: 'object',
    }
    const prepared = await boundary.prepareRun({
      runType: 'generate_without_images',
      task: {
        content: [],
        instructions: 'instruction',
        responseSchema,
        validationSchema: responseSchema,
      },
      trustConfiguration,
    })

    responseSchema.additionalProperties = true
    expect(prepared.task.responseSchema).not.toBe(responseSchema)
    expect(Object.isFrozen(prepared.task.responseSchema)).toBe(true)
    expect(Object.isFrozen(prepared.task.responseSchema.properties)).toBe(true)
    expect(() => {
      ;(
        prepared.task.responseSchema as Record<string, unknown>
      ).additionalProperties = true
    }).toThrow()
    await expect(
      boundary.approveCompleted({
        analysis: null,
        quarantinedText: [],
        rawOutput: '{"unexpected":true}',
        validationSchema: prepared.task.validationSchema,
      }),
    ).resolves.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'additionalProperties',
          path: '$/unexpected',
        }),
      ]),
      valid: false,
    })
  })

  it('rejects a response schema that cannot be snapshotted before egress', async () => {
    const { boundary, screenInput } = setup()
    await expect(
      boundary.prepareRun({
        runType: 'generate_without_images',
        task: {
          content: [],
          instructions: 'instruction',
          responseSchema: {
            unsafeFunction: () => undefined,
          },
          validationSchema: { type: 'object' },
        },
        trustConfiguration,
      }),
    ).rejects.toMatchObject({ code: 'invalid_response_schema' })
    expect(screenInput).not.toHaveBeenCalled()
  })

  it('fails closed before egress when input screening blocks or fails', async () => {
    const blocked = setup({
      safetyFilter: {
        screenInput: vi.fn(async () => ({ allowed: false })),
        screenOutput: vi.fn(async () => ({ allowed: true })),
      },
    }).boundary
    await expect(
      blocked.prepareRun({
        runType: 'generate_without_images',
        task: {
          content: [{ text: 'blocked', type: 'text' }],
          instructions: 'instruction',
          responseSchema: { type: 'object' },
          validationSchema: { type: 'object' },
        },
        trustConfiguration,
      }),
    ).rejects.toMatchObject({ code: 'input_safety_blocked' })

    const failed = setup({
      safetyFilter: {
        screenInput: vi.fn(async () => {
          throw new Error('filter internals and content')
        }),
        screenOutput: vi.fn(async () => ({ allowed: true })),
      },
    }).boundary
    await expect(
      failed.prepareRun({
        runType: 'generate_without_images',
        task: {
          content: [{ text: 'secret prompt', type: 'text' }],
          instructions: 'instruction',
          responseSchema: { type: 'object' },
          validationSchema: { type: 'object' },
        },
        trustConfiguration,
      }),
    ).rejects.toMatchObject({
      code: 'safety_filter_failed',
      message: 'The AI safety boundary blocked the request.',
    })
  })

  it('fails closed before screening when an image or connection policy is rejected', async () => {
    const { boundary, screenInput } = setup()
    await expect(
      boundary.prepareRun({
        runType: 'generate_with_images',
        task: {
          content: [
            {
              data: Buffer.from('not an image'),
              mediaType: 'image/png',
              type: 'image',
            },
          ],
          instructions: 'instruction',
          responseSchema: { type: 'object' },
          validationSchema: { type: 'object' },
        },
        trustConfiguration,
      }),
    ).rejects.toMatchObject({ code: 'image_rejected' })
    expect(screenInput).not.toHaveBeenCalled()

    await expect(
      boundary.prepareRun({
        runType: 'generate_without_images',
        task: {
          content: [],
          instructions: 'instruction',
          responseSchema: { type: 'object' },
          validationSchema: { type: 'object' },
        },
        trustConfiguration: {
          ...trustConfiguration,
          endpointUrl: 'http://private.invalid',
        },
      }),
    ).rejects.toMatchObject({ code: 'trust_policy_blocked' })
  })

  it('screens buffered final text and validates the exact response schema', async () => {
    const { boundary, screenOutput } = setup()
    const responseSchema = {
      additionalProperties: false,
      properties: { requirements: { type: 'array' } },
      required: ['requirements'],
      type: 'object',
    } as const

    await expect(
      boundary.approveCompleted({
        analysis: 'safe reasoning',
        quarantinedText: [],
        rawOutput: '{"requirements":[]}',
        validationSchema: responseSchema,
      }),
    ).resolves.toEqual({ valid: true })
    expect(screenOutput).toHaveBeenCalledWith([
      'safe reasoning',
      '{"requirements":[]}',
    ])

    await expect(
      boundary.approveCompleted({
        analysis: null,
        quarantinedText: [],
        rawOutput: '{"unexpected":true}',
        validationSchema: responseSchema,
      }),
    ).resolves.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'required',
          message: "Required property 'requirements' is missing.",
          path: '$/requirements',
        }),
      ]),
      valid: false,
    })
  })

  it('validates final output against the supplied canonical schema', async () => {
    const { boundary } = setup()
    const validationSchema = {
      additionalProperties: false,
      properties: { requirements: { type: 'array' } },
      required: ['requirements'],
      type: 'object',
    } as const

    await expect(
      boundary.approveCompleted({
        analysis: null,
        quarantinedText: [],
        rawOutput: '{"requirements":[]}',
        validationSchema,
      }),
    ).resolves.toEqual({ valid: true })
  })

  it('accepts a canonical requirement import with omitted optional fields', async () => {
    const { boundary } = setup()
    const validationSchema = buildRequirementsImportJsonSchema('sv')

    await expect(
      boundary.approveCompleted({
        analysis: null,
        quarantinedText: [],
        rawOutput: JSON.stringify({
          requirements: [
            {
              description: 'Systemet ska registrera betyg.',
              normReferenceIds: [],
            },
          ],
          schemaVersion: 'requirement-import.v4',
        }),
        validationSchema,
      }),
    ).resolves.toEqual({ valid: true })
  })

  it('returns all actionable field locations for structured-output repair', async () => {
    const { boundary } = setup()
    const validationSchema = {
      additionalProperties: false,
      properties: {
        proposedNormReferences: { type: 'array' },
        requirements: {
          items: {
            additionalProperties: false,
            properties: {
              acceptanceCriteria: { type: 'string' },
              proposedNormReferenceKeys: { type: 'array' },
            },
            required: ['acceptanceCriteria', 'proposedNormReferenceKeys'],
            type: 'object',
          },
          type: 'array',
        },
      },
      required: ['proposedNormReferences', 'requirements'],
      type: 'object',
    } as const

    await expect(
      boundary.approveCompleted({
        analysis: null,
        quarantinedText: [],
        rawOutput: JSON.stringify({
          requirements: [
            {
              acceptanceCriteria: ['First criterion'],
              proposedNormReferences: [],
            },
          ],
        }),
        validationSchema,
      }),
    ).resolves.toMatchObject({
      issues: expect.arrayContaining([
        {
          code: 'required',
          message: "Required property 'proposedNormReferences' is missing.",
          path: '$/proposedNormReferences',
        },
        {
          code: 'required',
          message: "Required property 'proposedNormReferenceKeys' is missing.",
          path: '$/requirements/0/proposedNormReferenceKeys',
        },
        {
          code: 'additionalProperties',
          message:
            "Property 'proposedNormReferences' is not allowed at this location.",
          path: '$/requirements/0/proposedNormReferences',
        },
        expect.objectContaining({
          code: 'type',
          path: '$/requirements/0/acceptanceCriteria',
        }),
      ]),
      valid: false,
    })
  })

  it.each([
    '{"requirements":[],"tool_calls":[{"name":"shell"}]}',
    '{"requirements":[],"callback_url":"https://attacker.invalid"}',
    '{"requirements":[{"nested":{"toolCall":{"name":"shell"}}}]}',
  ])(
    'rejects callback and tool activation-probe output: %s',
    async rawOutput => {
      const { boundary } = setup()
      await expect(
        boundary.approveCompleted({
          analysis: null,
          quarantinedText: [],
          rawOutput,
          validationSchema: { type: 'object' },
        }),
      ).rejects.toMatchObject({ code: 'forbidden_activation' })
    },
  )

  it('rejects blocked output while returning safe invalid-output issues', async () => {
    const blocked = setup({
      safetyFilter: {
        screenInput: vi.fn(async () => ({ allowed: true })),
        screenOutput: vi.fn(async () => ({ allowed: false })),
      },
    }).boundary
    await expect(
      blocked.approveCompleted({
        analysis: null,
        quarantinedText: ['partial'],
        rawOutput: '{}',
        validationSchema: { type: 'object' },
      }),
    ).rejects.toMatchObject({ code: 'output_safety_blocked' })

    const { boundary } = setup()
    await expect(
      boundary.approveCompleted({
        analysis: null,
        quarantinedText: [],
        rawOutput: 'not JSON',
        validationSchema: { type: 'object' },
      }),
    ).resolves.toEqual({
      issues: [
        {
          code: 'invalid_json',
          message: 'Generated response is not valid JSON.',
          path: '$',
        },
      ],
      valid: false,
    })
    await expect(
      boundary.approveCompleted({
        analysis: null,
        quarantinedText: [],
        rawOutput: '{}',
        validationSchema: { type: 'not-a-json-schema-type' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_response_schema' })
  })

  it('does not expose rejected output or filter errors', async () => {
    const boundary = setup({
      safetyFilter: {
        screenInput: vi.fn(async () => ({ allowed: true })),
        screenOutput: vi.fn(async () => {
          throw new Error('raw result and provider endpoint')
        }),
      },
    }).boundary
    const error = await boundary
      .approveCompleted({
        analysis: null,
        quarantinedText: [],
        rawOutput: 'raw-secret-result',
        validationSchema: { type: 'string' },
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AiRunTrustBoundaryError)
    expect(JSON.stringify(error)).not.toMatch(/raw-secret|provider endpoint/u)
  })
})
