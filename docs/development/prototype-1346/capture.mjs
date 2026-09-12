// Throwaway browser evidence capture, not a production test suite.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const root = new URL('./', import.meta.url)
const evidence = new URL('evidence/', root)
await mkdir(evidence, { recursive: true })
await mkdir('.auth', { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.setDefaultNavigationTimeout(120000)
const errors = []
page.on('pageerror', error =>
  errors.push({ path: new URL(page.url()).pathname, message: error.message }),
)
page.on('console', message => {
  if (
    message.type() === 'error' &&
    !message.text().includes('Failed to load resource')
  )
    errors.push({
      path: new URL(page.url()).pathname,
      message: message.text().slice(0, 1000),
    })
})
await page.goto('http://localhost:3002/sv/requirements?variant=after')
if (new URL(page.url()).port === '8080') {
  await page.locator('#username').fill('ada.admin')
  await page.locator('#password').fill('devpass')
  await page.locator('#kc-login').click()
}
await page.waitForURL('http://localhost:3002/sv/**')
await context.storageState({ path: '.auth/prototype1346.json' })
await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
const firstCode = (await page.locator('main').innerText()).match(
  /\b[A-ZÅÄÖ]{2,8}\d{4}\b/,
)?.[0]
const requirement = firstCode ? `/sv/requirements/${firstCode}` : undefined
await page.goto('http://localhost:3002/sv/specifications?variant=after', {
  waitUntil: 'domcontentloaded',
})
const specification = await page
  .locator('a[href]')
  .evaluateAll(links =>
    links
      .map(a => a.getAttribute('href'))
      .find(href => /^\/sv\/specifications\/\d+$/.test(href)),
  )
const views = [
  ['library', 'Requirements library', '/sv/requirements'],
  ['form', 'New requirement', '/sv/requirements/new'],
  ...(requirement
    ? [
        ['requirement-detail', 'Requirement details', requirement],
        ['requirement-edit', 'Edit requirement', `${requirement}/edit`],
      ]
    : []),
  ['specifications', 'Specification list', '/sv/specifications'],
  ...(specification
    ? [['specification-detail', 'Specification details', specification]]
    : []),
  ['areas', 'Requirement areas', '/sv/requirement-areas'],
  [
    'packages',
    'Requirement packages',
    '/sv/requirements/stewardship?tab=packages',
  ],
  ['norms', 'Norm library', '/sv/requirements/stewardship?tab=norms'],
  [
    'questions',
    'Selection questions',
    '/sv/requirements/stewardship?tab=questions',
  ],
  [
    'rfi',
    'Information requests',
    '/sv/requirements/stewardship?tab=information-requests',
  ],
  ...[
    'columns',
    'identity',
    'settings',
    'taxonomy',
    'statusesAndWorkflows',
    'accessReview',
    'archiving',
    'privacy',
    'actionAuditLog',
  ].map(tab => [`admin-${tab}`, `Admin · ${tab}`, `/sv/admin?tab=${tab}`]),
  ['privacy', 'Privacy page', '/sv/privacy'],
  ['not-found', 'Not-found page', '/sv/prototype-1346-missing'],
  ['auth-error', 'Authentication error', '/auth/error?locale=sv'],
]
const refreshProfile = process.env.PROTOTYPE_CAPTURE_PROFILE
const previous = refreshProfile
  ? JSON.parse(
      await readFile(new URL('evidence/observations.json', root), 'utf8'),
    )
  : null
const records = previous
  ? previous.records.filter(record => record.profile !== refreshProfile)
  : []
async function captureOnce(view, profile = '1440-light', prepare) {
  const [key, label, path] = view
  const dark = profile.includes('dark')
  const narrow = profile.includes('390')
  const wide = profile.includes('1920')
  await page.setViewportSize({
    width: narrow ? 390 : wide ? 1920 : 1440,
    height: narrow ? 844 : wide ? 1080 : 900,
  })
  // Drive existing product settings, never change their implementation for screenshots.
  await page.evaluate(
    ({ dark, wide }) => {
      localStorage.setItem('theme', dark ? 'dark' : 'light')
      localStorage.setItem(
        'requirements.navigationRail.expanded.v1',
        wide ? 'expanded' : 'collapsed',
      )
    },
    { dark, wide },
  )
  const url = new URL(path, 'http://localhost:3002')
  url.searchParams.set('variant', 'before')
  await page.goto(url.href, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-prototype1346-tools]').waitFor()
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await page.evaluate(dark => {
    document.documentElement.classList.toggle('dark', dark)
  }, dark)
  if (prepare) await prepare(page)
  await page.waitForTimeout(1250)
  const pair = { key, label, path, profile, variants: {} }
  for (const variant of ['before', 'after']) {
    await page
      .getByRole('button', {
        name: variant === 'before' ? 'Before' : 'Proposed',
        exact: true,
      })
      .click()
    await page.waitForFunction(
      variant => document.documentElement.dataset.prototype1346 === variant,
      variant,
    )
    await page.waitForTimeout(750)
    const measurements = await page.evaluate(() => {
      const visible = element =>
        element.getBoundingClientRect().width > 0 &&
        element.getBoundingClientRect().height > 0
      const sample = selector =>
        (typeof selector === 'string'
          ? [...document.querySelectorAll(selector)]
          : selector
        )
          .filter(visible)
          .slice(0, 30)
          .map(element => {
            const style = getComputedStyle(element)
            return {
              label: (
                element.getAttribute('aria-label') ||
                element.textContent ||
                element.tagName
              )
                .trim()
                .slice(0, 70),
              radius: style.borderRadius,
              fontSize: style.fontSize,
              color: style.color,
              background: style.backgroundColor,
              shadow: style.boxShadow,
              width: Math.round(element.getBoundingClientRect().width),
              height: Math.round(element.getBoundingClientRect().height),
            }
          })
      return {
        controls: sample(window.prototype1346Elements.control),
        panels: sample(window.prototype1346Elements.panel),
        floating: sample(window.prototype1346Elements.floating),
        headings: sample(
          'h1:not([data-prototype1346-tools] *),h2:not([data-prototype1346-tools] *)',
        ),
        statuses: sample('.status-badge'),
        navWidth: getComputedStyle(document.documentElement)
          .getPropertyValue('--global-nav-width')
          .trim(),
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      }
    })
    const filename = `${key}-${profile}-${variant}.png`
    await page.addStyleTag({
      content:
        '[data-prototype1346-tools],nextjs-portal { visibility:hidden !important; }',
    })
    await page.screenshot({
      path: new URL(filename, evidence).pathname,
      animations: 'disabled',
    })
    await page.evaluate(() => {
      for (const style of document.querySelectorAll('style'))
        if (
          style.textContent ===
          '[data-prototype1346-tools],nextjs-portal { visibility:hidden !important; }'
        )
          style.remove()
    })
    pair.variants[variant] = { file: filename, measurements }
  }
  records.push(pair)
  await writeFile(
    new URL('capture-progress.json', evidence),
    JSON.stringify({ records, errors }, null, 2),
  )
  console.log(`Captured ${key} / ${profile}`)
}
async function capture(view, profile = '1440-light', prepare) {
  if (refreshProfile && profile !== refreshProfile) return
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await captureOnce(view, profile, prepare)
      return
    } catch (error) {
      if (attempt === 1) {
        errors.push({ path: view[2], profile, message: error.message })
        console.log(`Capture failed: ${view[0]} / ${profile}`)
      }
    }
  }
}
for (const view of views) {
  try {
    await capture(view)
  } catch (error) {
    errors.push({ path: view[2], message: error.message })
    console.log(`Capture failed: ${view[0]}`)
  }
}
const references = views.filter(([key]) =>
  ['library', 'form', 'specification-detail', 'admin-columns'].includes(key),
)
for (const profile of ['1920-dark', '1440-dark', '1920-light'])
  for (const view of references) await capture(view, profile)
