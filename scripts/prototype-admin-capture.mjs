// Throwaway #1359 browser review: capture the live prototype and exercise local edits.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const base = `http://localhost:${process.env.PROTOTYPE_PORT || '3139'}`
const output = 'public/prototype-admin-layout'
mkdirSync(output, { recursive: true })
const jar = execFileSync(
  process.execPath,
  ['scripts/dev-login.mjs', '--base', 'http://localhost:3000'],
  { encoding: 'utf8' },
).trim()
const cookies = readFileSync(jar, 'utf8')
  .split('\n')
  .filter(line => line && !line.startsWith('#'))
  .map(line => {
    const [domain, , path, secure, expiry, name, value] = line.split('\t')
    return {
      domain,
      path,
      secure: secure === 'TRUE',
      expires: Number(expiry) || -1,
      name,
      value,
    }
  })
const browser = await chromium.launch({ headless: true })
const measurements = []
const checks = []
const errors = []
const writes = []
async function openPage({
  width = 1440,
  height = 900,
  rail = 'expanded',
  theme = 'light',
  locale = 'sv',
  variant = 'A',
}) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme,
  })
  await context.addCookies(cookies)
  await context.addInitScript(
    ({ rail, theme }) => {
      localStorage.setItem('requirements.navigationRail.expanded.v1', rail)
      localStorage.setItem('theme', theme)
    },
    { rail, theme },
  )
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (
      /\/api\/admin\//.test(request.url()) &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
    )
      writes.push(`${request.method()} ${request.url()}`)
  })
  await page.goto(`${base}/${locale}/admin?variant=${variant}`)
  await page.locator('[data-testid^="admin-column-row-"]').first().waitFor()
  await page.waitForFunction(
    ({ rail, theme }) =>
      document.documentElement.classList.contains('dark') ===
        (theme === 'dark') &&
      getComputedStyle(document.documentElement)
        .getPropertyValue('--global-nav-width')
        .trim() === (rail === 'expanded' ? '16.5rem' : '4.5rem'),
    { rail, theme },
  )
  await page.evaluate(() => document.fonts.ready)
  return { context, page }
}
async function capture(page, name, details) {
  await page.screenshot({
    path: `${output}/${name}.png`,
    style:
      '[data-prototype-tools="true"], nextjs-portal { visibility: hidden !important; }',
  })
  const geometry = await page.evaluate(() => {
    const box = node => node.getBoundingClientRect()
    const rows = [
      ...document.querySelectorAll('[data-testid^="admin-column-row-"]'),
    ]
    const tabs = [...document.querySelectorAll('[role="tab"]')]
    const header = box(document.querySelector('[data-admin-prototype-header]'))
    const rowBoxes = rows.map(box)
    const actionBar = document.querySelector('[data-prototype-actions]')
    const visibleBottom = actionBar
      ? Math.min(innerHeight, box(actionBar).top)
      : innerHeight
    return {
      headerHeight: header.height,
      firstRowY: rowBoxes[0].y,
      rowHeights: [...new Set(rowBoxes.map(row => row.height))],
      fullyVisibleRows: rowBoxes.filter(
        row => row.y >= 0 && row.bottom <= visibleBottom,
      ).length,
      totalRows: rows.length,
      tabLines: new Set(tabs.map(tab => Math.round(box(tab).y))).size,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      orderButtonX: rows.map(row =>
        Math.round(box(row.querySelector('button')).x),
      ),
    }
  })
  assert.equal(geometry.pageOverflow, false, `Page overflow: ${name}`)
  if (details.width === 1920)
    assert.equal(geometry.tabLines, 1, `Tabs wrap: ${name}`)
  measurements.push({ image: `${name}.png`, ...details, ...geometry })
}
try {
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ]) {
    for (const rail of ['collapsed', 'expanded'])
      for (const theme of ['light', 'dark']) {
        console.info(`Capture ${width} ${rail} ${theme}`)
        for (const variant of ['0', 'A', 'B', 'C']) {
          const { page, context } = await openPage({
            width,
            height,
            rail,
            theme,
            variant,
          })
          await capture(page, `${width}-${rail}-${theme}-${variant}`, {
            width,
            height,
            rail,
            theme,
            variant,
            locale: 'sv',
          })
          await context.close()
        }
      }
  }
  for (const variant of ['A', 'B', 'C']) {
    for (const scenario of ['long', 'mobile', 'english']) {
      const width = scenario === 'mobile' ? 320 : 1440
      const height = scenario === 'mobile' ? 812 : 900
      const locale = scenario === 'english' ? 'en' : 'sv'
      const { page, context } = await openPage({
        variant,
        width,
        height,
        locale,
      })
      if (scenario === 'long') {
        await page.getByLabel('Långa texter', { exact: true }).check()
        await page
          .locator('[data-testid="admin-column-row-area"]')
          .getByText(/Utökad beskrivning/)
          .waitFor()
      }
      await capture(page, `${scenario}-${variant}`, {
        variant,
        width,
        height,
        rail: 'expanded',
        theme: 'light',
        locale,
        scenario,
      })
      await context.close()
    }
  }
  for (const variant of ['0', 'A', 'B', 'C']) {
    console.info(`Exercise local controls ${variant}`)
    const { page, context } = await openPage({ variant })
    const before = await (
      await context.request.get(`${base}/api/admin/requirement-columns`)
    ).json()
    const rows = page.locator('[data-testid^="admin-column-row-"]')
    const order = () =>
      rows.evaluateAll(nodes =>
        nodes.map(node => node.getAttribute('data-testid')),
      )
    const originalOrder = await order()
    const area = page.getByTestId('admin-column-row-area')
    const checkbox = area.getByRole('checkbox')
    const originallyChecked = await checkbox.isChecked()
    assert.equal(
      await page
        .getByTestId('admin-column-row-uniqueId')
        .getByRole('checkbox')
        .isDisabled(),
      true,
    )
    assert.equal(
      await rows.first().getByRole('button').first().isDisabled(),
      true,
    )
    assert.equal(
      await rows.last().getByRole('button').last().isDisabled(),
      true,
    )
    await area.getByRole('button').first().click()
    assert.notDeepEqual(await order(), originalOrder)
    await checkbox.click()
    assert.equal(await checkbox.isChecked(), !originallyChecked)
    const save = page.getByRole('button', { name: 'Spara', exact: true })
    assert.equal(await save.isEnabled(), true)
    await save.click()
    await page.getByText('Sparat i prototypen', { exact: true }).waitFor()
    assert.equal(await save.isDisabled(), true)
    const afterSave = await (
      await context.request.get(`${base}/api/admin/requirement-columns`)
    ).json()
    assert.deepEqual(afterSave, before)
    await page
      .getByRole('button', { name: 'Återställ standardvy', exact: true })
      .click()
    assert.equal(await save.isEnabled(), true)
    await page.reload()
    await area.waitFor()
    assert.deepEqual(await order(), originalOrder)
    assert.equal(await checkbox.isChecked(), originallyChecked)
    checks.push({
      variant,
      result: 'pass',
      checks: [
        'reorder',
        'visibility',
        'locked column',
        'first/last limits',
        'local save',
        'reset stays dirty until save',
        'reload discards preview edits',
        'server data unchanged',
      ],
    })
    await context.close()
  }
  const { page, context } = await openPage({ variant: 'A' })
  await page.getByRole('button', { name: 'B · Tabell', exact: true }).click()
  await page.waitForURL('**variant=B')
  await page.locator('[data-prototype-variant="B"]').waitFor()
  await page.keyboard.press('ArrowRight')
  await page.waitForURL('**variant=C')
  await page.locator('[data-prototype-variant="C"]').waitFor()
  await page.getByLabel('Långa texter', { exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(new URL(page.url()).searchParams.get('variant'), 'C')
  await page.getByRole('tab', { name: 'Kolumner', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForURL('**tab=identity*')
  await page.locator('[inert]').waitFor()
  await page.getByRole('tab', { name: 'Kolumner', exact: true }).click()
  await page.locator('[data-testid^="admin-column-row-"]').first().waitFor()
  await page
    .getByRole('button', { name: 'Tillstånd och fråga', exact: true })
    .click()
  await page
    .getByText(
      '"persistence": "memory only; reload restores application data"',
      { exact: false },
    )
    .waitFor()
  checks.push({
    result: 'pass',
    checks: [
      'URL switcher',
      'arrow-key switcher',
      'input arrow keys excluded',
      'keyboard tab navigation',
      'other panel inert',
      'state inspector',
    ],
  })
  await context.close()
  assert.deepEqual(errors, [], 'Browser errors')
  assert.deepEqual(writes, [], 'Prototype issued admin write requests')
  writeFileSync(
    `${output}/measurements.json`,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        measurements,
        checks,
        errors,
        writes,
      },
      null,
      2,
    )}\n`,
  )
  writeFileSync(
    `${output}/data.js`,
    `window.REVIEW_DATA = ${JSON.stringify({ measurements, checks, errors, writes })};\n`,
  )
  console.info(
    `Captured ${measurements.length} screenshots. Browser controls passed; no admin write requests. ${output}/measurements.json`,
  )
} finally {
  await browser.close()
}
