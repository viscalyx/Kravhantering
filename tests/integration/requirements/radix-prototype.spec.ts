import { expect, type Locator, type Page, test } from '@playwright/test'

const RADIX_PROTOTYPE_MODE_STORAGE_KEY = 'requirements.radixPrototype.mode.v1'

async function openColumnPicker(page: Page) {
  const trigger = page.locator('[data-column-picker-trigger="true"]')
  await expect(trigger).toBeVisible()
  await trigger.click()
  const popover = page.locator(
    '[data-column-picker-popover="true"][data-radix-themes-popover="true"]',
  )
  await expect(popover).toBeVisible()
  return { popover, trigger }
}

async function expectPopoverClosesWithFocusReturn(
  page: Page,
  trigger: Locator,
  popover: Locator,
) {
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(trigger).toBeFocused()
}

test.describe('Requirements Radix prototype', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(storageKey => {
      globalThis.localStorage.clear()
      globalThis.localStorage.setItem(storageKey, 'themes')
      globalThis.localStorage.setItem('theme', 'dark')
    }, RADIX_PROTOTYPE_MODE_STORAGE_KEY)
  })

  test.use({ viewport: { height: 720, width: 1280 } })

  test('REQ-RADIX-01: switches the kravbibliotek workbench, table, and navigation to real Radix Themes', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')

    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()

    const prototypeSwitch = page.locator('[data-radix-prototype-switch="true"]')
    await expect(prototypeSwitch).toBeVisible()
    const switchBox = await prototypeSwitch.boundingBox()
    const viewport = page.viewportSize()
    expect(switchBox).not.toBeNull()
    expect(viewport).not.toBeNull()
    if (switchBox && viewport) {
      expect(switchBox.x + switchBox.width).toBeGreaterThan(viewport.width - 40)
      expect(switchBox.y + switchBox.height).toBeGreaterThan(
        viewport.height - 40,
      )
    }

    await expect(
      page.locator('[data-radix-themes-workbench="true"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-requirements-table-visual-mode="radix-themes"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-global-navigation-rail="desktop"]'),
    ).toHaveAttribute('data-radix-themes-navigation', 'true')

    await prototypeSwitch.getByRole('radio', { name: 'Lokalt' }).click()
    await expect(
      page.locator('[data-requirements-table-visual-mode="local"]'),
    ).toBeVisible()

    await prototypeSwitch.getByRole('radio', { name: 'Themes' }).click()
    await expect(
      page.locator('[data-requirements-table-visual-mode="radix-themes"]'),
    ).toBeVisible()
  })

  test('REQ-RADIX-02: uses Radix Themes popovers for search, multi-select, grouped filters, and columns', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()

    const requirementIdFilter = page.getByRole('button', {
      name: 'Filtrera efter Krav-ID',
    })
    await requirementIdFilter.click()
    await expect(
      page.locator(
        '[data-filter-popover="requirement id"][data-radix-themes-popover="true"]',
      ),
    ).toBeVisible()
    await expectPopoverClosesWithFocusReturn(
      page,
      requirementIdFilter,
      page.locator('[data-filter-popover="requirement id"]'),
    )

    const areaFilter = page.getByRole('button', {
      name: 'Filtrera efter Kravområde',
    })
    await areaFilter.click()
    await expect(
      page.locator(
        '[data-filter-popover="area"][data-radix-themes-popover="true"]',
      ),
    ).toBeVisible()
    await expectPopoverClosesWithFocusReturn(
      page,
      areaFilter,
      page.locator('[data-filter-popover="area"]'),
    )

    const { popover: columnPopover, trigger: columnTrigger } =
      await openColumnPicker(page)
    const qualityCharacteristicCheckbox = columnPopover.locator(
      '[data-column-picker-option="qualityCharacteristic"] input[type="checkbox"]',
    )
    if (!(await qualityCharacteristicCheckbox.isChecked())) {
      await qualityCharacteristicCheckbox.check()
    }
    await expectPopoverClosesWithFocusReturn(page, columnTrigger, columnPopover)

    const qualityCharacteristicFilter = page.getByRole('button', {
      name: 'Filtrera efter Kvalitetsegenskap',
    })
    await qualityCharacteristicFilter.click()
    await expect(
      page.locator(
        '[data-filter-popover="quality characteristic"][data-radix-themes-popover="true"]',
      ),
    ).toBeVisible()
    await expectPopoverClosesWithFocusReturn(
      page,
      qualityCharacteristicFilter,
      page.locator('[data-filter-popover="quality characteristic"]'),
    )
  })

  test('REQ-RADIX-03: uses Radix Themes dropdown menus with keyboard focus return', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()

    const reportsTrigger = page.getByRole('button', { name: 'Rapporter' })
    await reportsTrigger.focus()
    await page.keyboard.press('Enter')

    const reportsMenu = page.locator(
      '[data-floating-action-menu="reports"][data-radix-themes-menu="true"]',
    )
    await expect(reportsMenu).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: 'Kravlista' }),
    ).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(reportsMenu).toBeHidden()
    await expect(reportsTrigger).toBeFocused()
  })
})
