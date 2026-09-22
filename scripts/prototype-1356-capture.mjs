// THROWAWAY visual capture, not a production regression suite.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { login } from './lib/dev-login-core.mjs'

const base = `http://localhost:${process.env.PROTOTYPE_PORT ?? 3000}`
const output = 'tmp/prototype-1356'
await mkdir(output, { recursive: true })
const jar = await login(
  {
    base,
    user: process.env.DEV_LOGIN_USER ?? 'ada.admin',
    password: process.env.DEV_LOGIN_PASSWORD ?? 'devpass',
  },
  {
    // Complete the normal local Keycloak flow in the worktree. Its registered
    // callback is port 3000; the callback handler derives redirect_uri from its
    // existing configuration. No IdP, cookie, or authentication policy changes.
    fetchImpl: (input, init) => {
      const url = new URL(input)
      if (url.origin === 'http://localhost:3000') url.port = new URL(base).port
      return fetch(url, { ...init, signal: AbortSignal.timeout(60000) })
    },
  },
)
const browser = await chromium.launch({ headless: true })
const reuse = process.argv.includes('--verify-only')
const captures = reuse
  ? JSON.parse(await readFile(`${output}/measurements.json`, 'utf8'))
  : []
for (const capture of captures)
  capture.image = (await readFile(`${output}/${capture.name}.png`)).toString(
    'base64',
  )
