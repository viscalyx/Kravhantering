import { expect, type Page, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'

// Keep this in sync with getRequirementColumnWidthsStorageKey('sv')
// in lib/requirements/list-view.ts.
const DESCRIPTION_COLUMN_WIDTHS_STORAGE_KEY = 'requirements.columnWidths.v5.sv'

const viewportVariants = [
  {
    name: 'mobile',
    viewport: { height: 667, width: 375 },
  },
  {
    name: 'desktop',
    viewport: DESKTOP_VIEWPORT,
  },
] as const

async function openFirstRequirementDetail(page: Page) {
  const firstRow = page.locator('tbody > tr').first()
  // Skip the checkbox td (index 0) — uniqueId is at index 1
  const firstRowUniqueIdCell = firstRow.locator('td').nth(1)
  const secondRow = page.locator('tbody > tr').nth(1)
  const detailCell = page.locator('[data-expanded-detail-cell="true"]').first()

  await expect(firstRow).toBeVisible()
  await expect(secondRow).toBeVisible()
  await expect(firstRowUniqueIdCell).toBeVisible()

  await firstRowUniqueIdCell.click({ position: { x: 24, y: 20 } })
  await expect(detailCell).toBeVisible()

  return { detailCell }
}

async function getScrollY(page: Page) {
  return page.evaluate(() => window.scrollY)
}

test.describe('Requirements table column resizing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.localStorage.clear()
    })
  })

  for (const { name, viewport } of viewportVariants) {
    test.describe(`${name} viewport`, () => {
      test.use({ viewport })

      test('REQ-09: clips resize handles around an expanded detail pane and still resizes', async ({
        page,
      }) => {
        await page.goto('/sv/requirements')
        const { detailCell } = await openFirstRequirementDetail(page)
        const handle = page
          .locator('[data-column-resize-handle="description"]')
          .first()
        const bottomSegment = page
          .locator(
            '[data-column-resize-column="description"][data-column-resize-segment="bottom"]',
          )
          .first()
        const descriptionColumn = page.locator('colgroup col').nth(2)

        await expect(detailCell).toBeVisible()
        await expect(handle).toBeVisible()
        await expect(bottomSegment).toBeVisible()

        const getResizeBoxes = async () => {
          const detailBox = await detailCell.boundingBox()
          const topHandleBox = await handle.boundingBox()
          const bottomSegmentBox = await bottomSegment.boundingBox()

          expect(detailBox).not.toBeNull()
          if (!detailBox) {
            throw new Error(
              'Expanded detail pane did not expose a bounding box.',
            )
          }
          expect(topHandleBox).not.toBeNull()
          if (!topHandleBox) {
            throw new Error('Top resize handle did not expose a bounding box.')
          }
          expect(bottomSegmentBox).not.toBeNull()
          if (!bottomSegmentBox) {
            throw new Error(
              'Bottom resize segment did not expose a bounding box.',
            )
          }

          return { bottomSegmentBox, detailBox, topHandleBox }
        }

        await expect
          .poll(async () => {
            const { bottomSegmentBox, detailBox, topHandleBox } =
              await getResizeBoxes()
            return (
              Math.round(topHandleBox.y + topHandleBox.height) <=
                Math.round(detailBox.y) &&
              Math.round(bottomSegmentBox.y) >=
                Math.round(detailBox.y + detailBox.height) &&
              Math.round(bottomSegmentBox.height) <= 48
            )
          })
          .toBe(true)

        const { bottomSegmentBox, detailBox, topHandleBox } =
          await getResizeBoxes()

        expect(
          Math.round(topHandleBox.y + topHandleBox.height),
        ).toBeLessThanOrEqual(Math.round(detailBox.y))
        expect(Math.round(bottomSegmentBox.y)).toBeGreaterThanOrEqual(
          Math.round(detailBox.y + detailBox.height),
        )
        expect(Math.round(bottomSegmentBox.height)).toBeLessThanOrEqual(48)

        const beforeWidth = await descriptionColumn.evaluate(
          node => (node as HTMLTableColElement).style.width,
        )
        const pointerId = 1
        const startX = bottomSegmentBox.x + bottomSegmentBox.width / 2
        const pointerY =
          bottomSegmentBox.y + Math.min(bottomSegmentBox.height / 2, 24)

        await bottomSegment.dispatchEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: startX,
          clientY: pointerY,
          isPrimary: true,
          pointerId,
          pointerType: 'mouse',
        })
        await page.evaluate(
          ({ endX, pointerId, pointerY }) => {
            window.dispatchEvent(
              new PointerEvent('pointermove', {
                bubbles: true,
                button: 0,
                clientX: endX,
                clientY: pointerY,
                isPrimary: true,
                pointerId,
                pointerType: 'mouse',
              }),
            )
            window.dispatchEvent(
              new PointerEvent('pointerup', {
                bubbles: true,
                button: 0,
                clientX: endX,
                clientY: pointerY,
                isPrimary: true,
                pointerId,
                pointerType: 'mouse',
              }),
            )
          },
          {
            endX: startX + 64,
            pointerId,
            pointerY,
          },
        )

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
      })

      test('REQ-08: scrolls immediately up and down after opening an inline detail pane', async ({
        page,
      }) => {
        await page.goto('/sv/requirements')

        const { detailCell } = await openFirstRequirementDetail(page)

        await expect(detailCell).toBeVisible()

        const detailBox = await detailCell.boundingBox()

        expect(detailBox).not.toBeNull()
        if (!detailBox) {
          throw new Error('Expanded detail pane did not expose a bounding box.')
        }

        const viewportSize = page.viewportSize()
        const viewportHeight = viewportSize?.height ?? viewport.height
        const viewportWidth = viewportSize?.width ?? viewport.width

        // Find a probe point below the detail pane that does not overlap
        // any bottom resize-segment strip.  Segments are narrow vertical
        // strips at column borders; we query their actual positions so the
        // probe is placed in a clear gap between them.
        const probePoint = await page.evaluate(
          ({ detailBottom, vpHeight, vpWidth }) => {
            const bottomSegments = Array.from(
              document.querySelectorAll(
                '[data-column-resize-segment="bottom"]',
              ),
            )
            const rects = bottomSegments.map(s => {
              const r = s.getBoundingClientRect()
              return {
                bottom: r.bottom,
                left: r.left,
                right: r.right,
                top: r.top,
              }
            })
            const maxSegBottom = rects.reduce(
              (m, r) => Math.max(m, r.bottom),
              0,
            )

            // Pick y below the tallest bottom segment, clamped to viewport.
            const candidateY =
              maxSegBottom > 0
                ? Math.round(maxSegBottom + 16)
                : Math.round(detailBottom + 128)
            const y = Math.min(vpHeight - 32, candidateY)

            // Pick x in the horizontal centre; if that overlaps a segment
            // at the chosen y, nudge right past its right edge.
            let x = Math.round(vpWidth / 2)
            for (const r of rects) {
              if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
                x = Math.round(r.right + 8)
                break
              }
            }

            return { x: Math.min(x, vpWidth - 32), y }
          },
          {
            detailBottom: detailBox.y + detailBox.height,
            vpHeight: viewportHeight,
            vpWidth: viewportWidth,
          },
        )

        const targetAtProbe = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y)

          return {
            resizeSegment:
              el?.getAttribute('data-column-resize-segment') ?? null,
            tagName: el?.tagName ?? null,
          }
        }, probePoint)

        expect(targetAtProbe.resizeSegment).toBeNull()

        await page.mouse.move(probePoint.x, probePoint.y)

        const beforeDown = await getScrollY(page)
        await page.mouse.wheel(0, 180)
        await expect.poll(() => getScrollY(page)).toBeGreaterThan(beforeDown)

        const afterDown = await getScrollY(page)
        await page.mouse.move(probePoint.x, probePoint.y)
        await page.mouse.wheel(0, -180)
        await expect.poll(() => getScrollY(page)).toBeLessThan(afterDown)

        const afterUp = await getScrollY(page)
        await page.mouse.move(probePoint.x, probePoint.y)
        await page.mouse.wheel(0, 180)
        await expect.poll(() => getScrollY(page)).toBeGreaterThan(afterUp)
      })
    })
  }
})

