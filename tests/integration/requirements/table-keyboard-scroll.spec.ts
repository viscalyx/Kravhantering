import { expect, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '@/tests/helpers/desktop-viewport'
import {
  expectKeyboardTableScroll,
  tabToScrollRegion,
} from '@/tests/support/table-scroll-assertions'

for (const locale of ['en', 'sv'] as const) {
  test.describe(`${locale} scroll regions`, () => {
    test.use({ viewport: { width: 320, height: 900 } })

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(dark => {
        localStorage.setItem('theme', dark ? 'dark' : 'light')
      }, locale === 'sv')
    })

    test('A11Y-05: scrolls requirements with the keyboard and updates access when columns change', async ({
      page,
      browser,
    }, testInfo) => {
      await page.goto(`/${locale}/requirements`)
      const region = page.getByRole('region', {
        name: locale === 'sv' ? 'Lista över krav' : 'Requirements list',
        exact: true,
      })
      await expect(region.locator('tbody tr').first()).toContainText(/\S/)
      await expect(region).toHaveAccessibleDescription(
        locale === 'sv'
          ? 'Använd vänster och höger piltangent för att rulla mellan kolumnerna.'
          : 'Use the Left and Right arrow keys to scroll through the columns.',
      )
      await expect(region).toHaveAttribute(
        'data-developer-mode-value',
        'keyboard scroll region',
      )
      await test.step('Read every column and leave the region using the keyboard', async () => {
        await expectKeyboardTableScroll(page, region)
      })

      await test.step('Update the tab stop when column visibility and widths change', async () => {
        await page.setViewportSize(DESKTOP_VIEWPORT)
        const picker = page.locator('[data-column-picker-trigger]')
        // WebKit can finish resizing the viewport before the floating rail
        // reaches its desktop position.
        await expect
          .poll(() =>
            picker.evaluate(node => node.getBoundingClientRect().left),
          )
          .toBeGreaterThan(DESKTOP_VIEWPORT.width - 100)
        await picker.click()
        await expect(
          page.locator('[data-column-picker-option="area"] input'),
        ).toBeChecked()
        const options = page.locator(
          '[data-column-picker-popover] input[type="checkbox"]:enabled:checked',
        )
        while (await options.count()) await options.first().uncheck()
        await page.keyboard.press('Escape')
        await expect(region).toHaveAttribute('tabindex', '-1')
        await picker.click()
        await page
          .locator('[data-column-picker-option="version"] input')
          .check()
        await page.keyboard.press('Escape')
        const handle = region
          .locator('[data-column-resize-handle="description"]')
          .first()
        await handle.focus()
        for (let step = 0; step < 8; step++)
          await page.keyboard.press('ArrowRight')
        await expect(region).toHaveAttribute('tabindex', '0')
        await tabToScrollRegion(page, region, 'Shift+Tab')
      })
      await testInfo.attach(`requirements-focus-${locale}`, {
        body: await region.screenshot(),
        contentType: 'image/png',
      })
      await testInfo.attach('browser', {
        body: `${browser.browserType().name()} ${browser.version()}`,
        contentType: 'text/plain',
      })
    })
  })
}
