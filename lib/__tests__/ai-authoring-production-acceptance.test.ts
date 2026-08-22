import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { POST } from '@/app/api/ai/generate-requirement-import/route'
import { encryptAiProviderSecret } from '@/lib/ai/provider-secret-crypto'
import { parseAiProviderSecretKeyring } from '@/lib/ai/provider-secret-keyring'
import { DEFAULT_APPLICATION_SETTINGS } from '@/lib/application-settings'
import type { SqlServerDatabase } from '@/lib/db'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'

const acceptanceState = vi.hoisted(() => ({
  buildImportInstruction: vi.fn(async () => '# Persisted import contract'),
  getAiGenerationAvailability: vi.fn(async () => ({
    disabledByEnvironment: false,
    effectiveRequirementGenerationEnabled: true,
  })),
  getApplicationSettings: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  screenAiInput: vi.fn(async () => ({ allowed: true })),
  screenAiInputDetailed: vi.fn(async (_db: unknown, parts: unknown) => ({
    contentParts: parts,
    decision: {
      allowed: true,
      categories: [],
      primaryRuleId: null,
      primaryRuleType: null,
      ruleIds: [],
      ruleTypes: [],
      textLength: 0,
    },
    forensicEvidence: [],
  })),
  screenAiOutput: vi.fn(async () => ({ allowed: true })),
}))

vi.mock('@/lib/db', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  getRequestSqlServerDataSource: acceptanceState.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/dal/ai-settings', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/dal/ai-settings')>()),
  getAiGenerationAvailability: acceptanceState.getAiGenerationAvailability,
}))
vi.mock('@/lib/dal/application-settings', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/dal/application-settings')>()),
  getApplicationSettings: acceptanceState.getApplicationSettings,
}))
vi.mock('@/lib/requirements/server', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/requirements/server')>()),
  createRequirementsRuntime: vi.fn(() => ({
    service: {
      buildImportInstruction: acceptanceState.buildImportInstruction,
    },
  })),
}))
vi.mock('@/lib/ai/safety', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/ai/safety')>()),
  screenAiInput: acceptanceState.screenAiInput,
  screenAiInputDetailed: acceptanceState.screenAiInputDetailed,
  screenAiOutput: acceptanceState.screenAiOutput,
}))

const CONNECTION_ID = '10000000-0000-4000-8000-000000000867'
const MODEL_REVISION_ID = '20000000-0000-4000-8000-000000000867'
const PROFILE_ID = '30000000-0000-4000-8000-000000000867'
const SECRET_VERSION_ID = '40000000-0000-4000-8000-000000000867'
const ROOT_KEY = Buffer.alloc(32, 7).toString('base64')
const KEYRING_DOCUMENT = JSON.stringify({
  activeWriteVersion: 'acceptance-v1',
  formatVersion: 1,
  keys: { 'acceptance-v1': ROOT_KEY },
})
const USAGE = {
  analysisTokens: { status: 'reported', value: 0 },
  cost: { reason: 'not_reported', status: 'unavailable' },
  inputTokens: { status: 'reported', value: 9 },
  outputTokens: { status: 'reported', value: 11 },
  totalTokens: { status: 'reported', value: 20 },
} as const

let temporaryDirectory = ''
let keyringPath = ''

