import { expect, type Locator, type Page, test } from '@playwright/test'
import { delay, escapeRegExp } from '@/tests/helpers/common'

async function openRequirementDetail(
  page: Page,
  uniqueId = 'INT0001',
): Promise<Locator> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(
      `/sv/requirements?selected=${encodeURIComponent(uniqueId)}`,
      { timeout: 30_000, waitUntil: 'domcontentloaded' },
    )

    try {
      const rowButton = page.getByRole('button', {
        name: new RegExp(`^${escapeRegExp(uniqueId)}\\b`),
      })
      await expect(rowButton).toBeVisible({ timeout: 30_000 })

      const detailPaneId = await rowButton.getAttribute('aria-controls')
      if (!detailPaneId) {
        throw new Error(
          `Requirement row ${uniqueId} has no detail pane target.`,
        )
      }

      const detailPane = page.locator(`#${detailPaneId}`)
      await expect(detailPane).toBeVisible({ timeout: 30_000 })
      return detailPane
    } catch (error) {
      if (attempt === 2) throw error
      await delay(750 * (attempt + 1))
    }
  }

  throw new Error(`Requirement row ${uniqueId} did not load.`)
}

async function filterRequirementId(
  page: Page,
  uniqueId: string,
  locale: 'en' | 'sv' = 'sv',
) {
  const filterButtonName =
    locale === 'en' ? 'Filter by Requirement ID' : 'Filtrera efter Krav-ID'
  const textboxName = locale === 'en' ? 'Requirement ID' : 'Krav-ID'

  await page.getByRole('button', { name: filterButtonName }).click()
  await page.getByRole('textbox', { name: textboxName }).fill(uniqueId)
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', {
      name: new RegExp(`^${escapeRegExp(uniqueId)}\\b`, 'u'),
    }),
  ).toHaveCount(1)
}

