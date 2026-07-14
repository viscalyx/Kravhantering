import { expect, test } from '@playwright/test'

test.describe('admin center permissions', () => {
  test.use({ storageState: 'test-results/auth/reviewer.json' })

  test('AUTHZ-09/AUTH-10/AUTH-11: reviewer-only users get the Admin Center access-denied surface', async ({
    page,
  }) => {
    await page.goto('/sv/admin?tab=accessReview')

    await expect(
      page.getByRole('heading', {
        name: 'Du saknar behörighet till Administrationscenter',
      }),
    ).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)
  })
})
