// Throwaway browser exploration and evidence capture, not a production test suite.
// Start npm run prototype:1354 and obtain the cookie jar described in README.md.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const output = resolve(here, 'evidence')
mkdirSync(output, { recursive: true })
const jar = process.env.PROTOTYPE_COOKIE_JAR ?? '/tmp/prototype-1354.cookies'
const cookies = readFileSync(jar, 'utf8')
  .split('\n')
  .filter(
    line => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')),
  )
  .map(line => {
    const [domain, , path, secure, expires, name, value] = line
      .replace(/^#HttpOnly_/, '')
      .split('\t')
    return {
      domain,
      path,
      secure: secure === 'TRUE',
      expires: Number(expires) || -1,
      name,
      value,
      httpOnly: line.startsWith('#HttpOnly_'),
    }
  })
const browser = await chromium.launch({ headless: true })
const observations = []
const failures = []
const unsafeRequests = []
const browserErrors = []
const interactions = []

async function open({
  width = 1440,
  navigation = 'collapsed',
  theme = 'light',
  variant = 'A',
  locale = 'sv',
  sample = 'stress',
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height: width === 1920 ? 1080 : 900 },
    reducedMotion: 'reduce',
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
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('request', request => {
    if (
      new URL(request.url()).pathname.startsWith('/api/requirement-area') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
    )
      unsafeRequests.push({ method: request.method(), url: request.url() })
  })
  await page.goto(
    `http://localhost:3001/${locale}/requirement-areas?variant=${variant}&sample=${sample}`,
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  )
  await page
    .locator(`[data-prototype-variant="${variant}"]`)
    .waitFor({ timeout: 60000 })
  await page
    .locator(`[data-prototype-variant][data-theme="${theme}"]`)
    .waitFor()
  if (sample !== 'empty')
    await page.locator('[data-prototype-row]').first().waitFor()
  if (width >= 1024 && locale === 'sv')
    await page
      .getByRole('button', {
        name:
          navigation === 'collapsed'
            ? 'Expandera navigation'
            : 'Fäll ihop navigation',
        exact: true,
      })
      .waitFor()
  await page.evaluate(() => document.fonts.ready)
  return { context, page }
}

async function capture(options) {
  const { page, context } = await open(options)
  const {
    width,
    navigation,
    theme,
    variant,
    locale = 'sv',
    sample = 'stress',
  } = options
  const id = `${width}-${navigation}-${theme}-${locale}-${sample}-${variant}`
  const metrics = await page.evaluate(() => ({
    pageWidth: document.documentElement.clientWidth,
    pageScrollWidth: document.documentElement.scrollWidth,
    workspaceWidth: document
      .querySelector('.list-workspace')
      .getBoundingClientRect().width,
    rows: [...document.querySelectorAll('[data-prototype-row]')].map(row => {
      const description = row.querySelector('[data-prototype-description]')
      const owner = row.querySelector('[data-prototype-owner]')
      const coAuthors = row.querySelector('[data-prototype-coauthors]')
      const style = getComputedStyle(description)
      return {
        prefix: row.getAttribute('data-prototype-row'),
        rowHeight: Math.round(row.getBoundingClientRect().height),
        descriptionWidth: Math.round(description.getBoundingClientRect().width),
        clipped:
          description.scrollWidth > description.clientWidth + 1 ||
          description.scrollHeight > description.clientHeight + 1,
        whiteSpace: style.whiteSpace,
        textOverflow: style.textOverflow,
        ownerTop: owner?.getBoundingClientRect().top,
        coAuthorsTop: coAuthors?.getBoundingClientRect().top,
      }
    }),
    actionTargets: [
      ...document.querySelectorAll('[data-prototype-row] button'),
    ].map(element => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    })),
    anonymousVisible: document.body.innerText.includes(
      document.documentElement.lang === 'en' ? 'Anonymous' : 'Anonym',
    ),
    sentinelVisible: document.body.innerText.includes('no-user'),
  }))
  if (sample === 'live') {
    // Keep generated record identifiers out of the durable measurement report.
    metrics.rows.forEach((row, index) => {
      row.prefix = `record-${index + 1}`
    })
  }
  if (variant !== 'before') {
    if (metrics.rows.some(row => row.clipped))
      failures.push(`${id}: clipped description`)
    if (metrics.pageScrollWidth > metrics.pageWidth + 1)
      failures.push(`${id}: page overflows viewport`)
    if (
      metrics.actionTargets.some(
        target => target.width < 24 || target.height < 24,
      )
    )
      failures.push(`${id}: action target below 24px`)
    if (metrics.sentinelVisible)
      failures.push(`${id}: visible internal sentinel`)
    if (sample === 'stress' && !metrics.anonymousVisible)
      failures.push(`${id}: anonymous name missing`)
    if (
      width >= 1024 &&
      metrics.rows.some(row => Math.abs(row.ownerTop - row.coAuthorsTop) > 1)
    )
      failures.push(`${id}: responsibility starts misaligned`)
  }
  await page.screenshot({
    path: resolve(output, `${id}.png`),
    fullPage: true,
    animations: 'disabled',
  })
  observations.push({ id, ...options, ...metrics })
  console.log(
    `${id}: ${metrics.rows.length} rows, ${metrics.rows.filter(row => row.clipped).length} clipped descriptions`,
  )
  await context.close()
}

