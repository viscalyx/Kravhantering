import { expect, type Page, test } from '@playwright/test'
import {
  type AuthMeResponse,
  type AuthorizationFixture,
  aiGenerationBody,
  createAuthorizationFixture,
  expectOk,
  expectStatus,
  HSA,
  newAnonymousContext,
  newRoleContext,
  type RequirementDetailResponse,
  type RequirementListResponse,
  ROLE_STORAGE_STATE,
  referenceManualCases,
  type SpecificationListResponse,
} from './authorization-test-helpers'

let fixture: AuthorizationFixture

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  fixture = await createAuthorizationFixture(testInfo)
})

test.describe('AUTHZ-00/AUTH-11: authorization fixture seed', () => {
  test.use({
    storageState: ROLE_STORAGE_STATE.admin,
    viewport: { height: 720, width: 1280 },
  })

  test('AUTHZ-00/AUTH-11: seeded AUTHZ objects and identities are visible', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-00', 'AUTH-11')

    await page.goto('/sv/admin')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Administrationscenter' }),
    ).toBeVisible()

    await page.goto(`/sv/specifications/${fixture.specificationSlug}`)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: fixture.specificationName,
      }),
    ).toBeVisible()

    await page.goto('/sv/requirement-areas')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravområden' }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(fixture.areaPrefix) }),
    ).toBeVisible()

    await page.goto('/sv/requirements/stewardship?tab=packages')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravpaket' }),
    ).toBeVisible()
    await page
      .getByRole('textbox', { name: 'Filtrera på namn eller beskrivning' })
      .fill(fixture.packageName)
    await expect(
      page.getByRole('row', { name: new RegExp(fixture.packageName) }),
    ).toBeVisible()
  })
})

test('AUTH-03/AUTH-11: anonymous API requests return JSON 401 where authentication is required', async ({
  browserName: _browserName,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTH-03', 'AUTH-11')
  const anonymous = await newAnonymousContext(testInfo)

  try {
    const response = await anonymous.get('/api/requirements-specifications')

    await expectStatus(response, 401, 'anonymous specifications list')
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    })
  } finally {
    await anonymous.dispose()
  }
})

