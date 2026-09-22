// THROWAWAY visual capture, not a production regression suite.
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { login } from './lib/dev-login-core.mjs'

const base = `http://localhost:${process.env.PROTOTYPE_PORT ?? 3137}`
const output = 'tmp/prototype-1357'
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
const captures = []
try {
  const context = await browser.newContext()
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
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ]) {
    for (const theme of ['light', 'dark']) {
      for (const navigation of ['collapsed', 'expanded']) {
        const page = await context.newPage()
        page.setDefaultTimeout(30000)
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
        for (const variant of ['original', 'A', 'B', 'C']) {
          await page.goto(
            `${base}/sv/requirements/stewardship/workspaces/information-requests?variant=${variant}`,
            { waitUntil: 'domcontentloaded' },
          )
          await page.locator('[data-rfi-row]').first().waitFor()
          await page.waitForFunction(
            ({ variant, theme }) =>
              document
                .querySelector('[data-rfi-prototype]')
                ?.getAttribute('data-rfi-prototype') === variant &&
              document.documentElement.classList.contains('dark') ===
                (theme === 'dark'),
            { variant, theme },
          )
          await page.evaluate(() => document.fonts.ready)
          const metrics = await page
            .locator('[data-rfi-row]')
            .evaluateAll(rows => {
              const switcherTop = document
                .querySelector('[data-prototype-switcher]')
                .getBoundingClientRect().top
              const list = rows.map(row => {
                const rect = row.getBoundingClientRect()
                return {
                  id: row.dataset.rfiRow,
                  height: Math.round(rect.height * 10) / 10,
                  fullyVisible: rect.top >= 0 && rect.bottom <= switcherTop,
                }
              })
              return {
                viewport: [innerWidth, innerHeight],
                filterColumns: getComputedStyle(
                  document.querySelector('[data-rfi-filters]'),
                ).gridTemplateColumns,
                filterControls: document.querySelectorAll(
                  '[data-rfi-filters] input, [data-rfi-filters] select',
                ).length,
                unusedFilterWidth: (() => {
                  const grid = document.querySelector('[data-rfi-filters]')
                  const style = getComputedStyle(grid)
                  return Math.round(
                    grid.getBoundingClientRect().right -
                      parseFloat(style.paddingRight) -
                      parseFloat(style.borderRightWidth) -
                      grid.lastElementChild.getBoundingClientRect().right,
                  )
                })(),
                visibleRows: list.filter(row => row.fullyVisible).length,
                rows: list,
                horizontalOverflow:
                  document.documentElement.scrollWidth > innerWidth,
              }
            })
          const name = `${width}-${theme}-${navigation}-${variant}`
          const png = await page.screenshot({
            path: `${output}/${name}.png`,
            animations: 'disabled',
          })
          captures.push({
            name,
            variant,
            theme,
            navigation,
            width,
            height,
            metrics,
            image: png.toString('base64'),
          })
          console.log(
            `${name}: ${metrics.visibleRows} full rows; first row ${metrics.rows[0]?.height}px`,
          )
        }
        await page.close()
      }
    }
  }
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
const escaped = text =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;')
await writeFile(
  `${output}/gallery.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>#1357 RFI layout comparison</title><style>body{font:16px system-ui;margin:24px;background:#f3f4f6;color:#172033}header{position:sticky;top:0;background:#fff;padding:16px;border:1px solid #cbd5e1;border-radius:12px;z-index:1}h1{font-size:22px;margin:0 0 8px}select{padding:8px;margin:4px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:20px 0;background:white;padding:12px;border-radius:12px}img{width:100%;border:1px solid #cbd5e1}figcaption{margin-bottom:10px}a{color:#3433a8}@media(max-width:900px){main{grid-template-columns:1fr}}</style><header><h1>#1357 · RFI layout comparison</h1><p>Original + three throwaway alternatives. Click an image for native-resolution inspection. Same live development data in every capture. Measurements exclude rows covered by the floating switcher. No design is approved yet.</p><label>Viewport <select id="width"><option>1440</option><option>1920</option></select></label><label>Theme <select id="theme"><option>light</option><option>dark</option></select></label><label>Navigation <select id="navigation"><option>collapsed</option><option>expanded</option></select></label><p>Live: <a href="${base}/sv/requirements/stewardship/workspaces/information-requests?variant=A">open interactive prototype</a>. Captured ${escaped(new Date().toISOString())}.</p></header><main>${captures.map(c => `<figure data-width="${c.width}" data-theme="${c.theme}" data-navigation="${c.navigation}"><figcaption><b>${escaped(c.variant)}</b> · ${c.width} × ${c.height} · ${c.metrics.visibleRows} fully visible rows · first row ${c.metrics.rows[0]?.height}px · unused filter width ${c.metrics.unusedFilterWidth}px</figcaption><a href="${c.name}.png" target="_blank"><img alt="${escaped(c.name)}" src="data:image/png;base64,${c.image}"></a></figure>`).join('')}</main><script>function filter(){document.querySelectorAll('figure').forEach(f=>f.hidden=!['width','theme','navigation'].every(k=>f.dataset[k]===document.getElementById(k).value))}document.querySelectorAll('select').forEach(s=>s.addEventListener('change',filter));filter()</script></html>`,
)
console.log(
  `Open ${output}/gallery.html. Measurements: ${output}/measurements.json`,
)
