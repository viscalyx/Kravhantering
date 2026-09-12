import { expect, type Page, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'

const COLUMN_VISIBILITY_STORAGE_KEY = 'requirements.visibleColumns.v5'

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

async function expectStoredVersionColumn(page: Page, visible: boolean) {
  await expect
    .poll(() =>
      page.evaluate(
        storageKey =>
          (globalThis.localStorage.getItem(storageKey) ?? '').includes(
            '"version"',
          ),
        COLUMN_VISIBILITY_STORAGE_KEY,
      ),
    )
    .toBe(visible)
}

test.describe('Requirements table column picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const clearMarker = '__playwright_requirements_columns_cleared__'
      if (globalThis.sessionStorage.getItem(clearMarker) === '1') return
      globalThis.localStorage.clear()
      globalThis.sessionStorage.setItem(clearMarker, '1')
    })
  })

  for (const { name, viewport } of viewportVariants) {
    test.describe(`${name} viewport`, () => {
      test.use({ viewport })

      test('REQ-05: toggles columns and persists the selection', async ({
        page,
      }) => {
        await page.goto('/sv/requirements')

        const trigger = page.locator('[data-column-picker-trigger="true"]')
        await expect(trigger).toBeVisible()
        await trigger.click()

        const popover = page.locator('[data-column-picker-popover="true"]')
        const qualityCharacteristicCheckbox = popover.locator(
          '[data-column-picker-option="qualityCharacteristic"] input[type="checkbox"]',
        )
        const verifiableCheckbox = popover.locator(
          '[data-column-picker-option="verifiable"] input[type="checkbox"]',
        )
        const versionCheckbox = popover.locator(
          '[data-column-picker-option="version"] input[type="checkbox"]',
        )

        await expect(popover).toBeVisible()

        if (!(await qualityCharacteristicCheckbox.isChecked())) {
          await qualityCharacteristicCheckbox.check()
        }
        if (!(await verifiableCheckbox.isChecked())) {
          await verifiableCheckbox.check()
        }

        await expect(popover).toBeVisible()

        if (!(await versionCheckbox.isChecked())) {
          await versionCheckbox.check()
        }
        await expect(versionCheckbox).toBeChecked()

        await trigger.click()

        const versionHeaderLabel = page.locator(
          '[data-requirement-header-label="version"]',
        )

        await expect(versionHeaderLabel).toBeVisible()
        await expect(
          page.getByRole('img', { exact: true, name: 'Verifierbar' }).first(),
        ).toBeVisible()
        await expect(
          page
            .getByRole('img', { exact: true, name: 'Inte verifierbar' })
            .first(),
        ).toBeVisible()

        await trigger.click()
        await expect(popover).toBeVisible()
        await versionCheckbox.uncheck()
        await expect(versionCheckbox).not.toBeChecked()
        await expectStoredVersionColumn(page, false)
        await trigger.click()

        await page.reload()
        await expect(
          page.locator('[data-requirement-header-label="version"]'),
        ).toHaveCount(0)

        await expect(trigger).toBeVisible()
        await trigger.click()
        await expect(popover).toBeVisible()
        await versionCheckbox.check()
        await expect(versionCheckbox).toBeChecked()
        await expectStoredVersionColumn(page, true)
        await trigger.click()

        await page.reload()
        await expect(
          page.locator('[data-requirement-header-label="version"]'),
        ).toBeVisible()

        const storedColumns = await page.evaluate(
          storageKey => globalThis.localStorage.getItem(storageKey) ?? '',
          COLUMN_VISIBILITY_STORAGE_KEY,
        )

        expect(storedColumns).toContain('"qualityCharacteristic"')
        expect(storedColumns).toContain('"verifiable"')
        expect(storedColumns).toContain('"version"')
      })
    })
  }
})

