import { expect, test } from '@playwright/test'
import { expectApiResponseOkWithRetry } from '../api-retry-helpers'
import {
  type AuthorizationFixture,
  createAuthorizationFixture,
  type DataSubjectExportResponse,
  expectStatus,
  expectStatusCode,
  HSA,
  newRoleContext,
  ROLE_STORAGE_STATE,
  referenceManualCases,
} from './authorization-test-helpers'

let fixture: AuthorizationFixture

test.describe.configure({ mode: 'serial' })
test.use({
  storageState: ROLE_STORAGE_STATE.areaCoauthor,
  viewport: { height: 720, width: 1280 },
})

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  fixture = await createAuthorizationFixture(testInfo)
})

test('AUTHZ-03/AUTH-10/AUTH-11: requirement area co-authors can create requirements in assigned areas', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-03', 'AUTH-10', 'AUTH-11')
  const areaCoauthor = await newRoleContext(testInfo, 'areaCoauthor')
  const timestamp = Date.now()
  const apiRequirementText = `Area co-author API requirement ${timestamp}`
  const uiRequirementText = `Area co-author UI requirement ${timestamp}`

  try {
    const apiResponse = await areaCoauthor.post('/api/requirements', {
      data: {
        areaId: fixture.areaId,
        description: apiRequirementText,
        verifiable: false,
      },
    })
    await expectStatus(apiResponse, 201, 'area co-author requirement create')

    await page.goto('/sv/requirements/new')
    await page.selectOption('#areaId', String(fixture.areaId))
    await page.fill('#description', uiRequirementText)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/, {
      timeout: 30_000,
    })
    expect(page.url()).not.toContain('undefined')

    const selectedRequirementId = new URL(page.url()).searchParams.get(
      'selected',
    )
    if (!selectedRequirementId) {
      throw new Error(
        'Created requirement redirect did not include selected id',
      )
    }

    await page.goto('about:blank')

    const listParams = new URLSearchParams({
      descriptionSearch: uiRequirementText,
      limit: '5',
      locale: 'sv',
      statuses: '1',
    })
    const listResponse = await expectApiResponseOkWithRetry(
      'area co-author UI requirement list',
      () =>
        areaCoauthor.get(`/api/requirements?${listParams}`, {
          timeout: 30_000,
        }),
    )
    const listPayload = (await listResponse.json()) as {
      requirements?: Array<{
        uniqueId: string
        version?: { description?: string }
      }>
    }

    expect(
      (listPayload.requirements ?? []).some(
        requirement =>
          requirement.uniqueId === selectedRequirementId &&
          requirement.version?.description === uiRequirementText,
      ),
    ).toBe(true)
  } finally {
    await areaCoauthor.dispose()
  }
})

