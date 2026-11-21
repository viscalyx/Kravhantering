import { expect, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '@/tests/helpers/desktop-viewport'
import { expectModalKeyboardIsolation } from '@/tests/support/modal-keyboard'

for (const locale of ['sv', 'en'] as const) {
  for (const layout of ['desktop', 'mobile'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test.describe(`Skip navigation: ${locale}, ${layout}, ${theme}`, () => {
        test.use({
          colorScheme: theme,
          viewport:
            layout === 'desktop'
              ? DESKTOP_VIEWPORT
              : { width: 375, height: 812 },
        })

        test('NAV-01: skip link moves keyboard focus into the current page', async ({
          page,
        }, testInfo) => {
          await page.goto(`/${locale}/requirements`)
          await expect(
            page.getByRole('button', {
              name:
                locale === 'sv'
                  ? 'Filtrera efter Krav-ID'
                  : 'Filter by Requirement ID',
            }),
          ).toBeEnabled()
          await expect(page.locator('html')).toHaveClass(new RegExp(theme))
          const skipLink = page.getByRole('link', {
            name:
              locale === 'sv'
                ? 'Hoppa till huvudinnehållet'
                : 'Skip to main content',
          })
          const main = page.locator('main#main-content')

          await test.step('reveal an unobscured link on the first Tab', async () => {
            await expect(skipLink).toHaveCSS('clip-path', 'inset(50%)')
            await page.keyboard.press('Tab')
            await expect(skipLink).toBeFocused()
            await expect(skipLink).toBeInViewport({ ratio: 1 })
            await expect(skipLink).toHaveCSS('outline-style', 'solid')
            await expect(skipLink).toHaveCSS('outline-width', '2px')
            await expect
              .poll(() =>
                skipLink.evaluate(element => {
                  const rect = element.getBoundingClientRect()
                  return (
                    rect.width >= 24 &&
                    rect.height >= 24 &&
                    [
                      [rect.left + 8, rect.top + 8],
                      [rect.right - 8, rect.bottom - 8],
                    ].every(([x, y]) =>
                      element.contains(document.elementFromPoint(x, y)),
                    )
                  )
                }),
              )
              .toBe(true)
            await expect(skipLink).toHaveAttribute(
              'data-developer-mode-value',
              'skip to main content',
            )
            await expect(main).toHaveAttribute(
              'data-developer-mode-name',
              'main content',
            )
            await page.screenshot({
              path: testInfo.outputPath('skip-link.png'),
            })
          })

          await test.step('move actual focus into content without adding a Tab stop', async () => {
            await expect(main).toHaveCount(1)
            await page.keyboard.press('Enter')
            await expect(main).toBeFocused()
            await expect(main).toHaveAttribute('tabindex', '-1')
            await page.keyboard.press('Tab')
            await expect(main.locator(':focus')).toHaveCount(1)
          })

          await test.step('preserve the Tab starting point after clicking content', async () => {
            await main
              .getByText(
                locale === 'sv'
                  ? 'Inget kravpaketsfilter aktivt'
                  : 'No requirements package filter active',
                { exact: true },
              )
              .click()
            const firstPackage = page
              .locator(
                '[data-developer-mode-name="requirements package chooser"]',
              )
              .getByRole('button')
              .first()
            await expect(firstPackage).toBeEnabled()
            await page.keyboard.press('Tab')
            await expect(firstPackage).toBeFocused()
            await page.keyboard.press('Escape')
          })

          await test.step('keep the shortcut usable after client navigation', async () => {
            if (layout === 'mobile') {
              await page
                .getByRole('button', {
                  name: locale === 'sv' ? 'Öppna meny' : 'Open menu',
                })
                .click()
            }
            await page
              .getByRole('link', {
                name:
                  locale === 'sv'
                    ? 'Kravunderlag'
                    : 'Requirements specifications',
                exact: true,
              })
              .click()
            await expect(page).toHaveURL(`/${locale}/specifications`)
            await expect(main.getByRole('button').first()).toBeEnabled()
            // Return through the browser's keyboard sequence, without assigning focus.
            for (let stops = 0; stops < 40; stops += 1) {
              await page.keyboard.press('Shift+Tab')
              if (
                await skipLink.evaluate(
                  element => element === document.activeElement,
                )
              )
                break
            }
            await expect(skipLink).toBeFocused()
            await page.keyboard.press('Enter')
            await expect(main).toBeFocused()
            await page.keyboard.press('Tab')
            await expect(main.locator(':focus')).toHaveCount(1)
          })
        })
      })
    }
  }
}

test.describe('Global navigation', () => {
  test('NAV-01: global side navigation and mobile drawer open and close', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')

    const desktopRail = page.locator('[data-global-navigation-rail="desktop"]')

    await test.step('verify the desktop rail collapsed state', async () => {
      await expect(desktopRail).toBeVisible()
      const expandButton = desktopRail.getByRole('button', {
        name: 'Expandera navigation',
      })
      await expect(expandButton).toBeVisible()
    })

    await test.step('expand and collapse the desktop navigation', async () => {
      await desktopRail
        .getByRole('button', { name: 'Expandera navigation' })
        .click()
      const collapseButton = desktopRail.getByRole('button', {
        name: 'Fäll ihop navigation',
      })
      await expect(collapseButton).toBeVisible()
      await expect(
        desktopRail.getByText('Kravbiblioteksförvaltning'),
      ).toBeVisible()
      await collapseButton.click()
      await expect(
        desktopRail.getByRole('button', { name: 'Expandera navigation' }),
      ).toBeVisible()
    })

    await test.step('open help with the keyboard and return to its trigger', async () => {
      const help = desktopRail.getByRole('button', {
        name: 'Hjälp',
        exact: true,
      })
      await expect(help).toBeEnabled()
      await help.focus()
      await help.press('Enter')
      await expectModalKeyboardIsolation(page, page.getByRole('dialog'))
      await page.keyboard.press('Escape')
      await expect(help).toBeFocused()
    })

    await test.step('verify the mobile drawer opens and closes', async () => {
      await page.setViewportSize({ height: 812, width: 375 })
      const openButton = page.getByRole('button', { name: 'Öppna meny' })
      await openButton.press('Enter')
      const drawer = page.getByRole('dialog', { name: 'Huvudmeny' })
      await expect(drawer).toBeVisible()
      await expectModalKeyboardIsolation(page, drawer)
      const closeButton = drawer.getByRole('button', { name: 'Stäng meny' })
      await expect(closeButton).toBeVisible()
      await expect(closeButton).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(drawer.locator(':focus')).toHaveCount(1)
      await page.keyboard.press('Tab')
      await expect(closeButton).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(drawer).toBeHidden()
      await expect(openButton).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(
        page.getByRole('link', { name: 'Hoppa till huvudinnehållet' }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(openButton).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(closeButton).toBeFocused()
      await closeButton.click()
      await expect(drawer).toBeHidden()
      await expect(openButton).toBeFocused()
      await openButton.click()
      await expect(drawer).toBeVisible()
      await page.setViewportSize({ height: 1200, width: 1440 })
      await expect(drawer).toBeHidden()
      const desktopToggle = desktopRail.getByRole('button', {
        name: 'Expandera navigation',
      })
      await desktopToggle.click()
      await expect(
        desktopRail.getByRole('button', { name: 'Fäll ihop navigation' }),
      ).toBeVisible()
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
    })
  })
})

test('NAV-01: list workspace grows with the viewport and keeps actions beside the table', async ({
  page,
}) => {
  await page.goto('/sv/requirements')
  const table = page.locator('[data-requirements-scroll-container]')
  const rail = page.locator('[data-floating-action-rail="true"]')
  const description = page
    .locator('thead th[data-developer-mode-value="requirement text"]')
    .first()
  // Documented defaults: requirement text is 809px; the checkbox and other
  // visible columns use 36 + 118 + 148 + 130 + 131 + 144px.
  const defaultDescriptionWidth = 809
  const fixedColumnsWidth = 36 + 118 + 148 + 130 + 131 + 144
  const workspaceWidths: number[] = []
  await test.step('resize the workspace and toggle navigation', async () => {
    for (const width of [1440, 1920]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
      for (const expanded of [false, true]) {
        const toggle = page.getByRole('button', {
          name: expanded ? 'Expandera navigation' : 'Fäll ihop navigation',
          exact: true,
        })
        if (await toggle.count()) await toggle.click()
        await expect
          .poll(async () => {
            const bounds = await table.boundingBox()
            const actions = await rail.boundingBox()
            const navigation = await page
              .locator('[data-global-navigation-rail="desktop"]')
              .boundingBox()
            if (!bounds || !actions || !navigation) return false
            return (
              Math.abs(navigation.width - (expanded ? 264 : 72)) <= 1 &&
              Math.abs(bounds.x - (navigation.width + 33)) <= 1 &&
              bounds.width >= width - navigation.width - 122 &&
              actions.x >= bounds.x + bounds.width + 8 &&
              actions.x + actions.width <= width - 16
            )
          })
          .toBe(true)
        const workspaceWidth = await table.evaluate(el => el.clientWidth)
        await expect
          .poll(() =>
            description.evaluate(el => el.getBoundingClientRect().width),
          )
          .toBeCloseTo(
            Math.max(
              defaultDescriptionWidth,
              workspaceWidth - fixedColumnsWidth,
            ),
            0,
          )
        if (!expanded) workspaceWidths.push(workspaceWidth)
      }
    }
  })
  expect(workspaceWidths[1] - workspaceWidths[0]).toBeGreaterThan(400)
  await test.step('use list actions after scrolling', async () => {
    await page.mouse.wheel(0, 500)
    await expect
      .poll(async () => {
        const bounds = await table.boundingBox()
        const actions = await rail.boundingBox()
        return !!bounds && !!actions && actions.x >= bounds.x + bounds.width + 8
      })
      .toBe(true)
    await page.locator('[data-column-picker-trigger="true"]').click()
    await expect(
      page.locator('[data-column-picker-popover="true"]'),
    ).toBeVisible()
    await page.keyboard.press('Escape')
  })
})

for (const path of [
  '/sv/specifications',
  '/sv/requirements/stewardship?tab=packages',
  '/sv/requirements/stewardship?tab=norms',
  '/sv/requirements/stewardship?tab=questions',
  '/sv/requirements/stewardship?tab=information-requests',
  '/sv/requirement-areas',
  '/sv/requirement-types',
  '/sv/priority-levels',
  '/sv/quality-characteristics',
  '/sv/requirement-categories',
  '/sv/specification-item-statuses',
  '/sv/admin',
  '/sv/admin?tab=settings',
  '/sv/admin?tab=identity',
  '/sv/admin?tab=taxonomy',
  '/sv/admin?tab=actionAuditLog',
]) {
  test(`NAV-01: ${path} uses the workspace beside navigation`, async ({
    page,
  }) => {
    await page.goto(path)
    const workspace = page
      .locator('[data-developer-mode-name="list workspace"]')
      .first()
    await expect(workspace).toContainText(/\S/)
    await test.step('keep the list accessible beside both navigation states', async () => {
      for (const width of [1440, 1920]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 900 : 1080,
        })
        for (const expanded of [false, true]) {
          const toggle = page.getByRole('button', {
            name: expanded ? 'Expandera navigation' : 'Fäll ihop navigation',
            exact: true,
          })
          if (await toggle.count()) await toggle.click()
          await expect
            .poll(async () => {
              const bounds = await workspace.boundingBox()
              const nav = await page
                .locator('[data-global-navigation-rail="desktop"]')
                .boundingBox()
              if (!bounds || !nav) return false
              return (
                Math.abs(nav.width - (expanded ? 264 : 72)) <= 1 &&
                Math.abs(bounds.x - nav.width - 32) <= 1 &&
                bounds.width >= width - nav.width - 120
              )
            })
            .toBe(true)
          const rail = page.locator('[data-floating-action-rail="true"]')
          if (await rail.count()) {
            await expect
              .poll(async () => {
                const bounds = await workspace.boundingBox()
                const actions = await rail.first().boundingBox()
                return (
                  !!bounds &&
                  !!actions &&
                  actions.x >= bounds.x + bounds.width &&
                  actions.x + actions.width <= width - 16
                )
              })
              .toBe(true)
          }
        }
      }
    })
  })
}