test('REQ-09: long requirement text wraps within a reading width in inline and full-page detail', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const longText = `${'Systemet ska stödja ett säkert och spårbart utbyte av information. '.repeat(12)}\n${'referens'.repeat(120)}`
  await page.route(/\/api\/requirements\/(INT0001|1)$/, async route => {
    const response = await route.fetch()
    const body = await response.json()
    for (const version of body.versions) {
      version.description = longText
      version.acceptanceCriteria = longText
    }
    await route.fulfill({ response, json: body })
  })
  await page.goto('/sv/requirements?selected=INT0001')
  const section = page
    .locator(
      '[data-developer-mode-name="detail section"][data-developer-mode-value="requirement text"]',
    )
    .first()
  const assertReadingWidth = async () => {
    await expect(section).toContainText(longText)
    await expect
      .poll(() =>
        section
          .locator('div')
          .first()
          .evaluate(el => {
            const style = getComputedStyle(el)
            return (
              el.getBoundingClientRect().width <= 750 &&
              el.scrollWidth <= el.clientWidth &&
              el.clientHeight > 100 &&
              style.whiteSpace === 'pre-wrap' &&
              style.overflowWrap === 'anywhere'
            )
          }),
      )
      .toBe(true)
  }
  await test.step('read expanded requirement text', assertReadingWidth)
  await test.step('read the full-page requirement text', async () => {
    await page.goto('/sv/requirements/INT0001')
    await assertReadingWidth()
  })
})