for (const width of [1440, 1920]) {
  for (const navigation of ['collapsed', 'expanded']) {
    for (const theme of ['light', 'dark']) {
      test(`REQ-04 REQ-05: compact headers and wrapping at ${width}, ${navigation}, ${theme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 900 : 1080,
        })
        await page.addInitScript(
          ({ navigation, theme }) => {
            localStorage.setItem(
              'requirements.navigationRail.expanded.v1',
              navigation,
            )
            localStorage.setItem('theme', theme)
          },
          { navigation, theme },
        )
        await test.step('verify default header geometry and controls', async () => {
          await page.goto('/sv/requirements')
          const labels = page.locator('[data-requirement-header-label]')
          await expect(labels).toHaveText([
            'Krav-ID',
            'Kravtext',
            'Kravområde',
            'Kategori',
            'Typ',
            'Status',
          ])
          await page.evaluate(() => document.fonts.ready)
          const geometry = await labels.evaluateAll(nodes =>
            nodes.map(node => {
              const label = node as HTMLElement
              const cell = label.closest('th')
              if (!cell) throw new Error('Missing header cell')
              const rect = label.getBoundingClientRect()
              return {
                label: label.textContent,
                clipped: label.scrollWidth > label.clientWidth,
                clientWidth: label.clientWidth,
                scrollWidth: label.scrollWidth,
                width: cell.getBoundingClientRect().width,
                centre: rect.top + rect.height / 2,
              }
            }),
          )
          await testInfo.attach('default-header-geometry', {
            body: JSON.stringify(geometry, null, 2),
            contentType: 'application/json',
          })
          expect(geometry.filter(item => item.clipped)).toEqual([])
          await expect(
            page.locator('[data-requirement-header-control="area"]'),
          ).toHaveAttribute(
            'data-developer-mode-name',
            'column header controls',
          )
          for (const { label } of geometry) {
            for (const action of ['Sortera efter', 'Filtrera efter']) {
              const name = `${action} ${label}`
              await expect(
                page.getByRole('button', { name, exact: true }),
              ).toHaveAccessibleName(name)
            }
          }
          expect(
            Math.max(...geometry.map(item => item.centre)) -
              Math.min(...geometry.map(item => item.centre)),
          ).toBeLessThanOrEqual(1)
          expect(geometry[1].width).toBeGreaterThanOrEqual(809)
          expect(
            geometry.filter((_, index) => index !== 1).map(item => item.width),
          ).toEqual([118, 148, 130, 131, 144])
          const selection = page.getByRole('checkbox', {
            name: 'Markera alla',
            exact: true,
          })
          const selectionBox = await selection.boundingBox()
          if (!selectionBox) throw new Error('Missing select-all geometry')
          expect(
            Math.abs(
              selectionBox.y + selectionBox.height / 2 - geometry[0].centre,
            ),
          ).toBeLessThanOrEqual(1)
          const controls = page.locator(
            '[data-requirement-header-control] button',
          )
          for (const control of await controls.all()) {
            const box = await control.boundingBox()
            expect(box?.width).toBeGreaterThanOrEqual(28)
            expect(box?.height).toBeGreaterThanOrEqual(28)
          }
          await testInfo.attach('default-view', {
            body: await page.screenshot(),
            contentType: 'image/png',
          })
        })
        await test.step('wrap requirement text with mouse and keyboard', async () => {
          const wrap = page.getByRole('button', {
            name: 'Radbrytning av',
            exact: true,
          })
          await expect(wrap).toHaveText('Radbrytning av')
          await expect(wrap).toHaveAttribute(
            'data-developer-mode-value',
            'wrap requirement text',
          )
          const textCell = page
            .locator('[data-requirements-data-table] tbody tr')
            .first()
            .locator('td')
            .nth(2)
          const content = await textCell.textContent()
          await wrap.click()
          const unwrap = page.getByRole('button', {
            name: 'Radbrytning på',
            exact: true,
          })
          await expect(unwrap).toHaveText('Radbrytning på')
          await expect(unwrap).toHaveAttribute('aria-pressed', 'true')
          await expect(textCell).toHaveCSS('white-space', 'normal')
          await unwrap.focus()
          await page.keyboard.press('Enter')
          await expect(wrap).toHaveAttribute('aria-pressed', 'false')
          await expect(textCell).toHaveText(content ?? '')
          await expect(textCell).toHaveCSS('white-space', 'nowrap')
        })
        await test.step('reach status sorting and filtering after horizontal scrolling', async () => {
          // The approved wide defaults may scroll; both pointer and keyboard
          // users must still be able to reach the rightmost header controls.
          const scroll = page.locator(
            '[data-requirements-scroll-container="true"]',
          )
          await scroll.evaluate(node => {
            node.scrollLeft = node.scrollWidth
          })
          const sort = page.getByRole('button', {
            name: 'Sortera efter Status',
            exact: true,
          })
          await sort.focus()
          await page.keyboard.press('Enter')
          await expect(
            page.locator('[data-requirement-semantic-header-label="status"]'),
          ).toHaveAttribute('aria-sort', 'ascending')
          await page.mouse.move(0, 0)
          await page
            .getByRole('button', { name: 'Filtrera kravpaket', exact: true })
            .press('Escape')
          await expect(
            page.getByRole('group', { name: 'Tillgängliga kravpaket' }),
          ).toHaveCount(0)
          const filter = page.getByRole('button', {
            name: 'Filtrera efter Status',
            exact: true,
          })
          await filter.focus()
          await filter.click({ trial: true })
          await filter.click()
          await expect(
            page.getByRole('checkbox', { name: 'Publicerad', exact: true }),
          ).toBeChecked()
          await page.keyboard.press('Escape')
          const header = page
            .locator('[data-sticky-table-header-table] th')
            .last()
          const body = page
            .locator('[data-requirements-data-table] tbody tr')
            .first()
            .locator('td')
            .last()
          await expect
            .poll(async () => {
              const headerBox = await header.boundingBox()
              const bodyBox = await body.boundingBox()
              if (!headerBox || !bodyBox) return Number.POSITIVE_INFINITY
              return Math.abs(headerBox.x - bodyBox.x)
            })
            .toBeLessThanOrEqual(1)
        })
      })
    }
  }
}

test('REQ-05: optional headers share the row centre and retain their selected widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1710, height: 951 })
  await page.goto('/sv/requirements')
  await test.step('show optional columns using the picker', async () => {
    await page.locator('[data-column-picker-trigger="true"]').click()
    const picker = page.locator('[data-column-picker-popover="true"]')
    await expect(
      picker.getByRole('checkbox', { name: 'Status', exact: true }),
    ).toBeChecked()
    for (const column of [
      'qualityCharacteristic',
      'verifiable',
      'version',
      'normReferences',
    ]) {
      await picker
        .locator(`[data-column-picker-option="${column}"] input`)
        .check()
    }
    await page.locator('[data-column-picker-trigger="true"]').click()
  })
  await test.step('verify optional and sortable headers remain aligned after reload', async () => {
    await page.reload()
    const labels = page.locator('[data-requirement-header-label]')
    await expect(labels).toHaveCount(10)
    const geometry = await labels.evaluateAll(nodes =>
      nodes.map(node => {
        const rect = node.getBoundingClientRect()
        return {
          width: node.closest('th')?.getBoundingClientRect().width,
          centre: rect.top + rect.height / 2,
        }
      }),
    )
    expect(geometry.map(item => item.width)).toEqual([
      118, 809, 148, 130, 131, 189, 144, 124, 85, 200,
    ])
    expect(
      Math.max(...geometry.map(item => item.centre)) -
        Math.min(...geometry.map(item => item.centre)),
    ).toBeLessThanOrEqual(1)
  })
})
