import { expect, test } from '@playwright/test'
import {
  type AuthorizationFixture,
  createAuthorizationFixture,
  expectOk,
  expectStatus,
  HSA,
  newRoleContext,
  ROLE_STORAGE_STATE,
  referenceManualCases,
  type SpecificationResponse,
} from './authorization-test-helpers'

let fixture: AuthorizationFixture

test.describe.configure({ mode: 'serial' })
test.use({
  storageState: ROLE_STORAGE_STATE.specificationCoauthor,
  viewport: { height: 720, width: 1280 },
})

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  fixture = await createAuthorizationFixture(testInfo)
})

test('AUTH-10/AUTH-11: specification co-authors can edit content but not delegate access', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTH-10', 'AUTH-11')
  const specificationCoauthor = await newRoleContext(
    testInfo,
    'specificationCoauthor',
  )
  const updatedPurpose = `Updated by co-author ${Date.now()}`

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
      dialog.getByRole('button', { name: 'Byt kravunderlagsansvarig' }),
    ).toBeDisabled()
    await expect(
      dialog.getByRole('heading', { name: 'Kravunderlagsmedförfattare' }),
    ).toHaveCount(0)
    await dialog
      .getByRole('textbox', { name: 'Underlagssyfte' })
      .fill(updatedPurpose)
    await dialog.getByRole('button', { name: 'Spara' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(updatedPurpose)).toBeVisible()

    await page.reload()
    await expect(page.getByText(updatedPurpose)).toBeVisible()

    const readResponse = await specificationCoauthor.get(
      `/api/requirements-specifications/${fixture.specificationSlug}`,
    )
    await expectOk(readResponse, 'specification co-author read')
    const specification = (await readResponse.json()) as SpecificationResponse

    expect(specification.permissions).toMatchObject({
      canEditContent: true,
      canManageAssignments: false,
      canUseAi: true,
    })

    await expectOk(
      await specificationCoauthor.put(
        `/api/requirements-specifications/${fixture.specificationSlug}`,
        {
          data: {
            businessNeedsReference: updatedPurpose,
          },
        },
      ),
      'specification co-author content update',
    )
    await expectStatus(
      await specificationCoauthor.put(
        `/api/requirements-specifications/${fixture.specificationSlug}/co-authors`,
        {
          data: { coAuthorHsaIds: [HSA.areaCoauthor] },
        },
      ),
      403,
      'specification co-author co-author update',
    )
    await expectStatus(
      await specificationCoauthor.put(
        `/api/requirements-specifications/${fixture.specificationSlug}/responsible`,
        {
          data: { responsibleHsaId: HSA.specificationResponsible },
        },
      ),
      403,
      'specification co-author responsible update',
    )
  } finally {
    await specificationCoauthor.dispose()
  }
})
