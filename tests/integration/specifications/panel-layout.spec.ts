import { expect, type Page, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '@/tests/helpers/desktop-viewport'
import { requireTestValue } from '@/tests/helpers/require-test-value'
import { expectApiResponseOk } from '../api-response-assertions'

const storageKey = 'specification-panel-layout-v1'

test('SPEC-30: reads the locked RFI mode without overlapping actions in a narrow panel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route(
    '**/api/requirements-specifications/8/rfi-list',
    async route => {
      const response = await route.fetch()
      const json = await response.json()
      json.list.isLocked = true
      json.list.lockedAt = '2026-09-19T12:00:00.000Z'
      await route.fulfill({ json })
    },
  )
  await openSpecification(page, 8, 'en')
  await page
    .getByRole('button', { name: 'Expand Requirements Library', exact: true })
    .click()
  const divider = page.getByRole('separator', {
    name: 'Resize specification panels',
  })
  for (let step = 0; step < 20; step++) await divider.press('Shift+ArrowLeft')
  await page.getByRole('tab', { name: 'RFI question list' }).click()
  const explanation = page.getByRole('button', {
    name: 'Locked for export and relevance assessment Locked 2026-09-19T12:00:00.000Z',
    exact: true,
  })
  await expect(explanation).toBeVisible()
  const toolbar = page.locator(
    '#specification-left-panel [data-developer-mode-name="panel toolbar"]',
  )
  const mode = toolbar.getByText('Locked for export and relevance assessment', {
    exact: true,
  })
  const filter = toolbar.getByRole('button', {
    name: 'Show only RFI questions included in RFI',
    exact: true,
  })
  const bounds = requireTestValue(await mode.boundingBox())
  const actionBounds = requireTestValue(await filter.boundingBox())
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(actionBounds.x)
  const explanationBounds = requireTestValue(await explanation.boundingBox())
  expect(explanationBounds.x + explanationBounds.width).toBeLessThanOrEqual(
    actionBounds.x,
  )
  expect(requireTestValue(await toolbar.boundingBox()).height).toBe(37)
  await page.getByRole('tab', { name: 'RFI question list' }).press('Tab')
  await expect(page.getByRole('tooltip')).toContainText(
    'Locked for export and relevance assessment',
  )
  await expect(page.getByRole('tooltip')).toContainText(
    '2026-09-19T12:00:00.000Z',
  )
})

test('SPEC-30: reads the full RFI mode explanation with the keyboard', async ({
  page,
}) => {
  let finishLoading = () => {}
  const loading = new Promise<void>(resolve => {
    finishLoading = resolve
  })
  await page.route(
    '**/api/requirements-specifications/8/rfi-list',
    async route => {
      const response = await route.fetch()
      await loading
      await route.fulfill({ response })
    },
  )
  await openSpecification(page)
  await page.getByRole('tab', { name: 'RFI-frågelista' }).click()
  const rfiTab = page.getByRole('tab', { name: 'RFI-frågelista' })
  await rfiTab.focus()
  finishLoading()
  const explanation = page.getByRole('button', {
    name: 'Förbered Listan följer aktiva RFI-frågor tills den låses.',
    exact: true,
  })
  await expect(explanation).toBeVisible()
  await expect(rfiTab).toBeFocused()
  await page.getByRole('tab', { name: 'RFI-frågelista' }).press('Tab')
  await expect(explanation).toBeFocused()
  await expect(page.getByRole('tooltip')).toContainText(
    'Listan följer aktiva RFI-frågor tills den låses.',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toBeHidden()
  await expect(explanation).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', {
      name: 'Visa endast de som ingår i RFI',
      exact: true,
    }),
  ).toBeFocused()
  await explanation.hover()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toBeVisible()
  await tooltip.hover()
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tooltip).toBeHidden()
})

