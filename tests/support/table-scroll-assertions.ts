import { expect, type Locator, type Page } from '@playwright/test'

export async function tabToScrollRegion(
  page: Page,
  region: Locator,
  direction: 'Tab' | 'Shift+Tab' = 'Tab',
) {
  for (let step = 0; step < 150; step++) {
    await page.keyboard.press(direction)
    if (await region.evaluate(node => node === document.activeElement)) break
  }
  await expect(region).toBeFocused()
}

export async function expectKeyboardTableScroll(page: Page, region: Locator) {
  await expect(region).toHaveAttribute('tabindex', '0')
  await tabToScrollRegion(page, region)
  await expect(region).toHaveCSS('outline-style', 'solid')
  await expect(region).toHaveCSS('outline-width', '2px')
  await expect(region).toHaveCSS('outline-offset', '-2px')
  const focusFrame = region.locator('..').locator('[data-table-scroll-focus]')
  await expect(focusFrame).toHaveCSS('border-top-width', '2px')
  await expect(focusFrame).toHaveCSS('pointer-events', 'none')
  await expect(focusFrame).toHaveCSS(
    'border-top-color',
    (await page
      .locator('html')
      .evaluate(node => node.classList.contains('dark')))
      ? 'rgb(165, 180, 252)'
      : 'rgb(67, 56, 202)',
  )

  await page.keyboard.press('Shift+Tab')
  await expect(region).not.toBeFocused()
  await expect(focusFrame).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
  await page.keyboard.press('Tab')
  await expect(region).toBeFocused()

  await expect
    .poll(
      async () => {
        await page.keyboard.press('ArrowRight')
        return region.evaluate(
          node => node.scrollWidth - node.clientWidth - node.scrollLeft,
        )
      },
      { intervals: [30], timeout: 15_000 },
    )
    .toBeLessThanOrEqual(1)
  expect(await region.evaluate(node => node.scrollLeft)).toBeGreaterThan(0)

  const table = region.locator('table')
  const lastCell = table.locator('tbody tr').first().locator('td').last()
  await expect
    .poll(async () => {
      const viewport = await region.boundingBox()
      const cell = await lastCell.boundingBox()
      if (!viewport || !cell) throw new Error('Table geometry is unavailable')
      return cell.x + cell.width - viewport.x - viewport.width
    })
    .toBeLessThanOrEqual(1)

  await expect
    .poll(
      async () => {
        await page.keyboard.press('ArrowLeft')
        return region.evaluate(node => node.scrollLeft)
      },
      { intervals: [30], timeout: 15_000 },
    )
    .toBeLessThanOrEqual(1)
  await page.keyboard.press('Tab')
  await expect(region).not.toBeFocused()
}
