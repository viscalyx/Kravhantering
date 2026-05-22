import { expect, test } from '@playwright/test'

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
          response.url().includes('/api/requirements?') &&
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
      const area = areasPayload.areas?.[0]
      expect(area).toBeDefined()
      if (!area) throw new Error('No requirement area returned for smoke test')

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
})
