import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = vi.hoisted(() => ({ query: vi.fn() }))
const mockFetchedDb = vi.hoisted(() => ({ query: vi.fn() }))
const mockAuthorization = vi.hoisted(() => ({ assertAuthorized: vi.fn() }))
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}))
const mockUiSettings = vi.hoisted(() => ({
  getColumnDefaults: vi.fn(),
  getTerminology: vi.fn(),
}))
const mockService = vi.hoisted(() => ({ queryCatalog: vi.fn() }))
const mockRequestContext = vi.hoisted(() => ({
  actor: {
    displayName: '',
    hsaId: null,
    id: null,
    isAuthenticated: false,
    roles: [],
    source: 'anonymous' as const,
  },
  correlationId: 'test-correlation',
  requestId: 'test-request',
  source: 'rest' as const,
}))

const mockGetRequestSqlServerDataSource = vi.hoisted(() =>
  vi.fn(async () => mockFetchedDb),
)
const mockCreateDefaultAuthorizationService = vi.hoisted(() =>
  vi.fn(() => mockAuthorization),
)
const mockCreateRequestContext = vi.hoisted(() =>
  vi.fn(async () => mockRequestContext),
)
const mockCreateRequirementsLogger = vi.hoisted(() => vi.fn(() => mockLogger))
const mockCreateUiSettingsLoader = vi.hoisted(() => vi.fn(() => mockUiSettings))
const mockCreateRequirementsService = vi.hoisted(() => vi.fn(() => mockService))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mockGetRequestSqlServerDataSource,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createDefaultAuthorizationService: mockCreateDefaultAuthorizationService,
  createRequestContext: mockCreateRequestContext,
}))

vi.mock('@/lib/requirements/logging', () => ({
  createRequirementsLogger: mockCreateRequirementsLogger,
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  createUiSettingsLoader: mockCreateUiSettingsLoader,
}))

vi.mock('@/lib/requirements/service', () => ({
  createRequirementsService: mockCreateRequirementsService,
}))

import {
  createRequirementsRestRuntime,
  createRequirementsRuntime,
} from '@/lib/requirements/server'

describe('requirements server runtime helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the service with the same dependencies returned by the runtime', () => {
    const runtime = createRequirementsRuntime(mockDb as never)

    expect(runtime).toMatchObject({
      authorization: mockAuthorization,
      db: mockDb,
      logger: mockLogger,
      service: mockService,
      uiSettings: mockUiSettings,
    })
    expect(mockCreateRequirementsService).toHaveBeenCalledWith(mockDb, {
      authorization: mockAuthorization,
      logger: mockLogger,
      uiSettings: mockUiSettings,
    })
  })

  it('creates REST context with source rest', async () => {
    const request = new Request('https://example.test/api/requirements')

    const runtime = await createRequirementsRestRuntime(request)

    expect(mockGetRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(mockCreateRequestContext).toHaveBeenCalledWith(request, 'rest')
    expect(runtime.context).toBe(mockRequestContext)
    expect(runtime.db).toBe(mockFetchedDb)
    expect(runtime.service).toBe(mockService)
  })

  it('uses the supplied db without fetching another handle', async () => {
    const request = new Request('https://example.test/api/requirements')

    const runtime = await createRequirementsRestRuntime(request, {
      db: mockDb as never,
    })

    expect(mockGetRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockCreateRequestContext).toHaveBeenCalledWith(request, 'rest')
    expect(runtime.db).toBe(mockDb)
  })
})