test('SPEC-06 SPEC-30: keeps multiple package selections and toolbar actions usable at narrow widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openSpecification(page)
  await page
    .getByRole('button', { name: 'Öppna Kravbibliotek', exact: true })
    .click()
  const library = page.locator(
    '[data-specification-detail-list-panel="available"]',
  )
  const filter = library.getByRole('button', { name: /^Filtrera kravpaket/ })
  await filter.click()
  for (let index = 0; index < 3; index++) {
    await page
      .getByRole('button', { name: /^Lägg till .* i kravpaketsfiltret$/ })
      .first()
      .click()
  }
  await page.keyboard.press('Escape')
  const selected = library.getByRole('button', {
    name: /^Ta bort .* från kravpaketsfiltret$/,
  })
  await expect(selected).toHaveCount(3)
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await library.scrollIntoViewIfNeeded()
    const toolbar = library.locator(
      '[data-developer-mode-name="panel toolbar"]',
    )
    const row = requireTestValue(await toolbar.boundingBox())
    for (const button of await toolbar.getByRole('button').all()) {
      const bounds = requireTestValue(await button.boundingBox())
      expect(bounds.width).toBeGreaterThanOrEqual(24)
      expect(bounds.height).toBeGreaterThanOrEqual(24)
      expect(bounds.x).toBeGreaterThanOrEqual(row.x)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(row.x + row.width + 1)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        row.y + row.height + 1,
      )
    }
    const header = requireTestValue(
      await library.locator('[data-sticky-table-header]').boundingBox(),
    )
    expect(header.y).toBeGreaterThanOrEqual(row.y + row.height)
  }
  await library
    .getByRole('button', { name: 'Rensa alla kravpaket', exact: true })
    .click()
  await expect(library.getByText('Inget kravpaketsfilter aktivt')).toBeVisible()
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole('tab', { name: 'RFI-frågelista' }).click()
  await expect(
    page.getByRole('link', { name: 'CSV', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'PDF', exact: true }),
  ).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 1440, 1920]) {
    test(`SPEC-06: package choosers match the library and span each panel at ${width}, ${theme}`, async ({
      page,
      request,
    }) => {
      const created = await request.post('/api/requirements-specifications', {
        data: {
          name: 'Package chooser layout',
          specificationCode: `CHOOSER-${Date.now()}`,
          specificationLifecycleStatusId: 1,
        },
      })
      await expectApiResponseOk(created, 'create package chooser specification')
      const { id } = (await created.json()) as { id: number }
      try {
        // The manual-case seed publishes this requirement in the source package.
        await expectApiResponseOk(
          await request.post(`/api/requirements-specifications/${id}/items`, {
            data: { requirementIds: [920004] },
          }),
          'add packaged requirement to chooser fixture',
        )
        const catalog = await request.get(
          `/api/requirements-specifications/${id}/requirement-packages`,
        )
        await expectApiResponseOk(
          catalog,
          'read chooser fixture package catalog',
        )
        expect(
          (await catalog.json()).requirementPackages.length,
        ).toBeGreaterThan(0)
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.addInitScript(
          theme => localStorage.setItem('theme', theme),
          theme,
        )
        await page.goto('/sv/requirements')
        await page
          .getByRole('button', { name: 'Filtrera kravpaket', exact: true })
          .hover()
        const chooser = page.getByRole('group', {
          name: 'Tillgängliga kravpaket',
          exact: true,
        })
        await expect(chooser).toBeVisible()
        await expect(chooser).toHaveCSS('opacity', '1')
        const surface = () =>
          chooser.evaluate(node => {
            const style = getComputedStyle(node)
            return {
              background: style.backgroundColor,
              padding: style.padding,
              border: style.borderBottomWidth,
            }
          })
        const librarySurface = await surface()
        expect(librarySurface.background).not.toBe('rgba(0, 0, 0, 0)')
        await page.keyboard.press('Escape')
        await openSpecification(page, id)
        await page
          .getByRole('button', { name: 'Öppna Kravbibliotek', exact: true })
          .click()
        for (const side of ['left', 'right']) {
          const panel = page.locator(`#specification-${side}-panel`)
          const trigger = panel.getByRole('button', {
            name: 'Filtrera kravpaket',
            exact: true,
          })
          await trigger.scrollIntoViewIfNeeded()
          await trigger.hover()
          await expect(chooser).toBeVisible()
          await expect(chooser).toHaveCSS('opacity', '1')
          expect(await surface()).toEqual(librarySurface)
          const toolbar = panel.locator(
            '[data-developer-mode-name="panel toolbar"]',
          )
          await expect
            .poll(async () => {
              const menu = requireTestValue(await chooser.boundingBox())
              const bar = requireTestValue(await toolbar.boundingBox())
              const band = requireTestValue(
                await panel
                  .locator('[data-requirement-package-filter-band]')
                  .boundingBox(),
              )
              return (
                Math.abs(menu.x - bar.x) < 1 &&
                Math.abs(menu.width - bar.width) < 1 &&
                Math.abs(menu.y - band.y - band.height) < 1
              )
            })
            .toBe(true)
          await chooser.getByRole('button').first().hover()
          await expect(chooser).toBeVisible()
          await page.keyboard.press('Escape')
          await expect(chooser).toBeHidden()
          await expect(trigger).toBeFocused()
        }
      } finally {
        await expectApiResponseOk(
          await request.delete(`/api/requirements-specifications/${id}`),
          'delete package chooser specification',
        )
      }
    })
  }
}

