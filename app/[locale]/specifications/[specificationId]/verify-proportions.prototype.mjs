// THROWAWAY browser review checklist. Does not mutate application data.

import { writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

const directory =
  'app/[locale]/specifications/[specificationId]/prototype-review'
const browser = await chromium.launch({ headless: true })
const login = await browser.newContext()
const loginPage = await login.newPage()
await loginPage.goto('http://localhost:3001/en/specifications/8?variant=A')
await loginPage.locator('#username').fill('ada.admin')
await loginPage.locator('#password').fill('devpass')
await loginPage.getByRole('button', { name: 'Sign In', exact: true }).click()
await loginPage.waitForURL(
  'http://localhost:3001/en/specifications/8?variant=A',
)
const cookies = await login.cookies()
await login.close()
const results = []
for (const variant of ['A', 'B', 'C', 'D', 'E']) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  await context.addCookies(cookies)
  const page = await context.newPage()
  await page.goto(
    `http://localhost:3001/en/specifications/8?variant=${variant}&nav=expanded`,
  )
  const left = page.locator('#specification-left-panel'),
    right = page.locator('#specification-right-panel')
  await expect(left.locator('thead').first().locator('th')).toHaveCount(6)
  await expect(right.locator('tbody tr').first()).toContainText(/./)
  const englishTabsFit = await left
    .getByRole('tablist')
    .evaluate(el => el.scrollWidth <= el.clientWidth + 1)
  if (!englishTabsFit) throw Error('English tabs require scrolling')
  const divider = page.getByRole('separator')
  const before = (await left.boundingBox()).width
  await divider.press('ArrowRight')
  await expect
    .poll(async () => Math.round((await left.boundingBox()).width - before))
    .toBe(8)
  if (!page.url().includes(`variant=${variant}`))
    throw Error('Resize key switched variant')
  const resized = (await left.boundingBox()).width
  await page
    .locator('button[aria-controls="specification-right-panel"]')
    .click()
  await page
    .locator('button[aria-controls="specification-right-panel"]')
    .click()
  await expect
    .poll(async () => Math.round((await left.boundingBox()).width))
    .toBe(Math.round(resized))
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect
    .poll(async () => Math.round((await left.boundingBox()).width))
    .toBe(Math.round(before))
  const handle = await divider.boundingBox()
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    handle.x + handle.width / 2 + 24,
    handle.y + handle.height / 2,
    { steps: 4 },
  )
  await page.mouse.up()
  await expect
    .poll(async () => Math.round((await left.boundingBox()).width - before))
    .toBe(24)
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect
    .poll(async () => Math.round((await left.boundingBox()).width))
    .toBe(Math.round(before))
  const tabs = left.getByRole('tab')
  const rects = await tabs.evaluateAll(els =>
    els.map(el => {
      const r = el.getBoundingClientRect()
      return [r.x, r.width, r.height]
    }),
  )
  for (const label of [
    'Needs references',
    'RFI question list',
    'Requirements in specification',
  ]) {
    await left.getByRole('tab', { name: new RegExp(label) }).click()
    await expect
      .poll(() =>
        tabs.evaluateAll(els =>
          els.map(el => {
            const r = el.getBoundingClientRect()
            return [r.x, r.width, r.height]
          }),
        ),
      )
      .toEqual(rects)
  }
  await expect(left.locator('tbody tr').first()).toContainText(/./)
  const rightTabs = right.getByRole('tab')
  const rightRects = await rightTabs.evaluateAll(els =>
    els.map(el => {
      const r = el.getBoundingClientRect()
      return [r.x, r.width, r.height]
    }),
  )
  await rightTabs.nth(1).click()
  await expect
    .poll(() =>
      rightTabs.evaluateAll(els =>
        els.map(el => {
          const r = el.getBoundingClientRect()
          return [r.x, r.width, r.height]
        }),
      ),
    )
    .toEqual(rightRects)
  await rightTabs.nth(0).click()
  const idButton = left.getByRole('button', { name: /^BEH0001/ })
  await idButton.click()
  await expect(idButton).toHaveAttribute('aria-expanded', 'true')
  await page.screenshot({
    path: `${directory}/images/1440-${variant}-expanded-detail-en.png`,
    fullPage: true,
  })
  await idButton.click()
  await expect(idButton).toHaveAttribute('aria-expanded', 'false')
  const lp = left.locator('[data-specification-detail-list-panel]'),
    rp = right.locator('[data-specification-detail-list-panel]')
  const leftBefore = await lp.evaluate(el => el.scrollTop)
  const headerY = (await right.getByRole('tablist').boundingBox()).y
  await rp.hover()
  await page.mouse.wheel(0, 350)
  await expect.poll(() => rp.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  if ((await lp.evaluate(el => el.scrollTop)) !== leftBefore)
    throw Error('Scroll crossed panels')
  if (
    Math.abs((await right.getByRole('tablist').boundingBox()).y - headerY) > 1
  )
    throw Error('Header moved')
  if (variant === 'E') {
    await expect(
      page.locator('[data-specification-detail-header-metadata]'),
    ).toBeHidden()
    await page
      .getByRole('button', { name: /Show specification details$/ })
      .click()
    await expect(
      page.locator('[data-specification-detail-header-metadata]'),
    ).toBeVisible()
  }
  await page.getByRole('button', { name: 'Long text', exact: true }).click()
  await expect
    .poll(async () => (await page.locator('h1').innerText()).length)
    .toBe(150)
  await expect
    .poll(
      async () =>
        (
          await page
            .locator('[data-specification-detail-header-summary] > div > p')
            .innerText()
        ).length,
    )
    .toBe(300)
  await expect(left.locator('tbody tr').first()).toContainText(
    'Temporary long example',
  )
  await lp.evaluate(el => el.scrollTo(0, 0))
  await rp.evaluate(el => el.scrollTo(0, 0))
  await page.keyboard.press('h')
  await page.screenshot({
    path: `${directory}/images/1440-expanded-light-${variant}-long-en.png`,
    fullPage: true,
  })
  await page.keyboard.press('h')
  await page.getByRole('button', { name: 'Long text', exact: true }).click()
  // Confirm actual application mutation rejection before any route handler executes.
  const denied = await page.evaluate(async () => {
    const r = await fetch('/api/requirements-specifications/8', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    return { status: r.status, body: await r.text() }
  })
  if (
    denied.status !== 403 ||
    !denied.body.includes('Prototype #1352 is read-only')
  )
    throw Error('Write guard missing')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('ArrowRight')
  const next = { A: 'B', B: 'C', C: 'D', D: 'E', E: '0' }[variant]
  await expect(
    page.locator('[data-specification-detail-page-shell]'),
  ).toHaveAttribute('data-proportions-prototype', next)
  await page.reload()
  await expect(
    page.locator('[data-specification-detail-page-shell]'),
  ).toHaveAttribute('data-proportions-prototype', next)
  await page.goto(
    `http://localhost:3001/en/specifications/8?variant=${variant}&header=C&review=clean`,
  )
  await expect(
    page.locator('[data-specification-detail-page-shell]'),
  ).toHaveAttribute('data-prototype-header', 'C')
  await expect(left.locator('tbody tr').first()).toContainText(/./)
  await page.screenshot({
    path: `${directory}/images/1440-${variant}-header-C-en.png`,
    fullPage: true,
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await expect
    .poll(() =>
      page
        .locator('[data-specification-detail-split-panel]')
        .evaluate(
          el => getComputedStyle(el).gridTemplateColumns.split(' ').length,
        ),
    )
    .toBe(1)
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true)
  const sizes = await page
    .locator('[data-specification-detail-split-panel]')
    .evaluate(el => ({
      width: el.getBoundingClientRect().width,
      scrollWidth: el.scrollWidth,
    }))
  await page.screenshot({
    path: `${directory}/images/mobile-from-${variant}.png`,
    fullPage: true,
  })
  results.push({
    variant,
    englishTabsFit,
    pointerResize: true,
    rightTabsStable: true,
    expandDetail: true,
    mixedHeader: true,
    keyboardResize: '8 px without switching variants',
    collapseRestore: true,
    reset: true,
    stableTabs: true,
    independentScroll: true,
    stickyHeader: true,
    longText: true,
    writeGuard: denied.status,
    urlSwitchAndReload: true,
    mobile: sizes,
  })
  console.log(JSON.stringify(results.at(-1)))
  await context.close()
}
await writeFile(
  `${directory}/interaction-checks.json`,
  JSON.stringify(results, null, 2),
)
await browser.close()
