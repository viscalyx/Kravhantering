import { expect, test } from '@playwright/test'

// Keep this in sync with getRequirementColumnWidthsStorageKey('sv')
// in lib/requirements/list-view.ts.
const DESCRIPTION_COLUMN_WIDTHS_STORAGE_KEY = 'kravkatalog.columnWidths.v2.sv'

const viewportVariants = [
  {
    name: 'mobile',
    viewport: { height: 667, width: 375 },
  },
  {
    name: 'desktop',
    viewport: { height: 720, width: 1280 },
  },
] as const

test.describe('Requirements table column resizing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.localStorage.clear()
    })
  })

  for (const { name, viewport } of viewportVariants) {
    test.describe(`${name} viewport`, () => {
      test.use({ viewport })

      test('resizes the description column during rapid dragging without render-loop errors', async ({
        page,
      }) => {
        const consoleErrors: string[] = []
        const pageErrors: string[] = []

        page.on('console', message => {
          if (message.type() === 'error') {
            consoleErrors.push(message.text())
          }
        })
        page.on('pageerror', error => {
          pageErrors.push(error.message)
        })

        await page.goto('/sv/kravkatalog')

        const handle = page
          .locator('[data-column-resize-handle="description"]')
          .first()
        const descriptionColumn = page.locator('colgroup col').nth(1)

        await handle.scrollIntoViewIfNeeded()
        await expect(handle).toBeVisible()

        const beforeWidth = await descriptionColumn.evaluate(
          node => (node as HTMLTableColElement).style.width,
        )
        const box = await handle.boundingBox()

        expect(box).not.toBeNull()
        if (!box) {
          throw new Error(
            'Description resize handle did not expose a bounding box.',
          )
        }

        const startX = box.x + box.width / 2
        const pointerY = box.y + Math.min(box.height / 2, 24)
        const deltas = [56, -28, 88, -20, 104, -12, 128]

        await page.mouse.move(startX, pointerY)
        await page.mouse.down()

        for (const delta of deltas) {
          await page.mouse.move(startX + delta, pointerY, { steps: 3 })
        }

        await page.mouse.up()

        await expect
          .poll(async () =>
            descriptionColumn.evaluate(
              node => (node as HTMLTableColElement).style.width,
            ),
          )
          .not.toBe(beforeWidth)

        await expect
          .poll(async () =>
            page.evaluate(
              storageKey => globalThis.localStorage.getItem(storageKey) ?? '',
              DESCRIPTION_COLUMN_WIDTHS_STORAGE_KEY,
            ),
          )
          .toContain('"description"')

        const renderLoopErrors = [...consoleErrors, ...pageErrors].filter(
          message =>
            /Maximum update depth exceeded|too many re-renders/i.test(message),
        )

        expect(renderLoopErrors).toEqual([])
      })
    })
  }
})