test('SPEC-33: resizes both panels live without changing their gap or table columns', async ({
  page,
}) => {
  await openSpecification(page, 8, 'en')
  await page
    .getByRole('button', { name: 'Expand Requirements Library', exact: true })
    .click()
  const divider = page.getByRole('separator', {
    name: 'Resize specification panels',
  })
  await expect(divider).toBeVisible()
  await expect(divider).toHaveAttribute(
    'data-developer-mode-value',
    'panel widths',
  )
  const left = page.locator('#specification-left-panel')
  const right = page.locator('#specification-right-panel')
  const before = requireTestValue(await left.boundingBox())
  const beforeRight = requireTestValue(await right.boundingBox())
  const handle = requireTestValue(await divider.boundingBox())
  expect(handle.width).toBe(16)
  const column = left.locator('[data-requirement-header-label="uniqueId"]')
  const columnWidth = requireTestValue(await column.boundingBox()).width
  await test.step('Drag and retain the new widths on reload', async () => {
    await divider.hover()
    await expect(divider).toHaveCSS('cursor', 'ew-resize')
    await page.mouse.down()
    await page.mouse.move(
      handle.x + handle.width / 2 + 80,
      handle.y + handle.height / 2,
      { steps: 5 },
    )
    await expect
      .poll(async () =>
        Math.round(
          requireTestValue(await left.boundingBox()).width - before.width,
        ),
      )
      .toBe(80)
    expect(
      Math.round(
        requireTestValue(await right.boundingBox()).width - beforeRight.width,
      ),
    ).toBe(-80)
    const resizedLeft = requireTestValue(await left.boundingBox())
    const resizedRight = requireTestValue(await right.boundingBox())
    expect(resizedRight.x - resizedLeft.x - resizedLeft.width).toBe(16)
    expect(requireTestValue(await column.boundingBox()).width).toBeCloseTo(
      columnWidth,
      0,
    )
    await page.mouse.up()
    await expect(divider).toBeFocused()
    await page.reload()
    await expect
      .poll(async () =>
        Math.round(
          requireTestValue(await left.boundingBox()).width - before.width,
        ),
      )
      .toBe(80)
  })
  await test.step('Reset to the default proportions', async () => {
    await divider.dblclick()
    await expect
      .poll(async () =>
        Math.abs(
          requireTestValue(await left.boundingBox()).width -
            requireTestValue(await right.boundingBox()).width * 1.5,
        ),
      )
      .toBeLessThan(1)
  })
})

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

