import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import type { AiConnectionTrustConfiguration } from '@/lib/ai/connection-trust'
import {
  AiRunTrustBoundaryError,
  createAiRunTrustBoundary,
} from '@/lib/ai/run-trust-boundary'

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
        responseSchema: prepared.task.responseSchema,
      }),
    ).resolves.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'additionalProperties', path: '$' }),
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
        responseSchema,
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
        responseSchema,
      }),
    ).resolves.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'required', path: '$' }),
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
          responseSchema: { type: 'object' },
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
        responseSchema: { type: 'object' },
      }),
    ).rejects.toMatchObject({ code: 'output_safety_blocked' })

    const { boundary } = setup()
    await expect(
      boundary.approveCompleted({
        analysis: null,
        quarantinedText: [],
        rawOutput: 'not JSON',
        responseSchema: { type: 'object' },
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
        responseSchema: { type: 'not-a-json-schema-type' },
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
        responseSchema: { type: 'string' },
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AiRunTrustBoundaryError)
    expect(JSON.stringify(error)).not.toMatch(/raw-secret|provider endpoint/u)
  })
})
