import { expect, test } from '@playwright/test'
import {
  expectOk,
  expectStatus,
  newRoleContext,
  ROLE_STORAGE_STATE,
  referenceManualCases,
  type SpecificationListResponse,
} from './authorization-test-helpers'

test.use({
  storageState: ROLE_STORAGE_STATE.reviewer,
  viewport: { height: 720, width: 1280 },
})

test('AUTHZ-09/AUTH-10/AUTH-11: Reviewers can read broadly without privileged admin tabs', async ({
  page,
}, testInfo) => {
  referenceManualCases(testInfo, 'AUTHZ-09', 'AUTH-10', 'AUTH-11')
  const reviewer = await newRoleContext(testInfo, 'reviewer')

  try {
    await page.goto('/sv/specifications')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravunderlag' }),
    ).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()

    await page.goto('/sv/admin?tab=accessReview')
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Du saknar behörighet till Administrationscenter',
      }),
    ).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)

    const specificationsResponse = await reviewer.get(
      '/api/requirements-specifications',
    )
    await expectOk(specificationsResponse, 'reviewer specifications list')
    const specifications =
      (await specificationsResponse.json()) as SpecificationListResponse

    expect(specifications.specifications.length).toBeGreaterThan(0)
    await expectStatus(
      await reviewer.get('/api/admin/access-reviews'),
      403,
      'reviewer access-review list',
    )
    await expectStatus(
      await reviewer.get('/api/admin/audit-events'),
      403,
      'reviewer action log read',
    )
  } finally {
    await reviewer.dispose()
  }
})
