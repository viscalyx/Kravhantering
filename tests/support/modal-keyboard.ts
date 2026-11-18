import { expect, type Locator, type Page } from '@playwright/test'

/** Exercise both directions from the initial reading position. */
export async function expectModalKeyboardContainment(
  page: Page,
  dialog: Locator,
) {
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press(key)
      await expect
        .poll(() =>
          dialog.evaluate(element => element.contains(document.activeElement)),
        )
        .toBe(true)
    }
  }
}
