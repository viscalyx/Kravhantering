import { VERIFICATION } from '@/lib/__tests__/fixtures/ai-model-verification'
import {
  aiModelVerificationSnapshotSchema,
  parseAiModelVerificationPayload,
} from '@/lib/ai/model-verification-payload'

describe('Completed verification candidate snapshots', () => {
  const candidate = {
    externalModelId: 'controlled/model',
    externalModelVersion: null,
    reasoning: { mode: 'model_default', effort: null },
  }
  it('allows verification before a final presentation name is supplied', () => {
    expect(aiModelVerificationSnapshotSchema.parse(candidate)).toMatchObject({
      name: '',
      description: null,
      modelId: null,
      modelToken: null,
    })
  })
  it('rejects incomplete target references and fields outside the administrative snapshot', () => {
    expect(
      aiModelVerificationSnapshotSchema.safeParse({
        ...candidate,
        modelId: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false)
    for (const field of [
      'prompt',
      'image',
      'endpointUrl',
      'secret',
      'response',
    ]) {
      expect(
        aiModelVerificationSnapshotSchema.safeParse({
          ...candidate,
          [field]: 'sensitive',
        }).success,
      ).toBe(false)
    }
  })
  it('persists only bounded administrative fields and structured saveable evidence', () => {
    const payload = { candidate, verification: VERIFICATION }
    expect(parseAiModelVerificationPayload(payload).verification).toEqual(
      VERIFICATION,
    )
    for (const verification of [
      { ...VERIFICATION, saveable: false },
      { ...VERIFICATION, rawResponse: 'secret' },
      {
        ...VERIFICATION,
        connection: {
          ...VERIFICATION.connection,
          diagnosticCode: 'free error text with secret',
        },
      },
      { ...VERIFICATION, canonicalExternalModelVersion: 'x'.repeat(201) },
    ])
      expect(() =>
        parseAiModelVerificationPayload({ candidate, verification }),
      ).toThrow('Invalid model verification payload.')
    expect(() =>
      parseAiModelVerificationPayload({
        ...payload,
        candidate: { ...candidate, description: 'x'.repeat(20_001) },
      }),
    ).toThrow('Invalid model verification payload.')
  })
})
