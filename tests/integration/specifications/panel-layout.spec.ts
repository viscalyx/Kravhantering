import { expect, type Page, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '@/tests/helpers/desktop-viewport'
import { requireTestValue } from '@/tests/helpers/require-test-value'
import { expectApiResponseOk } from '../api-response-assertions'

const storageKey = 'specification-panel-layout-v1'

async function openSpecification(page: Page, id = 8, locale = 'sv') {
  await page.goto(`/${locale}/specifications/${id}`)
  await expect
    .poll(() =>
      page.evaluate(key => {
        const saved = localStorage.getItem(key)
        try {
          return saved ? JSON.parse(saved).specificationId : null
        } catch {
          return null
        }
      }, storageKey),
    )
    .toBe(id)
}

for (const locale of ['sv', 'en'] as const) {
  const labels =
    locale === 'sv'
      ? {
          left: 'Krav i underlaget',
          right: 'Kravbibliotek',
          needs: 'Behovsreferenser',
          rfi: 'RFI-frågelista',
          questions: 'Kravurvalsfrågor',
          expand: 'Öppna',
          collapse: 'Fäll ihop',
        }
      : {
          left: 'Requirements in specification',
          right: 'Requirements Library',
          needs: 'Needs references',
          rfi: 'RFI question list',
          questions: 'Requirement selection questions',
          expand: 'Expand',
          collapse: 'Collapse',
        }

  test(`SPEC-30: keyboard transitions, names and responsive workspace in ${locale}`, async ({
    page,
  }) => {
    await page.emulateMedia({
      reducedMotion: locale === 'en' ? 'reduce' : 'no-preference',
    })
    await test.step('Open specification and settle its initial layout', () =>
      openSpecification(page, 8, locale))
    const control = (action: 'expand' | 'collapse', label: string) =>
      page.getByRole('button', {
        name: `${labels[action]} ${label}`,
        exact: true,
      })
    await test.step('Keep focus and use freed width through keyboard transitions', async () => {
      await control('expand', labels.right).focus()
      await page.keyboard.press('Enter')
      await expect(control('collapse', labels.right)).toBeFocused()
      const workspace = page.locator('[data-specification-detail-split-panel]')
      const leftPanel = page.locator('#specification-left-panel')
      const rightPanel = page.locator('#specification-right-panel')
      if (locale === 'en') {
        await expect(rightPanel).toHaveCSS('animation-name', 'none')
      }
      const originalWidth = requireTestValue(
        await leftPanel.boundingBox(),
      ).width
      await control('collapse', labels.right).press('Space')
      await expect(control('expand', labels.right)).toBeFocused()
      await expect(rightPanel).toBeHidden()
      await expect
        .poll(async () => requireTestValue(await leftPanel.boundingBox()).width)
        .toBeGreaterThan(originalWidth + 100)
      const bounds = requireTestValue(await workspace.boundingBox())
      const tab = requireTestValue(
        await control('expand', labels.right).boundingBox(),
      )
      expect(tab.x + tab.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1)
      expect(tab.x + tab.width).toBeLessThanOrEqual(DESKTOP_VIEWPORT.width)
      expect(tab.width).toBeLessThan(60)
      await expect(control('expand', labels.right)).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      await expect(control('expand', labels.right)).toHaveAttribute(
        'data-developer-mode-value',
        'right panel',
      )

      await control('collapse', labels.left).press('Enter')
      await expect(control('expand', labels.left)).toBeFocused()
      await expect(rightPanel).toBeVisible()
      const leftTab = requireTestValue(
        await control('expand', labels.left).boundingBox(),
      )
      expect(leftTab.x).toBeCloseTo(bounds.x, 0)
      await control('collapse', labels.right).press('Enter')
      await expect(leftPanel).toBeVisible()
      await control('expand', labels.right).press('Enter')
    })
    await test.step('Preserve each active tab across narrow and wide layouts', async () => {
      for (const [tabName, panelLabel] of [
        [labels.needs, `${labels.left} – ${labels.needs}`],
        [labels.rfi, `${labels.left} – RFI`],
        [labels.questions, `${labels.right} – ${labels.questions}`],
      ]) {
        await page.getByRole('tab', { name: tabName, exact: false }).click()
        await control('collapse', panelLabel).click()
        await expect(control('expand', panelLabel)).toHaveText(panelLabel)
        await page.setViewportSize({ width: 375, height: 812 })
        const compact = requireTestValue(
          await control('expand', panelLabel).boundingBox(),
        )
        expect(compact.width).toBeGreaterThan(compact.height)
        expect(compact.x).toBeGreaterThanOrEqual(0)
        expect(compact.x + compact.width).toBeLessThanOrEqual(375)
        await control('expand', panelLabel).press('Enter')
        await expect(
          page.getByRole('tab', { name: tabName, exact: false }),
        ).toHaveAttribute('aria-selected', 'true')
        await page.setViewportSize(DESKTOP_VIEWPORT)
      }
    })
  })
}

test('SPEC-31: keeps only the latest specification layout across reloads and other pages', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/requirements-specifications', {
    data: {
      name: 'Panel layout browser test',
      specificationCode: `PWT-PANELS-${Date.now()}`,
      specificationLifecycleStatusId: 1,
    },
  })
  await expectApiResponseOk(response, 'create empty panel layout fixture')
  const empty: { id: number } = await response.json()
  try {
    await test.step('Open specification and settle its initial layout', () =>
      openSpecification(page))
    await test.step('Restore a manual choice on reload', async () => {
      await page
        .getByRole('button', {
          name: 'Fäll ihop Krav i underlaget',
          exact: true,
        })
        .click()
      await page.reload()
      await expect(
        page.getByRole('button', {
          name: 'Öppna Krav i underlaget',
          exact: true,
        }),
      ).toHaveAttribute('aria-expanded', 'false')
    })
    await test.step('Retain the choice when visiting another kind of page', async () => {
      await page.goto('/sv/specifications')
      await test.step('Open specification and settle its initial layout', () =>
        openSpecification(page))
      await expect(
        page.getByRole('button', {
          name: 'Öppna Krav i underlaget',
          exact: true,
        }),
      ).toHaveCount(1)
    })
    await test.step('Replace the saved choice when opening another specification', async () => {
      await test.step('Open specification and settle its initial layout', () =>
        openSpecification(page, empty.id))
      await expect(
        page.getByRole('button', { name: /^Fäll ihop / }),
      ).toHaveCount(2)
      await test.step('Open specification and settle its initial layout', () =>
        openSpecification(page))
      await expect(
        page.getByRole('button', { name: 'Öppna Kravbibliotek', exact: true }),
      ).toHaveCount(1)
      await expect
        .poll(() =>
          page.evaluate(
            key => JSON.parse(localStorage.getItem(key) ?? 'null'),
            storageKey,
          ),
        )
        .toEqual({ specificationId: 8, layout: 'left' })
    })
  } finally {
    await expectApiResponseOk(
      await request.delete(`/api/requirements-specifications/${empty.id}`),
      'delete panel layout fixture',
    )
  }
})