test('SPEC-34: keyboard resizing survives reloads, tabs, collapse and responsive widths', async ({
  page,
}) => {
  await openSpecification(page, 8, 'en')
  await page
    .getByRole('button', { name: 'Expand Requirements Library', exact: true })
    .click()
  const divider = page.getByRole('separator', {
    name: 'Resize specification panels',
  })
  const left = page.locator('#specification-left-panel')
  const width = async () => requireTestValue(await left.boundingBox()).width
  const initial = await width()
  await test.step('Resize with arrow keys and expose the current ratio', async () => {
    await divider.focus()
    await divider.press('ArrowRight')
    await expect.poll(async () => Math.round((await width()) - initial)).toBe(8)
    await divider.press('Shift+ArrowRight')
    await expect
      .poll(async () => Math.round((await width()) - initial))
      .toBe(40)
    await expect(divider).toHaveAttribute(
      'aria-valuetext',
      /Left panel \d+%, right panel \d+%/,
    )
  })
  await test.step('Preserve widths across reload, tabs, collapse and stacking', async () => {
    await page.reload()
    await expect
      .poll(async () => Math.round((await width()) - initial))
      .toBe(40)
    await page.getByRole('tab', { name: 'Needs references' }).click()
    await expect
      .poll(async () => Math.round((await width()) - initial))
      .toBe(40)
    await page
      .getByRole('button', {
        name: 'Collapse Requirements Library',
        exact: true,
      })
      .click()
    await expect(divider).toBeHidden()
    await page
      .getByRole('button', { name: 'Expand Requirements Library', exact: true })
      .click()
    await expect
      .poll(async () => Math.round((await width()) - initial))
      .toBe(40)
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(divider).toBeHidden()
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await expect
      .poll(async () => Math.round((await width()) - initial))
      .toBe(40)
  })
  await test.step('Reset and stop keyboard resizing at both width limits', async () => {
    await divider.press('Enter')
    await expect.poll(async () => Math.round((await width()) - initial)).toBe(0)
    for (let step = 0; step < 20; step++) await divider.press('Shift+ArrowLeft')
    await expect.poll(async () => Math.round(await width())).toBe(400)
    await expect(divider).toBeVisible()
    await page.setViewportSize({ width: 1320, height: DESKTOP_VIEWPORT.height })
    for (let step = 0; step < 30; step++)
      await divider.press('Shift+ArrowRight')
    expect(
      Number(await divider.getAttribute('aria-valuenow')),
    ).toBeLessThanOrEqual(Number(await divider.getAttribute('aria-valuemax')))
  })
})

test('SPEC-36: clamps narrow workspaces without losing the preferred ratio and cancels interrupted drags', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1200 })
  await openSpecification(page, 8, 'en')
  await page
    .getByRole('button', { name: 'Expand Requirements Library', exact: true })
    .click()
  const divider = page.getByRole('separator', {
    name: 'Resize specification panels',
  })
  const left = page.locator('#specification-left-panel')
  const handle = requireTestValue(await divider.boundingBox())
  const before = requireTestValue(await left.boundingBox())
  await test.step('Save a preferred panel width', async () => {
    await divider.hover()
    await page.mouse.down()
    await page.mouse.move(
      handle.x + 8 + 500 - before.width,
      handle.y + handle.height / 2,
      { steps: 5 },
    )
    await page.mouse.up()
    await expect
      .poll(async () =>
        Math.round(requireTestValue(await left.boundingBox()).width),
      )
      .toBe(500)
  })
  const saved = await page.evaluate(() =>
    localStorage.getItem('specification-panel-width-v1'),
  )
  await test.step('Clamp narrow workspaces without overwriting the preference', async () => {
    await page.setViewportSize({ width: 1280, height: 1200 })
    await expect
      .poll(async () =>
        Math.round(requireTestValue(await left.boundingBox()).width),
      )
      .toBe(400)
    expect(
      await page.evaluate(() =>
        localStorage.getItem('specification-panel-width-v1'),
      ),
    ).toBe(saved)
    await page.setViewportSize({ width: 1920, height: 1200 })
    await expect
      .poll(async () =>
        Math.round(requireTestValue(await left.boundingBox()).width),
      )
      .toBe(500)
  })
  await test.step('Cancel a drag when the panels stack and keep focus visible', async () => {
    await divider.hover()
    await page.mouse.down()
    await page.mouse.move(handle.x + 8, handle.y + handle.height / 2, {
      steps: 5,
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.mouse.up()
    await expect(divider).toBeHidden()
    await expect(
      page.getByRole('button', {
        name: 'Collapse Requirements in specification',
        exact: true,
      }),
    ).toBeFocused()
    await page.setViewportSize({ width: 1920, height: 1200 })
    await expect
      .poll(async () =>
        Math.round(requireTestValue(await left.boundingBox()).width),
      )
      .toBe(500)
    expect(
      await page.evaluate(() =>
        localStorage.getItem('specification-panel-width-v1'),
      ),
    ).toBe(saved)
  })
})

