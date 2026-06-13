import { expect, test } from '@playwright/test'
import {
  type AuthorizationFixture,
  createAuthorizationFixture,
  type DataSubjectExportResponse,
  expectOk,
  expectStatus,
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

test.fixme('AUTH-10/AUTH-11: requirement area co-authors can create requirements in assigned areas (blocked by #321)', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTH-10', 'AUTH-11')
  const requirementText = `Area co-author requirement ${Date.now()}`

  await page.goto('/sv/requirements/new')
  await page.selectOption('#areaId', String(fixture.areaId))
  await page.fill('#description', requirementText)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
  await expect(
    page.locator('[data-expanded-detail-cell="true"]').first(),
  ).toContainText(requirementText)
})

test('AUTH-10/AUTH-11: requirement area co-authors cannot delegate area access', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTH-10', 'AUTH-11')
  const areaCoauthor = await newRoleContext(testInfo, 'areaCoauthor')

  try {
    await page.goto('/sv/requirement-areas')
    const row = page.getByRole('row', { name: new RegExp(fixture.areaPrefix) })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Redigera' }).click()
    const form = page.locator('form').filter({ hasText: 'Kravområdesägare' })
    await expect(form).toBeVisible()
    await form
      .getByRole('textbox', { name: 'Beskrivning' })
      .fill('Area co-author must not manage area metadata.')
    await form.getByRole('button', { name: 'Spara' }).click()
    await expect(form.getByRole('alert')).toContainText('Forbidden')

    const exportResponse = await areaCoauthor.post(
      '/api/privacy/data-subject-export',
      {
        data: { delivery: 'json', locale: 'sv' },
      },
    )
    await expectOk(exportResponse, 'area co-author self privacy export')
    const exportPayload =
      (await exportResponse.json()) as DataSubjectExportResponse

    expect(exportPayload.subject.hsaId).toBe(HSA.areaCoauthor)
    expect(exportPayload.sources.map(source => source.key)).toContain(
      'requirement_area_co_authors.hsa_id',
    )

    await expectStatus(
      await areaCoauthor.get('/api/ai/models'),
      403,
      'area co-author AI models without required scope',
    )
    await expectStatus(
      await areaCoauthor.put(`/api/requirement-areas/${fixture.areaId}`, {
        data: {
          description: 'Area co-author must not manage area metadata.',
        },
      }),
      403,
      'area co-author area metadata update',
    )
    await expectStatus(
      await areaCoauthor.put(
        `/api/requirement-areas/${fixture.areaId}/co-authors`,
        {
          data: { coAuthorHsaIds: [HSA.areaCoauthor] },
        },
      ),
      403,
      'area co-author co-author update',
    )
  } finally {
    await areaCoauthor.dispose()
  }
})
