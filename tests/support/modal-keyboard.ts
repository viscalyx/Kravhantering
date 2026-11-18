import { expect, type Locator, type Page } from '@playwright/test'

/** Check the active modal through keyboard navigation and browser semantics. */
export async function expectModalKeyboardIsolation(
  page: Page,
  dialog: Locator,
) {
  await expect(dialog).toBeVisible()
  const expectFocusInside = () =>
    expect
      .poll(() =>
        dialog.evaluate(element => element.contains(document.activeElement)),
      )
      .toBe(true)
  await expectFocusInside()
  await expect(page.getByRole('main')).toHaveCount(0)
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let index = 0; index < 16; index++) {
      await page.keyboard.press(key)
      await expectFocusInside()
    }
  }
}