for (const pointer of ['touch', 'pen'] as const) {
  test(`SPEC-36: supports ${pointer} resizing and cancels lost gestures`, async ({
    page,
  }) => {
    await openSpecification(page, 8, 'en')
    await page
      .getByRole('button', { name: 'Expand Requirements Library', exact: true })
      .click()
    const divider = page.getByRole('separator', {
      name: 'Resize specification panels',
    })
    const left = page.locator('#specification-left-panel')
    const handle = requireTestValue(await divider.boundingBox())
    const before = requireTestValue(await left.boundingBox()).width
    const x = handle.x + 8
    const y = handle.y + handle.height / 2
    const session = await page.context().newCDPSession(page)
    const send = async (phase: 'start' | 'move' | 'end', clientX: number) => {
      if (pointer === 'touch') {
        await session.send('Input.dispatchTouchEvent', {
          type: (
            { start: 'touchStart', move: 'touchMove', end: 'touchEnd' } as const
          )[phase],
          touchPoints: phase === 'end' ? [] : [{ x: clientX, y }],
        })
      } else {
        await session.send('Input.dispatchMouseEvent', {
          type: (
            {
              start: 'mousePressed',
              move: 'mouseMoved',
              end: 'mouseReleased',
            } as const
          )[phase],
          x: clientX,
          y,
          button: 'left',
          buttons: phase === 'end' ? 0 : 1,
          clickCount: 1,
          pointerType: 'pen',
        })
      }
    }
    await test.step('Cancel an interrupted gesture', async () => {
      await send('start', x)
      await send('move', x + 64)
      await expect
        .poll(async () =>
          Math.round(requireTestValue(await left.boundingBox()).width - before),
        )
        .toBe(64)
      if (pointer === 'touch')
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchCancel',
          touchPoints: [],
        })
      else {
        // A blur interrupts a real pen gesture, without depending on Chromium's pointer IDs.
        await page.evaluate(() => window.dispatchEvent(new Event('blur')))
        await send('end', x + 64)
      }
      await expect
        .poll(async () => requireTestValue(await left.boundingBox()).width)
        .toBeCloseTo(before, 0)
    })
    await test.step('Commit a completed gesture', async () => {
      await send('start', x)
      await send('move', x + 64)
      await send('end', x + 64)
      await expect
        .poll(async () =>
          Math.round(requireTestValue(await left.boundingBox()).width - before),
        )
        .toBe(64)
    })
    await session.detach()
  })
}

