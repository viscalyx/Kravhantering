import { expect, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '@/tests/helpers/desktop-viewport'
import { expectKeyboardTableScroll } from '@/tests/support/table-scroll-assertions'

for (const locale of ['en', 'sv'] as const) {
  test.describe(`${locale} scroll regions`, () => {
    test.use({ viewport: { width: 320, height: 900 } })

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(dark => {
        localStorage.setItem('theme', dark ? 'dark' : 'light')
      }, locale === 'sv')
    })

    for (const path of ['requirement-statuses', 'requirement-areas']) {
      test(`A11Y-03: scrolls ${path} with the keyboard and skips the region when it fits`, async ({
        page,
      }) => {
        await page.goto(`/${locale}/${path}`)
        const title = await page.getByRole('heading', { level: 1 }).innerText()
        const region = page.getByRole('region', { name: title, exact: true })
        await expect(region).toHaveAttribute(
          'data-developer-mode-name',
          'table scroll region',
        )
        await test.step('Read every column and leave the region using the keyboard', async () => {
          await expectKeyboardTableScroll(page, region)
        })

        await test.step('Skip fitting content and restore access after narrowing the viewport', async () => {
          await page.setViewportSize(DESKTOP_VIEWPORT)
          await expect(region).toHaveAttribute('tabindex', '-1')
          const firstAction = region.getByRole('button').first()
          await firstAction.focus()
          await page.keyboard.press('Shift+Tab')
          await expect(region).not.toBeFocused()
          await expect(firstAction).not.toBeFocused()
          // Focus may open navigation popovers before the table.
          for (let step = 0; step < 20; step++) {
            await page.keyboard.press('Tab')
            await expect(region).not.toBeFocused()
            if (
              await firstAction.evaluate(
                node => node === document.activeElement,
              )
            )
              break
          }
          await expect(firstAction).toBeFocused()
          await page.setViewportSize({ width: 320, height: 900 })
          await expect(region).toHaveAttribute('tabindex', '0')
        })
      })
    }
  })
}
