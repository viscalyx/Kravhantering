// THROWAWAY visual evidence, not a production acceptance suite.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

const directory =
  'app/[locale]/specifications/[specificationId]/prototype-review'
await mkdir(`${directory}/images`, { recursive: true })
const base = 'http://localhost:3001'
const browser = await chromium.launch({ headless: true })
const login = await browser.newContext()
const loginPage = await login.newPage()
await loginPage.goto(`${base}/sv/specifications/8?variant=0`)
await loginPage.locator('#username').fill('ada.admin')
await loginPage.locator('#password').fill('devpass')
await loginPage.getByRole('button', { name: 'Sign In', exact: true }).click()
await loginPage.waitForURL(`${base}/sv/specifications/8?variant=0`)
const cookies = await login.cookies()
await login.close()
const variantFilter = process.argv
  .find(arg => arg.startsWith('--variant='))
  ?.split('=')[1]
const measurements = variantFilter
  ? JSON.parse(await readFile(`${directory}/measurements.json`, 'utf8')).filter(
      row => row.variant !== variantFilter,
    )
  : []
for (const width of process.argv.includes('--quick') ? [1440] : [1440, 1920]) {
  for (const nav of process.argv.includes('--quick')
    ? ['expanded']
    : ['collapsed', 'expanded']) {
    for (const theme of process.argv.includes('--quick')
      ? ['light']
      : ['light', 'dark']) {
      for (const variant of ['0', 'A', 'B', 'C', 'D', 'E'].filter(
        key => !variantFilter || key === variantFilter,
      )) {
        const context = await browser.newContext({
          viewport: { width, height: width === 1440 ? 900 : 1080 },
          reducedMotion: 'reduce',
        })
        await context.addCookies(cookies)
        const page = await context.newPage()
        await page.goto(
          `${base}/sv/specifications/8?variant=${variant}&nav=${nav}&theme=${theme}&review=clean`,
        )
        await expect(
          page.locator('[data-specification-detail-page-shell]'),
        ).toHaveAttribute('data-proportions-prototype', variant)
        await expect(
          page.locator('button[aria-controls="specification-right-panel"]'),
        ).toHaveAttribute('aria-expanded', 'true')
        await expect(
          page.locator('#specification-left-panel thead').first().locator('th'),
        ).toHaveCount(6)
        await expect(
          page.locator('#specification-right-panel tbody tr').first(),
        ).toContainText(/./)
        await page.evaluate(() => document.fonts.ready)
        await expect(page.locator('html')).toHaveAttribute(
          'data-proportions-prototype',
          variant,
        )
        const geometry = await page.evaluate(() => {
          const bounds = el => {
            if (!el) return null
            const r = el.getBoundingClientRect()
            return {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            }
          }
          return {
            panels: ['left', 'right'].map(side => {
              const panel = document.querySelector(
                `#specification-${side}-panel`,
              )
              const scroll = panel.querySelector(
                '[data-requirements-scroll-container]',
              )
              const tabs = panel.querySelector('[role=tablist]')
              const rows = [
                ...panel.querySelectorAll(
                  '[data-requirements-data-table] tbody > tr',
                ),
              ]
              const needs = panel.querySelector(
                'tbody [data-prototype-column="needsReference"]',
              )
              const text = panel.querySelector(
                'tbody [data-prototype-column="description"]',
              )
              return {
                side,
                bounds: bounds(panel),
                tabsFit: tabs.scrollWidth <= tabs.clientWidth + 1,
                tabs: [...tabs.querySelectorAll('[role=tab]')].map(el => ({
                  label: el.textContent,
                  bounds: bounds(el),
                })),
                horizontalOverflow: scroll.scrollWidth - scroll.clientWidth,
                needsBounds: bounds(needs),
                needsVisible: needs
                  ? bounds(needs).x >= bounds(panel).x &&
                    bounds(needs).right <= bounds(panel).right
                  : false,
                textBounds: bounds(text),
                textSize: getComputedStyle(rows[0]).fontSize,
                completeRows: rows.filter(
                  el => bounds(el).bottom <= bounds(panel).bottom,
                ).length,
              }
            }),
            metadata: [
              ...document.querySelectorAll(
                '[data-specification-detail-header-metadata] dt',
              ),
            ].map(el => ({
              text: el.textContent,
              bounds: bounds(el),
              size: getComputedStyle(el).fontSize,
              transform: getComputedStyle(el).textTransform,
            })),
            navigationWidth: document
              .querySelector('[data-global-navigation-rail="desktop"]')
              ?.getBoundingClientRect().width,
            dark: document.documentElement.classList.contains('dark'),
            pageOverflow: document.documentElement.scrollHeight - innerHeight,
          }
        })
        const name = `${width}-${nav}-${theme}-${variant}`
        await page.screenshot({
          path: `${directory}/images/${name}.png`,
          fullPage: true,
        })
        measurements.push({ name, width, nav, theme, variant, ...geometry })
        console.log(
          name,
          JSON.stringify(
            geometry.panels.map(p => ({
              side: p.side,
              width: p.bounds.width,
              needsVisible: p.needsVisible,
              overflow: p.horizontalOverflow,
              rows: p.completeRows,
              tabsFit: p.tabsFit,
            })),
          ),
        )
        await context.close()
      }
    }
  }
}
await writeFile(
  `${directory}/${process.argv.includes('--quick') ? 'quick' : 'measurements'}.json`,
  JSON.stringify(measurements, null, 2),
)
await browser.close()
