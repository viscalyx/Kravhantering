import { expect, test } from '@playwright/test'
import {
  type AuthorizationFixture,
  createAuthorizationFixture,
  expectOk,
  expectStatus,
  HSA,
  newRoleContext,
  ROLE_STORAGE_STATE,
  type RequirementPackageResponse,
  referenceManualCases,
} from './authorization-test-helpers'

let fixture: AuthorizationFixture

test.describe.configure({ mode: 'serial' })
test.use({
  storageState: ROLE_STORAGE_STATE.packageLead,
  viewport: { height: 720, width: 1280 },
})

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  fixture = await createAuthorizationFixture(testInfo)
})

test('AUTH-10/AUTH-11: requirement package leads can update packages but not archive them', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTH-10', 'AUTH-11')
  const packageLead = await newRoleContext(testInfo, 'packageLead')
  const updatedDescription = `Updated by package lead ${Date.now()}`

  try {
    await page.goto('/sv/requirements/stewardship?tab=packages')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravpaket' }),
    ).toBeVisible()
    const filter = page.getByRole('textbox', {
      name: 'Filtrera på namn eller beskrivning',
    })
    await filter.fill(fixture.packageName)
    const row = page.getByRole('row', { name: new RegExp(fixture.packageName) })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Redigera' }).click()

    const dialog = page.getByRole('dialog', { name: 'Redigera kravpaket' })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('textbox', {
        name: 'Kravpaketsansvarigs HSA-id',
      }),
    ).toHaveValue(HSA.packageLead)
    await dialog
      .getByRole('textbox', { name: 'Beskrivning' })
      .fill(updatedDescription)
    await dialog.getByRole('button', { name: 'Spara' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(updatedDescription)).toBeVisible()

    await page.reload()
    await expect(page.getByText(updatedDescription)).toBeVisible()

    const updateResponse = await packageLead.put(
      `/api/requirement-packages/${fixture.packageId}`,
      {
        data: {
          coAuthorHsaIds: [HSA.packageCoauthor],
          description: updatedDescription,
        },
      },
    )
    await expectOk(updateResponse, 'package lead update')
    const requirementPackage =
      (await updateResponse.json()) as RequirementPackageResponse

    expect(requirementPackage).toMatchObject({
      id: fixture.packageId,
      leadHsaId: HSA.packageLead,
    })

    await expectStatus(
      await packageLead.post(
        `/api/requirement-packages/${fixture.packageId}/archive`,
      ),
      403,
      'package lead archive',
    )
  } finally {
    await packageLead.dispose()
  }
})
