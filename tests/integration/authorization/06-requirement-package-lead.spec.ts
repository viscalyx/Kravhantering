import { expect, test } from '@playwright/test'
import { escapeRegExp } from '@/tests/helpers/common'
import {
  type AuthorizationFixture,
  createAuthorizationFixture,
  expectOk,
  expectStatus,
  HSA,
  newRoleContext,
  type RequirementPackageResponse,
  ROLE_STORAGE_STATE,
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

test('AUTHZ-06/AUTH-10/AUTH-11: requirement package leads can update packages but not archive them', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-06', 'AUTH-10', 'AUTH-11')
  const packageLead = await newRoleContext(testInfo, 'packageLead')
  const updatedPurposeAndScope = `Updated by package lead ${Date.now()}`
  const originalCoAuthors = [HSA.packageCoauthor]
  const temporaryCoAuthor = HSA.admin

  try {
    const coAuthorLoadGate: { release?: () => void } = {}
    const coAuthorLoadStarted = new Promise<void>(resolve => {
      void page.route(
        `**/api/requirement-packages/${fixture.packageId}/co-authors`,
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

    await page.goto('/sv/requirements/stewardship?tab=packages')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravpaket' }),
    ).toBeVisible()
    const filter = page.getByRole('textbox', {
      name: 'Filtrera på namn eller beskrivning',
    })
    await filter.fill(fixture.packageName)
    const row = page.getByRole('row', {
      name: new RegExp(escapeRegExp(fixture.packageName)),
    })
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
      .getByRole('textbox', { name: 'Syfte och avgränsning' })
      .fill(updatedPurposeAndScope)
    await dialog.getByRole('button', { name: 'Spara' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(updatedPurposeAndScope)).toBeVisible()

    await page.reload()
    await expect(page.getByText(updatedPurposeAndScope)).toBeVisible()
    const updatedRow = page.getByRole('row', {
      name: new RegExp(escapeRegExp(fixture.packageName)),
    })
    await updatedRow
      .getByRole('button', { name: 'Hantera medförfattare' })
      .click()
    const coAuthorsDialog = page.getByRole('dialog', {
      name: 'Kravpaketsmedförfattare',
    })
    await expect(coAuthorsDialog).toBeVisible()
    await coAuthorLoadStarted
    await expect(coAuthorsDialog.getByRole('status')).toContainText(
      /Hämtar .*medförfattare/u,
    )
    coAuthorLoadGate.release?.()
    await expect(coAuthorsDialog.getByText(HSA.packageCoauthor)).toBeVisible()
    await expect(
      coAuthorsDialog.getByRole('textbox', {
        name: 'Medförfattares HSA-id',
      }),
    ).toBeVisible()
    await expect(
      coAuthorsDialog.getByRole('button', { name: 'Hämta' }),
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
    await expect(coAuthorsDialog.getByText(HSA.packageCoauthor)).toBeVisible()
    await expect(coAuthorsDialog.getByText(temporaryCoAuthor)).toHaveCount(0)
    await coAuthorsDialog.getByRole('button', { name: 'Stäng' }).last().click()
    await expect(coAuthorsDialog).toBeHidden()

    const updateResponse = await packageLead.put(
      `/api/requirement-packages/${fixture.packageId}`,
      {
        data: {
          purposeAndScope: updatedPurposeAndScope,
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

    await expectOk(
      await packageLead.put(
        `/api/requirement-packages/${fixture.packageId}/co-authors`,
        {
          data: {
            coAuthorHsaIds: [HSA.packageCoauthor],
          },
        },
      ),
      'package lead co-author update',
    )

    await expectStatus(
      await packageLead.post(
        `/api/requirement-packages/${fixture.packageId}/archive`,
      ),
      403,
      'package lead archive',
    )
  } finally {
    try {
      await expectOk(
        await packageLead.put(
          `/api/requirement-packages/${fixture.packageId}/co-authors`,
          {
            data: {
              coAuthorHsaIds: originalCoAuthors,
            },
          },
        ),
        'package lead co-author restore',
      )
    } finally {
      await packageLead.dispose()
    }
  }
})
