import { expect, test } from '@playwright/test'

test.describe('admin center permissions', () => {
  test.use({ storageState: 'test-results/auth/reviewer.json' })

  test('reviewer-only users see privileged admin tabs disabled', async ({
    page,
  }) => {
    await page.goto('/sv/admin?tab=accessReview')

    const columnsTab = page.getByRole('tab', { name: 'Kolumner' })
    const disabledTabs = [
      {
        name: 'Behörighetsöversyn',
        title: /Administratör eller Dataskyddshandläggare/,
      },
      { name: 'Arkivering', title: /Dataskyddshandläggare/ },
      { name: 'Dataskydd', title: /Dataskyddshandläggare/ },
      { name: 'Åtgärdslogg', title: /Administratör/ },
    ]

    await expect(columnsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Kolumner' })).toBeVisible()

    for (const { name, title } of disabledTabs) {
      const tab = page.getByRole('tab', { name })

      await expect(tab).toHaveAttribute('aria-disabled', 'true')
      await expect(tab).toHaveAttribute('title', title)

      await tab.click({ force: true })

      await expect(tab).toHaveAttribute('aria-selected', 'false')
      await expect(columnsTab).toHaveAttribute('aria-selected', 'true')
    }
  })
})