function persistedProfileRow() {
  return {
    adapterType: 'controlled_test',
    adapterVersion: '1',
    agentRuntimeKey: null,
    attestationIsPersonalDataProcessed: false,
    attestationIsTrainingAllowed: false,
    attestationMaximumInformationClass: 'internal',
    attestationMaximumRetentionDays: 0,
    attestationProcessingRegionsJson: '["SE"]',
    attestationSubprocessorsJson: '[]',
    authenticationType: 'static_secret',
    connectionAgentRuntimeVersion: null,
    connectionConfigurationVersion: 1,
    connectionId: CONNECTION_ID,
    connectionLifecycleStatus: 'active',
    connectionMaximumConcurrency: 2,
    connectionPublicName: 'Persisted controlled service',
    dataPolicySummary: 'Swedish test processing; no training',
    egressPolicyKey: 'acceptance-local',
    endpointUrl: 'https://localhost:9443/v1',
    externalModelId: 'controlled/acceptance-v1',
    externalModelVersion: '1',
    inactivityTimeBudgetSeconds: 300,
    maximumBufferedEvents: 32,
    maximumOutputBytes: 4_194_304,
    maximumOutputTokens: 8_192,
    maximumRetainedMemoryBytes: 8_388_608,
    modelRevisionAgentRuntimeVersion: null,
    modelRevisionConnectionConfigurationVersion: 1,
    modelRevisionId: MODEL_REVISION_ID,
    modelRevisionMaximumConcurrency: 2,
    modelRevisionStatus: 'verified',
    operationalStatus: 'enabled',
    profileConfigurationVersion: 1,
    profileId: PROFILE_ID,
    queueCapacity: 2,
    tlsPolicyKey: 'acceptance-pki',
    totalTimeBudgetSeconds: 600,
    verifiedCapabilitiesJson: JSON.stringify({
      aiAnalysis: true,
      cost: false,
      imageInput: false,
      jsonSchemaSteering: true,
      streaming: true,
      tokenUsage: true,
      validatableJson: true,
    }),
  }
}

function controlledScenarioSecret(
  output = JSON.stringify({
    proposedNeedsReferences: [],
    proposedNormReferences: [],
    requirements: [
      {
        acceptanceCriteria: '',
        categoryId: null,
        categoryName: '',
        description: 'Use managed access.',
        needsReferenceId: null,
        needsReferenceKey: '',
        normReferenceIds: [],
        priorityLevelId: null,
        priorityLevelCode: '',
        priorityLevelName: '',
        proposedNormReferenceKeys: [],
        qualityCharacteristicId: null,
        qualityCharacteristicName: '',
        requirementPackageIds: [],
        requirementPackageNames: [],
        typeId: 1,
        typeName: '',
        verifiable: true,
        verificationMethod: '',
      },
    ],
    schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  }),
) {
  const keyring = parseAiProviderSecretKeyring(KEYRING_DOCUMENT)
  const plaintext = JSON.stringify({
    scenario: {
      analysis: 'Screened controlled analysis',
      analysisDeltas: ['quarantined analysis'],
      output,
      outputDeltas: ['quarantined output'],
      type: 'completed',
      usage: USAGE,
    },
  })
  const encrypted = encryptAiProviderSecret(
    keyring,
    { connectionId: CONNECTION_ID, secretVersionId: SECRET_VERSION_ID },
    plaintext,
  )
  return {
    activatedAt: new Date(),
    authenticationTag: encrypted.authenticationTag,
    ciphertext: encrypted.ciphertext,
    ciphertextDeletedAt: null,
    connectionId: CONNECTION_ID,
    createdAt: new Date(),
    formatVersion: encrypted.formatVersion,
    id: SECRET_VERSION_ID,
    nonce: encrypted.nonce,
    providerRevokedAt: null,
    revisionNumber: 1,
    revisionToken: '50000000-0000-4000-8000-000000000867',
    rootKeyVersion: encrypted.rootKeyVersion,
    status: 'active',
    verifiedAt: new Date(),
  }
}

function acceptanceDatabase(output?: string) {
  const secret = controlledScenarioSecret(output)
  const queries: string[] = []
  const queryCalls: Array<{ parameters: readonly unknown[]; sql: string }> = []
  const query = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    queries.push(sql)
    queryCalls.push({ parameters, sql })
    if (
      sql.includes('FROM [ai_run_profiles] AS [profile]') &&
      sql.includes('[profile].[profile_key] = @0')
    ) {
      return [persistedProfileRow()]
    }
    if (sql.includes('FROM [ai_provider_secret_versions]')) return [secret]
    if (
      sql.includes('SELECT TOP (@0)') &&
      sql.includes('FROM [ai_connection_model_operational_states]')
    ) {
      return []
    }
    if (sql.includes('DECLARE @running int')) {
      return [{ admissionStatus: 'queued' }]
    }
    if (sql.includes('DECLARE @connection_id uniqueidentifier')) {
      return [{ acquisitionStatus: 'acquired' }]
    }
    if (sql.includes("IF @3 = N'completed'")) {
      return [
        {
          breakerOpened: false,
          breakerStatus: 'closed',
          healthStateChanged: false,
          healthStatus: 'healthy',
        },
      ]
    }
    if (sql.includes('OUTPUT 1 AS [renewed]')) return [{ renewed: true }]
    return []
  })
  const db = {
    query,
    async transaction(...args: unknown[]) {
      const callback = args.at(-1) as (manager: {
        query: typeof query
      }) => Promise<unknown>
      return callback({ query })
    },
  } as unknown as SqlServerDatabase
  return { db, queries, queryCalls }
}