test('REQ-05, REQ-09: manual column widths and selection survive reload, navigation and viewport changes', async ({
  page,
}) => {
  const picker = page.locator('[data-column-picker-trigger="true"]')
  const versionOption = page.locator(
    '[data-column-picker-option="version"] input',
  )
  const versionHeader = page
    .locator('[data-requirement-header-label="version"]')
    .first()
  await test.step('REQ-05: show the version column using the column picker', async () => {
    await page.goto('/sv/requirements')
    await picker.click()
    await versionOption.check()
    await picker.click()
    await expect(versionHeader).toHaveText(/\S/)
  })
  const handle = page
    .locator('[data-column-resize-handle="description"]')
    .first()
  const description = page
    .locator('thead th[data-developer-mode-value="requirement text"]')
    .first()
  const getWidth = () =>
    description.evaluate(el => el.getBoundingClientRect().width)
  await test.step('resize the text column with keyboard and mouse', async () => {
    const initialWidth = await getWidth()
    await handle.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(getWidth).toBeGreaterThan(initialWidth)
    const keyboardWidth = await getWidth()
    const box = await handle.boundingBox()
    if (!box) throw new Error('Description resize handle is unavailable')
    await page.mouse.move(box.x + box.width / 2, box.y + 12)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + 12)
    await expect.poll(getWidth).toBeGreaterThan(keyboardWidth + 60)
    await page.mouse.up()
  })
  const savedWidth = await getWidth()
  const saved = await page.evaluate(() => ({
    columns: localStorage.getItem('requirements.visibleColumns.v5'),
    widths: localStorage.getItem('requirements.columnWidths.v5.sv'),
  }))
  await test.step('REQ-05: retain a hidden column after reload and show it again', async () => {
    await picker.click()
    await versionOption.uncheck()
    await picker.click()
    await expect(versionHeader).toHaveCount(0)
    await page.reload()
    await expect(versionHeader).toHaveCount(0)
    await picker.click()
    await expect(versionOption).not.toBeChecked()
    await versionOption.check()
    await picker.click()
    await expect(versionHeader).toHaveText(/\S/)
  })
  await test.step('retain column settings across navigation and viewport changes', async () => {
    await page
      .getByRole('button', { name: 'Expandera navigation', exact: true })
      .click()
    for (const width of [1920, 1440, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(getWidth).toBe(savedWidth)
      await expect(versionHeader).toHaveText(/\S/)
      expect(
        await page.evaluate(() => ({
          columns: localStorage.getItem('requirements.visibleColumns.v5'),
          widths: localStorage.getItem('requirements.columnWidths.v5.sv'),
        })),
      ).toEqual(saved)
    }
    const scroll = page.locator('[data-requirements-scroll-container]')
    await expect
      .poll(() => scroll.evaluate(el => el.scrollWidth > el.clientWidth))
      .toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(375)
  })
})