test('AUTHZ-01/AUTH-08/AUTH-10/AUTH-11: authenticated users without roles or assignments are read-limited', async ({
  browserName: _browserName,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-01', 'AUTH-08', 'AUTH-10', 'AUTH-11')
  const noRoles = await newRoleContext(testInfo, 'noRoles')

  try {
    const meResponse = await noRoles.get('/api/auth/me')
    await expectOk(meResponse, 'no-role auth projection')
    const me = (await meResponse.json()) as AuthMeResponse

    expect(me).toMatchObject({
      authenticated: true,
      hsaId: HSA.noRoles,
      roles: [],
    })

    const requirementsResponse = await noRoles.get(
      '/api/requirements?limit=5&locale=sv&statuses=3',
    )
    await expectOk(requirementsResponse, 'published requirements list')
    const requirements =
      (await requirementsResponse.json()) as RequirementListResponse
    const publishedRequirement = requirements.requirements[0]
    expect(publishedRequirement).toBeDefined()

    const detailResponse = await noRoles.get(
      `/api/requirements/${publishedRequirement.id}`,
    )
    await expectOk(detailResponse, 'published requirement detail')
    const detail = (await detailResponse.json()) as RequirementDetailResponse
    expect(detail.permissions).toMatchObject({
      allowedTransitionStatusIds: [],
      canArchive: false,
      canDeleteDraft: false,
      canEdit: false,
      canReactivate: false,
      canRestore: false,
    })

    const specificationsResponse = await noRoles.get(
      '/api/requirements-specifications',
    )
    await expectOk(specificationsResponse, 'no-role specifications list')
    const specifications =
      (await specificationsResponse.json()) as SpecificationListResponse

    expect(specifications.collectionPermissions.canCreateSpecification).toBe(
      true,
    )
    expect(specifications.specifications).toEqual([])

    await expectStatus(
      await noRoles.get(
        `/api/requirements-specifications/${fixture.specificationSlug}`,
      ),
      403,
      'no-role direct existing specification read',
    )
    await expectStatus(
      await noRoles.get(
        `/api/requirements-specifications/${fixture.specificationSlug}-MISSING`,
      ),
      404,
      'no-role missing specification read',
    )
    await expectStatus(
      await noRoles.get('/api/admin/audit-events'),
      403,
      'no-role action log read',
    )
    await expectStatus(
      await noRoles.post('/api/ai/generate-requirement-import', {
        data: aiGenerationBody({
          areaId: fixture.areaId,
          mode: 'library',
        }),
      }),
      403,
      'no-role AI generation with unauthorized area scope',
    )
    await expectStatus(
      await noRoles.post('/api/ai/generate-requirement-import', {
        data: aiGenerationBody({
          mode: 'specification-local',
          specificationId: fixture.specificationId,
        }),
      }),
      403,
      'no-role AI generation with unauthorized specification scope',
    )
  } finally {
    await noRoles.dispose()
  }
})

test('REQ-10/LIFE-11/SPEC-10/SPEC-10d/AUTH-10/AUTH-11: report PDFs enforce published and history boundaries', async ({
  browserName: _browserName,
}, testInfo) => {
  referenceManualCases(
    testInfo,
    'REQ-10',
    'LIFE-11',
    'SPEC-10',
    'SPEC-10d',
    'AUTH-10',
    'AUTH-11',
  )
  const noRoles = await newRoleContext(testInfo, 'noRoles')

  try {
    const requirementsResponse = await noRoles.get(
      '/api/requirements?limit=1&locale=sv&statuses=3',
    )
    await expectOk(requirementsResponse, 'published requirements list')
    const requirements =
      (await requirementsResponse.json()) as RequirementListResponse
    const publishedRequirement = requirements.requirements[0]
    expect(publishedRequirement).toBeDefined()

    const listPdfResponse = await noRoles.get(
      `/sv/requirements/reports/pdf/list?ids=${publishedRequirement.id}`,
    )
    await expectOk(listPdfResponse, 'published requirement list PDF')
    expect(listPdfResponse.headers()['content-type']).toContain(
      'application/pdf',
    )

    const historyUrls = [
      [
        `/sv/requirements/reports/pdf/history/${publishedRequirement.id}`,
        'history PDF without history access',
      ],
      [
        `/sv/requirements/reports/pdf/review/${publishedRequirement.id}`,
        'review PDF without history access',
      ],
      [
        `/sv/requirements/reports/pdf/suggestion-history/${publishedRequirement.id}`,
        'suggestion history PDF without history access',
      ],
      [
        `/sv/requirements/reports/pdf/review-combined?ids=${publishedRequirement.id}`,
        'combined review PDF without history access',
      ],
    ] as const

    for (const [url, label] of historyUrls) {
      await expectStatus(await noRoles.get(url), 403, label)
    }

    await expectStatus(
      await noRoles.get(
        `/sv/specifications/${fixture.specificationSlug}/reports/pdf/procurement`,
      ),
      403,
      'unassigned specification profile PDF',
    )
  } finally {
    await noRoles.dispose()
  }
})

async function assertForbiddenSpecificationSurface(page: Page): Promise<void> {
  await page.goto(`/sv/specifications/${fixture.specificationSlug}`)

  await expect(
    page.getByRole('heading', {
      name: 'Du har inte åtkomst till detta kravunderlag',
    }),
  ).toBeVisible()
  await expect(page.getByText(fixture.specificationName)).toBeVisible()
  await expect(page.getByText('Petra specresp')).toBeVisible()
  await expect(page.getByText('petra.specresp@example.test')).toBeVisible()
  await expect(page.getByText('Nytt unikt krav')).toHaveCount(0)
}

async function assertReadOnlyRequirementDetail(page: Page): Promise<void> {
  const requirementsResponse = await page.request.get(
    '/api/requirements?limit=1&locale=sv&statuses=3',
  )
  await expectOk(requirementsResponse, 'published requirement list for UI')
  const requirements =
    (await requirementsResponse.json()) as RequirementListResponse
  const publishedRequirement = requirements.requirements[0]
  expect(publishedRequirement).toBeDefined()

  await page.goto(`/sv/requirements/${publishedRequirement.uniqueId}`)

  await expect(
    page.getByText(
      'Du kan läsa kravet, men du kan inte ändra dess livscykel eller innehåll.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Redigera krav' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { exact: true, name: 'Arkivera' }),
  ).toHaveCount(0)
  await expect(
    page.locator(
      '[data-developer-mode-name="detail action"][data-developer-mode-value="edit"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value="archive"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value="approve archiving"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value="cancel archiving"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value="delete draft"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value="restore version"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value^="move to "]',
    ),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Dela' })).toBeVisible()
}

test.describe('AUTH-10/AUTH-11: forbidden requirement specification surface', () => {
  test.use({
    storageState: ROLE_STORAGE_STATE.noRoles,
    viewport: { height: 720, width: 1280 },
  })

  test('AUTH-10/AUTH-11: shows responsible contact without content on desktop', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTH-10', 'AUTH-11')

    await page.goto('/sv/specifications')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravunderlag' }),
    ).toBeVisible()
    await expect(page.getByText(fixture.specificationName)).toHaveCount(0)

    await assertForbiddenSpecificationSurface(page)
  })

  test('AUTH-10/AUTH-11: shows published requirement detail as read-only without lifecycle controls', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTH-10', 'AUTH-11')

    await assertReadOnlyRequirementDetail(page)
  })
})
