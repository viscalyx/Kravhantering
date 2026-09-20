import { expect, test } from '@playwright/test'
import { requireTestValue } from '@/tests/helpers/require-test-value'
import {
  createAuthorizationFixture,
  expectOk,
  newRoleContext,
  ROLE_STORAGE_STATE,
} from './authorization-test-helpers'

test.use({ storageState: ROLE_STORAGE_STATE.specificationCoauthor })

for (const role of [
  'specificationCoauthor',
  'reviewer',
  'adminOnly',
  'noRoles',
] as const) {
  test(`AUTHZ-04/AUTHZ-05/SPEC-24: ${role} cannot register the first agreement`, async ({
    baseURL,
    browser,
  }, testInfo) => {
    const fixture = await createAuthorizationFixture(testInfo)
    const caller = await browser.newContext({
      baseURL,
      storageState: ROLE_STORAGE_STATE[role],
    })
    try {
      const rolePage = await caller.newPage()
      await rolePage.goto(`/en/specifications/${fixture.specificationId}`)
      if (role === 'noRoles') {
        await expect(
          rolePage.getByRole('heading', {
            name: 'You do not have access to this requirements specification',
          }),
        ).toHaveText(
          'You do not have access to this requirements specification',
        )
      } else {
        await rolePage
          .getByRole('button', { name: 'Expand header', exact: true })
          .click()
        await expect(
          rolePage.locator('[data-developer-mode-value="agreement selector"]'),
        ).toContainText('None')
      }
      await expect(
        rolePage.getByRole('button', {
          name: 'Register agreement',
          exact: true,
        }),
      ).toHaveCount(0)
    } finally {
      await caller.close()
    }
  })
}

test('AUTHZ-04/AUTHZ-05/SPEC-24: co-authors prepare whole agreements and cancel pending cases while the assigned responsible person confirms', async ({
  baseURL,
  browser,
  page,
}, testInfo) => {
  const fixture = await createAuthorizationFixture(testInfo)
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  const ownerContext = await browser.newContext({
    baseURL,
    storageState: ROLE_STORAGE_STATE.specificationResponsible,
  })
  const ownerPage = await ownerContext.newPage()
  const endpoint = `/api/requirements-specifications/${fixture.specificationId}/agreement`
  const url = `/en/specifications/${fixture.specificationId}`
  try {
    await test.step('The assigned responsible person registers the first agreement', async () => {
      const response = await owner.post(endpoint, {
        data: {
          operation: 'establish',
          agreementReference: 'A',
          effectiveDate: '2020-01-01',
        },
      })
      await expectOk(response, 'register first whole agreement')
      // Saving a case refreshes package links. Compile that read-only dev route
      // during setup so its first request does not consume the UI assertion wait.
      await expectOk(
        await page.request.get(
          `/api/requirements-specifications/${fixture.specificationId}/requirement-packages?limit=50`,
        ),
        'load package links needed by the agreement refresh',
      )
    })
    await test.step('The co-author explicitly cancels a pending case from the requirement row', async () => {
      await page.goto(url)
      await page
        .getByRole('button', { name: 'Expand header', exact: true })
        .click()
      await expect(
        page.locator('[data-developer-mode-value="agreement selector"]'),
      ).toContainText('Current')
      const view = (await (
        await owner.get(
          `${endpoint}?itemRefs=local:${fixture.localRequirementId}`,
        )
      ).json()) as {
        items: Array<{ itemRef: string; uniqueId: string }>
      }
      const local = requireTestValue(
        view.items.find(
          item => item.itemRef === `local:${fixture.localRequirementId}`,
        ),
      )
      await page
        .getByRole('button', { name: new RegExp(`^${local.uniqueId}\\b`) })
        .click()
      await page
        .getByRole('button', { name: 'End without a decision', exact: true })
        .click()
      const dialog = page.getByRole('dialog', {
        name: 'End without a decision',
        exact: true,
      })
      await dialog
        .getByLabel(/^Reason/)
        .fill('The proposed content replaces this pending request')
      await dialog
        .getByRole('button', { name: 'End without a decision', exact: true })
        .click()
      await expect(dialog).toBeHidden()
      await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()
    })
    await test.step('The co-author creates and edits a complete draft', async () => {
      await page
        .getByRole('button', { name: 'New agreement', exact: true })
        .click()
      const create = page.getByRole('dialog', {
        name: 'New agreement',
        exact: true,
      })
      await create.getByLabel(/^Agreement reference/).fill('B')
      await create.getByLabel(/^Agreement effective date/).fill(
        new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Europe/Stockholm',
        }).format(new Date()),
      )
      await create
        .getByRole('button', { name: 'Create draft', exact: true })
        .click()
      await expect(create).toBeHidden()
      const localRow = page
        .locator('button[aria-controls]')
        .filter({ hasText: /^KRAV/ })
        .first()
      if ((await localRow.getAttribute('aria-expanded')) !== 'true')
        await localRow.click()
      await page
        .getByRole('button', { name: 'Edit requirement', exact: true })
        .click()
      const editor = page.getByRole('dialog', {
        name: 'Edit requirement',
        exact: true,
      })
      await editor
        .getByLabel(/^Requirement text/)
        .fill('Co-author prepared the successor content')
      await editor.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(editor).toBeHidden()
      await expect(localRow.locator('xpath=ancestor::tr[1]')).toContainText(
        'Co-author prepared the successor content',
      )
      const view = (await (await owner.get(endpoint)).json()) as {
        agreements: Array<{ id: number; state: string }>
      }
      const draftId = requireTestValue(
        view.agreements.find(agreement => agreement.state === 'draft'),
      ).id
      await page
        .getByRole('button', { name: 'Agreement details', exact: true })
        .click()
      const details = page.getByRole('dialog', {
        name: 'Agreement details',
        exact: true,
      })
      await expect(details).toContainText('B')
      await expect(
        details.getByRole('button', { name: 'Confirm agreement', exact: true }),
      ).toHaveCount(0)
      await expect(
        details.getByRole('button', { name: 'Discard draft', exact: true }),
      ).toHaveCount(0)
      await page.keyboard.press('Escape')
      await ownerPage.goto(url)
      await ownerPage
        .getByRole('button', { name: 'Expand header', exact: true })
        .click()
      await ownerPage
        .getByRole('button', { name: 'Select agreement', exact: true })
        .click()
      await ownerPage
        .getByRole('dialog', { name: 'Select agreement', exact: true })
        .getByRole('button', { name: /^B ·/ })
        .click()
      await ownerPage
        .getByRole('button', { name: 'Agreement details', exact: true })
        .click()
      await ownerPage
        .getByRole('dialog', { name: 'Agreement details', exact: true })
        .getByRole('button', { name: 'Confirm agreement', exact: true })
        .click()
      await expect(
        ownerPage.locator('[data-developer-mode-value="agreement selector"]'),
      ).toContainText('Current')
      const final = (await (await owner.get(endpoint)).json()) as {
        selectedAgreement: { id: number; state: string }
      }
      expect(final.selectedAgreement).toMatchObject({
        id: draftId,
        state: 'current',
      })
    })
  } finally {
    await owner.dispose()
    await ownerContext.close()
  }
})
