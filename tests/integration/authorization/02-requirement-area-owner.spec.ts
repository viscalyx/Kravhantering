import { expect, test } from '@playwright/test'
import { escapeRegExp } from '@/tests/helpers/common'
import {
  type AuthorizationFixture,
  createAuthorizationFixture,
  expectOk,
  expectStatus,
  HSA,
  newRoleContext,
  type RequirementAreaResponse,
  ROLE_STORAGE_STATE,
  referenceManualCases,
  seedAuthorizationResponsibilityPeople,
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

test('AUTHZ-02/AUTH-10/AUTH-11/ADMIN-13: requirement area owners can manage their area and co-authors', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-02', 'AUTH-10', 'AUTH-11', 'ADMIN-13')
  const areaOwner = await newRoleContext(testInfo, 'areaOwner')
  const updatedDescription = `Updated by area owner ${Date.now()}`
  const originalCoAuthors = [HSA.areaCoauthor]
  const temporaryCoAuthor = HSA.admin

  try {
    await seedAuthorizationResponsibilityPeople()
    await page.route(
      '**/api/requirement-responsibility-people/verify',
      async route => {
        const payload = route.request().postDataJSON() as Record<
          string,
          unknown
        >
        await route.continue({
          postData: JSON.stringify({ ...payload, mode: 'reuse_local' }),
        })
      },
    )
    const coAuthorLoadGate: { release?: () => void } = {}
    const coAuthorLoadStarted = new Promise<void>(resolve => {
      void page.route(
        `**/api/requirement-areas/${fixture.areaId}/co-authors`,
        async route => {
          if (
            route.request().method() === 'GET' &&
            coAuthorLoadGate.release === undefined
          ) {
            await new Promise<void>(loadResolve => {
              coAuthorLoadGate.release = loadResolve
              resolve()
            })
          }
          await route.continue()
        },
      )
    })
    const areaPrefixPattern = escapeRegExp(fixture.areaPrefix)

    await page.goto('/sv/requirement-areas')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravområden' }),
    ).toBeVisible()

    const row = page.getByRole('row', { name: new RegExp(areaPrefixPattern) })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Redigera' }).click()

    const form = page.locator('form').filter({ hasText: 'Kravområdesägare' })
    await expect(form).toBeVisible()
    await expect(
      form.getByRole('textbox', { name: 'Kravområdesägare' }),
    ).toHaveValue(HSA.areaOwner)
    await form
      .getByRole('textbox', { name: 'Beskrivning' })
      .fill(updatedDescription)
    await form.getByRole('button', { name: 'Spara' }).click()
    await expect(form).toBeHidden()
    await expect(page.getByText(updatedDescription)).toBeVisible()

    await page.reload()
    await expect(page.getByText(updatedDescription)).toBeVisible()

    const updatedRow = page.getByRole('row', {
      name: new RegExp(areaPrefixPattern),
    })
    await updatedRow
      .getByRole('button', { name: 'Hantera medförfattare' })
      .click()
    const coAuthorsDialog = page.getByRole('dialog', {
      name: 'Kravområdesmedförfattare',
    })
    await expect(coAuthorsDialog).toBeVisible()
    await coAuthorLoadStarted
    await expect(coAuthorsDialog.getByRole('status')).toContainText(
      /Hämtar .*medförfattare/u,
    )
    coAuthorLoadGate.release?.()
    await expect(coAuthorsDialog.getByText(HSA.areaCoauthor)).toBeVisible()
    await expect(
      coAuthorsDialog.getByRole('textbox', { name: 'Medförfattares HSA-id' }),
    ).toBeVisible()
    await coAuthorsDialog
      .getByRole('textbox', { name: 'Medförfattares HSA-id' })
      .fill('admin1')
    await coAuthorsDialog.getByRole('button', { name: 'Hämta' }).click()
    await expect(coAuthorsDialog.getByText(temporaryCoAuthor)).toBeVisible()
    await coAuthorsDialog
      .getByRole('row', { name: new RegExp(escapeRegExp(temporaryCoAuthor)) })
      .getByRole('button', { name: 'Ta bort' })
      .click()
    await page
      .getByRole('alertdialog', { name: 'Ta bort' })
      .getByRole('button', { name: 'Ta bort' })
      .click()
    await expect(coAuthorsDialog.getByText(temporaryCoAuthor)).toHaveCount(0)
    await coAuthorsDialog.getByRole('button', { name: 'Stäng' }).last().click()
    await expect(coAuthorsDialog).toBeHidden()

    await updatedRow
      .getByRole('button', { name: 'Hantera medförfattare' })
      .click()
    await expect(coAuthorsDialog).toBeVisible()
    await expect(coAuthorsDialog.getByText(HSA.areaCoauthor)).toBeVisible()
    await expect(coAuthorsDialog.getByText(temporaryCoAuthor)).toHaveCount(0)
    await coAuthorsDialog.getByRole('button', { name: 'Stäng' }).last().click()
    await expect(coAuthorsDialog).toBeHidden()

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
    await areaOwner
      .put(`/api/requirement-areas/${fixture.areaId}/co-authors`, {
        data: { coAuthorHsaIds: originalCoAuthors },
      })
      .catch(() => undefined)
    await areaOwner.dispose()
  }
})