test('SPEC-32: preserves selection, unsaved filters and scroll while hiding and resizing panels', async ({
  page,
}) => {
  await page.setViewportSize({ width: DESKTOP_VIEWPORT.width, height: 650 })
  await test.step('Open specification and settle its initial layout', () =>
    openSpecification(page))
  await page
    .getByRole('button', { name: 'Öppna Kravbibliotek', exact: true })
    .click()
  const library = page.locator(
    '[data-specification-detail-list-panel="available"]',
  )
  await test.step('Choose descending requirement-ID order', async () => {
    await library
      .getByRole('button', { name: 'Sortera efter Krav-ID', exact: true })
      .click()
    await expect(
      library.locator('th[aria-sort="descending"]').first(),
    ).toHaveCount(1)
  })
  await test.step('Retain selected requirements, filter text and nonzero scroll through hiding', async () => {
    const checkbox = library.locator('tbody input[type="checkbox"]').first()
    await checkbox.check()
    const filter = library.getByRole('button', { name: /Filtrera.*Krav-ID/i })
    await filter.click()
    const input = page.getByRole('textbox', { name: 'Krav-ID', exact: true })
    await Promise.all([
      page.waitForResponse(
        response =>
          response.url().includes('/available-requirements?') &&
          response.url().includes('A'),
      ),
      input.fill('A'),
    ])
    await input.press('Escape')
    await library.evaluate(element => {
      element.scrollTop = 150
    })
    const scrollTop = await library.evaluate(element => element.scrollTop)
    expect(scrollTop).toBeGreaterThan(0)
    await page
      .getByRole('button', { name: 'Fäll ihop Kravbibliotek', exact: true })
      .click()
    await expect(library).toBeHidden()
    await page.setViewportSize({ width: 375, height: 812 })
    await page.setViewportSize({ width: DESKTOP_VIEWPORT.width, height: 650 })
    await page
      .getByRole('button', { name: 'Öppna Kravbibliotek', exact: true })
      .click()
    await expect
      .poll(() => library.evaluate(element => element.scrollTop))
      .toBe(scrollTop)
    await expect(
      library.getByRole('button', { name: /Lägg till valda \(1\)/ }),
    ).toHaveCount(1)
    await filter.click()
    await expect(input).toHaveValue('A')
    await expect(
      library.locator('th[aria-sort="descending"]').first(),
    ).toHaveCount(1)
  })
  await test.step('Keep a zero-result search without changing layout', async () => {
    const input = page.getByRole('textbox', { name: 'Krav-ID', exact: true })
    await input.fill('NO-SUCH-PANEL-REQUIREMENT')
    await input.press('Escape')
    await expect(library.locator('tbody input[type="checkbox"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Fäll ihop / })).toHaveCount(
      2,
    )
  })
})

test('SPEC-31: unavailable browser storage still permits panel transitions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Denied', 'SecurityError')
      },
    })
  })
  await test.step('Open with browser storage denied', () =>
    page.goto('/sv/specifications/8'))
  await page
    .getByRole('button', { name: 'Öppna Kravbibliotek', exact: true })
    .click()
  await expect(page.getByRole('button', { name: /^Fäll ihop / })).toHaveCount(2)
})