test('AUTHZ-03/AUTH-10/AUTH-11: requirement area co-authors only list RFI questions from assigned areas', async ({
  browserName: _browserName,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-03', 'AUTH-10', 'AUTH-11')
  const admin = await newRoleContext(testInfo, 'admin')
  const areaCoauthor = await newRoleContext(testInfo, 'areaCoauthor')
  const createdQuestionIds: number[] = []

  try {
    const testData =
      await test.step('create assigned and foreign RFI questions', async () => {
        const areasResponse = await expectApiResponseOkWithRetry(
          'find a foreign requirement area for RFI authorization',
          () => admin.get('/api/requirement-areas', { timeout: 30_000 }),
        )
        const areasPayload = (await areasResponse.json()) as {
          areas?: Array<{ id: number }>
        }
        const foreignArea = areasPayload.areas?.find(
          area => area.id !== fixture.areaId,
        )
        if (!foreignArea) {
          throw new Error('No foreign requirement area available for RFI check')
        }

        const timestamp = Date.now()
        const assignedResponse = await areaCoauthor.post('/api/rfi-questions', {
          data: {
            areaId: fixture.areaId,
            questionText: `Assigned RFI authorization question ${timestamp}`,
          },
        })
        await expectStatus(
          assignedResponse,
          201,
          'area co-author assigned RFI question create',
        )
        const assignedQuestion = (await assignedResponse.json()) as {
          id: number
        }
        createdQuestionIds.push(assignedQuestion.id)

        const foreignResponse = await admin.post('/api/rfi-questions', {
          data: {
            areaId: foreignArea.id,
            questionText: `Foreign RFI authorization question ${timestamp}`,
          },
        })
        await expectStatus(
          foreignResponse,
          201,
          'admin foreign RFI question create',
        )
        const foreignQuestion = (await foreignResponse.json()) as {
          id: number
        }
        createdQuestionIds.push(foreignQuestion.id)

        return {
          assignedQuestionId: assignedQuestion.id,
          foreignAreaId: foreignArea.id,
          foreignQuestionId: foreignQuestion.id,
        }
      })

    await test.step('verify the unfiltered RFI question collection', async () => {
      const listResponse = await expectApiResponseOkWithRetry(
        'area co-author authorized RFI question list',
        () =>
          areaCoauthor.get('/api/rfi-questions?includeArchived=true', {
            timeout: 30_000,
          }),
      )
      const listPayload = (await listResponse.json()) as {
        questions?: Array<{ id: number }>
      }
      const listedQuestionIds = (listPayload.questions ?? []).map(
        question => question.id,
      )
      expect(listedQuestionIds).toContain(testData.assignedQuestionId)
      expect(listedQuestionIds).not.toContain(testData.foreignQuestionId)
    })

    await test.step('verify explicit-area RFI question collections', async () => {
      const assignedAreaResponse = await areaCoauthor.get(
        `/api/rfi-questions?areaId=${fixture.areaId}`,
      )
      await expectStatus(
        assignedAreaResponse,
        200,
        'area co-author assigned-area RFI question list',
      )
      await expectStatus(
        await areaCoauthor.get(
          `/api/rfi-questions?areaId=${testData.foreignAreaId}`,
        ),
        403,
        'area co-author foreign-area RFI question list',
      )
    })
  } finally {
    for (const questionId of createdQuestionIds) {
      await admin.delete(`/api/rfi-questions/${questionId}`)
    }
    await areaCoauthor.dispose()
    await admin.dispose()
  }
})

test('AUTHZ-03/AUTH-10/AUTH-11: requirement area co-authors cannot delegate area access', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-03', 'AUTH-10', 'AUTH-11')
  const areaCoauthor = await newRoleContext(testInfo, 'areaCoauthor')

  try {
    const areaResponse = await expectApiResponseOkWithRetry(
      'area co-author area read',
      () =>
        areaCoauthor.get(`/api/requirement-areas/${fixture.areaId}`, {
          timeout: 30_000,
        }),
    )
    const areaPayload = (await areaResponse.json()) as {
      area?: {
        permissions?: {
          canAuthor?: boolean
          canManageAssignments?: boolean
        }
      }
    }
    expect(areaPayload.area?.permissions).toMatchObject({
      canAuthor: true,
      canManageAssignments: false,
    })

    await page.goto('/sv/requirement-areas')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravområden' }),
    ).toBeVisible()
    const areaRow = page.getByRole('row', {
      name: new RegExp(fixture.areaPrefix),
    })
    await expect(areaRow).toBeVisible()
    await expect(
      areaRow.getByRole('button', { name: 'Hantera medförfattare' }),
    ).toHaveCount(0)
    await areaRow.getByRole('button', { name: 'Redigera' }).click()
    const editForm = page.locator('form').filter({ hasText: 'Kravområde' })
    await expect(editForm).toBeVisible()
    await expect(
      editForm.getByRole('textbox', { name: 'Kravområdesägare' }),
    ).toHaveValue(HSA.areaOwner)
    await expect(editForm.getByRole('button', { name: 'Hämta' })).toHaveCount(0)
    await editForm.getByRole('button', { name: 'Avbryt' }).click()

    const exportResponse = await expectApiResponseOkWithRetry(
      'area co-author self privacy export',
      () =>
        areaCoauthor.post('/api/privacy/data-subject-export', {
          data: { delivery: 'json', locale: 'sv' },
          timeout: 30_000,
        }),
    )
    const exportPayload =
      (await exportResponse.json()) as DataSubjectExportResponse

    expect(exportPayload.subject.hsaId).toBe(HSA.areaCoauthor)
    expect(exportPayload.sources.map(source => source.key)).toContain(
      'requirement_area_co_authors.hsa_id',
    )

    await expectStatus(
      await areaCoauthor.put(`/api/requirement-areas/${fixture.areaId}`, {
        data: {
          description: 'Area co-author must not manage area metadata.',
        },
        timeout: 30_000,
      }),
      403,
      'area co-author area metadata update',
    )
    await expectStatusCode(
      await areaCoauthor.put(
        `/api/requirement-areas/${fixture.areaId}/co-authors`,
        {
          data: {
            coAuthorHsaIds: [HSA.areaCoauthor],
            verificationEvidence: [],
          },
          timeout: 30_000,
        },
      ),
      403,
      'forbidden',
      'area co-author co-author update',
    )
  } finally {
    await areaCoauthor.dispose()
  }
})
