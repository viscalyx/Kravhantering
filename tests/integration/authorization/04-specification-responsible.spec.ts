import { expect, test } from '@playwright/test'
import { escapeRegExp } from '@/tests/helpers/common'
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
  storageState: ROLE_STORAGE_STATE.specificationResponsible,
  viewport: { height: 720, width: 1280 },
})

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  fixture = await createAuthorizationFixture(testInfo)
})

test('AUTHZ-04/AUTH-10/AUTH-11: specification responsible users can manage assignments', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-04', 'AUTH-10', 'AUTH-11')
  const specificationResponsible = await newRoleContext(
    testInfo,
    'specificationResponsible',
  )
  const updatedPurpose = `Updated by responsible ${Date.now()}`
  const originalCoAuthors = [HSA.specificationCoauthor]
  const temporaryCoAuthor = HSA.admin

  try {
    const coAuthorLoadGate: { release?: () => void } = {}
    const coAuthorLoadStarted = new Promise<void>(resolve => {
      void page.route(
        `**/api/requirements-specifications/${fixture.specificationSlug}/co-authors`,
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

    await page.goto(`/sv/specifications/${fixture.specificationSlug}`)
    await expect(
      page.getByRole('heading', { level: 1, name: fixture.specificationName }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Redigera kravunderlag' }).click()
    const dialog = page.getByRole('dialog', {
      name: 'Redigera kravunderlag',
    })
    await expect(dialog).toBeVisible()
    await dialog
      .getByRole('textbox', { name: 'Underlagssyfte' })
      .fill(updatedPurpose)
    await dialog.getByRole('button', { name: 'Spara' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(updatedPurpose)).toBeVisible()

    await page.reload()
    await expect(page.getByText(updatedPurpose)).toBeVisible()

    await page.goto('/sv/specifications')
    const specificationNamePattern = escapeRegExp(fixture.specificationName)
    const row = page.getByRole('row', {
      name: new RegExp(specificationNamePattern),
    })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Hantera medförfattare' }).click()
    const coAuthorsDialog = page.getByRole('dialog', {
      name: 'Kravunderlagsmedförfattare',
    })
    await expect(coAuthorsDialog).toBeVisible()
    await coAuthorLoadStarted
    await expect(coAuthorsDialog.getByRole('status')).toContainText(
      /Hämtar .*medförfattare/u,
    )
    coAuthorLoadGate.release?.()
    await expect(
      coAuthorsDialog.getByText(HSA.specificationCoauthor),
    ).toBeVisible()
    await expect(
      coAuthorsDialog.getByRole('textbox', {
        name: 'Medförfattares HSA-id',
      }),
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

    await row.getByRole('button', { name: 'Hantera medförfattare' }).click()
    await expect(coAuthorsDialog).toBeVisible()
    await expect(
      coAuthorsDialog.getByText(HSA.specificationCoauthor),
    ).toBeVisible()
    await expect(coAuthorsDialog.getByText(temporaryCoAuthor)).toHaveCount(0)
    await coAuthorsDialog.getByRole('button', { name: 'Stäng' }).last().click()
    await expect(coAuthorsDialog).toBeHidden()

    const readResponse = await specificationResponsible.get(
      `/api/requirements-specifications/${fixture.specificationSlug}`,
      { timeout: 30_000 },
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
      { timeout: 30_000 },
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
    await expectStatus(
      await specificationResponsible.post('/api/privacy/erasure-preview', {
        data: { target: { hsaId: HSA.areaOwner } },
      }),
      403,
      'specification responsible privacy preview',
    )
  } finally {
    await specificationResponsible
      .put(
        `/api/requirements-specifications/${fixture.specificationSlug}/co-authors`,
        {
          data: { coAuthorHsaIds: originalCoAuthors },
        },
      )
      .catch(() => undefined)
    await specificationResponsible.dispose()
  }
})