for (const locale of ['sv', 'en'] as const) {
  test.describe(`Browser titles in ${locale}`, () => {
    const app = locale === 'sv' ? 'Kravhantering' : 'Requirements Management'
    const requirement = locale === 'sv' ? 'Krav' : 'Requirement'
    const specification =
      locale === 'sv' ? 'Kravunderlag' : 'Requirements specification'
    test('NAV-02: tabs identify requirements and selected versions', async ({
      context,
      page,
    }) => {
      const secondTab = await context.newPage()
      await test.step('compare requirements after their canonical redirects', async () => {
        for (const [tab, id] of [
          [page, 'ANV0001'],
          [secondTab, 'ANV0002'],
        ] as const) {
          await tab.goto(`/${locale}/krav/${id}`)
          await expect(tab).toHaveURL(
            new RegExp(`/${locale}/requirements/${id}$`),
          )
          await expect(tab).toHaveTitle(`${id} – ${requirement} | ${app}`)
          await expect(
            tab.getByRole('heading', { name: id, exact: true }),
          ).toHaveText(id)
        }
      })

      await test.step('switch versions in the page and reload the selected version', async () => {
        await page.goto(`/${locale}/requirements/INT0001/1`)
        await expect(page).toHaveTitle(
          `INT0001, version 1 – ${requirement} | ${app}`,
        )
        await secondTab.goto(`/${locale}/requirements/INT0001/1`)
        await secondTab.getByRole('button', { name: /^v2 / }).click()
        await expect(secondTab).toHaveURL(
          new RegExp(`/${locale}/requirements/INT0001/2$`),
        )
        await expect(secondTab).toHaveTitle(
          `INT0001, version 2 – ${requirement} | ${app}`,
        )
        await secondTab.reload()
        await expect(secondTab).toHaveTitle(
          `INT0001, version 2 – ${requirement} | ${app}`,
        )
        await page.bringToFront()
        await expect(page).toHaveTitle(
          `INT0001, version 1 – ${requirement} | ${app}`,
        )
      })
    })

    test('NAV-02: tabs identify specifications after canonical redirects', async ({
      context,
      page,
    }) => {
      const secondTab = await context.newPage()
      for (const [tab, code] of [
        [page, 'AUTHZ-SPEC-2026'],
        [secondTab, 'DRIFT-FORV-BAS'],
      ] as const) {
        // The code redirect and numeric document share this test's deadline.
        await tab.goto(`/${locale}/specifications/${code}`, {
          timeout: test.info().timeout,
          waitUntil: 'commit',
        })
        await expect(tab).toHaveURL(/\/specifications\/\d+$/)
        await expect(tab).toHaveTitle(`${code} – ${specification} | ${app}`)
      }
    })
  })
}