await capture(
  ['library-en', 'English library', '/en/requirements'],
  '390-light',
)
await capture(['admin-en', 'English Admin', '/en/admin'], '390-dark')
// Capture a real form dialog; opening it does not save data.
await capture(
  ['norm-dialog', 'New norm reference dialog', '/sv/requirements/new'],
  '1440-light',
  async page => {
    await page.getByRole('button', { name: 'Ny', exact: true }).first().click()
    await page.getByRole('dialog').waitFor()
  },
)
await page.goto('http://localhost:3002/sv/admin?variant=after', {
  waitUntil: 'domcontentloaded',
})
await page.getByRole('button', { name: 'Changes & review' }).click()
await page.screenshot({
  path: new URL('review-controls.png', evidence).pathname,
})
const report = {
  capturedAt: new Date().toISOString(),
  question: 'Does the agreed visual style work throughout the application?',
  verdict:
    'Awaiting user visual review; this is a throwaway DOM skin, not production implementation.',
  records,
  errors,
}
await writeFile(
  new URL('observations.json', evidence),
  `${JSON.stringify(report, null, 2)}\n`,
)
await browser.close()

const template = await readFile(new URL('gallery-template.html', root), 'utf8')
await writeFile(
  new URL('review.html', root),
  template.replace(
    '/*PROTOTYPE_DATA*/',
    `const report = ${JSON.stringify(report).replaceAll('<', '\\u003c')};`,
  ),
)
console.log(
  `Review gallery: ${new URL('review.html', root).pathname}\n${records.length} pairs; ${errors.length} recorded browser/capture errors.`,
)

await rm(new URL('capture-progress.json', evidence), { force: true })