try {
  for (const width of [1440, 1920])
    for (const navigation of ['collapsed', 'expanded'])
      for (const theme of ['light', 'dark'])
        for (const variant of ['before', 'A', 'B', 'C']) {
          await capture({ width, navigation, theme, variant })
        }
  for (const variant of ['A', 'B', 'C'])
    await capture({
      width: 320,
      navigation: 'collapsed',
      theme: 'light',
      locale: 'en',
      variant,
    })
  await capture({
    width: 1440,
    navigation: 'collapsed',
    theme: 'light',
    variant: 'A',
    sample: 'empty',
  })
  await capture({
    width: 1920,
    navigation: 'expanded',
    theme: 'dark',
    variant: 'A',
    sample: 'live',
  })

  const { page, context } = await open()
  const switcher = page.getByRole('navigation', { name: 'Välj prototyplayout' })
  await switcher.getByRole('button', { name: 'B', exact: true }).click()
  await page.locator('[data-prototype-variant="B"]').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('variant'), 'B')
  await page.reload()
  await page.locator('[data-prototype-variant="B"]').waitFor()
  await page.keyboard.press('ArrowRight')
  await page.locator('[data-prototype-variant="C"]').waitFor()
  await page.keyboard.press('ArrowRight')
  await page.locator('[data-prototype-variant="before"]').waitFor()
  await page.keyboard.press('ArrowLeft')
  await page.locator('[data-prototype-variant="C"]').waitFor()
  interactions.push(
    'Direct switch, URL persistence, reload, keyboard forward/backward wrap passed.',
  )
  await page
    .getByText('Granskningsläge och anteckningar', { exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Anteckningar (endast i minnet)' })
    .fill('Review text')
  await page.keyboard.press('ArrowLeft')
  assert.equal(new URL(page.url()).searchParams.get('variant'), 'C')
  interactions.push(
    'Arrow keys inside the notes field keep the current variant.',
  )
  await page
    .getByRole('textbox', { name: 'Anteckningar (endast i minnet)' })
    .blur()
  const firstRow = page.locator('[data-prototype-row]').first()
  for (const button of await firstRow.getByRole('button').all()) {
    await button.click()
    await page
      .getByRole('status')
      .filter({ hasText: 'Inga ändringar sparade.' })
      .waitFor()
  }
  await page.getByRole('button', { name: 'Ny', exact: true }).click()
  await page
    .getByRole('status')
    .filter({ hasText: 'Inga ändringar sparade.' })
    .waitFor()
  await firstRow.getByRole('button').first().focus()
  await page.keyboard.press('Enter')
  interactions.push(
    'Create, edit, delete and co-author previews give feedback; keyboard activation works.',
  )
  await page
    .getByRole('combobox', { name: 'Granskningsdata' })
    .selectOption('empty')
  await page.locator('[data-prototype-dataset="empty"]').waitFor()
  assert.equal(await page.locator('[data-prototype-row]').count(), 0)
  await page.reload()
  await page.locator('[data-prototype-dataset="empty"]').waitFor()
  interactions.push('Empty-list choice survives reload; rows disappear.')
  await page
    .getByText('Granskningsläge och anteckningar', { exact: true })
    .click()
  assert.equal(
    await page
      .getByRole('textbox', { name: 'Anteckningar (endast i minnet)' })
      .inputValue(),
    '',
  )
  interactions.push('In-memory notes clear on reload.')
  await page.goto('http://localhost:3001/sv/requirement-areas')
  await page
    .getByRole('heading', { name: 'Kravområden', exact: true })
    .waitFor()
  assert.equal(await page.locator('[data-prototype-variant]').count(), 0)
  interactions.push('Normal route without variant retains the original page.')
  await context.close()
  if (unsafeRequests.length)
    failures.push('A requirement-area mutation request was sent.')
  if (browserErrors.length) failures.push(...browserErrors)
} catch (error) {
  failures.push(error.stack)
} finally {
  await browser.close()
  writeFileSync(
    resolve(output, 'observations.json'),
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        observations,
        interactions,
        unsafeRequests,
        browserErrors,
        failures,
      },
      null,
      2,
    )}\n`,
  )
}
assert.equal(failures.length, 0, failures.join('\n'))
console.log(
  `Captured ${observations.length} views; ${interactions.length} interaction checks; no requirement-area mutations.`,
)