const observations = []
const mutationRequests = []
const context = await browser.newContext({ reducedMotion: 'reduce' })
await context.addCookies(
  [...jar.cookies.values()].map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    expires: cookie.expiry ? Math.floor(cookie.expiry / 1000) : -1,
  })),
)
context.on('request', request => {
  if (
    new URL(request.url()).pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
  )
    mutationRequests.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
    })
})
const check = (condition, description) => {
  if (!condition) throw new Error(description)
  observations.push(description)
}
async function scenario(page, name) {
  await page
    .getByRole('button', { name: 'Granska och jämför', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: /Granskningsscenario/ })
    .selectOption(name)
  await page
    .getByRole('button', { name: 'Stäng granskning', exact: true })
    .click()
}
async function open(page, variant) {
  await page.goto(
    `${base}/sv/requirements/stewardship?tab=questions&variant=${variant}`,
  )
  await page.locator('[data-prototype-expanded]').waitFor()
  await page.evaluate(() => document.fonts.ready)
}
async function metrics(page) {
  return page.locator('[data-prototype-expanded]').evaluate(el => ({
    height: Math.round(el.getBoundingClientRect().height),
    rows: Array.from(el.querySelectorAll('.prototype-answer-row')).map(row => ({
      height: Math.round(row.getBoundingClientRect().height),
      actions: Array.from(
        row.querySelectorAll('.prototype-answer-actions button'),
      ).map(button => ({
        text: button.textContent.trim(),
        width: Math.round(button.getBoundingClientRect().width),
        height: Math.round(button.getBoundingClientRect().height),
      })),
    })),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    questionActions: el.querySelectorAll('.prototype-question-actions button')
      .length,
  }))
}
try {
  for (const [width, height] of reuse
    ? []
    : [
        [1440, 900],
        [1920, 1080],
      ]) {
    for (const theme of ['light', 'dark'])
      for (const navigation of ['collapsed', 'expanded']) {
        const page = await context.newPage()
        await page.setViewportSize({ width, height })
        await page.addInitScript(
          ({ theme, navigation }) => {
            localStorage.setItem('theme', theme)
            localStorage.setItem(
              'requirements.navigationRail.expanded.v1',
              navigation,
            )
          },
          { theme, navigation },
        )
        for (const example of ['live', 'long'])
          for (const variant of ['original', 'A', 'B', 'C']) {
            await open(page, variant)
            if (example !== 'live') await scenario(page, example)
            await page.waitForFunction(
              ({ theme, navigation }) =>
                document.documentElement.classList.contains('dark') ===
                  (theme === 'dark') &&
                !!document.querySelector(
                  `[aria-label="${navigation === 'expanded' ? 'Fäll ihop navigation' : 'Expandera navigation'}"]`,
                ),
              { theme, navigation },
            )
            const question = page
              .locator('[data-question-id]')
              .filter({ has: page.locator('[data-prototype-expanded]') })
            await question.evaluate(el => {
              el.style.scrollMarginTop = '60px'
              el.scrollIntoView({ block: 'start', behavior: 'instant' })
            })
            // Let the existing workspace settle its sticky area heading and scroll.
            await page.waitForTimeout(180)
            if (example === 'long')
              await page.waitForFunction(() =>
                document
                  .querySelector('.prototype-answer-content')
                  ?.textContent.includes(
                    'Svaret omfattar vanlig intern information',
                  ),
              )
            const measured = await metrics(page)
            check(
              !measured.horizontalOverflow,
              `${width}/${theme}/${navigation}/${example}/${variant}: no horizontal page overflow`,
            )
            check(
              measured.questionActions === 6 &&
                measured.rows.every(row => row.actions.length === 4),
              `${width}/${theme}/${navigation}/${example}/${variant}: six question and four answer actions`,
            )
            check(
              measured.rows.every(row =>
                row.actions.every(
                  action => action.width >= 24 && action.height >= 24,
                ),
              ),
              `${width}/${theme}/${navigation}/${example}/${variant}: answer action targets are at least 24px`,
            )
            const name = `${width}-${theme}-${navigation}-${example}-${variant}`
            const screenshot = await page.screenshot({
              path: `${output}/${name}.png`,
              animations: 'disabled',
            })
            await page.locator('[data-prototype-switcher]').evaluate(el => {
              el.style.visibility = 'hidden'
            })
            await question.screenshot({
              path: `${output}/${name}-detail.png`,
              animations: 'disabled',
              style:
                '[data-developer-mode-name="requirement area heading"] { visibility: hidden !important; }',
            })
            await page.locator('[data-prototype-switcher]').evaluate(el => {
              el.style.visibility = ''
            })
            captures.push({
              name,
              variant,
              theme,
              navigation,
              example,
              width,
              height,
              metrics: measured,
              image: screenshot.toString('base64'),
            })
            console.log(
              `${name}: expanded ${measured.height}px; answer heights ${measured.rows.map(row => row.height).join(', ')}`,
            )
          }
        await page.close()
      }
  }
  await writeFile(
    `${output}/measurements.json`,
    JSON.stringify(
      captures.map(({ image, ...capture }) => capture),
      null,
      2,
    ),
  )
  // Finite prototype checks, not additions to the production regression suite.
  const page = await context.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'A')
  await page.getByRole('button', { name: 'Nästa variant', exact: true }).click()
  check(
    new URL(page.url()).searchParams.get('variant') === 'B',
    'Switcher updates the shareable URL',
  )
  check(
    (await page.locator('[data-prototype-expanded]').count()) === 1,
    'Switching keeps the question expanded',
  )
  await page.reload()
  await page.locator('[data-prototype-expanded]').waitFor()
  check(
    (await page.locator('.variant-b').count()) === 1,
    'Variant survives reload',
  )
  await page.locator('body').click({ position: { x: 10, y: 10 } })
  await page.keyboard.press('ArrowRight')
  check(
    new URL(page.url()).searchParams.get('variant') === 'C',
    'Page arrow keys cycle variants',
  )
  const search = page.getByPlaceholder('Sök fråge-ID eller text')
  await search.fill('SÄK')
  await search.press('ArrowLeft')
  check(
    new URL(page.url()).searchParams.get('variant') === 'C',
    'Arrow keys in search do not switch variants',
  )
  await search.fill('')
  for (const variant of ['A', 'B', 'C']) {
    await open(page, variant)
    await scenario(page, 'readonly')
    check(
      (await page
        .locator('.prototype-question-actions,.prototype-answer-actions')
        .count()) === 0,
      `${variant}: read-only example hides management controls`,
    )
    await scenario(page, 'mixed')
    check(
      (await page.locator('[data-prototype-expanded]').innerText()).includes(
        'Saknar kravurval',
      ),
      `${variant}: mixed example exposes missing-selection warning`,
    )
    for (const width of [320, 768]) {
      await scenario(page, 'long')
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(400)
      if ((await metrics(page)).horizontalOverflow) {
        await page.screenshot({
          path: `${output}/overflow-${width}-${variant}.png`,
        })
        console.log(
          await page.locator('body *').evaluateAll(els =>
            els
              .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
              .slice(-15)
              .map(el => ({
                tag: el.tagName,
                class: el.className,
                text: el.textContent.slice(0, 60),
                right: el.getBoundingClientRect().right,
              })),
          ),
        )
      }
      check(
        !(await metrics(page)).horizontalOverflow,
        `${variant}: long content fits ${width}px`,
      )
      await page.screenshot({
        path: `${output}/narrow-${width}-${variant}.png`,
        animations: 'disabled',
      })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
  }
  await open(page, 'A')
  const rows = page.locator('.prototype-answer-row')
  const before = await rows
    .locator('.prototype-answer-content > p:first-child')
    .allTextContents()
  const handle = rows
    .first()
    .getByRole('button', { name: 'Ändra svarsordning', exact: true })
  await handle.focus()
  await handle.press('ArrowDown')
  check(
    (
      await rows
        .locator('.prototype-answer-content > p:first-child')
        .allTextContents()
    )[1] === before[0],
    'Keyboard answer reordering updates memory',
  )
  await scenario(page, 'live')
  check(
    JSON.stringify(
      await rows
        .locator('.prototype-answer-content > p:first-child')
        .allTextContents(),
    ) === JSON.stringify(before),
    'Reset restores answer order',
  )
  await handle.dragTo(rows.nth(1), { targetPosition: { x: 60, y: 80 } })
  check(
    (
      await rows
        .locator('.prototype-answer-content > p:first-child')
        .allTextContents()
    )[1] === before[0],
    'Pointer answer reordering updates memory',
  )
  await scenario(page, 'live')
  const preview = rows
    .first()
    .getByRole('button', { name: /Visa krav i urvalet för/ })
  await preview.click()
  check(
    (await rows
      .first()
      .getByRole('button', { name: /Dölj krav i urvalet för/ })
      .getAttribute('aria-expanded')) === 'true',
    'Requirement selection preview expands from its existing control',
  )
  await scenario(page, 'live')
  await rows
    .first()
    .getByRole('button', { name: 'Ta bort', exact: true })
    .click()
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
  check(
    (await rows.count()) === 3,
    'Answer delete confirmation cancels without removing data',
  )
  await page
    .locator('.prototype-question-actions')
    .getByRole('button', { name: 'Synlighetsvillkor', exact: true })
    .click()
  check(
    await page
      .getByRole('button', { name: 'Spara synlighet', exact: true })
      .isVisible(),
    'Visibility editor remains directly accessible',
  )
  await scenario(page, 'live')
  await rows
    .first()
    .getByRole('button', { name: 'Redigera', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Redigera kravurvalsvar' })
  await dialog.waitFor()
  const requirement = dialog.getByRole('button', {
    name: 'Öppna kravdetaljer SÄK0042',
    exact: true,
  })
  await requirement.click()
  check(
    (await requirement.getAttribute('aria-expanded')) === 'true',
    'Answer editor requirement details remain directly accessible',
  )
  const textInput = dialog.locator('#kuf-answer-text')
  await textInput.fill(`${await textInput.inputValue()} — prototype`)
  await dialog.getByRole('button', { name: /Spara/ }).click()
  await dialog
    .getByRole('alert')
    .filter({ hasText: 'Prototyp: sparande är avstängt' })
    .waitFor()
  check(true, 'Editor saving shows the prototype notice')
  await page.reload()
  await page.locator('[data-prototype-expanded]').waitFor()
  check(
    JSON.stringify(
      await rows
        .locator('.prototype-answer-content > p:first-child')
        .allTextContents(),
    ) === JSON.stringify(before),
    'Reload restores original answer text and order',
  )
  await page.goto(`${base}/en/requirements/stewardship?tab=questions&variant=B`)
  await page.locator('[data-prototype-expanded]').waitFor()
  check(
    await page
      .getByRole('button', { name: 'Review and compare', exact: true })
      .isVisible(),
    'English prototype copy renders',
  )
  check(
    (await page
      .locator('[data-developer-mode-name="prototype question actions"]')
      .count()) === 1 &&
      (await page
        .locator('[data-developer-mode-name="prototype answer actions"]')
        .count()) === 3,
    'Curated Developer Mode markers identify the control groups',
  )
  check(
    mutationRequests.length === 0,
    'No API mutation requests during capture or interaction review',
  )
  await page.close()
} finally {
  await browser.close()
}
await writeFile(
  `${output}/measurements.json`,
  JSON.stringify(
    captures.map(({ image, ...capture }) => capture),
    null,
    2,
  ),
)
await writeFile(
  `${output}/verification.json`,
  JSON.stringify({ observations, mutationRequests }, null, 2),
)
const escaped = text =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;')
await writeFile(
  `${output}/gallery.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>#1356 expanded controls</title><style>body{font:16px system-ui;margin:24px;background:#eef1f5;color:#172033}header{position:sticky;top:0;background:#fff;padding:16px;border:1px solid #cbd5e1;border-radius:12px;z-index:1}h1{font-size:22px;margin:0}select{padding:8px;margin:4px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:16px 0;background:white;padding:12px;border-radius:12px}img{width:100%;border:1px solid #cbd5e1}figcaption{margin-bottom:10px}a{color:#4338ca}[hidden]{display:none!important}@media(max-width:900px){main{grid-template-columns:1fr}}</style><header><h1>#1356 · Expanded question controls</h1><p>Original / A inline actions / B question sidebar / C answer ledger. Throwaway alternatives; no approved design.</p><label>Viewport <select id="width"><option>1440</option><option>1920</option></select></label><label>Theme <select id="theme"><option>light</option><option>dark</option></select></label><label>Navigation <select id="navigation"><option>collapsed</option><option>expanded</option></select></label><label>Content <select id="example"><option>live</option><option>long</option></select></label><p><a href="${base}/sv/requirements/stewardship?tab=questions&variant=A">Open interactive prototype</a> · <a href="measurements.json">Measurements</a> · <a href="verification.json">Verification log</a>. Captured ${escaped(new Date().toISOString())}. Click a screenshot for native size; use Full question for content below the viewport.</p></header><main>${captures.map(c => `<figure data-width="${c.width}" data-theme="${c.theme}" data-navigation="${c.navigation}" data-example="${c.example}"><figcaption><b>${c.variant}</b> · expanded content ${c.metrics.height}px · answer heights ${c.metrics.rows.map(r => r.height).join(' / ')}px · <a href="${c.name}-detail.png" target="_blank">Full question</a></figcaption><a href="${c.name}.png" target="_blank"><img alt="${escaped(c.name)}" src="data:image/png;base64,${c.image}"></a></figure>`).join('')}</main><script>function filter(){document.querySelectorAll('figure').forEach(f=>f.hidden=!['width','theme','navigation','example'].every(k=>f.dataset[k]===document.getElementById(k).value))}document.querySelectorAll('select').forEach(s=>s.addEventListener('change',filter));filter()</script></html>`,
)
console.log(
  `Open ${output}/gallery.html. ${captures.length} comparisons; ${observations.length} checks; ${mutationRequests.length} API mutation requests.`,
)