for (const side of ['left', 'right'] as const) {
  test(`SPEC-35: previews, cancels and commits dragging the ${side} panel closed`, async ({
    page,
  }) => {
    await openSpecification(page, 8, 'en')
    await page
      .getByRole('button', { name: 'Expand Requirements Library', exact: true })
      .click()
    const divider = page.getByRole('separator', {
      name: 'Resize specification panels',
    })
    await divider.press('Shift+ArrowRight')
    const panel = page.locator(`#specification-${side}-panel`)
    const left = page.locator('#specification-left-panel')
    const before = requireTestValue(await left.boundingBox()).width
    const panelBefore = requireTestValue(await panel.boundingBox()).width
    const label =
      side === 'left' ? 'Requirements in specification' : 'Requirements Library'
    const direction = side === 'left' ? -1 : 1
    const handle = requireTestValue(await divider.boundingBox())
    const x = handle.x + handle.width / 2
    const y = handle.y + handle.height / 2
    const atMinimum = x + direction * (panelBefore - 400)

    await test.step('Preview collapse, move back and cancel with Escape', async () => {
      await divider.hover()
      await page.mouse.down()
      await page.mouse.move(atMinimum, y, { steps: 5 })
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: `Continue dragging to collapse ${label}` }),
      ).toBeVisible()
      await expect
        .poll(async () =>
          Math.round(requireTestValue(await panel.boundingBox()).width),
        )
        .toBe(400)
      await page.mouse.move(atMinimum + direction * 81, y, { steps: 5 })
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: `Release to collapse ${label}` }),
      ).toBeVisible()
      await expect(panel).toHaveCSS('opacity', '0.45')
      await expect(panel).toBeVisible()
      await page.mouse.move(atMinimum - direction * 20, y, { steps: 3 })
      await expect(panel).toHaveCSS('opacity', '1')
      await expect
        .poll(async () =>
          Math.round(requireTestValue(await panel.boundingBox()).width),
        )
        .toBe(420)
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await expect
        .poll(async () => requireTestValue(await left.boundingBox()).width)
        .toBeCloseTo(before, 0)
    })
    await test.step('Collapse on release and restore the prior ratio on reopening', async () => {
      await divider.hover()
      await page.mouse.down()
      await page.mouse.move(atMinimum + direction * 81, y, { steps: 5 })
      await expect(panel).toHaveCSS('opacity', '0.45')
      await page.mouse.up()
      await expect(panel).toBeHidden()
      await expect(divider).toBeHidden()
      const reopen = page.getByRole('button', {
        name: `Expand ${label}`,
        exact: true,
      })
      await expect(reopen).toBeFocused()
      await reopen.press('Enter')
      await expect(panel).toHaveCSS('opacity', '1')
      await expect
        .poll(async () => requireTestValue(await left.boundingBox()).width)
        .toBeCloseTo(before, 0)
    })
  })
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
    await test.step('Keep the specification name at 20px bold on wide and narrow screens', async () => {
      const title = page.getByRole('heading', { level: 1 })
      await expect(title).toHaveAttribute(
        'data-developer-mode-value',
        'specification name',
      )
      await expect(title).toHaveCSS('font-size', '20px')
      await expect(title).toHaveCSS('font-weight', '700')
      await page.setViewportSize({ width: 375, height: 812 })
      await expect(title).toHaveCSS('font-size', '20px')
      await expect(title).toHaveCSS('font-weight', '700')
      await page.setViewportSize(DESKTOP_VIEWPORT)
    })
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
      for (const [side, label] of [
        ['left', labels.left],
        ['right', labels.right],
      ]) {
        const header = page.locator(
          `[data-developer-mode-name="panel header"][data-developer-mode-value="${side} panel"]`,
        )
        const button = header.getByRole('button', {
          name: `${labels.collapse} ${label}`,
          exact: true,
        })
        const tabs = header.getByRole('tablist')
        const buttonBounds = requireTestValue(await button.boundingBox())
        const tabBounds = requireTestValue(await tabs.boundingBox())
        expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(
          tabBounds.x,
        )
        expect(
          Math.abs(
            buttonBounds.y +
              buttonBounds.height / 2 -
              tabBounds.y -
              tabBounds.height / 2,
          ),
        ).toBeLessThan(2)
        await expect(button.locator(`.lucide-panel-${side}-close`)).toHaveCount(
          1,
        )
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
        .getByRole('button', { name: 'Öppna Kravbibliotek', exact: true })
        .click()
      await page
        .getByRole('separator', { name: 'Ändra panelbredder' })
        .press('Shift+ArrowRight')
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
      const widthPreference = await page.evaluate(() =>
        localStorage.getItem('specification-panel-width-v1'),
      )
      await page.goto('/sv/specifications')
      await test.step('Open specification and settle its initial layout', () =>
        openSpecification(page))
      await expect(
        page.getByRole('button', {
          name: 'Öppna Krav i underlaget',
          exact: true,
        }),
      ).toHaveCount(1)
      expect(
        await page.evaluate(() =>
          localStorage.getItem('specification-panel-width-v1'),
        ),
      ).toBe(widthPreference)
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
      await page
        .getByRole('button', { name: 'Öppna Kravbibliotek', exact: true })
        .click()
      await expect(
        page.getByRole('separator', { name: 'Ändra panelbredder' }),
      ).toHaveAttribute('aria-valuenow', '60')
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
  const selectedRequirementId =
    await test.step('Choose descending requirement-ID order', async () => {
      const [response] = await Promise.all([
        page.waitForResponse(response => {
          const url = new URL(response.url())
          return (
            url.pathname.endsWith('/available-requirements') &&
            url.searchParams.get('sortBy') === 'uniqueId' &&
            url.searchParams.get('sortDirection') === 'desc'
          )
        }),
        library
          .getByRole('button', { name: 'Sortera efter Krav-ID', exact: true })
          .click(),
      ])
      await expectApiResponseOk(response, 'sort available requirements')
      const result: { requirements: { uniqueId: string }[] } =
        await response.json()
      const firstId = requireTestValue(result.requirements[0]).uniqueId
      await expect(
        library.locator('th[aria-sort="descending"]').first(),
      ).toHaveCount(1)
      await expect(
        library.locator('tbody input[type="checkbox"]').first(),
      ).toHaveAttribute('aria-label', `Markera ${firstId}`)
      return firstId
    })
  await test.step('Retain selected requirements, filter text and nonzero scroll through hiding', async () => {
    const checkbox = library.getByRole('checkbox', {
      name: `Markera ${selectedRequirementId}`,
      exact: true,
    })
    await checkbox.check()
    await expect(
      library.getByRole('button', { name: /Lägg till valda \(1\)/ }),
    ).toHaveCount(1)
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
    const divider = page.getByRole('separator', { name: 'Ändra panelbredder' })
    const handle = requireTestValue(await divider.boundingBox())
    await divider.hover()
    await page.mouse.down()
    await page.mouse.move(handle.x + 68, handle.y + handle.height / 2, {
      steps: 5,
    })
    await page.mouse.up()
    expect(await library.evaluate(element => element.scrollTop)).toBe(scrollTop)
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
  const divider = page.getByRole('separator', { name: 'Ändra panelbredder' })
  await divider.press('Shift+ArrowRight')
  expect(Number(await divider.getAttribute('aria-valuenow'))).toBeGreaterThan(
    50,
  )
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

for (const width of [1440, 1920]) {
  for (const expanded of [false, true]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`SPEC-05 SPEC-30: compact headers and independent lists at ${width}, navigation ${expanded ? 'expanded' : 'collapsed'}, ${theme}`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 900 : 1080,
        })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.addInitScript(
          theme => localStorage.setItem('theme', theme),
          theme,
        )
        await openSpecification(page)
        if (expanded) {
          await page
            .locator(
              '[data-developer-mode-context="navigation"][data-developer-mode-value="expand rail"]',
            )
            .click()
        }
        await page
          .getByRole('button', { name: 'Öppna Kravbibliotek', exact: true })
          .click()
        const left = page.locator(
          '[data-specification-detail-list-panel="items"]',
        )
        const right = page.locator(
          '[data-specification-detail-list-panel="available"]',
        )
        await expect(left.locator('tbody tr').first()).toBeVisible()
        await expect(right.locator('tbody tr').first()).toBeVisible()
        await expect(page.getByText('Arbetar…', { exact: true })).toBeHidden()
        await expect(
          page.getByText('Hämtar krav…', { exact: true }),
        ).toBeHidden()
        const bounds = async (locator: ReturnType<Page['locator']>) =>
          requireTestValue(await locator.boundingBox())
        const leftTabs = page.getByRole('tablist', {
          name: 'Tabbar för detaljer i kravunderlag',
        })
        const rightTabs = page.getByRole('tablist', {
          name: 'Tabbar i kravunderlagets högra panel',
        })
        const tabGeometry = async (tabs: ReturnType<Page['locator']>) =>
          Promise.all((await tabs.getByRole('tab').all()).map(bounds))
        const originalLeft = await tabGeometry(leftTabs)
        const originalRight = await tabGeometry(rightTabs)
        const expectSameTabs = async (
          tabs: ReturnType<Page['locator']>,
          original: typeof originalLeft,
        ) => {
          const actual = await tabGeometry(tabs)
          expect(actual).toHaveLength(original.length)
          for (const [index, rect] of actual.entries()) {
            for (const dimension of ['x', 'y', 'width', 'height'] as const) {
              expect(rect[dimension]).toBeCloseTo(original[index][dimension], 0)
            }
          }
        }
        await test.step('Give the lists space without page overflow or smaller row text', async () => {
          const needsReference = left
            .locator('[data-developer-mode-name="column header"]')
            .filter({ hasText: 'Behovsreferens' })
          const referenceBounds = await bounds(needsReference)
          const leftBounds = await bounds(left)
          expect(referenceBounds.x + referenceBounds.width).toBeLessThanOrEqual(
            leftBounds.x + leftBounds.width,
          )

          const footer = await bounds(page.getByRole('contentinfo'))
          expect(footer.height).toBe(41)
          for (const panel of [left, right]) {
            const panelBounds = await bounds(panel)
            const firstRow = panel.locator('tbody tr').first()
            const row = await bounds(firstRow)
            const toolbar = panel.locator(
              '[data-developer-mode-name="panel toolbar"]',
            )
            const toolbarBounds = await bounds(toolbar)
            // The compact right panel wraps filters and actions onto two rows
            // when its 40% share cannot fit them beside one another.
            expect(toolbarBounds.height).toBeLessThanOrEqual(
              width === 1440 && panel === right ? 67 : 37,
            )
            expect(
              row.y - panelBounds.y - toolbarBounds.height,
            ).toBeLessThanOrEqual(93)
            expect(footer.y - panelBounds.y - panelBounds.height).toBe(8)
            await expect(firstRow).toHaveCSS('font-size', '14px')
            await expect(toolbar).toBeVisible()
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollHeight - innerHeight,
            ),
          ).toBe(0)
          await page.screenshot({
            path: test.info().outputPath('compact-lists.png'),
            fullPage: true,
          })
        })
        await test.step('Keep tabs in place when changing either panel view', async () => {
          for (const label of [
            'Behovsreferenser',
            'RFI-frågelista',
            'Krav i underlaget',
          ]) {
            await leftTabs.getByRole('tab', { name: label }).click()
            await expectSameTabs(leftTabs, originalLeft)
            const toolbar = page.locator(
              '#specification-left-panel [data-developer-mode-name="panel toolbar"]',
            )
            if (label === 'RFI-frågelista') {
              await expect(
                toolbar.getByRole('link', { name: 'CSV', exact: true }),
              ).toBeVisible()
              await expect(
                toolbar.getByRole('link', { name: 'PDF', exact: true }),
              ).toBeVisible()
              await expect(toolbar.getByRole('switch')).toBeVisible()
            }
            if (label === 'Behovsreferenser') {
              await expect(
                toolbar.getByRole('button', { name: 'Ny behovsreferens' }),
              ).toBeVisible()
            }
            expect((await bounds(toolbar)).height).toBe(37)
          }
          for (const label of ['Kravurvalsfrågor', 'Tillgängliga krav']) {
            await rightTabs.getByRole('tab', { name: label }).click()
            await expectSameTabs(rightTabs, originalRight)
          }
        })
        await test.step('Scroll each list while keeping its tabs, filter and table header fixed', async () => {
          await page.setViewportSize({ width, height: 650 })
          await left.getByRole('button', { name: /^BEH0001\b/ }).click()
          for (const [panel, other] of [
            [left, right],
            [right, left],
          ]) {
            const chrome = panel.locator('[data-sticky-table-chrome]')
            const before = await bounds(chrome)
            const otherScroll = await other.evaluate(node => node.scrollTop)
            await panel.hover()
            await page.mouse.wheel(0, 450)
            await expect
              .poll(() => panel.evaluate(node => node.scrollTop))
              .toBeGreaterThan(0)
            expect((await bounds(chrome)).y).toBeCloseTo(before.y, 0)
            expect(await other.evaluate(node => node.scrollTop)).toBe(
              otherScroll,
            )
            expect(await page.evaluate(() => window.scrollY)).toBe(0)
          }
        })
      })
    }
  }
}
