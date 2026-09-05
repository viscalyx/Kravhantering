import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeAiConnectionAdapterContract } from '@/lib/__tests__/ai-connection-adapter-contract'
import { createAiConnectionAdapterRegistry } from '@/lib/ai/adapter-registry'
import {
  OPENROUTER_ADAPTER_TYPE,
  OPENROUTER_ADAPTER_VERSION,
  openRouterAdapterRegistration,
} from '@/lib/ai/openrouter-adapter'
import {
  AI_REQUEST_PRIVACY_MINIMUM,
  type AiConnectionAdapterRunRequest,
  type AiConnectionId,
  type AiConnectionModelRevisionId,
  type AiRunEvent,
  type AiRunProfileId,
  createAiAdapterRunContext,
} from '@/lib/ai/run-contracts'

const mockFetch = vi.fn<typeof fetch>()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function request(
  abortSignal: AbortSignal = new AbortController().signal,
): AiConnectionAdapterRunRequest {
  return {
    connection: {
      configuration: {
        apiKey: 'test-provider-secret',
        endpoint: 'https://openrouter.test/api/v1',
      },
      id: 'connection-17' as AiConnectionId,
    },
    context: createAiAdapterRunContext(
      {
        abortSignal,
        applicationRunId: 'app-run-98',
        correlationId: 'correlation-42',
        deadlineAt: '2099-08-19T12:00:00.000Z',
      },
      { fetch: mockFetch },
    ),
    limits: {
      maxBufferedEvents: 32,
      maxOutputBytes: 4_194_304,
      maxOutputTokens: 8_192,
      maxRetainedMemoryBytes: 8_388_608,
    },
    modelRevision: {
      reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
      configuration: {},
      externalModelId: 'provider/model-v1',
      id: 'model-revision-23' as AiConnectionModelRevisionId,
      verifiedCapabilities: {
        reasoning: true,
        reasoningControl: true,
        aiAnalysis: true,
        cost: true,
        imageInput: true,
        jsonSchemaSteering: true,
        streaming: false,
        tokenUsage: true,
        validatableJson: true,
      },
    },
    privacyPolicy: AI_REQUEST_PRIVACY_MINIMUM,
    runProfileConfigurationVersion: 1,
    runProfileId: 'profile-31' as AiRunProfileId,
    selectedCapabilities: {
      reasoning: true,
      reasoningControl: true,
      aiAnalysis: true,
      cost: true,
      imageInput: false,
      jsonSchemaSteering: true,
      streaming: false,
      tokenUsage: true,
      validatableJson: true,
    },
    task: {
      content: [{ text: 'Generate safe JSON', type: 'text' }],
      instructions: 'Return a requirement import file.',
      responseSchema: { type: 'object' },
      validationSchema: { type: 'object' },
    },
  }
}

function adapter() {
  return createAiConnectionAdapterRegistry([
    openRouterAdapterRegistration,
  ]).resolve(OPENROUTER_ADAPTER_TYPE, OPENROUTER_ADAPTER_VERSION)
}

function nonStreamingResponse(
  overrides: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: '{"requirements":[]}',
            reasoning: 'complete analysis',
          },
        },
      ],
      usage: {
        completion_tokens: 7,
        completion_tokens_details: { reasoning_tokens: 2 },
        cost: 0.0042,
        prompt_tokens: 12,
        total_tokens: 19,
      },
      ...overrides,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}

