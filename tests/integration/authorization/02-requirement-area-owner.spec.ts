import { expect, test } from '@playwright/test'
import {
  type AuthorizationFixture,
  createAuthorizationFixture,
  expectOk,
  expectStatus,
  HSA,
  newRoleContext,
  ROLE_STORAGE_STATE,
  type RequirementAreaResponse,
  referenceManualCases,
} from './authorization-test-helpers'

let fixture: AuthorizationFixture

test.describe.configure({ mode: 'serial' })
test.use({
  storageState: ROLE_STORAGE_STATE.areaOwner,
  viewport: { height: 720, width: 1280 },
})

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  fixture = await createAuthorizationFixture(testInfo)
})

test('AUTH-10/AUTH-11: requirement area owners can manage their area and co-authors', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTH-10', 'AUTH-11')
  const areaOwner = await newRoleContext(testInfo, 'areaOwner')
  const updatedDescription = `Updated by area owner ${Date.now()}`

  try {
    await page.goto('/sv/requirement-areas')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravområden' }),
    ).toBeVisible()

    const row = page.getByRole('row', { name: new RegExp(fixture.areaPrefix) })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Redigera' }).click()

    const form = page.locator('form').filter({ hasText: 'Kravområdesägare' })
    await expect(form).toBeVisible()
    await expect(
      form.getByRole('textbox', { name: 'Kravområdesägare' }),
    ).toHaveValue(HSA.areaOwner)
    await expect(form.getByText('Cora CoAuthor')).toBeVisible()
    await form.getByRole('textbox', { name: 'Beskrivning' }).fill(
      updatedDescription,
    )
    await form.getByRole('button', { name: 'Spara' }).click()
    await expect(form).toBeHidden()
    await expect(page.getByText(updatedDescription)).toBeVisible()

    await page.reload()
    await expect(page.getByText(updatedDescription)).toBeVisible()

    const updateResponse = await areaOwner.put(
      `/api/requirement-areas/${fixture.areaId}`,
      {
        data: {
          description: updatedDescription,
        },
      },
    )
    await expectOk(updateResponse, 'area-owner requirement area update')
    const updatedArea = (await updateResponse.json()) as RequirementAreaResponse

    expect(updatedArea).toMatchObject({
      id: fixture.areaId,
      ownerHsaId: HSA.areaOwner,
    })

    const coAuthorsResponse = await areaOwner.get(
      `/api/requirement-areas/${fixture.areaId}/co-authors`,
    )
    await expectOk(coAuthorsResponse, 'area-owner co-author list')
    await expectStatus(
      await areaOwner.get('/api/admin/audit-events'),
      403,
      'area-owner action log read',
    )
  } finally {
    await areaOwner.dispose()
  }
})
