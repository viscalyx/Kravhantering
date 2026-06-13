import { expect, request as playwrightRequest, test } from '@playwright/test'
import { RELEASE_SMOKE_ADMIN } from './global-setup'

interface AuthMeResponse {
  authenticated?: boolean
  hsaId?: string
  name?: string
  roles?: string[]
}

interface RequirementListResponse {
  requirements?: Array<{
    id: number
    uniqueId: string
    version?: {
      description?: string | null
    } | null
  }>
}

interface RequirementAreasResponse {
  areas?: Array<{
    id: number
    name: string
    prefix: string
  }>
}

interface CreatedRequirementResponse {
  requirement: {
    id: number
    uniqueId: string
  }
  version: {
    description: string
  }
}

interface RequirementDetailResponse {
  id: number
  uniqueId: string
  versions?: Array<{
    description?: string | null
  }>
}

interface BuildMetadataResponse {
  builtAt?: unknown
  commitSha?: unknown
  imageTag?: unknown
  version?: unknown
}

interface HsaVerificationResponse {
  person?: {
    displayName?: string
    email?: string | null
    givenName?: string
    hsaId?: string
    middleName?: string | null
    surname?: string | null
  }
}

function expectNonEmptyString(
  value: unknown,
  fieldName: string,
): asserts value is string {
  expect(typeof value, `${fieldName} should be a string`).toBe('string')
  expect(
    (value as string).trim().length,
    `${fieldName} should not be empty`,
  ).toBeGreaterThan(0)
}

function releaseSmokeRunId() {
  return (
    process.env.RELEASE_SMOKE_RUN_ID ??
    process.env.GITHUB_RUN_ID ??
    `local-${Date.now().toString(36)}`
  )
}

function releaseSmokeBaseUrl(configuredBaseUrl: unknown) {
  return (
    process.env.PLAYWRIGHT_BASE_URL ??
    (typeof configuredBaseUrl === 'string'
      ? configuredBaseUrl
      : 'https://kravhantering.test')
  )
}

function originHeader(baseUrl: string) {
  return new URL(baseUrl).origin
}

const RELEASE_SMOKE_AREA_PREFIX = 'AUTHZ'

test.describe('Release smoke container flow', () => {
  test('proves HTTPS, auth, SQL Server reads and writes, assets, and build metadata', async ({
    page,
    request,
  }) => {
    const staticResourceUrls: string[] = []
    page.on('response', response => {
      if (
        response.status() === 200 &&
        response.url().includes('/_next/static/')
      ) {
        staticResourceUrls.push(response.url())
      }
    })

    await test.step('verify the release smoke user session', async () => {
      const meResponse = await request.get('/api/auth/me')
      expect(meResponse.ok()).toBe(true)
      const me = (await meResponse.json()) as AuthMeResponse

      expect(me.authenticated).toBe(true)
      expect(me.hsaId).toBe('SE5560000001-smoke1')
      expect(me.name).toBe('Release SmokeUser')
      expect(me.roles).toEqual([])
    })

    await test.step('open the requirements library and capture page evidence', async () => {
      const requirementsResponsePromise = page.waitForResponse(
        response =>
          new URL(response.url()).pathname === '/api/requirements' &&
          response.status() === 200,
      )

      await page.goto('/sv/requirements')
      const requirementsResponse = await requirementsResponsePromise
      const requirementsPayload =
        (await requirementsResponse.json()) as RequirementListResponse
      const firstRequirement = requirementsPayload.requirements?.find(
        requirement => requirement.uniqueId && requirement.version?.description,
      )

      expect(firstRequirement).toBeDefined()
      await expect(page.locator('body')).toContainText(
        firstRequirement?.uniqueId ?? '',
      )

      await expect
        .poll(() => staticResourceUrls.length, {
          message: 'expected static Next.js assets to load from the image',
        })
        .toBeGreaterThan(0)

      await test.info().attach('requirements-library.png', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    })

    await test.step('validate and attach build metadata', async () => {
      const buildResponse = await request.get('/build.json')
      expect(buildResponse.ok()).toBe(true)
      const metadata = (await buildResponse.json()) as BuildMetadataResponse

      expectNonEmptyString(metadata.version, 'version')
      expectNonEmptyString(metadata.commitSha, 'commitSha')
      expectNonEmptyString(metadata.builtAt, 'builtAt')
      expectNonEmptyString(metadata.imageTag, 'imageTag')
      expect(Number.isNaN(Date.parse(metadata.builtAt))).toBe(false)

      await test.info().attach('build-metadata.json', {
        body: JSON.stringify(metadata, null, 2),
        contentType: 'application/json',
      })
    })

    await test.step('create and read back a smoke requirement through the API', async () => {
      const areasResponse = await request.get('/api/requirement-areas')
      expect(areasResponse.ok()).toBe(true)
      const areasPayload =
        (await areasResponse.json()) as RequirementAreasResponse
      const area = areasPayload.areas?.find(
        candidate => candidate.prefix === RELEASE_SMOKE_AREA_PREFIX,
      )
      expect(area).toBeDefined()
      if (!area) {
        throw new Error(
          `No ${RELEASE_SMOKE_AREA_PREFIX} requirement area returned for smoke test`,
        )
      }

      const description = `release-smoke-${releaseSmokeRunId()}-${Date.now().toString(36)}`
      const createResponse = await request.post('/api/requirements', {
        data: {
          areaId: area.id,
          description,
          requiresTesting: false,
        },
      })
      expect(createResponse.status()).toBe(201)

      const created =
        (await createResponse.json()) as CreatedRequirementResponse
      expect(created.requirement.id).toBeGreaterThan(0)
      expect(created.requirement.uniqueId).toBeTruthy()
      expect(created.version.description).toBe(description)

      const readBackResponse = await request.get(
        `/api/requirements/${created.requirement.id}`,
      )
      expect(readBackResponse.ok()).toBe(true)
      const readBack =
        (await readBackResponse.json()) as RequirementDetailResponse
      expect(readBack.id).toBe(created.requirement.id)
      expect(readBack.uniqueId).toBe(created.requirement.uniqueId)
      expect(readBack.versions?.[0]?.description).toBe(description)
    })
  })

  test('verifies HSA person lookup through Kong and the HSA mock', async ({
    baseURL: configuredBaseUrl,
  }) => {
    const baseURL = releaseSmokeBaseUrl(configuredBaseUrl)
    const adminRequest = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        Origin: originHeader(baseURL),
        'X-Requested-With': 'XMLHttpRequest',
      },
      storageState: RELEASE_SMOKE_ADMIN.filePath,
    })

    try {
      const verifyResponse = await adminRequest.post(
        '/api/requirement-responsibility-people/verify',
        {
          data: {
            hsaId: 'SE5560000001-manualarea1',
            mode: 'refresh',
            purpose: 'requirement_area_owner',
          },
        },
      )
      expect(verifyResponse.ok()).toBe(true)
      const payload = (await verifyResponse.json()) as HsaVerificationResponse

      expect(payload.person).toMatchObject({
        displayName: 'Maja ManualArea',
        email: 'maja.manualarea@example.test',
        givenName: 'Maja',
        hsaId: 'SE5560000001-manualarea1',
        middleName: null,
        surname: 'ManualArea',
      })
    } finally {
      await adminRequest.dispose()
    }
  })
})
