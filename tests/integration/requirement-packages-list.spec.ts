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
      await page.goto('/sv/requirement-packages')

      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravpaket' }),
      ).toBeVisible()

      const nameFilter = page.getByRole('textbox', {
        name: 'Filtrera på namn',
      })
      await expect(nameFilter).toBeVisible()
      const createButton = page.getByRole('button', { name: 'Nytt kravpaket' })
      await expect(createButton).toBeVisible()
      const areaPill = page
        .locator('[data-package-requirement-area-pill="true"]')
        .first()
      await expect(areaPill).toBeVisible()
      await expect(areaPill).toHaveJSProperty('tagName', 'SPAN')
      await expect(areaPill).toHaveClass(/text-\[11px\]/)
      const editAction = page.getByRole('button', { name: 'Redigera' }).first()
      const deleteAction = page.getByRole('button', { name: 'Ta bort' }).first()
      await expect(editAction).toBeVisible()
      await expect(deleteAction).toBeVisible()
      await expect(editAction).not.toContainText('Redigera')
      await expect(deleteAction).not.toContainText('Ta bort')
      await expect(editAction.locator('svg')).toBeVisible()
      await expect(deleteAction.locator('svg')).toBeVisible()

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

      const hasMultiAreaPackage = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            '[data-package-requirement-area-pills="true"]',
          ),
        ).some(
          group =>
            group.querySelectorAll(
              '[data-package-requirement-area-pill="true"]',
            ).length > 1,
        ),
      )
      expect(hasMultiAreaPackage).toBe(true)

      await page.addStyleTag({
        content:
          '[data-package-requirement-area-pill-list="true"] { max-width: 72px !important; }',
      })
      await page.evaluate(() => window.dispatchEvent(new Event('resize')))

      const areaToggle = page
        .locator('[data-package-requirement-area-pill-toggle="true"]')
        .first()
      const areaList = areaToggle.locator(
        'xpath=../*[@data-package-requirement-area-pill-list="true"]',
      )
      await expect(areaToggle).toBeVisible()
      await expect(areaToggle).toHaveAttribute('aria-expanded', 'false')
      await expect(areaList).toHaveClass(/max-h-6/)
      const areaToggleBox = await areaToggle.boundingBox()
      expect(areaToggleBox).not.toBeNull()
      expect(areaToggleBox?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(areaToggleBox?.width ?? 0).toBeGreaterThanOrEqual(44)

      await areaToggle.click()
      await expect(areaToggle).toHaveAttribute('aria-expanded', 'true')
      await expect(areaList).not.toHaveClass(/max-h-6/)

      await areaToggle.click()
      await expect(areaToggle).toHaveAttribute('aria-expanded', 'false')
      await expect(areaList).toHaveClass(/max-h-6/)

      await nameFilter.fill('e-tjänst')

      await expect(
        page.getByRole('link', { name: 'Införande av e-tjänstplattform' }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Säkerhetslyft Q2' }),
      ).toBeHidden()

      await page.getByRole('button', { name: 'Rensa sökning' }).click()

      await expect(nameFilter).toHaveValue('')
      await expect(
        page.getByRole('link', { name: 'Införande av e-tjänstplattform' }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Säkerhetslyft Q2' }),
      ).toBeVisible()
    })
  })
}
