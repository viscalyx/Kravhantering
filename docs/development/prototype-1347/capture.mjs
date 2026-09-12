// THROWAWAY visual review capture, not a production regression suite.
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const out = new URL('./evidence/', import.meta.url)
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const observations = []
try {
  const login = await browser.newContext()
  const page = await login.newPage()
  await page.goto('http://localhost:3003/sv/requirements?variant=A')
  await page.locator('#username').fill('ada.admin')
  await page.locator('#password').fill('devpass')
  await page.locator('#kc-login').click()
  await page.waitForURL('http://localhost:3003/**')
  await page.locator('[data-requirement-header-label="area"]').waitFor()
  const auth = await login.storageState()
  await login.close()
  // Copy only the isolated prototype login cookie. Each comparison starts fresh.
  const cookies = auth.cookies.filter(
    cookie => cookie.name === 'prototype1347_session',
  )
  for (const width of [1440, 1920]) {
    for (const navigation of ['collapsed', 'expanded']) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({
          viewport: { width, height: width === 1440 ? 900 : 1080 },
          colorScheme: theme,
        })
        await context.addCookies(cookies)
        await context.addInitScript(
          ({ navigation, theme }) => {
            localStorage.setItem(
              'requirements.navigationRail.expanded.v1',
              navigation,
            )
            localStorage.setItem('theme', theme)
          },
          { navigation, theme },
        )
        const page = await context.newPage()
        await page.goto('http://localhost:3003/sv/requirements?variant=before')
        await page.locator('[data-requirement-header-label="area"]').waitFor()
        await page.evaluate(() => document.fonts.ready)
        for (const variant of ['before', 'A', 'B', 'C']) {
          await page
            .locator('[data-prototype1347-switcher]')
            .getByRole('button', {
              name: variant === 'before' ? 'Före' : new RegExp(`^${variant} ·`),
              exact: true,
            })
            .click()
          await page.locator(`[data-prototype1347="${variant}"]`).waitFor()
          // Wait for the resize observer to settle both sticky and body widths.
          await page.evaluate(
            () =>
              new Promise(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          )
          const measured = await page.evaluate(() => {
            const root = document.querySelector('[data-prototype1347]')
            const scroll = root.querySelector('.overflow-x-auto')
            const viewport = scroll.getBoundingClientRect()
            return {
              columns: [
                ...root.querySelectorAll('[data-requirement-header-label]'),
              ].map(label => {
                const box = label.getBoundingClientRect()
                const range = document.createRange()
                range.selectNodeContents(label)
                const rects = [...range.getClientRects()]
                return {
                  id: label.dataset.requirementHeaderLabel,
                  label: label.textContent,
                  width: Math.round(
                    label.closest('th').getBoundingClientRect().width,
                  ),
                  labelWidth: Math.round(box.width),
                  textWidth: label.scrollWidth,
                  lines: new Set(rects.map(rect => Math.round(rect.top))).size,
                  clipped:
                    label.scrollWidth > label.clientWidth + 1 ||
                    label.scrollHeight > label.clientHeight + 1,
                  withinViewport:
                    box.left >= viewport.left - 1 &&
                    box.right <= viewport.right + 1,
                }
              }),
              controls: [
                ...root.querySelectorAll(
                  '[data-requirement-header-control] button, [data-prototype1347-filter-strip] button',
                ),
              ].map(button => {
                const box = button.getBoundingClientRect()
                return {
                  label: button.getAttribute('aria-label'),
                  width: Math.round(box.width),
                  height: Math.round(box.height),
                  withinViewport:
                    box.left >= viewport.left - 1 &&
                    box.right <= viewport.right + 1,
                }
              }),
              headerHeight: Math.round(
                root
                  .querySelector('[data-sticky-table-chrome]')
                  .getBoundingClientRect().height,
              ),
              workspaceWidth: Math.round(viewport.width),
              horizontalScroll: scroll.scrollWidth > scroll.clientWidth + 1,
            }
          })
          const filename = `${width}-${navigation}-${theme}-${variant}.png`
          await page.screenshot({ path: new URL(filename, out).pathname })
          observations.push({
            width,
            navigation,
            theme,
            variant,
            filename,
            ...measured,
          })
          console.log(
            `${filename}: text=${measured.columns.find(column => column.id === 'description').width}px; clipped=${
              measured.columns
                .filter(column => column.clipped)
                .map(column => column.id)
                .join(',') || 'none'
            }; scroll=${measured.horizontalScroll}`,
          )
        }
        await context.close()
      }
    }
  }
  await writeFile(
    new URL('observations.json', out),
    JSON.stringify(observations, null, 2) + '\n',
  )
} finally {
  await browser.close()
}
