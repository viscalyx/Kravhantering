// THROWAWAY #1360: browser walkthrough + reproducible screenshot evidence.
// Uses the existing signed-in developer cookie; never submits an import.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect } from '@playwright/test'
import { chromium } from 'playwright'

const source = process.env.PROTOTYPE_SOURCE_ROOT || '/workspace'
const origin = `http://localhost:${process.env.PROTOTYPE_PORT || '3136'}`
const output = resolve('public/sv/prototype-1360')
await mkdir(output, { recursive: true })
execFileSync(process.execPath, [resolve(source, 'scripts/dev-login.mjs')], {
  cwd: source,
  stdio: 'ignore',
})
const cookies = (
  await readFile(resolve(source, '.auth/ada.admin.cookies'), 'utf8')
)
  .split('\n')
  .filter(
    line => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')),
  )
  .map(line => {
    const [domain, , path, secure, expires, name, value] = line
      .replace('#HttpOnly_', '')
      .split('\t')
    return {
      domain,
      path,
      secure: secure === 'TRUE',
      expires: Number(expires) || -1,
      name,
      value,
      httpOnly: line.startsWith('#HttpOnly_'),
      sameSite: 'Lax',
    }
  })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
})
await context.addCookies(cookies)
const page = await context.newPage()
const failures = []
const mutations = []
page.on('pageerror', error => failures.push(error.message))
page.on('request', request => {
  if (
    new URL(request.url()).pathname.includes('/import/') &&
    request.method() !== 'GET'
  )
    mutations.push(request.url())
})
const screenshots = []
const measurements = []
try {
  await page.goto(`${origin}/sv/requirements?prototype=import&variant=A`, {
    waitUntil: 'networkidle',
    timeout: 120000,
  })
  const panel = page.locator('[data-prototype-variant]')
  await panel.waitFor()
  const choose = async variant => {
    await page
      .getByLabel('Layoutvariant', { exact: true })
      .selectOption(variant)
    await page.waitForFunction(
      value =>
        document
          .querySelector('[data-prototype-variant]')
          ?.getAttribute('data-prototype-variant') === value,
      variant,
    )
  }
  const capture = async (name, label) => {
    // Let real navigation width transitions settle before photographing.
    await page.waitForTimeout(300)
    const geometry = await panel.evaluate(node => {
      const r = node.getBoundingClientRect()
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        horizontalOverflow: node.scrollWidth > node.clientWidth,
      }
    })
    assert(
      geometry.x >= 0 &&
        geometry.y >= 0 &&
        geometry.x + geometry.width <= geometry.viewportWidth + 1,
    )
    assert(!geometry.horizontalOverflow, `${name}: horizontal overflow`)
    const toolbar = await page
      .getByRole('region', { name: 'Prototypkontroller' })
      .boundingBox()
    assert(
      geometry.y + geometry.height <= toolbar.y,
      `${name}: panel overlaps toolbar`,
    )
    await page.screenshot({ path: resolve(output, `${name}.png`) })
    screenshots.push({ name, label })
    measurements.push({ name, ...geometry })
  }

  // All alternatives start from identical empty data at both target sizes.
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height })
    for (const expanded of [false, true]) {
      await page
        .getByRole('button', { name: 'Dölj dialog', exact: true })
        .click()
      const toggle = page.getByRole('button', {
        name: expanded ? 'Expandera navigation' : 'Fäll ihop navigation',
        exact: true,
      })
      if (await toggle.count()) await toggle.click()
      await page
        .getByRole('button', { name: 'Visa dialog', exact: true })
        .click()
      for (const theme of ['light', 'dark']) {
        const themeButton = page.getByRole('button', {
          name: theme === 'dark' ? 'Mörkt tema' : 'Ljust tema',
          exact: true,
        })
        if (await themeButton.count()) await themeButton.click()
        for (const variant of ['baseline', 'A', 'B', 'C']) {
          await choose(variant)
          await capture(
            `${variant}-${width}-${theme}-${expanded ? 'expanded' : 'collapsed'}`,
            `${variant} · ${width} × ${height} · ${theme} · navigation ${expanded ? 'expanded' : 'collapsed'}`,
          )
        }
      }
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Ljust tema', exact: true }).click()
  await page.getByRole('button', { name: 'Fyll exempel', exact: true }).click()
  const sample = await page.locator('#prototype-json').inputValue()
  await page.getByRole('button', { name: 'Lång text', exact: true }).click()
  for (const variant of ['baseline', 'A', 'B', 'C']) {
    await choose(variant)
    assert.equal(await page.locator('#prototype-json').inputValue(), sample)
    await capture(
      `${variant}-1440-long`,
      `${variant} · 1440 × 900 · long destination · identical sample`,
    )
  }
  await choose('A')
  await page
    .getByRole('button', { name: 'Förhandsgranska krav', exact: true })
    .click()
  await page
    .getByText('Simulerad förhandsgranskning: 1 krav', { exact: true })
    .waitFor()
  await capture('A-1440-preview', 'A · simulated preview · long destination')
  await page.locator('#prototype-json').fill('{ invalid')
  assert(
    await page
      .getByRole('button', { name: 'Förhandsgranska krav', exact: true })
      .isDisabled(),
  )
  await capture('A-1440-invalid', 'A · invalid JSON feedback')
  await page.locator('#prototype-json').press('ArrowRight')
  assert.equal(
    new URL(page.url()).searchParams.get('variant'),
    'A',
    'Textarea arrow must not switch variant',
  )
  await page.getByRole('button', { name: 'Nästa variant', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(
    () => new URL(location.href).searchParams.get('variant') === 'B',
  )
  await choose('C')
  await page.getByRole('button', { name: 'Nästa variant', exact: true }).click()
  await page.waitForFunction(
    () => new URL(location.href).searchParams.get('variant') === 'baseline',
  )
  await choose('A')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'prototype-example.json',
    mimeType: 'application/json',
    buffer: Buffer.from(sample),
  })
  assert.equal(await page.locator('#prototype-json').inputValue(), sample)
  const transfer = await page.evaluateHandle(text => {
    const data = new DataTransfer()
    data.items.add(
      new File([text], 'prototype-drop.json', { type: 'application/json' }),
    )
    return data
  }, sample)
  await page
    .getByRole('button', { name: /Släpp en JSON-fil/ })
    .dispatchEvent('drop', { dataTransfer: transfer })
  await page.getByText('prototype-drop.json', { exact: true }).waitFor()
  const downloaded = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Ladda ner schema', exact: true })
    .click()
  assert.equal((await downloaded).suggestedFilename(), 'prototype-schema.txt')
  await page.getByRole('button', { name: 'Stäng', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Visa dialog', exact: true }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Visa dialog', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Stäng', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(
    page.getByRole('button', { name: 'Tillstånd', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Stäng', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Visa dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Återställ', exact: true }).click()
  assert.equal(await page.locator('#prototype-json').inputValue(), '')
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(new URL(page.url()).searchParams.get('variant'), 'A')
  assert.equal(await page.locator('#prototype-json').inputValue(), '')
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    for (const variant of ['A', 'B', 'C']) {
      await choose(variant)
      await capture(
        `${variant}-${width}`,
        `${variant} · ${width} × 844 · responsive stack`,
      )
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${origin}/en/requirements?prototype=import&variant=B`, {
    waitUntil: 'networkidle',
  })
  await page
    .getByRole('button', { name: 'Preview requirements', exact: true })
    .waitFor()
  await page.screenshot({ path: resolve(output, 'B-1440-en.png') })
  screenshots.push({ name: 'B-1440-en', label: 'B · 1440 × 900 · English' })
  // Capture the real unchanged entry dialog as an additional before reference.
  await page.goto(`${origin}/sv/requirements`, { waitUntil: 'networkidle' })
  await page
    .getByRole('button', { name: 'Importera krav', exact: true })
    .click()
  await page.getByLabel('Import-JSON', { exact: false }).waitFor()
  await page.waitForFunction(
    () =>
      !document.body.textContent?.includes('Laddar aktuella importgränser.'),
  )
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(300)
    await page.screenshot({ path: resolve(output, `actual-${width}.png`) })
    screenshots.push({
      name: `actual-${width}`,
      label: `Actual unchanged dialog · ${width} × ${height} · no prototype toolbar`,
    })
  }
  assert.deepEqual(failures, [], 'No browser exceptions')
  assert.deepEqual(mutations, [], 'No import mutations')
  await writeFile(
    resolve(output, 'measurements.json'),
    `${JSON.stringify({ captured: new Date().toISOString(), mutations, failures, measurements }, null, 2)}\n`,
  )
  await writeFile(
    resolve(output, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>#1360 — import layout comparison</title><style>body{font:16px system-ui;background:#f1f5f9;color:#0f172a;margin:32px}h1{font-size:26px}nav{position:sticky;top:0;background:#fff;padding:12px;border-radius:8px}a{color:#4338ca}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,620px),1fr));gap:24px}figure{margin:0;background:white;padding:12px;border-radius:12px}img{width:100%;height:auto}figcaption{padding:8px;font-weight:600}p{max-width:1000px;line-height:1.6}</style><h1>#1360 · Import layout comparison</h1><p>Throwaway prototype. Baseline reconstructs the old entry layout; A uses a support sidebar, B places support beneath the form, C splits file and pasted input. Preview and downloads are simulated. No design is approved yet. Click any image for full resolution.</p><nav><a href="${origin}/sv/requirements?prototype=import&variant=A">Open interactive prototype</a> · <a href="measurements.json">Geometry and verification evidence</a></nav><main>${screenshots.map(({ name, label }) => `<figure><a href="${name}.png"><img loading="lazy" src="${name}.png" alt="${label}"></a><figcaption>${label}</figcaption></figure>`).join('')}</main></html>`,
  )
  console.info(
    `Verified interactions; ${screenshots.length} screenshots. Gallery: ${origin}/sv/prototype-1360/index.html`,
  )
} finally {
  await browser.close()
}
