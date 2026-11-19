import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test'

/** Reach the control through sequential keyboard navigation, including traps. */
export async function tabTo(page: Page, target: Locator, backwards = false) {
  await expect(target).toBeEnabled()
  for (let step = 0; step < 100; step++) {
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab')
    if (await target.evaluate(element => element === document.activeElement))
      return
  }
  throw new Error(
    `Keyboard navigation did not reach ${await target.ariaSnapshot()}`,
  )
}

/** Inspect painted pixels on all four sides, so a clipped outline fails too. */
export async function expectPaintedFocus(
  page: Page,
  target: Locator,
  testInfo: TestInfo,
  label: string,
) {
  const outlineWidth = 2
  const outlineOffset = 3
  await expect(target).toBeFocused()
  await expect(target).toHaveCSS('outline-style', 'solid')
  await expect(target).toHaveCSS('outline-width', `${outlineWidth}px`)
  await expect(target).toHaveCSS('outline-offset', `${outlineOffset}px`)
  await expect(target).toHaveCSS('forced-color-adjust', 'auto')
  expect(
    await target.evaluate(element => element.matches(':focus-visible')),
  ).toBe(true)
  await target.scrollIntoViewIfNeeded()
  // Screenshot waits for fonts and finishes finite transitions before sampling.
  const screenshot = await page.screenshot({ animations: 'disabled' })
  const box = await target.boundingBox()
  if (!box) throw new Error('Focused control has no bounds')
  const samples = await page.evaluate(
    async ({ data, box, outlineExtent }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      if (
        box.x - outlineExtent < 0 ||
        box.y - outlineExtent < 0 ||
        box.x + box.width + outlineExtent > canvas.width ||
        box.y + box.height + outlineExtent > canvas.height
      ) {
        throw new Error(
          `Focus outline extends outside the ${canvas.width} × ${canvas.height} screenshot`,
        )
      }
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.drawImage(image, 0, 0)
      const pixel = (x: number, y: number) => {
        const sampleX = Math.floor(x)
        const sampleY = Math.floor(y)
        if (
          sampleX < 0 ||
          sampleX >= canvas.width ||
          sampleY < 0 ||
          sampleY >= canvas.height
        ) {
          throw new Error(
            `Focus contrast sample (${sampleX}, ${sampleY}) is outside the ${canvas.width} × ${canvas.height} screenshot`,
          )
        }
        return Array.from(
          context.getImageData(sampleX, sampleY, 1, 1).data,
        ).slice(0, 3)
      }
      const luminance = (rgb: number[]) =>
        rgb
          .map(value => {
            const s = value / 255
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          })
          .reduce(
            (sum, value, index) =>
              sum + value * [0.2126, 0.7152, 0.0722][index],
            0,
          )
      return [
        { name: 'top', x: box.x + box.width / 2, y: box.y, dx: 0, dy: -1 },
        {
          name: 'bottom',
          x: box.x + box.width / 2,
          y: box.y + box.height,
          dx: 0,
          dy: 1,
        },
        { name: 'left', x: box.x, y: box.y + box.height / 2, dx: -1, dy: 0 },
        {
          name: 'right',
          x: box.x + box.width,
          y: box.y + box.height / 2,
          dx: 1,
          dy: 0,
        },
      ].map(({ name, x, y, dx, dy }) => {
        const outline = pixel(x + dx * 4, y + dy * 4)
        const background = pixel(x + dx * 7, y + dy * 7)
        const a = luminance(outline)
        const b = luminance(background)
        return {
          name,
          outline,
          background,
          contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        }
      })
    },
    {
      data: screenshot.toString('base64'),
      box,
      outlineExtent: outlineWidth + outlineOffset,
    },
  )
  await testInfo.attach(`${label}-contrast`, {
    body: JSON.stringify(samples, null, 2),
    contentType: 'application/json',
  })
  // Forced colors can substitute system colors at paint time. Measure the
  // visible outline rather than requiring computed and painted RGB to match.
  for (const side of samples) {
    expect(
      side.contrast,
      `${label} ${side.name}: adjacent contrast`,
    ).toBeGreaterThanOrEqual(3)
  }
}