test('SPEC-31: invalid saved layout falls back to the content default', async ({
  page,
}) => {
  await page.addInitScript(
    key => localStorage.setItem(key, '{invalid'),
    storageKey,
  )
  await test.step('Ignore malformed layout and allow manual expansion', async () => {
    await openSpecification(page)
    await page
      .getByRole('button', { name: 'Öppna Kravbibliotek', exact: true })
      .click()
    await expect(page.getByRole('button', { name: /^Fäll ihop / })).toHaveCount(
      2,
    )
  })
})

test('SPEC-32: keeps an expanded requirement and component-owned question input', async ({
  page,
}) => {
  await test.step('Keep the expanded requirement through a collapse', async () => {
    await openSpecification(page)
    const items = page.locator('#specification-left-panel')
    const requirement = items.getByRole('button', { name: /^BEH0001\b/ })
    await requirement.click()
    await expect(
      items.getByRole('heading', { name: 'Kravtext', exact: true }),
    ).toHaveCount(1)
    await page
      .getByRole('button', { name: 'Fäll ihop Krav i underlaget', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Öppna Krav i underlaget', exact: true })
      .click()
    await expect(
      items.getByRole('heading', { name: 'Kravtext', exact: true }),
    ).toHaveCount(1)
  })
  await test.step('Keep unsaved question search owned by the tab component', async () => {
    await page.route(
      '**/api/requirements-specifications/8/requirement-selection-answers',
      route =>
        route.fulfill({
          json: {
            questions: [
              {
                id: 901,
                questionCode: 'KUF-PANELS',
                text: 'Panel question',
                areaName: 'Integration',
                isActive: true,
                isArchived: false,
                isVisible: true,
                visibilityState: 'visible',
                visibilityGroups: [],
                answers: [],
                savedAnswers: [],
                selectedAnswerIds: [],
                selectionType: 'single',
              },
            ],
          },
        }),
    )
    await page
      .getByRole('tab', { name: 'Kravurvalsfrågor', exact: true })
      .click()
    const search = page.getByPlaceholder('Sök fråga eller svar', {
      exact: true,
    })
    await search.fill('Panel')
    await page
      .getByRole('button', {
        name: 'Fäll ihop Kravbibliotek – Kravurvalsfrågor',
        exact: true,
      })
      .click()
    await page
      .getByRole('button', {
        name: 'Öppna Kravbibliotek – Kravurvalsfrågor',
        exact: true,
      })
      .click()
    await expect(search).toHaveValue('Panel')
  })
})
