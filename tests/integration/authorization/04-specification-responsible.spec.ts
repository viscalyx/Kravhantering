import { expect, test } from '@playwright/test'
import {
  type AuthorizationFixture,
  createAuthorizationFixture,
  expectOk,
  expectStatus,
  newRoleContext,
  ROLE_STORAGE_STATE,
  referenceManualCases,
  type SpecificationResponse,
} from './authorization-test-helpers'

let fixture: AuthorizationFixture

test.describe.configure({ mode: 'serial' })
test.use({
  storageState: ROLE_STORAGE_STATE.specificationResponsible,
  viewport: { height: 720, width: 1280 },
})

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  fixture = await createAuthorizationFixture(testInfo)
})

test('AUTH-10/AUTH-11: specification responsible users can manage assignments', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTH-10', 'AUTH-11')
  const specificationResponsible = await newRoleContext(
    testInfo,
    'specificationResponsible',
  )
  const updatedPurpose = `Updated by responsible ${Date.now()}`

  try {
    await page.goto(`/sv/specifications/${fixture.specificationSlug}`)
    await expect(
      page.getByRole('heading', { level: 1, name: fixture.specificationName }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Redigera kravunderlag' }).click()
    const dialog = page.getByRole('dialog', {
      name: 'Redigera kravunderlag',
    })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('heading', { name: 'Kravunderlagsmedförfattare' }),
    ).toBeVisible()
    await expect(dialog.getByText('Signe SpecCoAuthor')).toBeVisible()
    await dialog
      .getByRole('textbox', { name: 'Underlagssyfte' })
      .fill(updatedPurpose)
    await dialog.getByRole('button', { name: 'Spara' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(updatedPurpose)).toBeVisible()

    await page.reload()
    await expect(page.getByText(updatedPurpose)).toBeVisible()

    const readResponse = await specificationResponsible.get(
      `/api/requirements-specifications/${fixture.specificationSlug}`,
    )
    await expectOk(readResponse, 'specification responsible read')
    const specification = (await readResponse.json()) as SpecificationResponse

    expect(specification.permissions).toMatchObject({
      canEditContent: true,
      canManageAssignments: true,
      canUseAi: true,
    })

    await expectOk(
      await specificationResponsible.put(
        `/api/requirements-specifications/${fixture.specificationSlug}`,
        {
          data: {
            businessNeedsReference: updatedPurpose,
          },
        },
      ),
      'specification responsible metadata update',
    )

    const coAuthorsResponse = await specificationResponsible.get(
      `/api/requirements-specifications/${fixture.specificationSlug}/co-authors`,
    )
    await expectOk(
      coAuthorsResponse,
      'specification responsible co-author read',
    )
    await expectStatus(
      await specificationResponsible.get('/api/admin/audit-events'),
      403,
      'specification responsible action log read',
    )
  } finally {
    await specificationResponsible.dispose()
  }
})