async function expectRequirementDetailRoute(
  page: Page,
  path: string,
  expectedUrl: RegExp,
  uniqueId = 'INT0001',
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(path, { timeout: 30_000, waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(expectedUrl, { timeout: 30_000 })

    try {
      await expect(
        page.getByRole('heading', { name: new RegExp(escapeRegExp(uniqueId)) }),
      ).toBeVisible({ timeout: 30_000 })
      return
    } catch (error) {
      if (attempt === 2) throw error
      await delay(750 * (attempt + 1))
    }
  }

  throw new Error(`Requirement detail route ${path} did not load.`)
}

test.describe('Requirements library', () => {
  test.setTimeout(120_000)
  test.use({ viewport: { height: 720, width: 1280 } })

  test('REQ-01: requirements library loads seeded requirements and opens detail metadata', async ({
    page,
  }) => {
    const detailPane = await openRequirementDetail(page, 'INT0001')

    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()
    await expect(detailPane).toContainText('Kravtext')
    await expect(detailPane).toContainText('Kravområde')
  })

  test('REQ-01: an invalid continuation cursor refreshes and announces the list', async ({
    page,
  }) => {
    let firstPageRequests = 0
    await page.goto('/sv/requirements')
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()
    const baseline = await page.evaluate(async () => {
      const response = await fetch(
        '/api/requirements?limit=200&locale=sv&sortBy=uniqueId&sortDirection=desc&statuses=3',
      )
      if (!response.ok) {
        throw new Error(
          `Failed to load cursor test baseline: ${response.status}`,
        )
      }
      return (await response.json()) as {
        pagination: Record<string, unknown>
        requirements: unknown[]
      }
    })

    await page.route('**/api/requirements?*', async route => {
      const requestUrl = new URL(route.request().url())
      if (requestUrl.searchParams.has('cursor')) {
        await route.fulfill({
          contentType: 'application/json',
          json: { code: 'invalid_cursor', error: 'Invalid cursor' },
          status: 400,
        })
        return
      }

      firstPageRequests += 1
      if (firstPageRequests === 1) {
        await route.fulfill({
          json: {
            ...baseline,
            pagination: {
              ...baseline.pagination,
              hasMore: true,
              nextCursor: 'stale-cursor',
            },
          },
        })
        return
      }

      await route.fulfill({ json: baseline })
    })

    await page.getByRole('button', { name: 'Sortera efter Krav-ID' }).click()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    await expect(
      page.getByRole('status').filter({
        hasText: 'Kravlistan ändrades och lästes in på nytt från början.',
      }),
    ).toBeVisible({ timeout: 30_000 })
    expect(firstPageRequests).toBeGreaterThanOrEqual(2)
  })

  test('REQ-02: language switch keeps the requirements table usable', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Byt språk' }).click()
    await expect(page).toHaveURL(/\/en\/requirements$/)
    await expect(
      page.getByRole('table', { name: 'Requirements list' }),
    ).toBeVisible()
    await filterRequirementId(page, 'INT0001', 'en')

    await page.getByRole('button', { name: 'Switch language' }).click()
    await expect(page).toHaveURL(/\/sv\/requirements$/)
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()
  })

  test('REQ-03: requirement filters and the package chooser preserve keyboard focus and OR queries', async ({
    page,
  }, testInfo) => {
    const developerModeMarkersEnabled =
      testInfo.config.configFile?.endsWith('playwright.prodlike.config.ts') !==
      true
    const band = page.getByRole('group', { exact: true, name: 'Kravpaket' })
    const trigger = band.getByRole('button', {
      name: 'Filtrera kravpaket',
    })
    const packageFilterTitle = band.locator(
      '[data-requirement-package-filter-title="true"]',
    )
    const packageFilterDivider = band.locator(
      '[data-requirement-package-filter-divider="true"]',
    )
    const packageFilterSelections = band.locator(
      '[data-requirement-package-filter-selections="true"]',
    )
    let availableButtons: Locator
    let chooser: Locator

    await test.step('verify filter presentation and static package controls', async () => {
      await page.goto('/sv/requirements')

      await page.getByRole('button', { name: 'Filtrera efter Krav-ID' }).click()
      await page.getByRole('textbox', { name: 'Krav-ID' }).fill('INT0001')
      await page.keyboard.press('Enter')

      await expect(
        page.getByRole('button', { name: /^INT0001\b/ }),
      ).toHaveCount(1)
      await expect(
        page.getByRole('button', { name: /^INT0002\b/ }),
      ).toHaveCount(0)

      await page.getByRole('button', { name: 'Ta bort INT0001' }).click()
      await expect(
        page.getByRole('button', { name: 'Ta bort INT0001' }),
      ).toHaveCount(0)

      await expect(band).toContainText('Inget kravpaketsfilter aktivt')
      if (developerModeMarkersEnabled) {
        await expect(band).toHaveAttribute(
          'data-developer-mode-name',
          'requirements package filter',
        )
      }
      await expect(packageFilterTitle).toHaveText('Kravpaket')
      await expect(packageFilterDivider).toHaveAttribute(
        'data-requirement-package-filter-divider',
        'true',
      )
      await expect(packageFilterSelections).toContainText(
        'Inget kravpaketsfilter aktivt',
      )
      await expect
        .poll(() =>
          packageFilterTitle.evaluate(
            title =>
              title.nextElementSibling?.querySelector(
                'button[aria-controls]',
              ) !== null,
          ),
        )
        .toBe(true)
      const packageTitleFontSize = await packageFilterTitle.evaluate(
        title => getComputedStyle(title).fontSize,
      )
      const columnTitleFontSize = await page
        .locator('[data-requirement-header-label="uniqueId"]')
        .evaluate(title => getComputedStyle(title).fontSize)
      expect(packageTitleFontSize).toBe(columnTitleFontSize)
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger).toHaveAttribute('aria-controls')
      if (developerModeMarkersEnabled) {
        await expect(trigger).toHaveAttribute(
          'data-developer-mode-name',
          'filter button',
        )
        await expect(trigger).toHaveAttribute(
          'data-developer-mode-value',
          'requirement package',
        )
      }
    })

    await test.step('open and dismiss the chooser with pointer interactions', async () => {
      await band.hover()
      chooser = page.getByRole('group', {
        name: 'Tillgängliga kravpaket',
      })
      await expect(chooser).toBeVisible()
      if (developerModeMarkersEnabled) {
        await expect(chooser).toHaveAttribute(
          'data-developer-mode-name',
          'requirements package chooser',
        )
      }
      availableButtons = chooser.getByRole('button')
      const availableNames = (await availableButtons.allTextContents()).map(
        name => name.trim(),
      )
      expect(availableNames.length).toBeGreaterThan(3)
      expect(availableNames).toEqual(
        [...availableNames].sort((left, right) =>
          left.localeCompare(right, 'sv', { sensitivity: 'base' }),
        ),
      )
      await expect(availableButtons.first()).toHaveAttribute(
        'aria-pressed',
        'false',
      )
      const tooltipPackageName = availableNames[0] as string
      await availableButtons.first().hover()
      const packageTooltip = page.getByRole('tooltip')
      await expect(packageTooltip).toContainText(tooltipPackageName)
      await expect(packageTooltip).toHaveAttribute('popover', 'manual')
      await expect
        .poll(() =>
          packageTooltip.evaluate(element => element.matches(':popover-open')),
        )
        .toBe(true)

      await page.mouse.move(0, 0)
      await expect(chooser).toHaveCount(0)
    })

    await test.step('navigate the chooser with the keyboard', async () => {
      await trigger.focus()
      await page.keyboard.press('Enter')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      chooser = page.getByRole('group', { name: 'Tillgängliga kravpaket' })
      await expect(chooser).toBeVisible()
      await trigger.focus()
      await page.keyboard.press('Tab')
      await expect(chooser.locator('button:focus')).toHaveCount(1)
      await chooser.getByRole('button').first().focus()
      await page.keyboard.press('Shift+Tab')
      await expect(trigger).toBeFocused()
    })

    await test.step('mutate package selections and preserve focus', async () => {
      const selectedPackageIds: string[] = []
      const selectedPackageNames: string[] = []
      for (let selectionIndex = 0; selectionIndex < 3; selectionIndex += 1) {
        availableButtons = chooser.getByRole('button')
        const addButton = availableButtons.first()
        const packageId = await addButton.getAttribute(
          'data-requirement-package',
        )
        const packageName = (await addButton.textContent())?.trim()
        const nextButtonName = (
          await availableButtons.nth(1).textContent()
        )?.trim()
        expect(packageId).not.toBeNull()
        expect(packageName).toBeTruthy()
        expect(nextButtonName).toBeTruthy()

        const requestPromise = page.waitForRequest(request => {
          const url = new URL(request.url())
          return (
            url.pathname === '/api/requirements' &&
            url.searchParams
              .getAll('requirementPackageIds')
              .includes(packageId as string)
          )
        })
        await addButton.click()
        const filterRequest = await requestPromise
        selectedPackageIds.push(packageId as string)
        selectedPackageNames.push(packageName as string)
        expect(
          new URL(filterRequest.url()).searchParams.getAll(
            'requirementPackageIds',
          ),
        ).toEqual(selectedPackageIds)

        await expect(
          band.getByRole('button', {
            name: `Ta bort ${packageName} från kravpaketsfiltret`,
          }),
        ).toHaveAttribute('aria-pressed', 'true')
        await expect(
          chooser.getByRole('button', {
            name: `Lägg till ${nextButtonName} i kravpaketsfiltret`,
          }),
        ).toBeFocused()
        await expect(
          page
            .locator('p[aria-live="polite"]')
            .filter({ hasText: `${packageName} har lagts till` }),
        ).toHaveCount(1)
        await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      }

      const selectedButtons = band.getByRole('button', {
        name: /^Ta bort .+ från kravpaketsfiltret$/u,
      })
      await expect(selectedButtons).toHaveCount(3)
      expect(
        (await selectedButtons.allTextContents()).map(name => name.trim()),
      ).toEqual(
        [...selectedPackageNames].sort((left, right) =>
          left.localeCompare(right, 'sv', { sensitivity: 'base' }),
        ),
      )
      await expect(
        trigger.locator('[data-filter-count-badge="true"]'),
      ).toHaveText('3')
      const [titleBox, dividerBox, selectedPackageBox, compactBandBox] =
        await Promise.all([
          packageFilterTitle.boundingBox(),
          packageFilterDivider.boundingBox(),
          selectedButtons.first().boundingBox(),
          band.boundingBox(),
        ])
      expect(titleBox).not.toBeNull()
      expect(dividerBox).not.toBeNull()
      expect(selectedPackageBox).not.toBeNull()
      expect(compactBandBox).not.toBeNull()
      expect(selectedPackageBox?.x ?? 0).toBeGreaterThan(dividerBox?.x ?? 0)
      expect(
        Math.abs(
          (titleBox?.y ?? 0) +
            (titleBox?.height ?? 0) / 2 -
            ((selectedPackageBox?.y ?? 0) +
              (selectedPackageBox?.height ?? 0) / 2),
        ),
      ).toBeLessThanOrEqual(1)
      expect(
        compactBandBox?.height ?? Number.POSITIVE_INFINITY,
      ).toBeLessThanOrEqual(48)

      const nextSelectedName = (
        await selectedButtons.nth(2).textContent()
      )?.trim()
      await selectedButtons.nth(1).click()
      await expect(
        band.getByRole('button', {
          name: `Ta bort ${nextSelectedName} från kravpaketsfiltret`,
        }),
      ).toBeFocused()

      await band.getByRole('button', { name: 'Rensa alla kravpaket' }).click()
      await expect(trigger).toBeFocused()
      await expect(band).toContainText('Inget kravpaketsfilter aktivt')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    await test.step('close the chooser with keyboard and focus transitions', async () => {
      await page.keyboard.press('Enter')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await page.keyboard.press('Space')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Escape')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger).toBeFocused()

      await trigger.click()
      const destination = page.getByRole('button', {
        name: 'Kolumner',
      })
      await destination.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(destination).toBeFocused()
      await page.keyboard.press('Escape')
    })

    await test.step('combine archived status and historical package queries', async () => {
      await filterRequirementId(page, 'INT0002')
      await page.getByRole('button', { name: 'Ta bort INT0002' }).click()

      await page
        .getByRole('button', { name: 'Filtrera efter Kravversionsstatus' })
        .click()
      await page.getByRole('button', { name: 'Rensa' }).click()
      const archivedStatusRequest = page.waitForRequest(request => {
        const url = new URL(request.url())
        return (
          url.pathname === '/api/requirements' &&
          url.searchParams.getAll('statuses').length === 1
        )
      })
      await page.getByRole('checkbox', { name: 'Arkiverad' }).check()
      const archivedRequest = await archivedStatusRequest
      expect(
        new URL(archivedRequest.url()).searchParams.getAll('statuses'),
      ).toHaveLength(1)

      await trigger.click()
      chooser = page.getByRole('group', { name: 'Tillgängliga kravpaket' })
      const historicalPackage = chooser.getByRole('button', {
        name: /PWT-MANUAL källpaket/u,
      })
      const historicalPackageId = await historicalPackage.getAttribute(
        'data-requirement-package',
      )
      expect(historicalPackageId).toBe('920001')

      const historicalPackageRequest = page.waitForRequest(request => {
        const url = new URL(request.url())
        return (
          url.pathname === '/api/requirements' &&
          url.searchParams
            .getAll('requirementPackageIds')
            .includes(historicalPackageId ?? '') &&
          url.searchParams.getAll('statuses').length === 1
        )
      })
      await historicalPackage.click()
      await historicalPackageRequest
      await expect(
        page.getByRole('button', { name: /^PWT-LIFE-RESTORE\b/u }),
      ).toHaveCount(1)
    })
  })

  test('REQ-03: column-search clear control keeps a 24 CSS-pixel target at responsive widths', async ({
    page,
  }) => {
    for (const viewport of [
      { height: 720, width: 1280 },
      { height: 720, width: 375 },
      { height: 320, width: 375 },
    ]) {
      await test.step(`configure the ${viewport.width} by ${viewport.height} viewport`, async () => {
        await page.setViewportSize(viewport)
        await page.goto('/sv/requirements')
        await page.mouse.move(0, 0)
        await page.keyboard.press('Escape')

        await page
          .getByRole('button', { name: 'Filtrera efter Krav-ID' })
          .click()
        const textbox = page.getByRole('textbox', { name: 'Krav-ID' })
        await textbox.fill('INT0001')
      })

      await test.step('verify and activate the column-filter target size', async () => {
        const textbox = page.getByRole('textbox', { name: 'Krav-ID' })
        const clearButton = page.getByRole('button', { name: 'Rensa' })
        await expect(clearButton).toBeVisible()

        const clearButtonBox = await clearButton.boundingBox()
        expect(clearButtonBox).not.toBeNull()
        expect(clearButtonBox?.height ?? 0).toBeGreaterThanOrEqual(24)
        expect(clearButtonBox?.width ?? 0).toBeGreaterThanOrEqual(24)

        await clearButton.click()
        await expect(textbox).toHaveValue('')
      })

      const band = page.getByRole('group', {
        exact: true,
        name: 'Kravpaket',
      })
      const trigger = band.getByRole('button', {
        name: 'Filtrera kravpaket',
      })
      const chooser = page.getByRole('group', {
        name: 'Tillgängliga kravpaket',
      })

      await test.step('position the package chooser within the viewport', async () => {
        await trigger.click()
        const bandBox = await band.boundingBox()
        const chooserBox = await chooser.boundingBox()
        expect(bandBox).not.toBeNull()
        expect(chooserBox).not.toBeNull()
        expect((bandBox?.x ?? -1) >= 0).toBe(true)
        expect((bandBox?.x ?? 0) + (bandBox?.width ?? 0)).toBeLessThanOrEqual(
          viewport.width,
        )
        expect((chooserBox?.x ?? -1) >= 0).toBe(true)
        expect(
          (chooserBox?.x ?? 0) + (chooserBox?.width ?? 0),
        ).toBeLessThanOrEqual(viewport.width)
        expect(Math.abs((chooserBox?.width ?? 0) - (bandBox?.width ?? 0))).toBe(
          0,
        )
      })

      await test.step('verify package-filter target sizes', async () => {
        const packageButton = chooser.getByRole('button').first()
        const packageButtonBox = await packageButton.boundingBox()
        const triggerBox = await trigger.boundingBox()
        expect(
          Math.round(packageButtonBox?.height ?? 0),
        ).toBeGreaterThanOrEqual(24)
        expect(Math.round(packageButtonBox?.width ?? 0)).toBeGreaterThanOrEqual(
          24,
        )
        expect(Math.round(triggerBox?.height ?? 0)).toBeGreaterThanOrEqual(24)
        expect(Math.round(triggerBox?.width ?? 0)).toBeGreaterThanOrEqual(24)
      })

      if (viewport.height === 320) {
        let selectedButtons: Locator

        await test.step('wrap available and selected packages across rows', async () => {
          const chooserMetrics = await chooser.evaluate(element => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          }))
          expect(chooserMetrics.scrollHeight).toBeGreaterThan(
            chooserMetrics.clientHeight,
          )
          const chooserRows = await chooser
            .getByRole('button')
            .evaluateAll(
              buttons =>
                new Set(
                  buttons.map(button =>
                    Math.round(button.getBoundingClientRect().top),
                  ),
                ).size,
            )
          expect(chooserRows).toBeGreaterThan(1)

          for (
            let selectionIndex = 0;
            selectionIndex < 7;
            selectionIndex += 1
          ) {
            await chooser.getByRole('button').first().click()
          }
          selectedButtons = band.getByRole('button', {
            name: /^Ta bort .+ från kravpaketsfiltret$/u,
          })
          await expect(selectedButtons).toHaveCount(7)
          const selectedRows = await selectedButtons.evaluateAll(
            buttons =>
              new Set(
                buttons.map(button =>
                  Math.round(button.getBoundingClientRect().top),
                ),
              ).size,
          )
          expect(selectedRows).toBeGreaterThan(1)
        })

        await test.step('reposition the chooser below the grown package band', async () => {
          const grownBandBox = await band.boundingBox()
          await expect
            .poll(async () => {
              const [currentBandBox, currentChooserBox] = await Promise.all([
                band.boundingBox(),
                chooser.boundingBox(),
              ])
              return Math.abs(
                (currentChooserBox?.y ?? 0) -
                  ((currentBandBox?.y ?? 0) + (currentBandBox?.height ?? 0)),
              )
            })
            .toBeLessThanOrEqual(1)
          const tableHeaderBox = await page
            .locator('[data-sticky-table-header="true"]')
            .boundingBox()
          expect(tableHeaderBox?.y ?? 0).toBeGreaterThanOrEqual(
            (grownBandBox?.y ?? 0) + (grownBandBox?.height ?? 0),
          )
        })

        await test.step('dismiss the tooltip after removing its package', async () => {
          const previousSelectedButton = selectedButtons.nth(5)
          const lastSelectedButton = selectedButtons.nth(6)
          await lastSelectedButton.hover()
          await expect(page.getByRole('tooltip')).toBeVisible()
          await lastSelectedButton.click()
          await expect(previousSelectedButton).toBeFocused()
          await expect(page.getByRole('tooltip')).toHaveCount(0)
        })
      }

      await test.step('close the chooser before the next viewport', async () => {
        await page.keyboard.press('Escape')
        await expect(chooser).toHaveCount(0)
      })
    }
  })

  test('REQ-03: empty, all-selected, localized, and focus-exit package states remain understandable', async ({
    page,
  }) => {
    let band: Locator
    let chooser: Locator
    let releaseCatalog: (() => void) | undefined
    let trigger: Locator
    const catalogGate = new Promise<void>(resolve => {
      releaseCatalog = resolve
    })

    await test.step('keep package controls hidden while the catalog is loading', async () => {
      await page.route('**/api/requirement-packages', async route => {
        await catalogGate
        await route.fulfill({ json: { requirementPackages: [] } })
      })
      await page.goto('/sv/requirements')

      await expect(
        page.getByRole('button', { name: 'Filtrera efter Krav-ID' }),
      ).toHaveCount(1)
      await expect(
        page.getByRole('group', { exact: true, name: 'Kravpaket' }),
      ).toHaveCount(0)
    })

    await test.step('show a disabled package filter for an empty catalog', async () => {
      releaseCatalog?.()

      band = page.getByRole('group', {
        exact: true,
        name: 'Kravpaket',
      })
      await expect(band).toContainText(
        'Det finns inga kravpaket att filtrera på',
      )
      await expect(
        band.getByRole('button', { name: 'Filtrera kravpaket' }),
      ).toBeDisabled()
    })

    await test.step('hide package controls when catalog loading fails', async () => {
      await page.unroute('**/api/requirement-packages')
      await page.route('**/api/requirement-packages', async route => {
        await route.fulfill({
          json: { error: 'Package catalog unavailable' },
          status: 500,
        })
      })
      await page.reload()
      await expect(
        page.getByRole('group', { exact: true, name: 'Kravpaket' }),
      ).toHaveCount(0)
    })

    await test.step('select every package in stable localized order', async () => {
      await page.unroute('**/api/requirement-packages')
      await page.route('**/api/requirement-packages', async route => {
        await route.fulfill({
          json: {
            requirementPackages: [
              {
                id: 2,
                name: 'Alfa',
                purposeAndScope: 'Det andra likvärdiga namnet.',
              },
              {
                id: 1,
                name: 'alfa',
                purposeAndScope: null,
              },
            ],
          },
        })
      })
      await page.reload()

      band = page.getByRole('group', { exact: true, name: 'Kravpaket' })
      trigger = band.getByRole('button', { name: 'Filtrera kravpaket' })
      await trigger.click()
      chooser = page.getByRole('group', {
        name: 'Tillgängliga kravpaket',
      })
      const stableOrder = await chooser
        .getByRole('button')
        .evaluateAll(buttons =>
          buttons.map(button =>
            button.getAttribute('data-requirement-package'),
          ),
        )
      expect(stableOrder).toEqual(['1', '2'])

      await chooser.getByRole('button').first().click()
      await chooser.getByRole('button').first().click()
      await expect(chooser).toContainText('Alla kravpaket är valda.')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    await test.step('close the chooser when focus exits the package controls', async () => {
      await band.getByRole('button', { name: 'Rensa alla kravpaket' }).click()
      await trigger.click()
      await trigger.click()
      chooser = page.getByRole('group', { name: 'Tillgängliga kravpaket' })
      await chooser.getByRole('button').first().focus()
      await page.getByRole('button', { name: 'Filtrera efter Krav-ID' }).focus()
      await expect(chooser).toHaveCount(0)
    })

    await test.step('localize package controls after switching to English', async () => {
      await page.getByRole('button', { name: 'Byt språk' }).click()
      await expect(page).toHaveURL(/\/en\/requirements$/)
      band = page.getByRole('group', {
        exact: true,
        name: 'Requirements packages',
      })
      await expect(band).toContainText('No requirements package filter active')
      trigger = band.getByRole('button', {
        name: 'Filter requirements packages',
      })
      await trigger.click()
      await expect(
        page.getByRole('group', { name: 'Available requirements packages' }),
      ).toHaveCount(1)
    })
  })

  test('REQ-04: sortable requirement columns update the sort direction', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')

    const descriptionHeader = page.locator(
      '[data-requirement-semantic-header-label="description"]',
    )
    const descriptionSortButton = page.getByRole('button', {
      name: 'Sortera efter Kravtext',
    })
    const getVisibleRows = () =>
      page
        .getByRole('table', { name: 'Lista över krav' })
        .getByRole('row')
        .evaluateAll(rows =>
          rows
            .slice(1)
            .map(row => row.textContent?.replace(/\s+/g, ' ').trim() ?? '')
            .filter(Boolean),
        )

    await descriptionSortButton.click()
    await expect(descriptionHeader).toHaveAttribute('aria-sort', 'ascending')
    const ascendingRows = await getVisibleRows()
    await descriptionSortButton.click()
    await expect(descriptionHeader).toHaveAttribute('aria-sort', 'descending')
    await expect.poll(getVisibleRows).not.toEqual(ascendingRows)
  })

  test('REQ-04: cursor boundaries match an equivalent larger page for every sort', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')
    const result = await page.evaluate(async () => {
      const sorts = [
        'uniqueId',
        'description',
        'area',
        'category',
        'type',
        'qualityCharacteristic',
        'priorityLevel',
        'status',
        'version',
      ]
      const failures: string[] = []

      async function loadPage(
        sortBy: string,
        sortDirection: 'asc' | 'desc',
        limit: number,
        cursor?: string,
      ) {
        const params = new URLSearchParams({
          limit: String(limit),
          locale: 'sv',
          sortBy,
          sortDirection,
        })
        if (cursor) params.set('cursor', cursor)
        const response = await fetch(`/api/requirements?${params}`)
        if (!response.ok) {
          throw new Error(
            `${sortBy}/${sortDirection}: ${response.status} ${await response.text()}`,
          )
        }
        return (await response.json()) as {
          pagination: { nextCursor: string | null }
          requirements: Array<{ id: number }>
        }
      }

      for (const sortBy of sorts) {
        for (const sortDirection of ['asc', 'desc'] as const) {
          const reference = await loadPage(sortBy, sortDirection, 4)
          const first = await loadPage(sortBy, sortDirection, 1)
          const second = first.pagination.nextCursor
            ? await loadPage(
                sortBy,
                sortDirection,
                3,
                first.pagination.nextCursor,
              )
            : { pagination: { nextCursor: null }, requirements: [] }
          const expected = reference.requirements.map(row => row.id)
          const actual = [...first.requirements, ...second.requirements].map(
            row => row.id,
          )
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            failures.push(`${sortBy}/${sortDirection}`)
          }
        }
      }

      return failures
    })

    expect(result).toEqual([])
  })

  test('REQ-18: complete CSV export uses the dedicated unpaged endpoint', async ({
    page,
  }) => {
    const exportedIds = Array.from(
      { length: 205 },
      (_, index) => `EXP${String(index + 1).padStart(4, '0')}`,
    )
    let exportUrl: URL | undefined
    let releaseExport: (() => void) | undefined
    const exportGate = new Promise<void>(resolve => {
      releaseExport = resolve
    })
    await page.goto('/sv/requirements')
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()

    await page.route('**/api/requirements/export?*', async route => {
      exportUrl = new URL(route.request().url())
      await exportGate
      const body = [
        '\uFEFF"Krav-ID","Kravtext"',
        ...exportedIds.map(id => `"${id}","Requirement ${id}"`),
      ].join('\r\n')
      await route.fulfill({
        body,
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Length': String(Buffer.byteLength(body)),
          'Content-Disposition': 'attachment; filename="kravbibliotek.csv"',
          'Content-Type': 'text/csv; charset=utf-8',
          'X-Accel-Buffering': 'no',
        },
        status: 200,
      })
    })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportera' }).click()
    const progressDialog = page.getByRole('dialog', {
      name: 'Förbereder CSV-export …',
    })
    await expect(progressDialog).toBeVisible()
    await expect(
      progressDialog.getByRole('button', { name: 'Avbryt' }),
    ).toBeFocused()
    releaseExport?.()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    let csv = ''
    for await (const chunk of stream) {
      csv += chunk.toString()
    }

    expect(exportUrl).toBeDefined()
    expect(exportUrl?.searchParams.has('cursor')).toBe(false)
    expect(exportUrl?.searchParams.has('limit')).toBe(false)
    expect(download.suggestedFilename()).toBe('kravbibliotek.csv')
    await expect(progressDialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Exportera' })).toBeFocused()
    expect(
      csv
        .split(/\r?\n/u)
        .slice(1)
        .map(line => line.match(/^"(EXP\d{4})"/u)?.[1]),
    ).toEqual(exportedIds)
  })

  test('CSV export busy response shows a stable countdown and retries only on request', async ({
    page,
  }) => {
    let attempts = 0
    await page.route('**/api/requirements/export?*', async route => {
      attempts += 1
      if (attempts === 1) {
        await route.fulfill({
          body: JSON.stringify({
            code: 'capacity_busy',
            details: {
              output: 'csv',
              retryAfterSeconds: 1,
            },
            error: 'internal queue saturation detail must stay hidden',
          }),
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '1',
          },
          status: 429,
        })
        return
      }

      await route.fulfill({
        body: '\uFEFF"Krav-ID"\r\n"INT0001"',
        headers: {
          'Content-Disposition': 'attachment; filename="retry.csv"',
          'Content-Type': 'text/csv; charset=utf-8',
        },
        status: 200,
      })
    })

    await page.goto('/sv/requirements')
    const exportButton = page.getByRole('button', { name: 'Exportera' })
    await exportButton.click()

    const errorDialog = page.getByRole('alertdialog', {
      name: 'Nedladdningen misslyckades',
    })
    await expect(errorDialog).toContainText(
      'Så många CSV-exporter som tillåts samtidigt pågår redan.',
    )
    await expect(errorDialog).not.toContainText('internal queue saturation')
    await expect(
      errorDialog.getByRole('button', { name: 'Försök igen om 1 s' }),
    ).toBeDisabled()
    await expect(
      errorDialog.getByRole('button', { name: 'Försök igen' }),
    ).toBeEnabled()
    expect(attempts).toBe(1)

    const downloadPromise = page.waitForEvent('download')
    await errorDialog.getByRole('button', { name: 'Försök igen' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('retry.csv')
    expect(attempts).toBe(2)
    await expect(errorDialog).toHaveCount(0)
    await expect(exportButton).toBeFocused()
  })

  test('REQ-09: inline detail orders text, criteria, metadata, references, and packages', async ({
    page,
  }) => {
    const detailPane = await openRequirementDetail(page, 'INT0001')

    const sectionOrder = await detailPane.evaluate(root => {
      const wantedLabels = new Set([
        'Kravtext',
        'Acceptanskriterier',
        'Kravområde',
        'Normreferenser',
        'Kravpaket',
      ])

      return Array.from(root.querySelectorAll('h3, dt'))
        .map(element => {
          const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
          return text === 'Acceptanskriterium' || text === 'Acceptanskriterier'
            ? 'Acceptanskriterier'
            : text
        })
        .filter(text => wantedLabels.has(text))
    })

    expect(sectionOrder.indexOf('Kravtext')).toBeGreaterThanOrEqual(0)
    expect(sectionOrder.indexOf('Acceptanskriterier')).toBeGreaterThan(
      sectionOrder.indexOf('Kravtext'),
    )
    expect(sectionOrder.indexOf('Kravområde')).toBeGreaterThan(
      sectionOrder.indexOf('Acceptanskriterier'),
    )
    expect(sectionOrder.indexOf('Normreferenser')).toBeGreaterThan(
      sectionOrder.indexOf('Kravområde'),
    )
    expect(sectionOrder.indexOf('Kravpaket')).toBeGreaterThan(
      sectionOrder.indexOf('Normreferenser'),
    )
  })

  test('REQ-11: Swedish krav aliases redirect to canonical requirement detail routes', async ({
    page,
  }) => {
    await expectRequirementDetailRoute(
      page,
      '/krav/INT0001',
      /\/sv\/requirements\/INT0001$/,
    )

    await expectRequirementDetailRoute(
      page,
      '/sv/krav/INT0001',
      /\/sv\/requirements\/INT0001$/,
    )

    await expectRequirementDetailRoute(
      page,
      '/en/krav/INT0001',
      /\/en\/requirements\/INT0001$/,
    )
  })

  test('REQ-13: requirement detail share and report menus support keyboard use', async ({
    page,
  }) => {
    const detailPane = await openRequirementDetail(page, 'INT0001')

    const shareButton = detailPane.getByRole('button', { name: 'Dela' })
    await shareButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator(':focus')).toHaveText(/länk/i)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()

    const reportsButton = detailPane.getByRole('button', { name: 'Rapporter' })
    await reportsButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator(':focus')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
  })

  test('ADMIN-11: status and priority badges show labels with configured icons', async ({
    page,
  }) => {
    const requirementId = 'ANV0003'
    const detailPane = await openRequirementDetail(page, requirementId)

    await page.locator('[data-column-picker-trigger="true"]').click()
    const popover = page.locator('[data-column-picker-popover="true"]')
    for (const columnId of ['status', 'priorityLevel'] as const) {
      const checkbox = popover.locator(
        `[data-column-picker-option="${columnId}"] input[type="checkbox"]`,
      )
      if (!(await checkbox.isChecked())) {
        await checkbox.check()
      }
    }
    await page.keyboard.press('Escape')

    const row = page
      .getByRole('button', { name: new RegExp(`^${requirementId}\\b`) })
      .locator('xpath=ancestor::tr[1]')
    const publishedBadge = row.locator('.status-badge').filter({
      hasText: 'Publicerad',
    })
    const priorityBadge = row.locator('.status-badge').filter({
      hasText: /P[1-4]/,
    })

    await expect(publishedBadge).toHaveCount(1)
    await expect(publishedBadge.locator('svg')).toHaveCount(1)
    await expect(priorityBadge).toHaveCount(1)
    await expect(priorityBadge.locator('svg')).toHaveCount(1)

    const workflow = detailPane.getByRole('group', {
      name: 'Arbetsflöde för kravversionsstatus',
    })
    await expect(workflow).toContainText('Publicerad')
    await expect
      .poll(async () => workflow.locator('svg').count())
      .toBeGreaterThan(0)
  })
})
