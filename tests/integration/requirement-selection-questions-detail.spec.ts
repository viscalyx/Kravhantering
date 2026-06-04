import { expect, test } from '@playwright/test'

test.describe('Requirement selection question detail preview', () => {
  test.use({ viewport: { height: 720, width: 1280 } })

  test('opens a library-style read-only requirement detail card from the answer modal', async ({
    page,
  }) => {
    await test.step('open a seeded requirement-selection answer for editing', async () => {
      await page.goto('/sv/requirements/stewardship?tab=questions')

      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()

      const answerRow = page
        .locator('li')
        .filter({ hasText: 'Grundskydd för intern information' })
        .first()
      await expect(answerRow).toContainText('Grundskydd för intern information')
      await answerRow.getByRole('button', { name: 'Redigera' }).click()

      await expect(
        page.getByRole('dialog', { name: 'Redigera kravurvalsvar' }),
      ).toBeVisible()
    })

    const dialog = page.getByRole('dialog', {
      name: 'Redigera kravurvalsvar',
    })
    const requirementId = 'SÄK0042'

    await test.step('expand a requirement in the selection preview', async () => {
      const requirementButton = dialog.getByRole('button', {
        name: `Öppna kravdetaljer ${requirementId}`,
      })

      await expect(requirementButton).toHaveAttribute('aria-expanded', 'false')
      await requirementButton.click()
      await expect(requirementButton).toHaveAttribute('aria-expanded', 'true')
    })

    await test.step('verify the library-style read-only detail card layout', async () => {
      const detailCard = dialog.locator(
        '[data-developer-mode-name="matched requirement detail"]',
      )

      await expect(detailCard).toHaveCount(1)
      await expect(detailCard).toBeVisible()

      await expect(
        detailCard.getByRole('heading', { name: 'Kravtext' }),
      ).toBeVisible()
      await expect(detailCard).toContainText(
        'Skyddade routes ska returnera 302',
      )
      await expect(
        detailCard.getByRole('heading', { name: requirementId }),
      ).toHaveCount(0)
      await expect(
        dialog.getByRole('button', { name: 'Arkivera' }),
      ).toHaveCount(0)
    })
  })
})
