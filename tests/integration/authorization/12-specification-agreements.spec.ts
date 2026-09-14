import { expect, test } from '@playwright/test'
import {
  createAuthorizationFixture,
  newRoleContext,
  ROLE_STORAGE_STATE,
} from './authorization-test-helpers'

test.use({ storageState: ROLE_STORAGE_STATE.specificationCoauthor })

test('AUTHZ-04/AUTHZ-05/SPEC-24: co-authors prepare and cancel deviations while only the responsible person decides the agreement', async ({
  baseURL,
  browser,
  page,
}, testInfo) => {
  const fixture =
    await test.step('Set up the assigned specification and active deviation', () =>
      createAuthorizationFixture(testInfo))
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  const ownerContext = await browser.newContext({
    baseURL,
    storageState: ROLE_STORAGE_STATE.specificationResponsible,
  })
  const ownerPage = await ownerContext.newPage()
  const endpoint = `/api/requirements-specifications/${fixture.specificationId}/agreement`
  const specificationUrl = `/en/specifications/${fixture.specificationId}`
  const effectiveDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
  }).format(new Date())
  const panel = page.getByRole('region', {
    name: 'Agreement and version history',
  })
  const ownerPanel = ownerPage.getByRole('region', {
    name: 'Agreement and version history',
  })
  try {
    await test.step('Establishment is unavailable to roles without specification responsibility', async () => {
      for (const role of [
        'specificationCoauthor',
        'reviewer',
        'adminOnly',
        'noRoles',
      ] as const) {
        const caller = await browser.newContext({
          baseURL,
          storageState: ROLE_STORAGE_STATE[role],
        })
        try {
          const rolePage = await caller.newPage()
          await rolePage.goto(specificationUrl)
          if (role === 'noRoles') {
            await expect(
              rolePage.getByRole('heading', {
                name: 'You do not have access to this requirements specification',
              }),
            ).toHaveCount(1)
          } else {
            await expect(
              rolePage
                .getByRole('region', { name: 'Agreement and version history' })
                .getByRole('button', {
                  name: 'Export selected view as JSON',
                  exact: true,
                }),
            ).toBeEnabled()
          }
          await expect(
            rolePage.getByRole('button', {
              name: 'Establish agreement',
              exact: true,
            }),
          ).toHaveCount(0)
        } finally {
          await caller.close()
        }
      }
    })
    await test.step('The responsible person establishes the agreement', async () => {
      await ownerPage.goto(specificationUrl)
      await ownerPanel.getByLabel(/^Reason/).fill('Agreement')
      await ownerPanel.getByLabel(/^Agreement reference/).fill('A')
      await ownerPanel.getByLabel(/^Effective date/).fill(effectiveDate)
      await ownerPanel
        .getByRole('button', { name: 'Establish agreement', exact: true })
        .click()
      await expect(ownerPanel).toContainText('Established supplier agreement')
    })
    await test.step('The co-author cancels the active deviation', async () => {
      await page.goto(specificationUrl)
      await expect(
        panel.getByRole('button', { name: 'Record agreement end' }),
      ).toHaveCount(0)
      await panel
        .getByLabel(/^Reason/)
        .fill('The proposed requirement change replaces this deviation')
      await panel
        .getByRole('button', { name: 'Cancel deviation', exact: true })
        .click()
      await expect(panel.getByText(/Cancelled deviation/)).toBeVisible()
    })
    await test.step('The co-author prepares an amendment', async () => {
      await panel.getByLabel(/^Reason/).fill('Remove obsolete requirement')
      await panel.getByLabel(/^Agreement reference/).fill('A / T1')
      await panel.getByLabel(/^Effective date/).fill(effectiveDate)
      await panel.getByLabel(/^Change type/).selectOption('remove')
      await panel
        .getByLabel(/^Requirement application/)
        .selectOption(`local:${fixture.localRequirementId}`)
      await panel
        .getByRole('button', { name: 'Add change', exact: true })
        .click()
      await panel
        .getByRole('button', { name: 'Prepare amendment', exact: true })
        .click()
      await expect(panel.getByRole('article')).toBeVisible()
    })
    await test.step('Only the responsible person can decide the proposal', async () => {
      await expect(
        panel.getByRole('button', { name: 'Record agreement decision' }),
      ).toHaveCount(0)
      const view = (await (await owner.get(endpoint)).json()) as {
        amendments: Array<{ id: number }>
      }
      expect(view.amendments[0]?.id).toBeDefined()
      await ownerPage.reload()
      await ownerPanel
        .getByRole('button', { name: 'Record agreement decision', exact: true })
        .click()
      await expect(
        ownerPanel
          .locator('ul')
          .first()
          .getByText('Scoped child authorization fixture.', { exact: true }),
      ).toHaveCount(0)
    })
    await test.step('Verify the final current agreement content', async () => {
      await page.reload()
      await expect(
        panel.getByRole('button', {
          name: 'Export selected view as JSON',
          exact: true,
        }),
      ).toBeEnabled()
      await expect(
        panel
          .locator('ul')
          .first()
          .getByText('Scoped child authorization fixture.', { exact: true }),
      ).toHaveCount(0)
    })
  } finally {
    await owner.dispose()
    await ownerContext.close()
  }
})
