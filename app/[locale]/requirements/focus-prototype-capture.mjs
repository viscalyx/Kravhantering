// THROWAWAY visual capture, not a regression suite. Run with the preview server.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const output = '/tmp/focus-prototype-1677'
await mkdir(output, { recursive: true })
const jar = await readFile('/tmp/prototype-1677.cookies', 'utf8')
const cookies = jar
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
  viewport: { width: 1280, height: 1000 },
  reducedMotion: 'reduce',
})
await context.addCookies(cookies)
const page = await context.newPage()
page.on('pageerror', error => console.error(error.message))
const evidence = []
const captures = []
for (const theme of ['light', 'dark']) {
  for (const forcedColors of ['none', 'active']) {
    await page.emulateMedia({ colorScheme: theme, forcedColors })
    for (const variant of ['today', 'desired']) {
      await page.goto(
        `http://localhost:3001/en/requirements?variant=${variant}`,
        { waitUntil: 'networkidle', timeout: 90000 },
      )
      await page.waitForSelector(`[data-focus-prototype="${variant}"]`)
      await page.evaluate(
        theme =>
          document.documentElement.classList.toggle('dark', theme === 'dark'),
        theme,
      )
      const primary = page.locator('[data-prototype-control="primary"]')
      await primary.focus()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await page.waitForTimeout(250)
      const file = `${theme}-${forcedColors}-${variant}.png`
      await page
        .getByRole('region', { name: 'Try the actual controls' })
        .screenshot({ path: `${output}/${file}` })
      captures.push({ theme, forcedColors, variant, file })
      for (let i = 0; i < 4; i++) {
        evidence.push({
          theme,
          forcedColors,
          variant,
          ...(await page.evaluate(() => {
            const el = document.activeElement
            const css = getComputedStyle(el)
            return {
              control: el.textContent.trim(),
              focusVisible: el.matches(':focus-visible'),
              outline: css.outline,
              outlineOffset: css.outlineOffset,
              shadow: css.boxShadow,
            }
          })),
        })
        if (i < 3) await page.keyboard.press('Tab')
      }
      await page.keyboard.press('Enter')
      await page.getByRole('dialog', { name: 'Sample requirement' }).waitFor()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await page.getByRole('dialog').screenshot({
        path: `${output}/modal-${theme}-${forcedColors}-${variant}.png`,
      })
      await page.keyboard.press('Escape')
      evidence.push({
        theme,
        forcedColors,
        variant,
        restored: await page
          .locator('[data-prototype-control="modal"]')
          .evaluate(el => el === document.activeElement),
      })
    }
  }
}
await writeFile(
  `${output}/observations.json`,
  JSON.stringify(evidence, null, 2),
)
const card = async capture =>
  `<figure><figcaption>${capture.variant === 'today' ? 'TODAY' : 'DESIRED'} — keyboard focus on Save</figcaption><img alt="Application buttons with keyboard focus on Save; compare the focus outline with the adjacent Today or Desired image." src="data:image/png;base64,${(await readFile(`${output}/${capture.file}`)).toString('base64')}"></figure>`
const panels = []
for (const theme of ['light', 'dark']) {
  for (const forcedColors of ['none', 'active']) {
    panels.push(
      `<section><h2>${theme === 'light' ? 'Light' : 'Dark'} · ${forcedColors === 'active' ? 'Forced colors (Chromium emulation)' : 'Regular colors'}</h2><div>${(await Promise.all(captures.filter(c => c.theme === theme && c.forcedColors === forcedColors).map(card))).join('')}</div></section>`,
    )
  }
}
const html = `<!doctype html><meta charset="utf-8"><title>Focus: today vs desired</title><style>body{font:16px system-ui;margin:0;padding:32px;background:#eef2f6;color:#111827}h1{font-size:32px;margin:0 0 8px}p{margin:0 0 28px}h2{font-size:20px}section{margin:28px 0}section>div{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:white;border:1px solid #cbd5e1;border-radius:16px;overflow:hidden}figcaption{font-weight:700;padding:16px;border-bottom:1px solid #cbd5e1}img{display:block;width:100%}</style><h1>Same focus. Visible difference.</h1><p>Actual application controls. Save has keyboard focus in every image. Throwaway proposal for #1677.</p>${panels.join('')}<p>Forced colors removes today's shadow ring. The proposed outline remains visible. Native Windows validation is still outstanding.</p>`
await writeFile(`${output}/comparison.html`, html)
const sheet = await context.newPage()
await sheet.emulateMedia({ forcedColors: 'none', colorScheme: 'light' })
await sheet.setContent(html)
await sheet.screenshot({ path: `${output}/comparison.png`, fullPage: true })
console.log(
  `Captured ${evidence.length} observations and comparison at ${output}/comparison.html`,
)
await browser.close()
