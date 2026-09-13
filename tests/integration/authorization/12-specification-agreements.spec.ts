import { expect, test } from '@playwright/test'
import {
  createAuthorizationFixture,
  expectOk,
  newRoleContext,
  ROLE_STORAGE_STATE,
} from './authorization-test-helpers'

test.use({ storageState: ROLE_STORAGE_STATE.specificationCoauthor })

test('AUTHZ-04/AUTHZ-05/SPEC-24: co-authors prepare and cancel deviations while only the responsible person decides the agreement', async ({
  page,
}, testInfo) => {
  const fixture = await createAuthorizationFixture(testInfo)
  const owner = await newRoleContext(testInfo, 'specificationResponsible')
  const coauthor = await newRoleContext(testInfo, 'specificationCoauthor')
  const endpoint = `/api/requirements-specifications/${fixture.specificationId}/agreement`
  const effectiveDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
  }).format(new Date())
  try {
    for (const role of [
      'specificationCoauthor',
      'reviewer',
      'adminOnly',
      'noRoles',
    ] as const) {
      const caller = await newRoleContext(testInfo, role)
      try {
        const response = await caller.post(endpoint, {
          data: {
            operation: 'establish',
            agreementReference: 'A',
            reason: 'Agreement',
            effectiveDate,
          },
        })
        expect(response.status(), role).toBe(403)
      } finally {
        await caller.dispose()
      }
    }
    await expectOk(
      await owner.post(endpoint, {
        data: {
          operation: 'establish',
          agreementReference: 'A',
          reason: 'Agreement',
          effectiveDate,
        },
      }),
      'owner establishes',
    )
    await page.goto(`/en/specifications/${fixture.specificationId}`)
    const panel = page.getByRole('region', {
      name: 'Agreement and version history',
    })
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
    await panel.getByLabel(/^Reason/).fill('Remove obsolete requirement')
    await panel.getByLabel(/^Agreement reference/).fill('A / T1')
    await panel.getByLabel(/^Effective date/).fill(effectiveDate)
    await panel.getByLabel(/^Change type/).selectOption('remove')
    await panel
      .getByLabel(/^Requirement application/)
      .selectOption(`local:${fixture.localRequirementId}`)
    await panel.getByRole('button', { name: 'Add change', exact: true }).click()
    await panel
      .getByRole('button', { name: 'Prepare amendment', exact: true })
      .click()
    await expect(panel.getByRole('article')).toBeVisible()
    await expect(
      panel.getByRole('button', { name: 'Record agreement decision' }),
    ).toHaveCount(0)
    const view = (await (await owner.get(endpoint)).json()) as {
      amendments: Array<{ id: number }>
    }
    const amendmentId = view.amendments[0]?.id
    expect(amendmentId).toBeDefined()
    expect(
      (
        await coauthor.post(endpoint, {
          data: { operation: 'decide_amendment', amendmentId },
        })
      ).status(),
    ).toBe(403)
    await expectOk(
      await owner.post(endpoint, {
        data: { operation: 'decide_amendment', amendmentId },
      }),
      'owner decides co-author proposal',
    )
    await page.reload()
    await expect(
      panel
        .locator('ul')
        .first()
        .getByText('Scoped child authorization fixture.', { exact: true }),
    ).toHaveCount(0)
  } finally {
    await owner.dispose()
    await coauthor.dispose()
  }
})