async function collectEvents(
  events: AsyncIterable<AiRunEvent>,
): Promise<AiRunEvent[]> {
  const collected: AiRunEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

function streamingCompletionResponse(): Response {
  return new Response(
    [
      'data: {"choices":[{"delta":{"reasoning":"partial analysis"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"{\\"requirements\\""}}]}',
      '',
      'data: {"choices":[{"delta":{"content":":[]}"}}],"usage":{"prompt_tokens":12,"completion_tokens":7,"total_tokens":19,"cost":0.0042,"completion_tokens_details":{"reasoning_tokens":2}}}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n'),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

function enableStreaming(
  adapterRequest: AiConnectionAdapterRunRequest,
): AiConnectionAdapterRunRequest {
  return {
    ...adapterRequest,
    modelRevision: {
      ...adapterRequest.modelRevision,
      verifiedCapabilities: {
        ...adapterRequest.modelRevision.verifiedCapabilities,
        streaming: true,
      },
    },
    selectedCapabilities: {
      ...adapterRequest.selectedCapabilities,
      streaming: true,
    },
  }
}

describeAiConnectionAdapterContract('OpenRouter adapter', () => ({
  adapterType: OPENROUTER_ADAPTER_TYPE,
  expectedReasoningEvidence: { activity: true, control: true },
  completedRequest: () => {
    mockFetch.mockResolvedValueOnce(streamingCompletionResponse())
    return enableStreaming(request())
  },
  missingCapabilityRequest: () => {
    const adapterRequest = request()
    return {
      ...adapterRequest,
      modelRevision: {
        ...adapterRequest.modelRevision,
        verifiedCapabilities: {
          ...adapterRequest.modelRevision.verifiedCapabilities,
          imageInput: false,
        },
      },
      selectedCapabilities: {
        ...adapterRequest.selectedCapabilities,
        imageInput: true,
      },
    }
  },
  registration: openRouterAdapterRegistration,
  waitForAbortRequest: signal => {
    mockFetch.mockImplementationOnce(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    return request(signal)
  },
}))

describe('OpenRouter AI connection adapter', () => {
  it('requests saved reasoning independently of visible analysis and usage display', async () => {
    const value = request()
    value.modelRevision = {
      ...value.modelRevision,
      reasoning: { mode: 'explicit_control', effort: 'low' },
    }
    value.selectedCapabilities = {
      ...value.selectedCapabilities,
      reasoning: true,
      reasoningControl: true,
      aiAnalysis: false,
      tokenUsage: false,
    }
    mockFetch.mockResolvedValueOnce(
      nonStreamingResponse({
        choices: [
          {
            message: {
              content: '{"requirements":[]}',
              reasoning_details: [
                { type: 'reasoning.encrypted', data: 'private' },
              ],
            },
          },
        ],
        usage: {},
      }),
    )
    const events = await collectEvents(adapter().run(value))
    expect(
      JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      reasoning: { effort: 'low' },
      provider: { require_parameters: true },
    })
    expect(events.at(-1)).toMatchObject({
      type: 'completed',
      analysis: null,
      reasoningEvidence: { activity: true, control: true },
    })
    expect(JSON.stringify(events)).not.toContain('private')
  })

  it.each([
    [
      { reasoning_details: [{ type: 'reasoning.text', text: 'safe text' }] },
      {},
      true,
      'safe text',
    ],
    [
      {
        reasoning_details: [
          { type: 'reasoning.summary', summary: 'safe summary' },
        ],
      },
      {},
      true,
      'safe summary',
    ],
    [
      {
        reasoning_details: [
          { type: 'reasoning.encrypted', data: 'private', text: 'private' },
        ],
      },
      {},
      true,
      null,
    ],
    [
      {
        reasoning_details: [
          { type: 'reasoning.redacted', data: 'private', summary: 'private' },
        ],
      },
      {},
      true,
      null,
    ],
    [
      { reasoning_details: [{ type: 'arbitrary', text: 'private' }] },
      {},
      false,
      null,
    ],
    [{}, { completion_tokens_details: { reasoning_tokens: 2 } }, true, null],
    [{}, { completion_tokens_details: { reasoning_tokens: 0 } }, false, null],
    [{}, { reasoning: true }, false, null],
  ] as const)(
    'normalizes activity independently of safe analysis for %j',
    async (message, usage, activity, analysis) => {
      const value = request()
      value.modelRevision = {
        ...value.modelRevision,
        reasoning: { mode: 'model_default', effort: null },
      }
      value.selectedCapabilities = {
        ...value.selectedCapabilities,
        jsonSchemaSteering: false,
        tokenUsage: false,
        reasoningControl: false,
      }
      mockFetch.mockResolvedValueOnce(
        nonStreamingResponse({
          choices: [
            {
              message: {
                content: '{"reasoning":"final answer is not evidence"}',
                ...message,
              },
            },
          ],
          usage,
        }),
      )
      const events = await collectEvents(adapter().run(value))
      const body = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))
      expect(body).not.toHaveProperty('reasoning')
      expect(body.provider).toEqual({
        allow_fallbacks: true,
        data_collection: 'deny',
        zdr: true,
      })
      expect(events.at(-1)).toMatchObject({
        type: 'completed',
        analysis,
        reasoningEvidence: { activity, control: false },
      })
      expect(JSON.stringify(events)).not.toContain('private')
    },
  )

  it('normalizes encrypted streaming activity without exposing the payload', async () => {
    const value = enableStreaming(request())
    mockFetch.mockResolvedValueOnce(
      new Response(
        'data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.encrypted","data":"private"}],"content":"{}"}}]}\n\ndata: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    )
    const events = await collectEvents(adapter().run(value))
    expect(events.at(-1)).toMatchObject({
      type: 'completed',
      analysis: null,
      reasoningEvidence: { activity: true, control: true },
    })
    expect(JSON.stringify(events)).not.toContain('private')
  })

  it('force-closes the exact active transport by opaque external run ID', async () => {
    let transportSignal: AbortSignal | undefined
    let markStarted = (): void => undefined
    const started = new Promise<void>(resolve => {
      markStarted = resolve
    })
    mockFetch.mockImplementation(async (_input, init) => {
      transportSignal = init?.signal ?? undefined
      markStarted()
      await new Promise<void>((_resolve, reject) => {
        transportSignal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        )
      })
      throw new Error('unreachable')
    })
    const runRequest = request()
    const connectionAdapter = adapter()
    const next = connectionAdapter
      .run(runRequest)
      [Symbol.asyncIterator]()
      .next()
    await started

    connectionAdapter.forceClose(runRequest.context.externalRunId)

    expect(transportSignal?.aborted).toBe(true)
    await expect(next).resolves.toMatchObject({
      value: { failure: { category: 'connection_unavailable' } },
    })
  })

  it('is registrable and normalizes a completed non-streaming response', async () => {
    mockFetch.mockResolvedValueOnce(nonStreamingResponse())

    await expect(collectEvents(adapter().run(request()))).resolves.toEqual([
      {
        reasoningEvidence: { activity: true, control: true },
        analysis: 'complete analysis',
        identity: {
          aiConnectionId: 'connection-17',
          aiConnectionModelRevisionId: 'model-revision-23',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile-31',
        },
        rawOutput: '{"requirements":[]}',
        type: 'completed',
        usage: {
          analysisTokens: { status: 'reported', value: 2 },
          cost: {
            status: 'reported',
            value: { amount: '0.0042', currency: 'USD' },
          },
          inputTokens: { status: 'reported', value: 12 },
          outputTokens: { status: 'reported', value: 7 },
          totalTokens: { status: 'reported', value: 19 },
        },
      },
    ])
  })

  it('processes coalesced SSE frames without treating one transport chunk as an event queue', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        [
          `data: ${JSON.stringify({
            choices: [{ delta: { content: '{"requirements":' } }],
          })}`,
          '',
          `data: ${JSON.stringify({
            choices: [{ delta: { content: '[]}' } }],
          })}`,
          '',
          'data: [DONE]',
          '',
          '',
        ].join('\n'),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )
    const adapterRequest = enableStreaming(request())
    adapterRequest.limits = {
      ...adapterRequest.limits,
      maxBufferedEvents: 1,
    }

    const events = await collectEvents(adapter().run(adapterRequest))

    expect(events.at(-1)).toMatchObject({
      rawOutput: '{"requirements":[]}',
      type: 'completed',
    })
    expect(events.filter(event => event.type === 'output_delta')).toHaveLength(
      2,
    )
  })

  it('consumes mixed SSE frame endings and recognizes a clean done event', async () => {
    const first = `data: ${JSON.stringify({
      choices: [{ delta: { content: '{"requirements":' } }],
    })}`
    const second = `data: ${JSON.stringify({
      choices: [{ delta: { content: '[]}' } }],
    })}`
    mockFetch.mockResolvedValueOnce(
      new Response(`${first}\r\n\n${second}\n\r\ndata: [DONE]\r\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )

    const events = await collectEvents(
      adapter().run(enableStreaming(request())),
    )

    expect(events.at(-1)).toMatchObject({
      rawOutput: '{"requirements":[]}',
      type: 'completed',
    })
    expect(events).not.toContainEqual(
      expect.objectContaining({
        failure: expect.objectContaining({
          diagnosticCode: 'invalid_upstream_stream_event',
        }),
        type: 'failed',
      }),
    )
  })

  it.each([false, true])(
    'preserves token limits, privacy, and opaque identity with streaming=%s',
    async streaming => {
      mockFetch.mockResolvedValueOnce(
        streaming ? streamingCompletionResponse() : nonStreamingResponse(),
      )
      const adapterRequest = streaming ? enableStreaming(request()) : request()
      adapterRequest.connection.configuration = {
        apiKey: 'test-provider-secret',
        endpoint: 'https://gateway.example.test/openrouter/v1/',
        providerPreferences: {
          dataCollection: 'allow',
          zeroDataRetention: false,
        },
      }
      adapterRequest.selectedCapabilities = {
        ...adapterRequest.selectedCapabilities,
        imageInput: true,
        streaming,
      }
      adapterRequest.task = {
        ...adapterRequest.task,
        content: [
          { text: 'Generate safe JSON', type: 'text' },
          {
            data: new Uint8Array([0, 1, 2, 255]),
            mediaType: 'image/png',
            type: 'image',
          },
        ],
      }

      const events = await collectEvents(adapter().run(adapterRequest))
      expect(events.at(-1)).toMatchObject({ type: 'completed' })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe(
        'https://gateway.example.test/openrouter/v1/chat/completions',
      )
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer test-provider-secret',
      )
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).toMatchObject({
        max_completion_tokens: 8_192,
        model: 'provider/model-v1',
        provider: {
          allow_fallbacks: true,
          data_collection: 'deny',
          require_parameters: true,
          zdr: true,
        },
        reasoning: { effort: 'high', exclude: false },
        response_format: {
          json_schema: {
            name: 'requirement_import',
            schema: { type: 'object' },
            strict: true,
          },
          type: 'json_schema',
        },
        stream: streaming,
      })
      expect(body).not.toHaveProperty('user')
      expect(body.messages).toEqual([
        {
          content: 'Return a requirement import file.',
          role: 'system',
        },
        {
          content: [
            { text: 'Generate safe JSON', type: 'text' },
            {
              image_url: {
                url: `data:image/png;base64,${Buffer.from([0, 1, 2, 255]).toString('base64')}`,
              },
              type: 'image_url',
            },
          ],
          role: 'user',
        },
      ])
      const serializedBody = JSON.stringify(body)
      expect(serializedBody).not.toMatch(
        /app-run-98|correlation-42|connection-17|model-revision-23|profile-31/u,
      )
    },
  )

  it('uses the resolved revision as runtime truth without consulting the model catalog', async () => {
    mockFetch.mockResolvedValueOnce(nonStreamingResponse())

    await collectEvents(adapter().run(request()))

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://openrouter.test/api/v1/chat/completions',
    )
    const body = JSON.parse(String(mockFetch.mock.calls[0][1]?.body)) as Record<
      string,
      unknown
    >
    expect(body.model).toBe('provider/model-v1')
  })

  it.each([
    [
      401,
      'authentication_failed',
      'upstream_authentication_failed_http_401',
      false,
      undefined,
    ],
    [
      403,
      'authentication_failed',
      'upstream_authentication_failed_http_403',
      false,
      undefined,
    ],
    [429, 'rate_limited', 'upstream_rate_limited_http_429', true, 17],
    [
      404,
      'connection_unavailable',
      'upstream_unavailable_http_404',
      true,
      undefined,
    ],
    [
      400,
      'request_rejected',
      'upstream_request_rejected_http_400',
      false,
      undefined,
    ],
    [
      408,
      'deadline_exceeded',
      'upstream_deadline_exceeded_http_408',
      true,
      undefined,
    ],
    [
      500,
      'connection_unavailable',
      'upstream_unavailable_http_500',
      true,
      undefined,
    ],
    [
      504,
      'deadline_exceeded',
      'upstream_deadline_exceeded_http_504',
      true,
      undefined,
    ],
  ] as const)(
    'normalizes HTTP %s without exposing the provider response',
    async (status, category, diagnosticCode, retryable, retryAfterSeconds) => {
      mockFetch.mockResolvedValueOnce(
        new Response('secret provider details', {
          headers: { 'Retry-After': '17' },
          status,
        }),
      )

      const events = await collectEvents(adapter().run(request()))

      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        failure: {
          category,
          diagnosticCode,
          retryable,
          ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
        },
        type: 'failed',
      })
      expect(JSON.stringify(events)).not.toContain('secret provider details')
    },
  )

  it('reports unavailable usage explicitly without rejecting valid output', async () => {
    mockFetch.mockResolvedValueOnce(nonStreamingResponse({ usage: undefined }))

    const events = await collectEvents(adapter().run(request()))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'completed',
      usage: {
        analysisTokens: { reason: 'not_reported', status: 'unavailable' },
        cost: { reason: 'not_reported', status: 'unavailable' },
        inputTokens: { reason: 'not_reported', status: 'unavailable' },
        outputTokens: { reason: 'not_reported', status: 'unavailable' },
        totalTokens: { reason: 'not_reported', status: 'unavailable' },
      },
    })
  })

  it('calculates total tokens when OpenRouter reports both component counts', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'))
    mockFetch.mockResolvedValueOnce(
      nonStreamingResponse({
        usage: {
          completion_tokens: 7,
          prompt_tokens: 12,
        },
      }),
    )

    const events = await collectEvents(adapter().run(request()))

    expect(events[0]).toMatchObject({
      type: 'completed',
      usage: {
        totalTokens: {
          calculatedAt: '2026-08-19T12:00:00.000Z',
          status: 'calculated',
          value: 19,
        },
      },
    })
  })

  it('does not infer a provider response format from validatable JSON', async () => {
    mockFetch.mockResolvedValueOnce(
      nonStreamingResponse({
        choices: [
          {
            message: {
              content: '{}',
              reasoning: 'must not be consumed',
            },
          },
        ],
      }),
    )
    const adapterRequest = request()
    adapterRequest.modelRevision = {
      ...adapterRequest.modelRevision,
      reasoning: { mode: 'model_default', effort: null },
    }
    adapterRequest.connection.configuration = { apiKey: 'secret' }
    adapterRequest.modelRevision.configuration = {}
    adapterRequest.selectedCapabilities = {
      reasoning: true,
      reasoningControl: true,
      aiAnalysis: false,
      cost: false,
      imageInput: false,
      jsonSchemaSteering: false,
      streaming: false,
      tokenUsage: false,
      validatableJson: true,
    }

    const events = await collectEvents(adapter().run(adapterRequest))

    expect(events[0]).toMatchObject({
      analysis: null,
      type: 'completed',
      usage: {
        analysisTokens: { reason: 'not_supported', status: 'unavailable' },
        cost: { reason: 'not_supported', status: 'unavailable' },
        inputTokens: { reason: 'not_supported', status: 'unavailable' },
        outputTokens: { reason: 'not_supported', status: 'unavailable' },
        totalTokens: { reason: 'not_supported', status: 'unavailable' },
      },
    })
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    )
    const body = JSON.parse(String(mockFetch.mock.calls[0][1]?.body))
    expect(body).not.toHaveProperty('include_reasoning')
    expect(body).not.toHaveProperty('reasoning')
    expect(body).not.toHaveProperty('response_format')
    expect(body.provider).toEqual({
      allow_fallbacks: true,
      data_collection: 'deny',
      zdr: true,
    })
    expect(body).not.toHaveProperty('user')
  })

  it('does not require provider parameters for usage-only capabilities', async () => {
    mockFetch.mockResolvedValueOnce(nonStreamingResponse())
    const adapterRequest = request()
    adapterRequest.modelRevision = {
      ...adapterRequest.modelRevision,
      reasoning: { mode: 'model_default', effort: null },
    }
    adapterRequest.selectedCapabilities = {
      reasoning: true,
      reasoningControl: true,
      aiAnalysis: false,
      cost: true,
      imageInput: false,
      jsonSchemaSteering: false,
      streaming: false,
      tokenUsage: true,
      validatableJson: false,
    }

    await collectEvents(adapter().run(adapterRequest))

    const body = JSON.parse(String(mockFetch.mock.calls[0][1]?.body))
    expect(body.provider).not.toHaveProperty('require_parameters')
    expect(body).not.toHaveProperty('reasoning')
    expect(body).not.toHaveProperty('response_format')
  })

  it('requires parameter-supporting routes for explicit reasoning control', async () => {
    mockFetch.mockResolvedValueOnce(nonStreamingResponse())
    const adapterRequest = request()
    adapterRequest.selectedCapabilities = {
      reasoning: true,
      reasoningControl: true,
      aiAnalysis: true,
      cost: false,
      imageInput: false,
      jsonSchemaSteering: false,
      streaming: false,
      tokenUsage: false,
      validatableJson: false,
    }

    const events = await collectEvents(adapter().run(adapterRequest))

    expect(events[0]).toMatchObject({
      analysis: 'complete analysis',
      type: 'completed',
    })
    const body = JSON.parse(String(mockFetch.mock.calls[0][1]?.body))
    expect(body.reasoning).toEqual({ effort: 'high', exclude: false })
    expect(body.provider.require_parameters).toBe(true)
    expect(body).not.toHaveProperty('response_format')
  })

  it.each([
    undefined,
    { allowDataCollection: true, requireZeroDataRetention: true },
    { allowDataCollection: false, requireZeroDataRetention: false },
  ])(
    'rejects a missing or weaker integration privacy policy before egress',
    async privacyPolicy => {
      const adapterRequest = request()
      Object.assign(adapterRequest, { privacyPolicy })

      await expect(
        collectEvents(adapter().run(adapterRequest)),
      ).resolves.toEqual([
        expect.objectContaining({
          failure: expect.objectContaining({
            diagnosticCode: 'privacy_policy_not_satisfied',
            retryable: false,
          }),
          type: 'failed',
        }),
      ])
      expect(mockFetch).not.toHaveBeenCalled()
    },
  )

  it('normalizes reasoning detail text without duplicating fallback reasoning', async () => {
    mockFetch.mockResolvedValueOnce(
      nonStreamingResponse({
        choices: [
          {
            message: {
              content: '{}',
              reasoning_details: [
                null,
                { type: 'reasoning.text', text: 'first' },
                { type: 'reasoning.summary', summary: ' second' },
                { ignored: true },
              ],
            },
          },
        ],
      }),
    )

    const events = await collectEvents(adapter().run(request()))

    expect(events[0]).toMatchObject({
      analysis: 'first second',
      type: 'completed',
    })
  })

  it('normalizes the documented reasoning-content response alias', async () => {
    mockFetch.mockResolvedValueOnce(
      nonStreamingResponse({
        choices: [
          {
            message: {
              content: '{}',
              reasoning_content: 'safe summarized analysis',
            },
          },
        ],
      }),
    )

    const events = await collectEvents(adapter().run(request()))

    expect(events[0]).toMatchObject({
      analysis: 'safe summarized analysis',
      type: 'completed',
    })
  })

  it('does not expose encrypted reasoning details as visible AI analysis', async () => {
    mockFetch.mockResolvedValueOnce(
      nonStreamingResponse({
        choices: [
          {
            message: {
              content: '{}',
              reasoning_details: [
                {
                  data: 'opaque-encrypted-reasoning',
                  type: 'reasoning.encrypted',
                },
              ],
            },
          },
        ],
      }),
    )

    const events = await collectEvents(adapter().run(request()))

    expect(events[0]).toMatchObject({ analysis: null, type: 'completed' })
  })

  it.each([
    null,
    { apiKey: '', endpoint: 'https://openrouter.test/api/v1' },
    { apiKey: '   ', endpoint: 'https://openrouter.test/api/v1' },
    { apiKey: 'secret', endpoint: 17 },
    { apiKey: 'secret', endpoint: 'not a url' },
    { apiKey: 'secret', endpoint: 'http://openrouter.test/api/v1' },
    {
      apiKey: 'secret',
      endpoint: 'https://user:password@openrouter.test/api/v1',
    },
    { apiKey: 'secret', providerPreferences: 'deny' },
    {
      apiKey: 'secret',
      providerPreferences: { dataCollection: 'sometimes' },
    },
    {
      apiKey: 'secret',
      providerPreferences: { zeroDataRetention: 'yes' },
    },
  ])(
    'rejects unsafe connection configuration before transport',
    async configuration => {
      const adapterRequest = request()
      adapterRequest.connection.configuration = configuration

      const events = await collectEvents(adapter().run(adapterRequest))

      expect(events).toEqual([
        {
          failure: {
            category: 'adapter_failure',
            diagnosticCode: 'invalid_adapter_configuration',
            retryable: false,
          },
          identity: {
            aiConnectionId: 'connection-17',
            aiConnectionModelRevisionId: 'model-revision-23',
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: 'profile-31',
          },
          type: 'failed',
        },
      ])
      expect(mockFetch).not.toHaveBeenCalled()
      expect(JSON.stringify(events)).not.toMatch(/secret|openrouter\.test/u)
    },
  )

  it.each([null, 'invalid'])(
    'rejects invalid model configuration before transport',
    async configuration => {
      const adapterRequest = request()
      adapterRequest.modelRevision.configuration = configuration

      const events = await collectEvents(adapter().run(adapterRequest))

      expect(events[0]).toMatchObject({
        failure: { category: 'adapter_failure', retryable: false },
        type: 'failed',
      })
      expect(mockFetch).not.toHaveBeenCalled()
    },
  )

  it('rejects an invalid external model identifier before transport', async () => {
    const adapterRequest = request()
    adapterRequest.modelRevision = {
      ...adapterRequest.modelRevision,
      externalModelId: '',
    }

    const events = await collectEvents(adapter().run(adapterRequest))

    expect(events[0]).toMatchObject({
      failure: { category: 'adapter_failure', retryable: false },
      type: 'failed',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not send image input when the capability was not selected', async () => {
    const adapterRequest = request()
    adapterRequest.task = {
      ...adapterRequest.task,
      content: [
        { data: new Uint8Array([1]), mediaType: 'image/png', type: 'image' },
      ],
    }

    const events = await collectEvents(adapter().run(adapterRequest))

    expect(events[0]).toMatchObject({
      failure: { category: 'capability_mismatch', retryable: false },
      type: 'failed',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects an invalid adapter deadline before transport', async () => {
    const adapterRequest = request()
    adapterRequest.context = {
      ...adapterRequest.context,
      deadlineAt: 'not-a-date',
    }

    const events = await collectEvents(adapter().run(adapterRequest))

    expect(events[0]).toMatchObject({
      failure: {
        category: 'adapter_failure',
        diagnosticCode: 'invalid_adapter_deadline',
        retryable: false,
      },
      type: 'failed',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fails an expired deadline without opening transport', async () => {
    const adapterRequest = request()
    adapterRequest.context = {
      ...adapterRequest.context,
      deadlineAt: '2000-01-01T00:00:00.000Z',
    }

    await expect(collectEvents(adapter().run(adapterRequest))).resolves.toEqual(
      [
        {
          failure: {
            category: 'deadline_exceeded',
            diagnosticCode: 'upstream_deadline_exceeded',
            retryable: true,
          },
          identity: {
            aiConnectionId: 'connection-17',
            aiConnectionModelRevisionId: 'model-revision-23',
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: 'profile-31',
          },
          type: 'failed',
        },
      ],
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('cancels an already aborted run without opening transport', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      collectEvents(adapter().run(request(controller.signal))),
    ).resolves.toEqual([
      {
        identity: {
          aiConnectionId: 'connection-17',
          aiConnectionModelRevisionId: 'model-revision-23',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile-31',
        },
        reason: 'application_cancelled',
        type: 'cancelled',
      },
    ])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fails malformed and incomplete stream events safely', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('data: {not-json}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    const adapterRequest = enableStreaming(request())

    const events = await collectEvents(adapter().run(adapterRequest))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      failure: { category: 'invalid_response', retryable: false },
      type: 'failed',
    })
    expect(JSON.stringify(events)).not.toContain('{not-json}')
  })

  it('normalizes a transport failure without exposing its exception', async () => {
    mockFetch.mockRejectedValueOnce(
      new Error('https://provider.test token=secret'),
    )

    const events = await collectEvents(adapter().run(request()))

    expect(events[0]).toMatchObject({
      failure: { category: 'connection_unavailable', retryable: true },
      type: 'failed',
    })
    expect(JSON.stringify(events)).not.toMatch(/provider\.test|secret/u)
  })

  it.each([false, true])(
    'forbids redirects in %s streaming mode without replaying the request',
    async streaming => {
      mockFetch.mockRejectedValueOnce(new TypeError('redirect rejected'))
      const adapterRequest = streaming ? enableStreaming(request()) : request()

      const events = await collectEvents(adapter().run(adapterRequest))

      expect(mockFetch).toHaveBeenCalledOnce()
      expect(mockFetch.mock.calls[0][1]?.redirect).toBe('error')
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        failure: {
          category: 'connection_unavailable',
          retryable: true,
        },
        type: 'failed',
      })
      expect(JSON.stringify(events)).not.toContain('redirect rejected')
    },
  )

  it.each([
    [
      'rate_limited',
      {
        choices: [
          {
            error: { code: 429, message: 'secret provider error' },
            finish_reason: 'error',
            message: { content: 'partial unsafe output' },
          },
        ],
      },
    ],
    [
      'authentication_failed',
      {
        error: { code: 403, message: 'secret provider error' },
      },
    ],
  ] as const)(
    'normalizes a non-streaming in-band provider error without completing partial output',
    async (category, providerResponse) => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(providerResponse), {
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const events = await collectEvents(adapter().run(request()))

      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ failure: { category }, type: 'failed' })
      expect(JSON.stringify(events)).not.toMatch(
        /secret provider error|partial unsafe output/u,
      )
    },
  )

  it('normalizes an in-band stream error as failure instead of partial completion', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        [
          'data: {"choices":[{"delta":{"content":"partial"}}]}',
          '',
          'data: {"error":{"code":429,"message":"secret provider error"},"choices":[{"delta":{"content":""}}]}',
          '',
          'data: [DONE]',
          '',
          '',
        ].join('\n'),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )

    const events = await collectEvents(
      adapter().run(enableStreaming(request())),
    )

    expect(events).toEqual([
      { delta: 'partial', type: 'output_delta', visibility: 'internal' },
      expect.objectContaining({
        failure: expect.objectContaining({
          category: 'rate_limited',
          retryable: true,
        }),
        type: 'failed',
      }),
    ])
    expect(JSON.stringify(events)).not.toContain('secret provider error')
  })

  it.each([
    new Response('{}', { headers: { 'Content-Type': 'text/plain' } }),
    new Response(null, { headers: { 'Content-Type': 'application/json' } }),
    new Response('{not-json}', {
      headers: { 'Content-Type': 'application/json' },
    }),
    new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
    new Response('{"choices":[{}]}', {
      headers: { 'Content-Type': 'application/json' },
    }),
    new Response('{"choices":[{"message":{"content":17}}]}', {
      headers: { 'Content-Type': 'application/problem+json' },
    }),
  ])('rejects invalid non-streaming provider responses', async response => {
    mockFetch.mockResolvedValueOnce(response)

    const events = await collectEvents(adapter().run(request()))

    expect(events[0]).toMatchObject({
      failure: { category: 'invalid_response', retryable: false },
      type: 'failed',
    })
  })

  it('rejects provider callback, tool, and function-call protocol fields', async () => {
    for (const prohibited of ['callback', 'function_call', 'tool_calls']) {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"requirements":[]}',
                  [prohibited]: {},
                },
              },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      )
      await expect(
        collectEvents(adapter().run(request())),
      ).resolves.toMatchObject([
        { failure: { category: 'invalid_response' }, type: 'failed' },
      ])
    }

    mockFetch.mockResolvedValueOnce(
      new Response(
        'data: {"choices":[{"delta":{"tool_calls":[]}}]}\n\ndata: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    )
    await expect(
      collectEvents(adapter().run(enableStreaming(request()))),
    ).resolves.toMatchObject([
      { failure: { category: 'invalid_response' }, type: 'failed' },
    ])
  })

  it('normalizes streaming transport and HTTP failures', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('secret stream exception'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      )

    for (const category of [
      'connection_unavailable',
      'connection_unavailable',
      'invalid_response',
    ]) {
      const events = await collectEvents(
        adapter().run(enableStreaming(request())),
      )
      expect(events[0]).toMatchObject({ failure: { category }, type: 'failed' })
      expect(JSON.stringify(events)).not.toContain('secret stream exception')
    }
  })

  it.each([
    'data: null\n\n',
    'data: {"choices":{}}\n\n',
    'data: {"choices":[null]}\n\n',
    'data: {"choices":[{"delta":{"content":17}}]}\n\n',
  ])('rejects an invalid normalized stream delta', async streamBody => {
    mockFetch.mockResolvedValueOnce(
      new Response(streamBody, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )

    const events = await collectEvents(
      adapter().run(enableStreaming(request())),
    )

    expect(events[0]).toMatchObject({
      failure: { category: 'invalid_response', retryable: false },
      type: 'failed',
    })
  })

  it('turns an unterminated provider stream into a safe terminal failure', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        ': keepalive\n\ndata: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )

    const events = await collectEvents(
      adapter().run(enableStreaming(request())),
    )

    expect(events).toEqual([
      { delta: 'partial', type: 'output_delta', visibility: 'internal' },
      expect.objectContaining({
        failure: expect.objectContaining({
          category: 'invalid_response',
          retryable: false,
        }),
        type: 'failed',
      }),
    ])
  })

  it('normalizes invalid UTF-8 and stream read failures', async () => {
    const invalidEncoding = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff]))
      },
    })
    const readFailure = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('secret read failure')
      },
    })
    mockFetch
      .mockResolvedValueOnce(
        new Response(invalidEncoding, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(readFailure, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )

    for (const diagnosticCode of [
      'invalid_upstream_stream_encoding',
      'upstream_stream_read_failed',
    ]) {
      const events = await collectEvents(
        adapter().run(enableStreaming(request())),
      )
      expect(events[0]).toMatchObject({
        failure: { diagnosticCode },
        type: 'failed',
      })
      expect(JSON.stringify(events)).not.toContain('secret read failure')
    }
  })

  it('bounds a non-streaming response before parsing it', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('x'.repeat(4 * 1024 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const events = await collectEvents(adapter().run(request()))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      failure: { category: 'invalid_response', retryable: false },
      type: 'failed',
    })
  })

  it('bounds a streaming frame before parsing it', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(`data: ${'x'.repeat(256 * 1024)}\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    const adapterRequest = enableStreaming(request())

    const events = await collectEvents(adapter().run(adapterRequest))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      failure: { category: 'invalid_response', retryable: false },
      type: 'failed',
    })
  })

  it('bounds a streaming partial frame by the persisted memory limit', async () => {
    const encoder = new TextEncoder()
    mockFetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: 1234567890'))
            controller.enqueue(encoder.encode('1234567890'))
            controller.close()
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )
    const adapterRequest = enableStreaming(request())
    adapterRequest.limits = {
      ...adapterRequest.limits,
      maxRetainedMemoryBytes: 20,
    }

    const events = await collectEvents(adapter().run(adapterRequest))

    expect(events).toEqual([
      expect.objectContaining({
        failure: expect.objectContaining({
          diagnosticCode: 'upstream_stream_buffer_too_large',
        }),
        type: 'failed',
      }),
    ])
  })

  it('applies retained memory to output and buffered stream data in aggregate', async () => {
    const output = 'x'.repeat(40)
    mockFetch.mockResolvedValueOnce(
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: output } }] })}\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )
    const adapterRequest = enableStreaming(request())
    adapterRequest.limits = {
      ...adapterRequest.limits,
      maxRetainedMemoryBytes: 120,
    }

    const events = await collectEvents(adapter().run(adapterRequest))

    expect(events).toEqual([
      expect.objectContaining({
        failure: expect.objectContaining({
          diagnosticCode: 'upstream_stream_output_too_large',
        }),
        type: 'failed',
      }),
    ])
  })

  it('actively cancels provider streaming when the adapter consumer stops', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"reasoning":"partial"}}]}\n\n',
          ),
        )
      },
    })
    mockFetch.mockResolvedValueOnce(
      new Response(body, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    const adapterRequest = enableStreaming(request())
    const events = adapter().run(adapterRequest)[Symbol.asyncIterator]()

    await expect(events.next()).resolves.toEqual({
      done: false,
      value: { delta: 'partial', type: 'analysis_delta' },
    })
    await events.return?.()

    expect(cancel).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0][1]?.signal).toMatchObject({ aborted: true })
  })

  it('normalizes an active adapter deadline and aborts transport', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'))
    mockFetch.mockImplementationOnce(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    const adapterRequest = request()
    adapterRequest.context = {
      ...adapterRequest.context,
      deadlineAt: '2026-08-19T12:00:01.000Z',
    }
    const eventsPromise = collectEvents(adapter().run(adapterRequest))

    await vi.advanceTimersByTimeAsync(1_000)

    await expect(eventsPromise).resolves.toEqual([
      {
        failure: {
          category: 'deadline_exceeded',
          diagnosticCode: 'upstream_deadline_exceeded',
          retryable: true,
        },
        identity: {
          aiConnectionId: 'connection-17',
          aiConnectionModelRevisionId: 'model-revision-23',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile-31',
        },
        type: 'failed',
      },
    ])
  })
})