function request(): Request {
  const value = new Request(
    'https://example.test/api/ai/generate-requirement-import',
    {
      body: JSON.stringify({
        areaId: 1,
        count: 1,
        locale: 'en',
        mode: 'library',
        need: 'Managed access',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  )
  attachVerifiedActor(value, {
    displayName: 'Acceptance author',
    hsaId: null,
    id: 'acceptance-author',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'oidc',
  })
  return value
}

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'ai-authoring-acceptance-'))
  keyringPath = join(temporaryDirectory, 'keyring.json')
  await writeFile(keyringPath, KEYRING_DOCUMENT, { mode: 0o600 })
})

afterAll(async () => {
  await rm(temporaryDirectory, { force: true, recursive: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('production AI authoring acceptance boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearInMemoryThrottleForTests()
    acceptanceState.getApplicationSettings.mockResolvedValue(
      DEFAULT_APPLICATION_SETTINGS,
    )
    vi.stubEnv('AI_PROVIDER_SECRET_KEYRING_FILE', keyringPath)
    vi.stubEnv(
      'AI_CONNECTION_EGRESS_POLICIES_JSON',
      JSON.stringify({
        'acceptance-local': {
          allowedOrigins: [],
          privateSidecarAddresses: ['127.0.0.1', '::1'],
          privateSidecarOrigins: ['https://localhost:9443'],
        },
      }),
    )
    vi.stubEnv(
      'AI_CONNECTION_DATA_POLICIES_JSON',
      JSON.stringify({
        generate_without_images: {
          allowedProcessingRegions: ['SE'],
          informationClassOrder: ['public', 'internal'],
          maximumInformationClass: 'internal',
          maximumRetentionDays: 0,
          personalDataAllowed: false,
          requireTrainingProhibited: true,
        },
      }),
    )
    vi.stubEnv(
      'AI_CONNECTION_TLS_POLICIES_JSON',
      JSON.stringify({ 'acceptance-pki': 'public_web_pki' }),
    )
  })

  it('projects one terminal result through persisted profile, trust gates, and coordinator', async () => {
    const { db, queries } = acceptanceDatabase()
    acceptanceState.getRequestSqlServerDataSource.mockResolvedValue(db)

    const response = await POST(request())
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('event: done')
    expect(body).toContain('Use managed access.')
    expect(body).not.toContain('quarantined output')
    expect(body).not.toContain('quarantined analysis')
    expect(acceptanceState.screenAiInput).toHaveBeenCalled()
    expect(acceptanceState.screenAiOutput).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        'quarantined analysis',
        'quarantined output',
        'Screened controlled analysis',
      ]),
    )
    expect(
      queries.some(sql => sql.includes('[profile].[profile_key] = @0')),
    ).toBe(true)
    expect(queries.some(sql => sql.includes('DECLARE @running int'))).toBe(true)
    expect(queries.some(sql => sql.includes("IF @3 = N'completed'"))).toBe(true)
  })

  it('preserves screened invalid output for repair while coordination records failure', async () => {
    const rawOutput = '{"schemaVersion":"wrong"}'
    const { db, queryCalls } = acceptanceDatabase(rawOutput)
    acceptanceState.getRequestSqlServerDataSource.mockResolvedValue(db)

    const response = await POST(request())
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('event: validation_error')
    expect(body).toContain('schemaVersion')
    expect(body).toContain('required')
    expect(body).not.toContain('event: done')
    expect(body).not.toContain('quarantined output')
    expect(body).not.toContain('quarantined analysis')
    expect(acceptanceState.screenAiOutput).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        'quarantined analysis',
        'quarantined output',
        rawOutput,
      ]),
    )
    expect(
      queryCalls.find(call => call.sql.includes("IF @3 = N'completed'"))
        ?.parameters,
    ).toEqual(expect.arrayContaining(['invalid_response', 'failed']))
  })
})
