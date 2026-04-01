import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 720 },
]

for (const viewport of viewports) {
  test.describe(`Requirement packages list filter — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('filters the table by package name and clears the search', async ({
      page,
    }) => {
      await page.goto('/sv/kravpaket')

      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravpaket' }),
      ).toBeVisible()

      const nameFilter = page.getByRole('textbox', {
        name: 'Filtrera på namn',
      })
      await expect(nameFilter).toBeVisible()
      const createButton = page.getByRole('button', { name: 'Nytt kravpaket' })
      await expect(createButton).toBeVisible()

      if (viewport.name === 'desktop') {
        const filterBox = await nameFilter.boundingBox()
        const buttonBox = await createButton.boundingBox()

        expect(filterBox).not.toBeNull()
        expect(buttonBox).not.toBeNull()
        expect(
          Math.abs(
            (buttonBox?.y ?? 0) +
              (buttonBox?.height ?? 0) -
              ((filterBox?.y ?? 0) + (filterBox?.height ?? 0)),
          ),
        ).toBeLessThanOrEqual(6)
        expect(buttonBox?.x ?? 0).toBeGreaterThan(
          (filterBox?.x ?? 0) + (filterBox?.width ?? 0),
        )
      }

      await nameFilter.fill('Behörighet')

      await expect(
        page.getByRole('link', { name: 'Behörighet och IAM' }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Säkerhetslyft Q2' }),
      ).toBeHidden()

      await page.getByRole('button', { name: 'Rensa sökning' }).click()

      await expect(nameFilter).toHaveValue('')
      await expect(
        page.getByRole('link', { name: 'Behörighet och IAM' }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Säkerhetslyft Q2' }),
      ).toBeVisible()
    })
  })
}
